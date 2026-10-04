import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { HydrationSlot } from './plan'
import { timeToMinutes } from './plan'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

export type WaterLog = { id: string; log_date: string; logged_at: string; ml: number }

// ---------------------------------------------------------------------------
// Regras (puras, testadas em water.test.ts)
// ---------------------------------------------------------------------------

export function totalMl(logs: { ml: number }[]): number {
  return logs.reduce((sum, l) => sum + l.ml, 0)
}

/** Quanto falta para a meta (nunca negativo). O progresso é contra a meta, não contra o protocolo. */
export function remainingMl(targetMl: number, intakeMl: number): number {
  return Math.max(0, targetMl - intakeMl)
}

const BASE_QUICK_AMOUNTS = [200, 500]

/** Botões de registro rápido: 200 e 500 mL mais o volume mais comum do protocolo (até 3, cabem numa linha com "Outro"). */
export function quickAmounts(slots: Pick<HydrationSlot, 'ml'>[]): number[] {
  const fromPlan = [...new Set(slots.map((s) => s.ml).filter((ml) => ml >= 100 && ml <= 1000))]
  // Volume mais frequente do protocolo primeiro (ex.: 362 mL).
  fromPlan.sort((a, b) => slots.filter((s) => s.ml === b).length - slots.filter((s) => s.ml === a).length)
  const amounts = [...new Set([...BASE_QUICK_AMOUNTS, ...fromPlan.slice(0, 1)])]
  return amounts.sort((a, b) => a - b)
}

export type SlotStatus = HydrationSlot & { cumulativeMl: number; reached: boolean; due: boolean }

/**
 * Protocolo de horários como guia: um horário conta como cumprido quando o
 * total bebido no dia alcança a soma do protocolo até ele. `due` = o horário
 * já chegou.
 */
export function slotStatuses(slots: HydrationSlot[], intakeMl: number, nowMinutes: number): SlotStatus[] {
  let cumulative = 0
  return [...slots]
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((slot) => {
      cumulative += slot.ml
      return {
        ...slot,
        cumulativeMl: cumulative,
        reached: intakeMl >= cumulative,
        due: timeToMinutes(slot.time) <= nowMinutes,
      }
    })
}

/** Soma do protocolo até agora: quanto o plano previa ter bebido a esta hora. */
export function expectedByNow(slots: HydrationSlot[], nowMinutes: number): number {
  return slots.filter((s) => timeToMinutes(s.time) <= nowMinutes).reduce((sum, s) => sum + s.ml, 0)
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

const COLUMNS = 'id, log_date, logged_at, ml'

/** Registros do dia `date` (AAAA-MM-DD, dia local do usuário), do mais recente ao mais antigo. */
export async function fetchWaterLogs(date: string): Promise<WaterLog[]> {
  const { data, error } = await client
    .from('water_logs')
    .select(COLUMNS)
    .eq('log_date', date)
    .order('logged_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as WaterLog[]
}

export async function addWater(date: string, ml: number): Promise<WaterLog> {
  const { data, error } = await client.from('water_logs').insert({ log_date: date, ml }).select(COLUMNS).single()
  if (error) throw error
  return data as WaterLog
}

export async function deleteWater(id: string): Promise<void> {
  const { error } = await client.from('water_logs').delete().eq('id', id)
  if (error) throw error
}
