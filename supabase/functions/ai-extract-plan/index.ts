// IA do plano alimentar (Claude), em três modos:
//   - "extract" (padrão): lê o PDF do plano e devolve o plano estruturado;
//   - "edit": aplica ao plano atual um pedido em texto livre ("atrase o
//     jantar em uma hora") e devolve o plano inteiro já alterado + a lista
//     do que mudou;
//   - "estimate": estima calorias e macros de algo comido fora do plano
//     ("pipoca de panela, 1 tigela média"), para a pessoa registrar a refeição.
// Nos modos de plano (extract/edit) o resultado vai para a tela de revisão; o plano em si só é
// salvo depois que a pessoa confirma. Aqui fica guardado apenas o resultado
// (ai_plan_extractions), para não se perder se a conexão do celular cair.
//
// Acesso: só usuários VIP (tabela ai_access) que aceitaram o termo e ainda
// têm saldo no teto mensal. Cada chamada grava tokens e custo em ai_usage.
//
// Segredos (Supabase -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY  chave da API da Anthropic (obrigatório)
//   AI_MODEL           opcional; padrão claude-opus-5-5
//   AI_EFFORT          opcional; padrão low (o raciocínio é cobrado como saída)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontos no ambiente.
//
// Privacidade: o conteúdo do PDF, do plano e do pedido nunca vai para os logs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "npm:@supabase/supabase-js@2"

const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_INSTRUCTION_CHARS = 1000
const MAX_DESCRIPTION_CHARS = 300

// US$ por milhão de tokens (entrada, saída). Tokens de raciocínio contam como saída.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

const nullableNumber = { type: ["number", "null"] }
const stringList = { type: "array", items: { type: "string" } }

// Mesmo formato do rascunho do app (src/lib/planDraft.ts, ExtractedPlan).
const PLAN_PROPERTIES = {
  name: { type: "string" },
  status_note: { type: ["string", "null"] },
  targets: {
    type: "object",
    additionalProperties: false,
    required: ["kcal", "protein_g", "carbs_g", "fat_g", "water_ml"],
    properties: {
      kcal: nullableNumber,
      protein_g: nullableNumber,
      carbs_g: nullableNumber,
      fat_g: nullableNumber,
      water_ml: nullableNumber,
    },
  },
  notes: stringList,
  meals: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["name", "time", "items"],
      properties: {
        name: { type: "string" },
        time: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "food", "qty_text", "qty_value", "qty_unit",
              "kcal", "protein_g", "carbs_g", "fat_g", "substitutions",
            ],
            properties: {
              food: { type: "string" },
              qty_text: { type: "string" },
              qty_value: nullableNumber,
              qty_unit: { anyOf: [{ type: "string", enum: ["g", "mL", "un"] }, { type: "null" }] },
              kcal: nullableNumber,
              protein_g: nullableNumber,
              carbs_g: nullableNumber,
              fat_g: nullableNumber,
              substitutions: stringList,
            },
          },
        },
      },
    },
  },
  hydration_slots: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      required: ["time", "ml", "label"],
      properties: {
        time: { type: "string" },
        ml: { type: "number" },
        label: { type: ["string", "null"] },
      },
    },
  },
  warnings: stringList,
}

const PLAN_REQUIRED = ["name", "status_note", "targets", "notes", "meals", "hydration_slots", "warnings"]

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: PLAN_REQUIRED,
  properties: PLAN_PROPERTIES,
}

const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...PLAN_REQUIRED, "changes"],
  properties: { ...PLAN_PROPERTIES, changes: stringList },
}

const ESTIMATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "kcal", "protein_g", "carbs_g", "fat_g", "notes"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    kcal: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    notes: stringList,
  },
}

const ESTIMATE_SYSTEM = `Você estima o valor nutricional de algo que uma pessoa já comeu, para ela registrar no app que acompanha o plano alimentar dela.

Regras:
- Estime calorias (kcal) e macros (proteína, carboidrato e gordura, em gramas) da porção descrita, com base em valores típicos de tabelas brasileiras de composição de alimentos (como a TACO).
- Se a quantidade não for dita, assuma uma porção comum e diga qual em "notes" (ex.: "Considerei 1 tigela média, cerca de 30 g de milho").
- "name": nome curto do alimento ou prato, com inicial maiúscula (ex.: "Pipoca de panela"). "description": a porção considerada (ex.: "1 tigela média, com manteiga").
- Números arredondados (kcal inteiro, macros com no máximo 1 casa decimal).
- Não julgue a escolha, não dê conselhos nem sugira compensar em outras refeições.
- Se o texto não descrever comida, devolva zeros e explique em "notes".`

const EXTRACT_SYSTEM = `Você transcreve planos alimentares em PDF, feitos por nutricionistas brasileiros, para um formato estruturado. O resultado vai para uma tela de revisão em que a própria pessoa confere e corrige tudo antes de salvar.

Regras:
- Transcreva só o que está no PDF. Não invente alimentos, quantidades, calorias, metas nem horários, e não dê recomendações. Campo numérico ausente no PDF fica null.
- Não copie nomes de pessoas (paciente, nutricionista), CRN, contatos ou endereços para nenhum campo. Em "name", use algo curto como "Plano de outubro/2026" (mês/ano se constar no PDF) ou "Plano alimentar".
- Refeições em ordem de horário. "time" no formato HH:MM (24h). Se a refeição não tiver horário no PDF, use um horário típico para ela e registre isso em "warnings".
- Cada alimento é um item. "qty_text" é a quantidade como está escrita (ex.: "2 colheres de sopa (30 g)"). Preencha "qty_value" e "qty_unit" só quando houver número em g, mL ou unidades (ex.: 30 e "g"; 2 e "un"); medidas caseiras sem peso ficam só no texto, com qty_value e qty_unit null.
- Substituições/opções/trocas de um alimento vão em "substitutions" desse item, uma por linha de texto (ex.: "Batata-doce cozida (100 g)"). Se o PDF oferecer opções para a refeição inteira (ex.: "Opção 1" e "Opção 2"), use a primeira como itens e descreva as demais em "warnings".
- Metas diárias (kcal, proteína, carboidrato, gordura, água em mL) só se o PDF trouxer. Água em litros vira mL.
- "hydration_slots": horários de água, se o PDF tiver um protocolo; senão, lista vazia.
- "notes": orientações gerais do plano (ex.: "Pouco sal"), curtas, uma por item.
- "status_note": null, a menos que o PDF traga um aviso sobre o próprio plano (ex.: "plano provisório").
- "warnings": tudo o que ficou em dúvida, ilegível, ambíguo ou que não coube nos campos, em frases curtas para a pessoa conferir. Lista vazia se nada.
- Se o PDF não for um plano alimentar, devolva "meals" vazio e explique em "warnings".`

const EDIT_SYSTEM = `Você edita um plano alimentar estruturado a pedido da própria pessoa que o segue. O plano foi passado pelo nutricionista dela. O resultado vai para uma tela de revisão em que ela confere tudo antes de salvar.

Regras:
- Aplique exatamente o que foi pedido e mais nada. Todo o resto fica idêntico: mesmos textos, números, ordem dos itens, trocas, metas e observações.
- Devolva o plano INTEIRO no formato pedido, já com as alterações.
- "time" no formato HH:MM (24h). Se mudar horários, deixe as refeições em ordem de horário.
- Se o pedido mexer em horários de refeição e houver horários de água ligados a elas (ex.: "No jantar"), só mude os de água se o pedido disser.
- Não invente alimentos, quantidades nem valores nutricionais que a pessoa não deu. Ao trocar um alimento por outro a pedido dela, mantenha a quantidade que ela disser; sem quantidade, mantenha a do original e avise em "warnings". Deixe kcal e macros do item trocado como null se não souber.
- Não dê recomendações nutricionais nem decida pela pessoa. Se o pedido for vago, impossível ou pedir uma decisão nutricional (ex.: "diminua as calorias", "deixe mais saudável"), NÃO altere o plano e explique em "warnings" que esse tipo de ajuste é com o nutricionista.
- "changes": lista curta, em português, de cada alteração feita, no formato "Jantar: 19:00 → 20:00" ou "Almoço: arroz trocado por quinoa (80 g)". Lista vazia se nada mudou.
- "warnings": dúvidas ou partes do pedido que não foram aplicadas, em frases curtas. Lista vazia se nada.
- Não inclua nomes de pessoas em nenhum campo.`

type Mode = "extract" | "edit" | "estimate"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) return json({ error: "A IA ainda não foi configurada no servidor." }, 503)
  const model = Deno.env.get("AI_MODEL") || "claude-opus-5-5"
  const price = PRICES[model] ?? PRICES["claude-opus-5-5"]
  const effort = Deno.env.get("AI_EFFORT") || "low"

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )

  // Quem está chamando (o gateway já validou o JWT; aqui pegamos o id).
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const { data: userData, error: userError } = await admin.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: "Sessão expirada. Entre de novo." }, 401)
  const userId = userData.user.id

  // VIP, aceite do termo e saldo do mês.
  const { data: access } = await admin
    .from("ai_access")
    .select("monthly_limit_usd, consented_at")
    .eq("user_id", userId)
    .maybeSingle()
  if (!access) return json({ error: "A IA é exclusiva para usuários VIP." }, 403)
  if (!access.consented_at) return json({ error: "Aceite o termo de uso da IA antes de continuar." }, 403)

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: usageRows } = await admin
    .from("ai_usage")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString())
  const spent = (usageRows ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0)
  const limit = Number(access.monthly_limit_usd)
  if (spent >= limit) {
    return json({ error: "Você atingiu o limite de uso da IA deste mês." }, 429)
  }

  // Corpo: { pdf_base64 } (extract), { mode: "edit", plan, instruction } ou
  // { mode: "estimate", description }.
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: "Envio inválido." }, 400)
  }
  const mode: Mode = body?.mode === "edit" ? "edit" : body?.mode === "estimate" ? "estimate" : "extract"

  let content: Anthropic.ContentBlockParam[]
  if (mode === "extract") {
    const pdfBase64 = String(body?.pdf_base64 ?? "")
    if (!pdfBase64) return json({ error: "Nenhum PDF recebido." }, 400)
    if (pdfBase64.length * 0.75 > MAX_PDF_BYTES) return json({ error: "O PDF passa de 10 MB." }, 413)
    content = [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
      { type: "text", text: "Transcreva este plano alimentar no formato pedido." },
    ]
  } else if (mode === "estimate") {
    const description = String(body?.description ?? "").trim()
    if (!description) return json({ error: "Descreva o que você comeu." }, 400)
    if (description.length > MAX_DESCRIPTION_CHARS) {
      return json({ error: `A descrição passa de ${MAX_DESCRIPTION_CHARS} caracteres.` }, 400)
    }
    content = [{ type: "text", text: `O que a pessoa comeu:
<comida>
${description}
</comida>` }]
  } else {
    const instruction = String(body?.instruction ?? "").trim()
    if (!instruction) return json({ error: "Escreva o que você quer mudar no plano." }, 400)
    if (instruction.length > MAX_INSTRUCTION_CHARS) {
      return json({ error: `O pedido passa de ${MAX_INSTRUCTION_CHARS} caracteres.` }, 400)
    }
    if (!body?.plan || typeof body.plan !== "object") return json({ error: "Plano atual não recebido." }, 400)
    content = [
      {
        type: "text",
        text:
          `Plano atual (JSON):\n${JSON.stringify(body.plan)}\n\n` +
          `Pedido da pessoa (aplique só isto):\n<pedido>\n${instruction}\n</pedido>`,
      },
    ]
  }

  const schema = mode === "extract" ? EXTRACT_SCHEMA : mode === "edit" ? EDIT_SCHEMA : ESTIMATE_SCHEMA
  // O Haiku 4.5 não aceita "effort".
  const outputConfig = model.startsWith("claude-haiku")
    ? { format: { type: "json_schema", schema } }
    : { effort, format: { type: "json_schema", schema } }

  const client = new Anthropic({ apiKey })
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: mode === "extract" ? EXTRACT_SYSTEM : mode === "edit" ? EDIT_SYSTEM : ESTIMATE_SYSTEM,
      output_config: outputConfig,
      messages: [{ role: "user", content }],
    } as Anthropic.MessageCreateParamsNonStreaming)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "A IA está ocupada agora. Tente de novo em 1 minuto." }, 503)
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("anthropic bad request", mode, err.status)
      return json({
        error: mode === "extract"
          ? "A IA não conseguiu abrir este PDF. Confira se o arquivo não está protegido por senha."
          : "A IA não conseguiu processar este pedido. Tente escrever de outro jeito.",
      }, 422)
    }
    if (err instanceof Anthropic.APIError) {
      console.error("anthropic api error", mode, err.status)
      return json({ error: "A IA não respondeu agora. Tente de novo em instantes." }, 502)
    }
    console.error("anthropic unknown error", mode)
    return json({ error: "A IA não respondeu agora. Tente de novo em instantes." }, 502)
  }

  // Registra o uso mesmo se a resposta não servir: os tokens foram cobrados.
  const inputTokens =
    (response.usage.input_tokens ?? 0) +
    (response.usage.cache_creation_input_tokens ?? 0) +
    (response.usage.cache_read_input_tokens ?? 0)
  const outputTokens = response.usage.output_tokens ?? 0
  const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000
  await admin.from("ai_usage").insert({
    user_id: userId,
    feature: mode === "extract" ? "extract_plan" : mode === "edit" ? "edit_plan" : "estimate_meal",
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
  })
  const usage = { cost_usd: cost, month_spent_usd: spent + cost, month_limit_usd: limit }

  if (response.stop_reason === "refusal") {
    return json({ error: "A IA recusou este pedido.", usage }, 422)
  }
  if (response.stop_reason === "max_tokens") {
    return json({ error: "O plano é longo demais para a IA processar de uma vez.", usage }, 422)
  }

  const text = response.content.find((b) => b.type === "text")
  let plan: unknown
  try {
    plan = JSON.parse(text && text.type === "text" ? text.text : "")
  } catch {
    console.error("invalid json from model", mode)
    return json({ error: "A IA devolveu uma resposta incompleta. Tente de novo.", usage }, 502)
  }

  // Estimativa é rápida e pequena: volta direto, sem guardar.
  if (mode === "estimate") return json({ estimate: plan, usage, mode })

  // Guarda o resultado antes de responder: se a conexão do celular cair
  // durante a espera, o app busca o resultado aqui em vez de perdê-lo.
  const { data: saved } = await admin
    .from("ai_plan_extractions")
    .insert({ user_id: userId, plan, cost_usd: cost })
    .select("id")
    .single()

  return json({ plan, usage, extraction_id: saved?.id ?? null, mode })
})
