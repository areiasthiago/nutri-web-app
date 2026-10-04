import { describe, expect, it } from 'vitest'
import { highlightedMealIndex, localDateIn, nowMinutesIn } from './plan'
import type { Meal } from './plan'

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
