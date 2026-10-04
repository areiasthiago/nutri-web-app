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
// - item sem quantidade em g, mL ou unidade vai para uma parte separada;
// - cada item do plano vira ingredientes de mercado ("Ovo mexido" → Ovo;
//   "Salada de tomate com cheiro verde" → Tomate + Cheiro verde): pela IA (só
//   VIP, quantidades já em cru) ou ajuste à mão; sem isso, pelas regras
//   automáticas abaixo (ruleIngredients).

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
// Item do plano → ingredientes de compra (regras, sem IA)
// ---------------------------------------------------------------------------

/** Chave de um item do plano (alimento + quantidade): liga o item aos ingredientes guardados. */
export function itemKey(food: string, qtyText: string): string {
  return `${foodKey(food)}|${foodKey(qtyText)}`.slice(0, 300)
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// Preparo que não muda o que se compra ("ovo mexido" = ovo).
const PREP =
  /\b(mexid|cozid|grelhad|assad|refogad|frit|picad|ralad|desfiad|amassad|fatiad|temperad|torrad|tostad|cru|crua|crus|cruas)[oa]?s?\b|\b(no vapor|ao forno|na air ?fryer|em cubos|em rodelas|em tiras|sem pele|sem osso|a gosto)\b/g

/** Limpa o nome do preparo: "Peito de frango grelhado" → "Peito de frango". */
export function shoppingName(text: string): string {
  const cleaned = text
    .replace(/\(.*?\)/g, ' ')
    .toLowerCase()
    .replace(/^(salada|prato|por[cç][aã]o|mix|creme|sopa|caldo|omelete|panqueca) de /, '')
    .replace(PREP, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(de|do|da|com)$/, '')
    .trim()
    // "ovos", "ovo" e omelete são o mesmo item de compra.
    .replace(/^ovos?\b/, 'ovo')
    .replace(/^omelete$/, 'ovo')
  return capitalize(cleaned || text.trim())
}

/**
 * Ingredientes pelas regras (quem não usa IA): separa por "com", " e ", vírgula
 * e "+", tira o preparo do nome e dá a quantidade do item ao primeiro
 * ingrediente; os demais ficam sem quantidade. Ovo/omelete com "N ovos" vira
 * Ovo em unidades.
 */
export function ruleIngredients(item: Pick<PlanItem, 'food' | 'qty_text' | 'qty_value' | 'qty_unit'>): Ingredient[] {
  const text = `${item.food} ${item.qty_text}`.toLowerCase()
  const unit = item.qty_unit === 'g' || item.qty_unit === 'mL' || item.qty_unit === 'un' ? item.qty_unit : null
  const eggs = text.match(/(\d+)\s*ovos?\b/)
  const parts = item.food
    .split(/\s+com\s+|\s+e\s+|,|\+/i)
    .map((p) => p.trim())
    .filter(Boolean)
  const names = [...new Set(parts.map(shoppingName))]
  if (/^omelete|^ovos?\b/i.test(item.food.trim()) && names[0] !== 'Ovo') names.unshift('Ovo')
  return names.map((name, i) => {
    if (name === 'Ovo' && eggs) return { name, qty_value: Number(eggs[1]), qty_unit: 'un' as const }
    if (i === 0 && unit && item.qty_value && item.qty_value > 0) return { name, qty_value: item.qty_value, qty_unit: unit }
    return { name, qty_value: null, qty_unit: null }
  })
}

// ---------------------------------------------------------------------------
// Entrada e cálculo
// ---------------------------------------------------------------------------

/** Ingrediente de compra de uma porção de um item do plano (quantidade em cru; null = sem quantidade). */
export type Ingredient = { name: string; qty_value: number | null; qty_unit: Unit | null }

export type PlanItem = {
  food: string
  qty_text: string
  qty_value: number | null
  qty_unit: string | null
  /** Ingredientes da IA ou ajustados à mão (em cru); null/ausente = regras automáticas. */
  ingredients?: Ingredient[] | null
}

export type PlanPerson = {
  /** "Você" ou o apelido. */
  label: string
  /** Refeições em casa ("dia:refeição"); null = todas, todos os dias. */
  homeMeals: string[] | null
  meals: { name: string; time: string; items: PlanItem[] }[]
}

/** Item do plano de onde veio uma linha (para ajustar os ingredientes dele). */
export type ItemSource = { itemKey: string; food: string; qty_text: string }

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
  /** Convertida de pronto para cru pelo rendimento (dá para ajustar); falso para ingredientes já em cru e extras. */
  cooked: boolean
  /** Itens do plano que entram nesta linha. */
  sources: ItemSource[]
  /** Quem também come este produto sem quantidade definida ("à vontade"): a compra é "total +". */
  plusUnquantified: string[]
}

export type UnquantifiedLine = { key: string; name: string; who: string[]; sources: ItemSource[] }

export const ALL_DAYS_SLOTS: Record<HouseSlot, number> = { cafe: 7, almoco: 7, lanche: 7, jantar: 7 }

const ALL_WEEK = 7

export function buildShoppingList(input: ShoppingInput): { lines: ShoppingLine[]; unquantified: UnquantifiedLine[] } {
  const lines = new Map<string, ShoppingLine>()
  const unquantified = new Map<string, UnquantifiedLine>()
  const yieldFor = (name: string) => input.yields.get(foodKey(name)) ?? defaultYield(name)

  const addSource = (list: ItemSource[], source?: ItemSource) => {
    if (source && !list.some((x) => x.itemKey === source.itemKey)) list.push(source)
  }

  function add(name: string, unit: Unit, amount: number, label: string, cooked: boolean, source?: ItemSource) {
    if (!(amount > 0)) return
    const y = cooked && unit !== 'un' ? yieldFor(name) : 1
    const raw = amount / y
    const key = `${foodKey(name)}|${unit}`
    const line = lines.get(key) ?? { key, name: name.trim(), unit, total: 0, parts: [], yield: y, cooked: false, sources: [], plusUnquantified: [] }
    line.total += raw
    line.cooked ||= cooked && unit !== 'un'
    const part = line.parts.find((p) => p.label === label)
    if (part) part.amount += raw
    else line.parts.push({ label, amount: raw })
    addSource(line.sources, source)
    lines.set(key, line)
  }

  function addUnquantified(name: string, label: string, source?: ItemSource) {
    const k = foodKey(name)
    const u = unquantified.get(k) ?? { key: k, name: name.trim(), who: [], sources: [] }
    if (!u.who.includes(label)) u.who.push(label)
    addSource(u.sources, source)
    unquantified.set(k, u)
  }

  for (const person of input.planPeople) {
    const perWeek = person.homeMeals ? timesPerWeek(person.homeMeals) : ALL_DAYS_SLOTS
    for (const meal of person.meals) {
      const days = perWeek[mealSlot(meal.name, meal.time)] ?? ALL_WEEK
      if (!days) continue
      for (const item of meal.items) {
        const source: ItemSource = { itemKey: itemKey(item.food, item.qty_text), food: item.food, qty_text: item.qty_text }
        if (item.ingredients) {
          // IA ou ajuste à mão: já em cru, sem rendimento.
          for (const ing of item.ingredients) {
            if (ing.qty_unit && ing.qty_value && ing.qty_value > 0) add(ing.name, ing.qty_unit, ing.qty_value * days, person.label, false, source)
            else addUnquantified(ing.name, person.label, source)
          }
          continue
        }
        // Regras automáticas: o ingrediente principal leva a quantidade (convertida pelo rendimento).
        for (const ing of ruleIngredients(item)) {
          if (ing.qty_unit && ing.qty_value && ing.qty_value > 0) add(ing.name, ing.qty_unit, ing.qty_value * days, person.label, ing.qty_unit !== 'un', source)
          else addUnquantified(ing.name, person.label, source)
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

  // Mesmo produto com e sem quantidade (tomate da omelete + salada de tomate à
  // vontade): uma linha só, "420 g +", em vez de duas.
  for (const [k, u] of unquantified) {
    const line = [...lines.values()].find((l) => foodKey(l.name) === k)
    if (!line) continue
    for (const w of u.who) if (!line.plusUnquantified.includes(w)) line.plusUnquantified.push(w)
    for (const src of u.sources) addSource(line.sources, src)
    unquantified.delete(k)
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

