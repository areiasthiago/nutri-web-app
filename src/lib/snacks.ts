import type { SupabaseClient } from '@supabase/supabase-js'
import type { OffPlanFood } from './mealLogs'
import type { Totals } from './plan'
import { ZERO_TOTALS, addTotals, itemTotals } from './plan'
import { supabase } from './supabaseClient'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

/** Algo comido fora das refeições do plano ("Comeu fora de hora?"). */
export type SnackLog = {
  id: string
  log_date: string
  logged_at: string
  name: string
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

const COLUMNS = 'id, log_date, logged_at, name, kcal, protein_g, carbs_g, fat_g'

/** Soma do que foi comido fora de hora (macro desconhecido de um item deixa o total desconhecido). */
export function snackTotals(snacks: SnackLog[]): Totals {
  return snacks.reduce((t, s) => addTotals(t, itemTotals(s)), ZERO_TOTALS)
}

/**
 * Soma ao total (ou à diferença do plano) o que foi comido fora de hora: tudo
 * isso fica acima do plano, que não previa nada fora das refeições.
 */
export function plusSnacks(base: Totals, snacks: SnackLog[]): Totals {
  return addTotals(base, snackTotals(snacks))
}

export async function fetchSnacks(date: string): Promise<SnackLog[]> {
  const { data, error } = await client
    .from('snack_logs')
    .select(COLUMNS)
    .eq('log_date', date)
    .order('logged_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as SnackLog[]
}

export async function addSnack(date: string, food: OffPlanFood): Promise<SnackLog> {
  const { data, error } = await client
    .from('snack_logs')
    .insert({
      log_date: date,
      custom_meal_id: food.custom_meal_id,
      name: food.name,
      kcal: food.kcal,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
    })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data as SnackLog
}

export async function deleteSnack(id: string): Promise<void> {
  const { error } = await client.from('snack_logs').delete().eq('id', id)
  if (error) throw error
}
