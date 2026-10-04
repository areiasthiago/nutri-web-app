import type { SupabaseClient } from '@supabase/supabase-js'
import type { Plan } from './plan'
import { supabase } from './supabaseClient'

// Pessoas da casa, comida da casa e extras (briefing, seção 7). Só servem para
// estimar a compra da semana: o app não monta cardápio nem define porção de
// criança a partir do plano de ninguém.

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

// ---------------------------------------------------------------------------
// Refeições da casa e faixas de idade
// ---------------------------------------------------------------------------

export type HouseSlot = 'cafe' | 'almoco' | 'lanche' | 'jantar'

export const HOUSE_SLOTS: { key: HouseSlot; label: string; short: string }[] = [
  { key: 'cafe', label: 'Café da manhã', short: 'Café' },
  { key: 'almoco', label: 'Almoço', short: 'Almoço' },
  { key: 'lanche', label: 'Lanche', short: 'Lanche' },
  { key: 'jantar', label: 'Jantar', short: 'Jantar' },
]

/** Dias da semana, domingo = 0 (como Date.getDay). */
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export type AgeBand = '1-3' | '4-8' | '9-13' | '14-17'

export const AGE_BANDS: { key: AgeBand; label: string; factor: number }[] = [
  { key: '1-3', label: '1 a 3 anos', factor: 0.5 },
  { key: '4-8', label: '4 a 8 anos', factor: 0.7 },
  { key: '9-13', label: '9 a 13 anos', factor: 0.9 },
  { key: '14-17', label: '14 a 17 anos', factor: 1 },
]

/** Fator padrão (porção em relação a um adulto sem dieta); sempre editável. */
export function defaultFactor(kind: 'adult' | 'child', band: AgeBand | null): number {
  if (kind === 'adult') return 1
  return AGE_BANDS.find((b) => b.key === band)?.factor ?? 1
}

export const mealCode = (day: number, slot: HouseSlot) => `${day}:${slot}`

/** Todas as refeições, todos os dias (padrão de quem come tudo em casa). */
export const ALL_HOME_MEALS = WEEKDAYS.flatMap((_, d) => HOUSE_SLOTS.map((s) => mealCode(d, s.key)))

/** Liga/desliga uma refeição num dia. */
export function toggleHomeMeal(codes: string[], day: number, slot: HouseSlot): string[] {
  const code = mealCode(day, slot)
  return codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]
}

/** Quantas vezes por semana a pessoa faz cada refeição em casa. */
export function timesPerWeek(codes: string[]): Record<HouseSlot, number> {
  const out: Record<HouseSlot, number> = { cafe: 0, almoco: 0, lanche: 0, jantar: 0 }
  for (const c of codes) {
    const slot = c.split(':')[1] as HouseSlot
    if (slot in out) out[slot]++
  }
  return out
}

/** Resumo curto: "Todas as refeições em casa" ou "Almoço fora seg a sex" etc. */
export function homeMealsSummary(codes: string[]): string {
  if (codes.length === ALL_HOME_MEALS.length) return 'Todas as refeições em casa'
  if (codes.length === 0) return 'Nenhuma refeição em casa'
  const counts = timesPerWeek(codes)
  return HOUSE_SLOTS.filter((s) => counts[s.key] < 7)
    .map((s) => (counts[s.key] === 0 ? `${s.short} fora` : `${s.short} em casa ${counts[s.key]}x/semana`))
    .join(' · ')
}

// ---------------------------------------------------------------------------
// Sugestão de "comida da casa" a partir do almoço e do jantar do plano
// ---------------------------------------------------------------------------

export type HouseFoodDraft = { name: string; slot: HouseSlot; qty_value: number; qty_unit: 'g' | 'mL' | 'un' }

/** Refeição do plano que corresponde a almoço ou jantar (pelo nome; senão pelo horário). */
export function lunchOrDinner(name: string, time: string): 'almoco' | 'jantar' | null {
  const n = name.toLowerCase()
  if (n.includes('almo')) return 'almoco'
  if (n.includes('jant')) return 'jantar'
  if (/caf|lanche|cola|ceia/.test(n)) return null
  const h = Number(time.slice(0, 2))
  if (h >= 11 && h < 15) return 'almoco'
  if (h >= 18 && h < 22) return 'jantar'
  return null
}

/**
 * Ponto de partida para a comida da casa: os alimentos do almoço e do jantar
 * do plano que têm quantidade em g, mL ou unidade (sem repetir). É só uma
 * sugestão: a porção da casa é a de um adulto sem dieta, e a pessoa ajusta.
 */
export function suggestHouseFoods(plan: Pick<Plan, 'meals'>): HouseFoodDraft[] {
  const out: HouseFoodDraft[] = []
  const seen = new Set<string>()
  for (const meal of plan.meals) {
    const slot = lunchOrDinner(meal.name, meal.time)
    if (!slot) continue
    for (const item of meal.meal_items) {
      const unit = item.qty_unit === 'g' || item.qty_unit === 'mL' || item.qty_unit === 'un' ? item.qty_unit : null
      if (!unit || !item.qty_value || item.qty_value <= 0) continue
      const key = `${slot}:${item.food.trim().toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name: item.food.trim().slice(0, 60), slot, qty_value: item.qty_value, qty_unit: unit })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

export type HouseholdMember = {
  id: string
  nickname: string
  kind: 'adult' | 'child'
  age_band: AgeBand | null
  factor: number
  home_meals: string[]
  position: number
  /** Tem plano próprio ativo. */
  has_plan: boolean
}

export type MemberInput = Omit<HouseholdMember, 'id' | 'position' | 'has_plan'>

export async function fetchMembers(): Promise<HouseholdMember[]> {
  const [members, plans] = await Promise.all([
    client
      .from('household_members')
      .select('id, nickname, kind, age_band, factor, home_meals, position')
      .order('position')
      .order('created_at'),
    client.from('plans').select('household_member_id').eq('active', true).not('household_member_id', 'is', null),
  ])
  if (members.error) throw members.error
  if (plans.error) throw plans.error
  const withPlan = new Set((plans.data ?? []).map((p: { household_member_id: string }) => p.household_member_id))
  return (members.data ?? []).map((m) => ({ ...m, factor: Number(m.factor), has_plan: withPlan.has(m.id) })) as HouseholdMember[]
}

export async function fetchMember(id: string): Promise<HouseholdMember | null> {
  const { data, error } = await client
    .from('household_members')
    .select('id, nickname, kind, age_band, factor, home_meals, position')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? ({ ...data, factor: Number(data.factor), has_plan: false } as HouseholdMember) : null
}

/** Cria ou atualiza a pessoa; devolve o id. */
export async function saveMember(input: MemberInput, id?: string): Promise<string> {
  const row = { ...input, age_band: input.kind === 'child' ? input.age_band : null }
  const { data, error } = id
    ? await client.from('household_members').update(row).eq('id', id).select('id').single()
    : await client.from('household_members').insert(row).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Apaga a pessoa (e o plano dela, se houver). */
export async function deleteMember(id: string): Promise<void> {
  const { error } = await client.from('household_members').delete().eq('id', id)
  if (error) throw error
}

export type HouseFood = HouseFoodDraft & { id: string }

export async function fetchHouseFoods(): Promise<HouseFood[]> {
  const { data, error } = await client
    .from('house_foods')
    .select('id, name, slot, qty_value, qty_unit')
    .order('position')
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((f) => ({ ...f, qty_value: Number(f.qty_value) })) as HouseFood[]
}

export async function addHouseFoods(foods: HouseFoodDraft[]): Promise<void> {
  if (!foods.length) return
  const { error } = await client.from('house_foods').insert(foods)
  if (error) throw error
}

export async function updateHouseFood(id: string, food: HouseFoodDraft): Promise<void> {
  const { error } = await client.from('house_foods').update(food).eq('id', id)
  if (error) throw error
}

export async function deleteHouseFood(id: string): Promise<void> {
  const { error } = await client.from('house_foods').delete().eq('id', id)
  if (error) throw error
}

export type ExtraUnit = 'g' | 'kg' | 'mL' | 'L' | 'un'
export type HouseholdExtra = { id: string; name: string; qty_value: number; qty_unit: ExtraUnit }

export async function fetchExtras(): Promise<HouseholdExtra[]> {
  const { data, error } = await client
    .from('household_extras')
    .select('id, name, qty_value, qty_unit')
    .order('position')
    .order('created_at')
  if (error) throw error
  return (data ?? []).map((x) => ({ ...x, qty_value: Number(x.qty_value) })) as HouseholdExtra[]
}

export async function saveExtra(extra: Omit<HouseholdExtra, 'id'>, id?: string): Promise<void> {
  const { error } = id
    ? await client.from('household_extras').update(extra).eq('id', id)
    : await client.from('household_extras').insert(extra)
  if (error) throw error
}

export async function deleteExtra(id: string): Promise<void> {
  const { error } = await client.from('household_extras').delete().eq('id', id)
  if (error) throw error
}
