import { FunctionsHttpError } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractedPlan } from './planDraft'
import { supabase } from './supabaseClient'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

export type AiAccess = {
  vip: boolean
  consented: boolean
  monthLimitUsd: number
  monthSpentUsd: number
}

/** Se a conta é VIP, se já aceitou o termo e quanto já usou no mês (UTC). */
export async function fetchAiAccess(): Promise<AiAccess> {
  const { data: access } = await client.from('ai_access').select('monthly_limit_usd, consented_at').maybeSingle()
  if (!access) return { vip: false, consented: false, monthLimitUsd: 0, monthSpentUsd: 0 }

  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: usage } = await client.from('ai_usage').select('cost_usd').gte('created_at', monthStart.toISOString())

  return {
    vip: true,
    consented: access.consented_at !== null,
    monthLimitUsd: Number(access.monthly_limit_usd),
    monthSpentUsd: (usage ?? []).reduce((sum, r) => sum + Number(r.cost_usd), 0),
  }
}

export async function acceptAiTerms(): Promise<boolean> {
  const { data, error } = await client.rpc('accept_ai_terms')
  return !error && data === true
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export const MAX_PDF_MB = 10

type ExtractResult =
  | { ok: true; plan: ExtractedPlan; costUsd: number; extractionId: string | null }
  /** network: a resposta não chegou (conexão caiu); a leitura pode ter terminado no servidor. */
  | { ok: false; error: string; network: boolean }

/** Manda o PDF para a Edge Function ai-extract-plan (Claude) e devolve o plano lido. */
export async function extractPlanFromPdf(file: File): Promise<ExtractResult> {
  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    return { ok: false, error: `O PDF passa de ${MAX_PDF_MB} MB.`, network: false }
  }
  return invokePlanAi({ pdf_base64: await fileToBase64(file) })
}

export const MAX_INSTRUCTION_CHARS = 1000

/** Aplica ao plano um pedido em texto livre ("atrase o jantar em 1 hora"); devolve o plano alterado + o que mudou. */
export async function editPlanWithAi(plan: ExtractedPlan, instruction: string): Promise<ExtractResult> {
  return invokePlanAi({ mode: 'edit', plan, instruction })
}

async function invokePlanAi(body: Record<string, unknown>): Promise<ExtractResult> {
  const { data, error } = await client.functions.invoke('ai-extract-plan', { body })

  if (error) {
    // A função devolve { error: "mensagem em português" } nos erros previstos.
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json()
        if (body?.error) return { ok: false, error: String(body.error), network: false }
      } catch {
        // corpo sem JSON: cai na mensagem genérica
      }
    }
    return {
      ok: false,
      error: 'Não foi possível falar com a IA agora. Confira a internet e tente de novo.',
      network: true,
    }
  }
  return {
    ok: true,
    plan: data.plan as ExtractedPlan,
    costUsd: Number(data.usage?.cost_usd ?? 0),
    extractionId: data.extraction_id ?? null,
  }
}

export type SavedExtraction = { id: string; plan: ExtractedPlan; costUsd: number; createdAt: Date }

/**
 * Última leitura de PDF guardada (até 24 h), ainda não salva nem descartada.
 * `since`: só leituras feitas depois desse momento.
 */
export async function fetchLatestExtraction(since?: Date): Promise<SavedExtraction | null> {
  const from = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000)
  const { data } = await client
    .from('ai_plan_extractions')
    .select('id, plan, cost_usd, created_at')
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id,
    plan: data.plan as ExtractedPlan,
    costUsd: Number(data.cost_usd),
    createdAt: new Date(data.created_at),
  }
}

/** Apaga a leitura guardada (depois de salvar o plano ou descartar). */
export async function deleteExtraction(id: string): Promise<void> {
  await client.from('ai_plan_extractions').delete().eq('id', id)
}

/** Quanto de uma cota de US$ `limit` o valor `usd` representa, em % inteiro (mínimo 1% se > 0). */
export type MealEstimate = {
  name: string
  description: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  notes: string[]
}

/** Custo típico de uma estimativa de refeição fora do plano. */
export const AI_ESTIMATE_ESTIMATE_USD = 0.005

/** Estima calorias e macros de algo comido fora do plano ("pipoca, 1 tigela média"). */
export async function estimateMealWithAi(
  description: string,
): Promise<{ ok: true; estimate: MealEstimate; costUsd: number } | { ok: false; error: string }> {
  const { data, error } = await client.functions.invoke('ai-extract-plan', { body: { mode: 'estimate', description } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json()
        if (body?.error) return { ok: false, error: String(body.error) }
      } catch {
        // corpo sem JSON: cai na mensagem genérica
      }
    }
    return { ok: false, error: 'Não foi possível falar com a IA agora. Confira a internet e tente de novo.' }
  }
  return { ok: true, estimate: data.estimate as MealEstimate, costUsd: Number(data.usage?.cost_usd ?? 0) }
}

export function quotaPercent(usd: number, limit: number): number {
  if (usd <= 0) return 0
  if (limit <= 0) return 100
  return Math.max(1, Math.round((usd / limit) * 100))
}

/** Custo típico de uma leitura de PDF com IA, para estimar a % da cota antes de ler. */
export const AI_READ_ESTIMATE_USD = 0.06
/** Custo típico de uma edição do plano com IA. */
export const AI_EDIT_ESTIMATE_USD = 0.03

/**
 * Se a resposta da IA não chegou (conexão caiu), procura o resultado guardado
 * no servidor por até `timeoutMs` (a IA costuma levar 30-90 s).
 */
export async function waitForSavedResult(startedAt: Date, timeoutMs = 150_000): Promise<SavedExtraction | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = await fetchLatestExtraction(startedAt)
    if (found) return found
    await new Promise((r) => setTimeout(r, 5_000))
  }
  return null
}

// ---------------------------------------------------------------------------
// Treino e atividades (só VIP; quem não é VIP usa o leitor local e a tabela)
// ---------------------------------------------------------------------------

type AiCall<T> = { ok: true; data: T; costUsd: number } | { ok: false; error: string }

async function callAi<T>(body: Record<string, unknown>, pick: (data: Record<string, unknown>) => T): Promise<AiCall<T>> {
  const { data, error } = await client.functions.invoke('ai-extract-plan', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = await error.context.json().catch(() => null)
      if (res?.error) return { ok: false, error: String(res.error) }
    }
    return { ok: false, error: 'Não foi possível falar com a IA agora. Confira a internet e tente de novo.' }
  }
  return { ok: true, data: pick(data), costUsd: Number(data.usage?.cost_usd ?? 0) }
}

export type AiWorkout = {
  name: string
  routines: { name: string; exercises: { name: string; sets_text: string; load_text: string; rest_text: string }[] }[]
  warnings: string[]
}

/** Lê o PDF do treino com a IA (qualquer formato). */
export async function readWorkoutWithAi(file: File): Promise<AiCall<AiWorkout>> {
  if (file.size > MAX_PDF_MB * 1024 * 1024) return { ok: false, error: `O PDF passa de ${MAX_PDF_MB} MB.` }
  return callAi({ mode: 'workout', pdf_base64: await fileToBase64(file) }, (d) => d.workout as AiWorkout)
}

export type AiActivity = { name: string; duration_min: number; kcal: number; notes: string[] }

/**
 * Gasto de uma atividade pela IA: uma rotina do treino com a duração, ou uma
 * atividade descrita em texto ("caminhei 40 min").
 */
export async function estimateActivityWithAi(input: {
  weight_kg: number | null
  routine?: { name: string; exercises: { name: string; sets_text: string; load_text: string }[] }
  duration_min?: number
  description?: string
}): Promise<AiCall<AiActivity>> {
  return callAi({ mode: 'activity', ...input }, (d) => d.activity as AiActivity)
}
