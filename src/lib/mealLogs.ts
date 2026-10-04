import type { SupabaseClient } from '@supabase/supabase-js'
import type { Meal } from './plan'
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
}

const COLUMNS = 'id, meal_id, log_date, done_at, swaps'

/** Refeições marcadas como feitas no dia `date` (AAAA-MM-DD, dia local do usuário). */
export async function fetchMealLogs(date: string): Promise<MealLog[]> {
  const { data, error } = await client.from('meal_logs').select(COLUMNS).eq('log_date', date)
  if (error) throw error
  return (data ?? []) as MealLog[]
}

export async function markMealDone(meal: Meal, date: string, swaps: Swap[]): Promise<MealLog> {
  const { data, error } = await client
    .from('meal_logs')
    .upsert(
      {
        meal_id: meal.id,
        log_date: date,
        meal_name: meal.name,
        meal_time: meal.time,
        swaps,
        done_at: new Date().toISOString(),
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
