// Lê o PDF de um plano alimentar com o Claude e devolve o plano estruturado,
// para o app mostrar na tela de revisão (nada é salvo aqui).
//
// Acesso: só usuários VIP (tabela ai_access) que aceitaram o termo e ainda
// têm saldo no teto mensal. Cada chamada grava tokens e custo em ai_usage.
//
// Segredos (Supabase -> Edge Functions -> Secrets):
//   ANTHROPIC_API_KEY  chave da API da Anthropic (obrigatório)
//   AI_MODEL           opcional; padrão claude-opus-5-5
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm prontos no ambiente.
//
// Privacidade: o conteúdo do PDF e do plano nunca vai para os logs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "npm:@supabase/supabase-js@2"

const FEATURE = "extract_plan"
const MAX_PDF_BYTES = 10 * 1024 * 1024

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

// Mesmo formato do rascunho do app (src/lib/planDraft.ts).
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "status_note", "targets", "notes", "meals", "hydration_slots", "warnings"],
  properties: {
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
    notes: { type: "array", items: { type: "string" } },
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
                substitutions: { type: "array", items: { type: "string" } },
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
    warnings: { type: "array", items: { type: "string" } },
  },
}

const SYSTEM = `Você transcreve planos alimentares em PDF, feitos por nutricionistas brasileiros, para um formato estruturado. O resultado vai para uma tela de revisão em que a própria pessoa confere e corrige tudo antes de salvar.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) return json({ error: "A IA ainda não foi configurada no servidor." }, 503)
  const model = Deno.env.get("AI_MODEL") || "claude-opus-5-5"
  const price = PRICES[model] ?? PRICES["claude-opus-5-5"]

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
  if (!access) return json({ error: "A leitura com IA é exclusiva para usuários VIP." }, 403)
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

  // O PDF chega em base64 no corpo.
  let pdfBase64: string
  try {
    const body = await req.json()
    pdfBase64 = String(body?.pdf_base64 ?? "")
  } catch {
    return json({ error: "Envio inválido." }, 400)
  }
  if (!pdfBase64) return json({ error: "Nenhum PDF recebido." }, 400)
  if (pdfBase64.length * 0.75 > MAX_PDF_BYTES) {
    return json({ error: "O PDF passa de 10 MB." }, 413)
  }

  const client = new Anthropic({ apiKey })
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: PLAN_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: "Transcreva este plano alimentar no formato pedido." },
          ],
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming)
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "A IA está ocupada agora. Tente de novo em 1 minuto." }, 503)
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("anthropic bad request", err.status)
      return json({ error: "A IA não conseguiu abrir este PDF. Confira se o arquivo não está protegido por senha." }, 422)
    }
    if (err instanceof Anthropic.APIError) {
      console.error("anthropic api error", err.status)
      return json({ error: "A IA não respondeu agora. Tente de novo em instantes." }, 502)
    }
    console.error("anthropic unknown error")
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
    feature: FEATURE,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
  })
  const usage = { cost_usd: cost, month_spent_usd: spent + cost, month_limit_usd: limit }

  if (response.stop_reason === "refusal") {
    return json({ error: "A IA recusou ler este arquivo.", usage }, 422)
  }
  if (response.stop_reason === "max_tokens") {
    return json({ error: "O plano é longo demais para ler de uma vez.", usage }, 422)
  }

  const text = response.content.find((b) => b.type === "text")
  let plan: unknown
  try {
    plan = JSON.parse(text && text.type === "text" ? text.text : "")
  } catch {
    console.error("invalid json from model")
    return json({ error: "A IA devolveu uma resposta incompleta. Tente de novo.", usage }, 502)
  }

  return json({ plan, usage })
})
