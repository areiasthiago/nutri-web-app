import type { SupabaseClient } from '@supabase/supabase-js'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { fetchAiAccess } from './ai'
import { fetchExtras, fetchHouseFoods, fetchMembers } from './household'
import type { SectionKey } from './marketSections'
import { itemKey } from './shopping'
import type { Ingredient, ShoppingInput } from './shopping'
import { supabase } from './supabaseClient'

// Banco da lista de compras: junta os planos ativos (do usuário e das pessoas
// da casa), as pessoas sem plano, a comida da casa, os extras e os rendimentos
// escolhidos. O cálculo fica em shopping.ts.

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

type PlanRow = {
  household_member_id: string | null
  meals: { name: string; time: string; meal_items: { food: string; qty_text: string; qty_value: number | null; qty_unit: string | null }[] }[]
}

export async function fetchShoppingInput(): Promise<ShoppingInput> {
  const [plans, members, houseFoods, extras, yields, maps] = await Promise.all([
    client
      .from('plans')
      .select('household_member_id, meals (name, time, meal_items (food, qty_text, qty_value, qty_unit))')
      .eq('active', true),
    fetchMembers(),
    fetchHouseFoods(),
    fetchExtras(),
    client.from('food_yields').select('food_key, yield'),
    client.from('ingredient_maps').select('item_key, ingredients'),
  ])
  if (plans.error) throw plans.error
  if (yields.error) throw yields.error
  if (maps.error) throw maps.error
  const ingredientsByItem = new Map(
    (maps.data ?? []).map((m: { item_key: string; ingredients: Ingredient[] }) => [m.item_key, m.ingredients]),
  )

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
        items: m.meal_items.map((i) => ({
          food: i.food,
          qty_text: i.qty_text ?? '',
          qty_value: i.qty_value === null ? null : Number(i.qty_value),
          qty_unit: i.qty_unit,
          ingredients: ingredientsByItem.get(itemKey(i.food, i.qty_text ?? '')) ?? null,
        })),
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

// ---------------------------------------------------------------------------
// Ingredientes de cada item do plano (IA só para VIP; ajuste à mão para todos)
// ---------------------------------------------------------------------------

/** Itens dos planos ativos que ainda não têm ingredientes guardados (sem repetir). */
export function itemsWithoutIngredients(input: ShoppingInput): { key: string; food: string; qty_text: string }[] {
  const out = new Map<string, { key: string; food: string; qty_text: string }>()
  for (const person of input.planPeople) {
    for (const meal of person.meals) {
      for (const item of meal.items) {
        if (item.ingredients) continue
        const key = itemKey(item.food, item.qty_text)
        if (!out.has(key)) out.set(key, { key, food: item.food, qty_text: item.qty_text })
      }
    }
  }
  return [...out.values()]
}

/** A IA pode ser usada agora? (VIP, termo aceito e saldo no mês.) Quem não é VIP nunca usa. */
export async function canUseAi(): Promise<boolean> {
  try {
    const access = await fetchAiAccess()
    return access.vip && access.consented && access.monthSpentUsd < access.monthLimitUsd
  } catch {
    return false
  }
}

let running: Promise<number> | null = null

/**
 * Pede à IA os ingredientes dos itens que faltam (de 100 em 100) e guarda.
 * Só chame depois de canUseAi(). Devolve quantos itens foram resolvidos.
 */
export function fillIngredientsWithAi(items: { key: string; food: string; qty_text: string }[]): Promise<number> {
  if (running) return running
  running = (async () => {
    let done = 0
    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100)
      const { data, error } = await client.functions.invoke('ai-extract-plan', { body: { mode: 'ingredients', items: chunk } })
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const body = await error.context.json().catch(() => null)
          throw new Error(body?.error ?? 'A IA não respondeu agora.')
        }
        throw error
      }
      done += (data?.items ?? []).length
    }
    return done
  })().finally(() => {
    running = null
  })
  return running
}

/**
 * Depois de salvar um plano: completa os ingredientes em segundo plano, se a
 * pessoa for VIP. Sem VIP, nada acontece (a lista usa as regras).
 */
export async function prepareIngredientsInBackground(): Promise<void> {
  try {
    if (!(await canUseAi())) return
    const missing = itemsWithoutIngredients(await fetchShoppingInput())
    if (missing.length) await fillIngredientsWithAi(missing)
  } catch {
    // Sem problema: a lista tenta de novo quando for aberta.
  }
}

/** Ajuste à mão dos ingredientes de um item (a IA nunca sobrescreve). */
export async function saveManualIngredients(source: { itemKey: string; food: string; qty_text: string }, ingredients: Ingredient[]): Promise<void> {
  const { error } = await client.from('ingredient_maps').upsert(
    {
      item_key: source.itemKey,
      food: source.food,
      qty_text: source.qty_text,
      ingredients,
      source: 'manual',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'owner_id,item_key' },
  )
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Seção do mercado escolhida pela pessoa
// ---------------------------------------------------------------------------

export async function fetchSections(): Promise<Map<string, SectionKey>> {
  const { data, error } = await client.from('food_sections').select('food_key, section')
  if (error) throw error
  return new Map((data ?? []).map((r: { food_key: string; section: SectionKey }) => [r.food_key, r.section]))
}

/** Guarda a seção de um item; null volta à seção deduzida pelo nome. */
export async function saveSection(foodKey: string, section: SectionKey | null): Promise<void> {
  const { error } =
    section === null
      ? await client.from('food_sections').delete().eq('food_key', foodKey)
      : await client.from('food_sections').upsert({ food_key: foodKey, section }, { onConflict: 'owner_id,food_key' })
  if (error) throw error
}
