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
  | { ok: true; plan: ExtractedPlan; costUsd: number }
  | { ok: false; error: string }

/** Manda o PDF para a Edge Function ai-extract-plan (Claude) e devolve o plano lido. */
export async function extractPlanFromPdf(file: File): Promise<ExtractResult> {
  if (file.size > MAX_PDF_MB * 1024 * 1024) {
    return { ok: false, error: `O PDF passa de ${MAX_PDF_MB} MB.` }
  }
  const pdf_base64 = await fileToBase64(file)
  const { data, error } = await client.functions.invoke('ai-extract-plan', { body: { pdf_base64 } })

  if (error) {
    // A função devolve { error: "mensagem em português" } nos erros previstos.
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
  return { ok: true, plan: data.plan as ExtractedPlan, costUsd: Number(data.usage?.cost_usd ?? 0) }
}

export function formatUsd(n: number): string {
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
