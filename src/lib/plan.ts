import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// O plano só é lido depois do login, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

export type Substitution = { id: string; text: string; position: number }

export type MealItem = {
  id: string
  food: string
  qty_text: string
  qty_value: number | null
  qty_unit: 'g' | 'mL' | 'un' | null
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  position: number
  substitutions: Substitution[]
}

export type Meal = {
  id: string
  name: string
  /** "HH:MM:SS", como o Postgres devolve o tipo time. */
  time: string
  position: number
  meal_items: MealItem[]
}

export type HydrationSlot = { id: string; time: string; ml: number; label: string | null }

export type Plan = {
  id: string
  name: string
  status_note: string | null
  target_kcal: number | null
  target_protein_g: number | null
  target_carbs_g: number | null
  target_fat_g: number | null
  target_water_ml: number | null
  notes: string[]
  meals: Meal[]
  hydration_slots: HydrationSlot[]
}

/** Plano ativo do próprio usuário (ou de uma pessoa da casa, com memberId), com tudo dentro. */
export async function fetchActivePlan(memberId: string | null = null): Promise<Plan | null> {
  const query = client
    .from('plans')
    .select(
      `id, name, status_note, target_kcal, target_protein_g, target_carbs_g, target_fat_g,
       target_water_ml, notes,
       meals (id, name, time, position,
         meal_items (id, food, qty_text, qty_value, qty_unit, kcal, protein_g, carbs_g, fat_g, position,
           substitutions (id, text, position))),
       hydration_slots (id, time, ml, label)`,
    )
    .eq('active', true)
  const { data, error } = await (memberId ? query.eq('household_member_id', memberId) : query.is('household_member_id', null)).maybeSingle()

  if (error) throw error
  if (!data) return null

  const plan = data as unknown as Plan
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position
  plan.meals.sort((a, b) => a.time.localeCompare(b.time) || a.position - b.position)
  for (const meal of plan.meals) {
    meal.meal_items.sort(byPosition)
    for (const item of meal.meal_items) item.substitutions.sort(byPosition)
  }
  plan.hydration_slots.sort((a, b) => a.time.localeCompare(b.time))
  return plan
}

/** "07:00:00" -> minutos desde a meia-noite. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** "07:00:00" -> "07:00". */
export function formatTime(time: string): string {
  return time.slice(0, 5)
}

/** Minutos desde a meia-noite, agora, no fuso do usuário (não no do aparelho). */
export function nowMinutesIn(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

/**
 * Data de hoje ("AAAA-MM-DD") no fuso do usuário, não no UTC nem no do
 * aparelho: 23h em São Paulo ainda é o mesmo dia, mesmo já sendo amanhã em UTC.
 */
export function localDateIn(timeZone: string, now = new Date()): string {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Uma refeição continua "agora" por este tempo depois do horário dela. */
export const CURRENT_MEAL_WINDOW_MIN = 60

/**
 * Refeição em destaque: a primeira ainda não feita cujo horário não passou há
 * mais de CURRENT_MEAL_WINDOW_MIN. Sem nenhuma assim, -1.
 */
export function highlightedMealIndex(meals: Meal[], nowMinutes: number, doneMealIds: Set<string> = new Set()): number {
  return meals.findIndex(
    (m) => !doneMealIds.has(m.id) && timeToMinutes(m.time) + CURRENT_MEAL_WINDOW_MIN > nowMinutes,
  )
}

/**
 * Soma de calorias e macros. Um macro `null` é DESCONHECIDO (o plano não
 * informa), não zero: muitos planos trazem só as calorias por alimento.
 */
export type Totals = { kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null }

export const ZERO_TOTALS: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

const addMacro = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b)

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: addMacro(a.protein_g, b.protein_g),
    carbs_g: addMacro(a.carbs_g, b.carbs_g),
    fat_g: addMacro(a.fat_g, b.fat_g),
  }
}

/**
 * Valores de um alimento. Sem calorias (ex.: "canela a gosto") ele não pesa
 * na conta; com calorias mas sem um macro, aquele macro fica desconhecido.
 */
export function itemTotals(i: Pick<MealItem, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>): Totals {
  if (i.kcal === null) return ZERO_TOTALS
  return { kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g }
}

export function sumItems(items: MealItem[]): Totals {
  return items.reduce((t, i) => addTotals(t, itemTotals(i)), ZERO_TOTALS)
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

/** "em 1h20", "em 15 min". */
export function formatIn(minutes: number): string {
  if (minutes < 60) return `em ${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `em ${h}h${String(m).padStart(2, '0')}` : `em ${h}h`
}
