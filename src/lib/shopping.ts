import type { HouseSlot } from './household'
import { timesPerWeek } from './household'

// Lista de compras da semana (briefing, seção 7). Regras puras, testadas em
// shopping.test.ts:
// - planos (o do usuário e os das pessoas da casa): quantidade × dias em que a
//   refeição é feita em casa, usando o alimento principal (não as trocas);
// - pessoas sem plano: porção da comida da casa × fator × refeições em casa;
// - extras da casa, por semana;
// - o plano traz o peso do alimento pronto e a compra é do cru: cru = pronto ÷
//   rendimento (carnes perdem peso, arroz e feijão ganham);
// - itens iguais são somados, guardando quanto veio de cada pessoa;
// - item sem quantidade em g, mL ou unidade vai para uma parte separada.

export type Unit = 'g' | 'mL' | 'un'

// ---------------------------------------------------------------------------
// Nomes e rendimento
// ---------------------------------------------------------------------------

/** Chave para juntar itens iguais: minúsculas, sem acento, sem espaços extras. */
export function foodKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Rendimento padrão (pronto ÷ cru), editável por alimento. Padrões do
 * briefing: carnes e frango 0,72; arroz 2,7; feijão 2,3. O resto, 1 (compra =
 * quantidade do plano).
 */
export function defaultYield(name: string): number {
  const k = foodKey(name)
  if (/\barroz\b/.test(k)) return 2.7
  if (/\bfeij(ao|oes)\b/.test(k)) return 2.3
  if (/\b(carne|frango|peito de frango|file|bife|patinho|acem|alcatra|maminha|musculo|lagarto|coxao|fraldinha|picanha|contra.?file|sobrecoxa|coxa|carne moida|suino|lombo|pernil|peixe|tilapia|salmao|merluza|pescada|atum fresco)\b/.test(k)) return 0.72
  return 1
}

// ---------------------------------------------------------------------------
// Refeição do plano → refeição da casa
// ---------------------------------------------------------------------------

/** A que refeição da casa corresponde uma refeição do plano (pelo nome; senão pelo horário). */
export function mealSlot(name: string, time: string): HouseSlot {
  const n = foodKey(name)
  if (/cafe|desjejum/.test(n)) return 'cafe'
  if (/almo/.test(n)) return 'almoco'
  if (/jant/.test(n)) return 'jantar'
  if (/lanche|colacao|ceia/.test(n)) return 'lanche'
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  if (minutes < 10 * 60) return 'cafe'
  if (minutes < 15 * 60) return 'almoco'
  if (minutes < 18 * 60 + 30) return 'lanche'
  return 'jantar'
}

// ---------------------------------------------------------------------------
// Entrada e cálculo
// ---------------------------------------------------------------------------

export type PlanPerson = {
  /** "Você" ou o apelido. */
  label: string
  /** Refeições em casa ("dia:refeição"); null = todas, todos os dias. */
  homeMeals: string[] | null
  meals: { name: string; time: string; items: { food: string; qty_value: number | null; qty_unit: string | null }[] }[]
}

export type HousePerson = { label: string; factor: number; homeMeals: string[] }
export type HouseFoodPortion = { name: string; slot: HouseSlot; qty_value: number; qty_unit: Unit }
export type Extra = { name: string; qty_value: number; qty_unit: Unit | 'kg' | 'L' }

export type ShoppingInput = {
  planPeople: PlanPerson[]
  housePeople: HousePerson[]
  houseFoods: HouseFoodPortion[]
  extras: Extra[]
  /** Rendimento escolhido pela pessoa, por foodKey (sobrepõe o padrão). */
  yields: Map<string, number>
}

export type ShoppingLine = {
  /** foodKey + unidade: identifica a linha (marcar como comprado). */
  key: string
  name: string
  unit: Unit
  /** Total da semana, já em cru. */
  total: number
  /** Quanto veio de cada pessoa (ou "Extras da casa"). */
  parts: { label: string; amount: number }[]
  /** Rendimento aplicado (1 = sem conversão). */
  yield: number
  /** Vem de plano ou comida da casa (dá para ajustar o rendimento); extras não. */
  cooked: boolean
}

export type UnquantifiedLine = { key: string; name: string; who: string[] }

export const ALL_DAYS_SLOTS: Record<HouseSlot, number> = { cafe: 7, almoco: 7, lanche: 7, jantar: 7 }

const ALL_WEEK = 7

export function buildShoppingList(input: ShoppingInput): { lines: ShoppingLine[]; unquantified: UnquantifiedLine[] } {
  const lines = new Map<string, ShoppingLine>()
  const unquantified = new Map<string, UnquantifiedLine>()
  const yieldFor = (name: string) => input.yields.get(foodKey(name)) ?? defaultYield(name)

  function add(name: string, unit: Unit, amount: number, label: string, cooked: boolean) {
    if (!(amount > 0)) return
    const y = cooked && unit !== 'un' ? yieldFor(name) : 1
    const raw = amount / y
    const key = `${foodKey(name)}|${unit}`
    const line = lines.get(key) ?? { key, name: name.trim(), unit, total: 0, parts: [], yield: y, cooked: false }
    line.total += raw
    line.cooked ||= cooked && unit !== 'un'
    const part = line.parts.find((p) => p.label === label)
    if (part) part.amount += raw
    else line.parts.push({ label, amount: raw })
    lines.set(key, line)
  }

  for (const person of input.planPeople) {
    const perWeek = person.homeMeals ? timesPerWeek(person.homeMeals) : ALL_DAYS_SLOTS
    for (const meal of person.meals) {
      const days = perWeek[mealSlot(meal.name, meal.time)] ?? ALL_WEEK
      if (!days) continue
      for (const item of meal.items) {
        const unit = item.qty_unit === 'g' || item.qty_unit === 'mL' || item.qty_unit === 'un' ? item.qty_unit : null
        if (unit && item.qty_value && item.qty_value > 0) {
          add(item.food, unit, item.qty_value * days, person.label, true)
        } else {
          const k = foodKey(item.food)
          const u = unquantified.get(k) ?? { key: k, name: item.food.trim(), who: [] }
          if (!u.who.includes(person.label)) u.who.push(person.label)
          unquantified.set(k, u)
        }
      }
    }
  }

  for (const person of input.housePeople) {
    const perWeek = timesPerWeek(person.homeMeals)
    for (const food of input.houseFoods) {
      const times = perWeek[food.slot]
      if (times) add(food.name, food.qty_unit, food.qty_value * person.factor * times, person.label, true)
    }
  }

  for (const x of input.extras) {
    const [unit, value] =
      x.qty_unit === 'kg' ? (['g', x.qty_value * 1000] as const) : x.qty_unit === 'L' ? (['mL', x.qty_value * 1000] as const) : ([x.qty_unit, x.qty_value] as const)
    add(x.name, unit, value, 'Extras da casa', false)
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR')
  return { lines: [...lines.values()].sort(byName), unquantified: [...unquantified.values()].sort(byName) }
}

// ---------------------------------------------------------------------------
// Exibição e semana
// ---------------------------------------------------------------------------

const fmt = (n: number, digits = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits })

/** Quantidade para comprar, arredondada para cima: "850 g", "1,3 kg", "2 L", "13 un". */
export function formatAmount(amount: number, unit: Unit): string {
  if (unit === 'un') return `${fmt(Math.ceil(amount - 1e-9))} un`
  const big = unit === 'g' ? 'kg' : 'L'
  if (amount >= 1000) return `${fmt(Math.ceil(amount / 100 - 1e-9) / 10, 1)} ${big}`
  return `${fmt(Math.ceil(amount / 10 - 1e-9) * 10)} ${unit}`
}

/** Dia de compras de cada semana: hoje, se for o dia; senão o próximo. (AAAA-MM-DD; 0 = domingo.) */
export function weekStartFor(today: string, shoppingDay: number): string {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((shoppingDay - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
}

export const SHOPPING_DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

