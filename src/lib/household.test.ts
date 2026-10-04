import { describe, expect, it } from 'vitest'
import type { Plan } from './plan'
import {
  ALL_HOME_MEALS,
  defaultFactor,
  homeMealsSummary,
  lunchOrDinner,
  suggestHouseFoods,
  timesPerWeek,
  toggleHomeMeal,
} from './household'

describe('fator por pessoa', () => {
  it('adulto 1,0; criança pela faixa de idade (briefing, seção 7)', () => {
    expect(defaultFactor('adult', null)).toBe(1)
    expect(defaultFactor('child', '1-3')).toBe(0.5)
    expect(defaultFactor('child', '4-8')).toBe(0.7)
    expect(defaultFactor('child', '9-13')).toBe(0.9)
    expect(defaultFactor('child', '14-17')).toBe(1)
  })
})

describe('refeições em casa', () => {
  it('criança que almoça na escola de segunda a sexta', () => {
    let codes = ALL_HOME_MEALS
    for (let d = 1; d <= 5; d++) codes = toggleHomeMeal(codes, d, 'almoco')
    expect(timesPerWeek(codes)).toEqual({ cafe: 7, almoco: 2, lanche: 7, jantar: 7 })
    expect(homeMealsSummary(codes)).toBe('Almoço em casa 2x/semana')
    expect(toggleHomeMeal(codes, 1, 'almoco')).toContain('1:almoco')
  })

  it('resumos dos extremos', () => {
    expect(homeMealsSummary(ALL_HOME_MEALS)).toBe('Todas as refeições em casa')
    expect(homeMealsSummary([])).toBe('Nenhuma refeição em casa')
  })
})

describe('sugestão de comida da casa', () => {
  it('reconhece almoço e jantar pelo nome ou pelo horário', () => {
    expect(lunchOrDinner('Almoço', '12:30:00')).toBe('almoco')
    expect(lunchOrDinner('Jantar', '20:00:00')).toBe('jantar')
    expect(lunchOrDinner('Refeição 3', '12:00:00')).toBe('almoco')
    expect(lunchOrDinner('Lanche da tarde', '13:00:00')).toBeNull()
    expect(lunchOrDinner('Ceia', '21:30:00')).toBeNull()
  })

  it('pega só alimentos do almoço e jantar com quantidade numérica, sem repetir', () => {
    // Plano FICTÍCIO.
    const item = (food: string, qty_value: number | null, qty_unit: string | null) => ({
      id: food, food, qty_text: '', qty_value, qty_unit, kcal: null, protein_g: null, carbs_g: null, fat_g: null,
      position: 0, substitutions: [],
    })
    const plan = {
      meals: [
        { id: 'c', name: 'Café da manhã', time: '07:00:00', position: 0, meal_items: [item('Pão', 1, 'un')] },
        { id: 'a', name: 'Almoço', time: '12:30:00', position: 1, meal_items: [item('Arroz', 80, 'g'), item('Salada', null, null), item('Frango', 120, 'g')] },
        { id: 'j', name: 'Jantar', time: '20:00:00', position: 2, meal_items: [item('Arroz', 60, 'g'), item('Azeite', 1, 'colher')] },
      ],
    } as unknown as Pick<Plan, 'meals'>
    expect(suggestHouseFoods(plan)).toEqual([
      { name: 'Arroz', slot: 'almoco', qty_value: 80, qty_unit: 'g' },
      { name: 'Frango', slot: 'almoco', qty_value: 120, qty_unit: 'g' },
      { name: 'Arroz', slot: 'jantar', qty_value: 60, qty_unit: 'g' },
    ])
  })
})
