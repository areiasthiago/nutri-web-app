import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchExtras, fetchHouseFoods, fetchMembers } from './household'
import type { ShoppingInput } from './shopping'
import { supabase } from './supabaseClient'

// Banco da lista de compras: junta os planos ativos (do usuário e das pessoas
// da casa), as pessoas sem plano, a comida da casa, os extras e os rendimentos
// escolhidos. O cálculo fica em shopping.ts.

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

type PlanRow = {
  household_member_id: string | null
  meals: { name: string; time: string; meal_items: { food: string; qty_value: number | null; qty_unit: string | null }[] }[]
}

export async function fetchShoppingInput(): Promise<ShoppingInput> {
  const [plans, members, houseFoods, extras, yields] = await Promise.all([
    client
      .from('plans')
      .select('household_member_id, meals (name, time, meal_items (food, qty_value, qty_unit))')
      .eq('active', true),
    fetchMembers(),
    fetchHouseFoods(),
    fetchExtras(),
    client.from('food_yields').select('food_key, yield'),
  ])
  if (plans.error) throw plans.error
  if (yields.error) throw yields.error

  const rows = (plans.data ?? []) as PlanRow[]
  const byMember = new Map(members.map((m) => [m.id, m]))
  const planPeople: ShoppingInput['planPeople'] = []
  for (const p of rows) {
    const member = p.household_member_id ? byMember.get(p.household_member_id) : null
    if (p.household_member_id && !member) continue
    planPeople.push({
      label: member ? member.nickname : 'Você',
      homeMeals: member ? member.home_meals : null,
      meals: p.meals.map((m) => ({
        name: m.name,
        time: m.time,
        items: m.meal_items.map((i) => ({ food: i.food, qty_value: i.qty_value === null ? null : Number(i.qty_value), qty_unit: i.qty_unit })),
      })),
    })
  }
  // O usuário primeiro; depois as pessoas na ordem da casa.
  planPeople.sort((a, b) => (a.label === 'Você' ? -1 : b.label === 'Você' ? 1 : 0))

  return {
    planPeople,
    housePeople: members.filter((m) => !m.has_plan).map((m) => ({ label: m.nickname, factor: m.factor, homeMeals: m.home_meals })),
    houseFoods: houseFoods.map((f) => ({ name: f.name, slot: f.slot, qty_value: f.qty_value, qty_unit: f.qty_unit })),
    extras: extras.map((x) => ({ name: x.name, qty_value: x.qty_value, qty_unit: x.qty_unit })),
    yields: new Map((yields.data ?? []).map((y: { food_key: string; yield: number }) => [y.food_key, Number(y.yield)])),
  }
}

/** Rendimento escolhido para um alimento; null volta ao padrão do app. */
export async function saveYield(foodKey: string, value: number | null): Promise<void> {
  const { error } =
    value === null
      ? await client.from('food_yields').delete().eq('food_key', foodKey)
      : await client.from('food_yields').upsert({ food_key: foodKey, yield: value }, { onConflict: 'owner_id,food_key' })
  if (error) throw error
}

export async function fetchChecks(weekStart: string): Promise<Set<string>> {
  const { data, error } = await client.from('shopping_checks').select('item_key').eq('week_start', weekStart)
  if (error) throw error
  return new Set((data ?? []).map((c: { item_key: string }) => c.item_key))
}

export async function setChecked(weekStart: string, itemKey: string, checked: boolean): Promise<void> {
  const { error } = checked
    ? await client.from('shopping_checks').upsert({ week_start: weekStart, item_key: itemKey }, { onConflict: 'owner_id,week_start,item_key' })
    : await client.from('shopping_checks').delete().eq('week_start', weekStart).eq('item_key', itemKey)
  if (error) throw error
}

/** Recomeçar a lista da semana: desmarca tudo. */
export async function clearChecks(weekStart: string): Promise<void> {
  const { error } = await client.from('shopping_checks').delete().eq('week_start', weekStart)
  if (error) throw error
}
