import type { SupabaseClient } from '@supabase/supabase-js'
import type { Meal, Totals } from './plan'
import { sumItems } from './plan'
import { supabase } from './supabaseClient'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

/** Troca usada num alimento da refeição. */
export type Swap = { item_id: string; food: string; substitution: string }

export type MealLog = {
  id: string
  meal_id: string
  log_date: string
  done_at: string
  swaps: Swap[]
  /** Preenchidos quando a pessoa comeu outra coisa no lugar da refeição do plano. */
  custom_meal_id: string | null
  actual_name: string | null
  actual_kcal: number | null
  actual_protein_g: number | null
  actual_carbs_g: number | null
  actual_fat_g: number | null
}

/** O que foi comido fora do plano (copiado no registro, para o histórico). */
export type OffPlanFood = {
  custom_meal_id: string | null
  name: string
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

const COLUMNS =
  'id, meal_id, log_date, done_at, swaps, custom_meal_id, actual_name, actual_kcal, actual_protein_g, actual_carbs_g, actual_fat_g'

export const isOffPlan = (log: MealLog | undefined) => !!log?.actual_name

/**
 * Quanto foi comido no dia, só nas refeições marcadas: a refeição do plano
 * conta pelos valores do plano; a "fora do plano", pelo que foi registrado.
 */
export function consumedTotals(meals: Meal[], logsByMeal: Map<string, MealLog>): Totals {
  const total: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  for (const meal of meals) {
    const log = logsByMeal.get(meal.id)
    if (!log) continue
    const part: Totals = isOffPlan(log)
      ? {
          kcal: log.actual_kcal ?? 0,
          protein_g: log.actual_protein_g ?? 0,
          carbs_g: log.actual_carbs_g ?? 0,
          fat_g: log.actual_fat_g ?? 0,
        }
      : sumItems(meal.meal_items)
    total.kcal += part.kcal
    total.protein_g += part.protein_g
    total.carbs_g += part.carbs_g
    total.fat_g += part.fat_g
  }
  return total
}

/** Refeições marcadas como feitas no dia `date` (AAAA-MM-DD, dia local do usuário). */
export async function fetchMealLogs(date: string): Promise<MealLog[]> {
  const { data, error } = await client.from('meal_logs').select(COLUMNS).eq('log_date', date)
  if (error) throw error
  return (data ?? []) as MealLog[]
}

export async function markMealDone(meal: Meal, date: string, swaps: Swap[]): Promise<MealLog> {
  return upsertLog(meal, date, {
    swaps,
    custom_meal_id: null,
    actual_name: null,
    actual_kcal: null,
    actual_protein_g: null,
    actual_carbs_g: null,
    actual_fat_g: null,
  })
}

/** Marca a refeição como feita, mas com outra comida no lugar da do plano. */
export async function markMealOffPlan(meal: Meal, date: string, food: OffPlanFood): Promise<MealLog> {
  return upsertLog(meal, date, {
    swaps: [],
    custom_meal_id: food.custom_meal_id,
    actual_name: food.name,
    actual_kcal: food.kcal,
    actual_protein_g: food.protein_g,
    actual_carbs_g: food.carbs_g,
    actual_fat_g: food.fat_g,
  })
}

async function upsertLog(meal: Meal, date: string, fields: Record<string, unknown>): Promise<MealLog> {
  const { data, error } = await client
    .from('meal_logs')
    .upsert(
      {
        meal_id: meal.id,
        log_date: date,
        meal_name: meal.name,
        meal_time: meal.time,
        done_at: new Date().toISOString(),
        ...fields,
      },
      { onConflict: 'owner_id,log_date,meal_id' },
    )
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data as MealLog
}

export async function unmarkMeal(mealId: string, date: string): Promise<void> {
  const { error } = await client.from('meal_logs').delete().eq('meal_id', mealId).eq('log_date', date)
  if (error) throw error
}

export async function updateSwaps(logId: string, swaps: Swap[]): Promise<void> {
  const { error } = await client.from('meal_logs').update({ swaps }).eq('id', logId)
  if (error) throw error
}
