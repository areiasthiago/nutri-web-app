import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Peso: um registro por dia (registrar de novo no mesmo dia troca o valor). O
// peso do perfil, usado no gasto das atividades, acompanha o registro mais
// recente (gatilho no banco). O app só mostra os números: não julga nem sugere.

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

export type WeightLog = { id: string; log_date: string; weight_kg: number }

const COLUMNS = 'id, log_date, weight_kg'
const normalize = (rows: { id: string; log_date: string; weight_kg: number | string }[]): WeightLog[] =>
  rows.map((r) => ({ ...r, weight_kg: Number(r.weight_kg) }))

/** Registros do período (inclusive), do mais antigo ao mais recente. */
export async function fetchWeights(from: string, to: string): Promise<WeightLog[]> {
  const { data, error } = await client.from('weight_logs').select(COLUMNS).gte('log_date', from).lte('log_date', to).order('log_date')
  if (error) throw error
  return normalize(data ?? [])
}

/** Os últimos registros até a data (inclusive), do mais recente ao mais antigo. */
export async function fetchLatestWeights(until: string, limit = 2): Promise<WeightLog[]> {
  const { data, error } = await client
    .from('weight_logs')
    .select(COLUMNS)
    .lte('log_date', until)
    .order('log_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return normalize(data ?? [])
}

/** Registra (ou troca) o peso do dia. */
export async function saveWeight(date: string, weightKg: number): Promise<WeightLog> {
  const { data, error } = await client
    .from('weight_logs')
    .upsert({ log_date: date, weight_kg: weightKg, logged_at: new Date().toISOString() }, { onConflict: 'owner_id,log_date' })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return normalize([data])[0]
}

export async function deleteWeight(id: string): Promise<void> {
  const { error } = await client.from('weight_logs').delete().eq('id', id)
  if (error) throw error
}

/** 82.5 → "82,5". */
export const formatKg = (kg: number) => kg.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Diferença com sinal: "+0,4" / "−1,2" / "0,0". */
export function formatKgDelta(delta: number): string {
  const r = Math.round(delta * 10) / 10
  if (r === 0) return '0,0'
  return `${r > 0 ? '+' : '−'}${formatKg(Math.abs(r))}`
}
