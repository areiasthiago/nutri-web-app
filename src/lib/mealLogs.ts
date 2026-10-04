import type { SupabaseClient } from '@supabase/supabase-js'
import type { Meal, Totals } from './plan'
import { sumItems } from './plan'
import { supabase } from './supabaseClient'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

/**
 * Troca usada num alimento da refeição. Os valores nutricionais são da troca
 * (estimados pela IA ou vindos da lista "Já comi antes"); sem eles, o alimento
 * continua contando pelos valores do plano.
 */
export type Swap = {
  item_id: string
  food: string
  substitution: string
  kcal?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
  /** "Não comi": o alimento conta zero. */
  skipped?: boolean
}

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
 * A refeição saiu do plano: comeu outra coisa no lugar, ou trocou algum
 * alimento por algo fora das trocas previstas ("Outro…"). Trocas previstas e
 * "Não comi" não contam como fora do plano.
 */
export function leftThePlan(meal: Meal, log: MealLog | undefined): boolean {
  if (!log) return false
  if (isOffPlan(log)) return true
  return log.swaps.some((s) => {
    if (s.skipped) return false
    const item = meal.meal_items.find((i) => i.id === s.item_id)
    return !item?.substitutions.some((sub) => sub.text === s.substitution)
  })
}

const ZERO: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

function add(a: Totals, b: Totals): Totals {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    fat_g: a.fat_g + b.fat_g,
  }
}

/**
 * O que foi comido numa refeição marcada: "fora do plano" conta pelo que foi
 * registrado; senão, os alimentos do plano, com cada alimento trocado contando
 * pelos valores da troca (quando calculados).
 */
export function mealActualTotals(meal: Meal, log: MealLog): Totals {
  if (isOffPlan(log)) {
    return {
      kcal: log.actual_kcal ?? 0,
      protein_g: log.actual_protein_g ?? 0,
      carbs_g: log.actual_carbs_g ?? 0,
      fat_g: log.actual_fat_g ?? 0,
    }
  }
  return meal.meal_items.reduce((total, item) => {
    const swap = log.swaps.find((s) => s.item_id === item.id)
    const part: Totals =
      swap && swap.kcal !== null && swap.kcal !== undefined
        ? { kcal: swap.kcal, protein_g: swap.protein_g ?? 0, carbs_g: swap.carbs_g ?? 0, fat_g: swap.fat_g ?? 0 }
        : sumItems([item])
    return add(total, part)
  }, ZERO)
}

/** Quanto foi comido no dia, só nas refeições marcadas. */
export function consumedTotals(meals: Meal[], logsByMeal: Map<string, MealLog>): Totals {
  return meals.reduce((total, meal) => {
    const log = logsByMeal.get(meal.id)
    return log ? add(total, mealActualTotals(meal, log)) : total
  }, ZERO)
}

/**
 * Diferença entre o que foi comido e o que o plano previa, nas refeições
 * marcadas (positivo = acima do plano, negativo = abaixo).
 */
export function planDeviation(meals: Meal[], logsByMeal: Map<string, MealLog>): Totals {
  const done = meals.filter((m) => logsByMeal.has(m.id))
  const planned = sumItems(done.flatMap((m) => m.meal_items))
  const consumed = consumedTotals(done, logsByMeal)
  return {
    kcal: consumed.kcal - planned.kcal,
    protein_g: consumed.protein_g - planned.protein_g,
    carbs_g: consumed.carbs_g - planned.carbs_g,
    fat_g: consumed.fat_g - planned.fat_g,
  }
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
