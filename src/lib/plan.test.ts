import { describe, expect, it } from 'vitest'
import { highlightedMealIndex, localDateIn, nowMinutesIn } from './plan'
import type { Meal } from './plan'
import { consumedTotals, leftThePlan, mealActualTotals, planDeviation } from './mealLogs'
import type { MealLog } from './mealLogs'

const SP = 'America/Sao_Paulo'

describe('localDateIn: o dia é o do fuso do usuário', () => {
  it('23h em São Paulo ainda é o mesmo dia (já é amanhã em UTC)', () => {
    // 3/out 23:30 em SP (UTC-3) = 4/out 02:30 UTC
    const now = new Date('2026-10-04T02:30:00Z')
    expect(localDateIn(SP, now)).toBe('2026-10-03')
    expect(localDateIn('UTC', now)).toBe('2026-10-04')
  })

  it('vira o dia à meia-noite local', () => {
    expect(localDateIn(SP, new Date('2026-10-04T02:59:00Z'))).toBe('2026-10-03') // 23:59 SP
    expect(localDateIn(SP, new Date('2026-10-04T03:00:00Z'))).toBe('2026-10-04') // 00:00 SP
  })

  it('respeita outros fusos do Brasil', () => {
    // 00:30 em SP = 23:30 do dia anterior em Manaus (UTC-4)
    const now = new Date('2026-10-04T03:30:00Z')
    expect(localDateIn(SP, now)).toBe('2026-10-04')
    expect(localDateIn('America/Manaus', now)).toBe('2026-10-03')
  })

  it('nowMinutesIn usa o mesmo fuso', () => {
    expect(nowMinutesIn(SP, new Date('2026-10-04T02:30:00Z'))).toBe(23 * 60 + 30)
  })
})

describe('highlightedMealIndex', () => {
  const meal = (id: string, time: string): Meal => ({ id, name: id, time: `${time}:00`, position: 0, meal_items: [] })
  const meals = [meal('cafe', '07:00'), meal('almoco', '12:30'), meal('jantar', '19:00')]

  it('destaca a próxima pelo horário', () => {
    expect(highlightedMealIndex(meals, 6 * 60)).toBe(0)
    expect(highlightedMealIndex(meals, 10 * 60)).toBe(1)
  })

  it('mantém a refeição em destaque por até 1h depois do horário', () => {
    expect(highlightedMealIndex(meals, 13 * 60)).toBe(1)
    expect(highlightedMealIndex(meals, 13 * 60 + 31)).toBe(2)
  })

  it('pula as refeições já feitas', () => {
    expect(highlightedMealIndex(meals, 12 * 60 + 40, new Set(['almoco']))).toBe(2)
    expect(highlightedMealIndex(meals, 6 * 60, new Set(['cafe', 'almoco']))).toBe(2)
  })

  it('sem refeição pendente no dia, -1', () => {
    expect(highlightedMealIndex(meals, 21 * 60)).toBe(-1)
    expect(highlightedMealIndex(meals, 18 * 60, new Set(['jantar']))).toBe(-1)
  })
})

describe('consumedTotals: o que foi comido no dia', () => {
  const item = (kcal: number, protein_g: number) => ({
    id: `i${kcal}`, food: 'x', qty_text: '', qty_value: null, qty_unit: null,
    kcal, protein_g, carbs_g: 0, fat_g: 0, position: 0, substitutions: [],
  })
  const meals: Meal[] = [
    { id: 'almoco', name: 'Almoço', time: '12:00:00', position: 0, meal_items: [item(300, 30), item(200, 5)] },
    { id: 'lanche', name: 'Lanche', time: '16:00:00', position: 1, meal_items: [item(150, 10)] },
    { id: 'ceia', name: 'Ceia', time: '21:30:00', position: 2, meal_items: [item(80, 5)] },
  ]
  const log = (meal_id: string, actual?: { name: string; kcal: number; protein_g: number }): MealLog => ({
    id: meal_id, meal_id, log_date: '2026-10-04', done_at: '', swaps: [],
    custom_meal_id: null, actual_name: actual?.name ?? null, actual_kcal: actual?.kcal ?? null,
    actual_protein_g: actual?.protein_g ?? null, actual_carbs_g: null, actual_fat_g: null,
  })

  it('soma só as refeições marcadas, pelos valores do plano', () => {
    const t = consumedTotals(meals, new Map([['almoco', log('almoco')]]))
    expect(t.kcal).toBe(500)
    expect(t.protein_g).toBe(35)
  })

  it('refeição fora do plano conta pelo que foi registrado, não pelo plano', () => {
    const t = consumedTotals(
      meals,
      new Map([
        ['almoco', log('almoco')],
        ['ceia', log('ceia', { name: 'Pipoca de panela', kcal: 310, protein_g: 4 })],
      ]),
    )
    expect(t.kcal).toBe(810)
    expect(t.protein_g).toBe(39)
  })

  it('nada marcado, nada consumido', () => {
    expect(consumedTotals(meals, new Map()).kcal).toBe(0)
  })
})

describe('trocas com valores calculados e diferença do plano', () => {
  const item = (id: string, kcal: number, protein_g: number) => ({
    id, food: id, qty_text: '', qty_value: null, qty_unit: null,
    kcal, protein_g, carbs_g: 0, fat_g: 0, position: 0, substitutions: [],
  })
  const colacao: Meal = {
    id: 'colacao', name: 'Colação', time: '10:00:00', position: 0,
    meal_items: [item('banana', 59, 1), item('leite-desnatado', 72, 7)],
  }
  const base = { id: 'l', log_date: '2026-10-04', done_at: '', custom_meal_id: null, actual_name: null,
    actual_kcal: null, actual_protein_g: null, actual_carbs_g: null, actual_fat_g: null }

  it('alimento trocado conta pelos valores da troca', () => {
    const log: MealLog = { ...base, meal_id: 'colacao',
      swaps: [{ item_id: 'leite-desnatado', food: 'Leite desnatado', substitution: 'Leite em pó integral', kcal: 99, protein_g: 5 }] }
    expect(mealActualTotals(colacao, log)).toMatchObject({ kcal: 158, protein_g: 6 })
  })

  it('"Não comi" tira o alimento da conta', () => {
    const log: MealLog = { ...base, meal_id: 'colacao',
      swaps: [{ item_id: 'leite-desnatado', food: 'Leite desnatado', substitution: 'Não comi', skipped: true, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }] }
    expect(mealActualTotals(colacao, log)).toMatchObject({ kcal: 59, protein_g: 1 })
    expect(planDeviation([colacao], new Map([['colacao', log]])).kcal).toBe(-72)
  })

  it('troca sem valores calculados mantém os valores do plano', () => {
    const log: MealLog = { ...base, meal_id: 'colacao',
      swaps: [{ item_id: 'leite-desnatado', food: 'Leite desnatado', substitution: 'Leite em pó integral' }] }
    expect(mealActualTotals(colacao, log).kcal).toBe(131)
  })

  it('diferença do plano: positiva acima, negativa abaixo, só nas marcadas', () => {
    const jantar: Meal = { id: 'jantar', name: 'Jantar', time: '19:00:00', position: 1, meal_items: [item('carne', 300, 40)] }
    const logs = new Map<string, MealLog>([
      ['colacao', { ...base, meal_id: 'colacao',
        swaps: [{ item_id: 'leite-desnatado', food: 'x', substitution: 'y', kcal: 99, protein_g: 5 }] }],
    ])
    expect(planDeviation([colacao, jantar], logs)).toMatchObject({ kcal: 27, protein_g: -2 })
    logs.set('jantar', { ...base, meal_id: 'jantar', swaps: [], actual_name: 'Sopa', actual_kcal: 180, actual_protein_g: 12 })
    expect(planDeviation([colacao, jantar], logs)).toMatchObject({ kcal: 27 - 120, protein_g: -2 - 28 })
  })
})

describe('leftThePlan: quando a refeição conta como fora do plano', () => {
  const meal: Meal = {
    id: 'm', name: 'Almoço', time: '12:00:00', position: 0,
    meal_items: [{ id: 'arroz', food: 'Arroz', qty_text: '80 g', qty_value: null, qty_unit: null, kcal: 100,
      protein_g: 2, carbs_g: 22, fat_g: 0, position: 0, substitutions: [{ id: 's', text: 'Batata-doce (100 g)', position: 0 }] }],
  }
  const log = (swaps: MealLog['swaps'], actual_name: string | null = null): MealLog => ({
    id: 'l', meal_id: 'm', log_date: '2026-10-04', done_at: '', swaps, custom_meal_id: null, actual_name,
    actual_kcal: null, actual_protein_g: null, actual_carbs_g: null, actual_fat_g: null,
  })

  it('troca prevista no plano não sai do plano', () => {
    expect(leftThePlan(meal, log([{ item_id: 'arroz', food: 'Arroz', substitution: 'Batata-doce (100 g)' }]))).toBe(false)
  })

  it('troca por algo fora das previstas ("Outro…") sai do plano, mesmo sendo um item só', () => {
    expect(leftThePlan(meal, log([{ item_id: 'arroz', food: 'Arroz', substitution: 'Macarrão (100 g)' }]))).toBe(true)
  })

  it('"Não comi" não conta como fora do plano; comer outra coisa conta', () => {
    expect(leftThePlan(meal, log([{ item_id: 'arroz', food: 'Arroz', substitution: 'Não comi', skipped: true }]))).toBe(false)
    expect(leftThePlan(meal, log([], 'Pipoca'))).toBe(true)
    expect(leftThePlan(meal, undefined)).toBe(false)
  })
})

describe('macros desconhecidos (plano só com calorias por alimento)', () => {
  const kcalOnly = (id: string, kcal: number | null) => ({
    id, food: id, qty_text: '', qty_value: null, qty_unit: null,
    kcal, protein_g: null, carbs_g: null, fat_g: null, position: 0, substitutions: [],
  })
  const cafe: Meal = { id: 'cafe', name: 'Café', time: '07:00:00', position: 0,
    meal_items: [kcalOnly('ovos', 146), kcalOnly('pao', 65), kcalOnly('canela', null)] }
  const base = { id: 'l', meal_id: 'cafe', log_date: '2026-10-04', done_at: '', custom_meal_id: null,
    actual_kcal: null, actual_protein_g: null, actual_carbs_g: null, actual_fat_g: null }

  it('soma as calorias e deixa o macro desconhecido (não zero)', () => {
    const t = mealActualTotals(cafe, { ...base, swaps: [], actual_name: null })
    expect(t).toEqual({ kcal: 211, protein_g: null, carbs_g: null, fat_g: null })
  })

  it('a diferença compara só o que o plano informa (as calorias)', () => {
    const logs = new Map<string, MealLog>([
      ['cafe', { ...base, swaps: [], actual_name: 'Sucrilhos', actual_kcal: 303, actual_protein_g: 8, actual_carbs_g: 50, actual_fat_g: 8 }],
    ])
    expect(planDeviation([cafe], logs)).toEqual({ kcal: 92, protein_g: null, carbs_g: null, fat_g: null })
  })
})
