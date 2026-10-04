import { describe, expect, it } from 'vitest'
import type { Meal } from './plan'
import {
  addDays,
  aggregateDays,
  dateRange,
  dayAchievement,
  mealStreak,
  monthAchievement,
  monthEnd,
  summarize,
  weekAchievement,
  weekStart,
} from './stats'
import type { DayStat, LoggedMeal, StatsInput } from './stats'

describe('datas', () => {
  it('soma dias e monta intervalos (virada de mês)', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(dateRange('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  })

  it('semana começa na segunda; mês termina no último dia', () => {
    expect(weekStart('2026-10-04')).toBe('2026-09-28') // domingo -> segunda anterior
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
    expect(monthEnd('2026-10-04')).toBe('2026-10-31')
  })
})

// Plano FICTÍCIO: 3 refeições de 500 kcal, meta de água 2.000 mL.
const meal = (id: string): Meal & { plan_id: string } => ({
  id, name: id, time: '12:00:00', position: 0, plan_id: 'p1',
  meal_items: [{ id: `${id}-i`, food: 'x', qty_text: '', qty_value: null, qty_unit: null, kcal: 500,
    protein_g: null, carbs_g: null, fat_g: null, position: 0, substitutions: [] }],
})
const log = (m: LoggedMeal['meal'], date: string, actual?: number): LoggedMeal => ({
  id: `${m.id}-${date}`, meal_id: m.id, log_date: date, done_at: '', swaps: [], custom_meal_id: null,
  actual_name: actual ? 'Outra coisa' : null, actual_kcal: actual ?? null, actual_protein_g: null,
  actual_carbs_g: null, actual_fat_g: null, meal: m,
})
const [cafe, almoco] = [meal('cafe'), meal('almoco')]
const input = (over: Partial<StatsInput>): StatsInput => ({
  dates: ['2026-10-01', '2026-10-02', '2026-10-03'],
  firstDate: '2026-10-01',
  mealLogs: [],
  waterLogs: [],
  snackLogs: [],
  mealsPerPlan: new Map([['p1', 3]]),
  plan: { target_kcal: null, target_water_ml: 2000, mealCount: 3, mealsKcal: 1500 },
  ...over,
})

describe('agregação por dia', () => {
  it('conta refeições, água, kcal (com fora do plano e fora de hora)', () => {
    const days = aggregateDays(
      input({
        mealLogs: [log(cafe, '2026-10-01'), log(almoco, '2026-10-01', 800)],
        waterLogs: [{ log_date: '2026-10-01', ml: 1500 }, { log_date: '2026-10-01', ml: 500 }],
        snackLogs: [{ log_date: '2026-10-01', kcal: 140 }],
      }),
    )
    expect(days[0]).toMatchObject({
      mealsDone: 2, mealsPlanned: 3, mealsOffPlan: 1, waterMl: 2000, kcal: 500 + 800 + 140, kcalPlan: 1500, snacks: 1, hasData: true,
    })
    expect(days[1]).toMatchObject({ mealsDone: 0, waterMl: 0, kcal: 0, hasData: false })
  })
})

describe('resumo do período, sequência e selo', () => {
  const day = (date: string, mealsDone: number, waterMl: number): DayStat => ({
    date, mealsDone, mealsPlanned: 3, mealsOffPlan: 0, waterMl, waterTarget: 2000,
    kcal: mealsDone * 500, kcalPlan: 1500, snacks: 0, hasData: mealsDone > 0 || waterMl > 0,
  })

  it('médias só com os dias até hoje (o futuro não derruba a média)', () => {
    const s = summarize([day('2026-10-01', 3, 2000), day('2026-10-02', 0, 1000), day('2026-10-09', 0, 0)], '2026-10-02')
    expect(s.days).toBe(2)
    expect(s.mealsPct).toBe(50)
    expect(s.completeDays).toBe(1)
    expect(s.waterPct).toBe(75)
    expect(s.waterGoalDays).toBe(1)
    // Dias antes do primeiro registro também não entram.
    expect(summarize([day('2026-10-01', 0, 0), day('2026-10-02', 3, 2000)], '2026-10-02', '2026-10-02').mealsPct).toBe(100)
  })

  it('sequência de dias completos; hoje em andamento não quebra', () => {
    const days = [day('2026-10-01', 3, 0), day('2026-10-02', 3, 0), day('2026-10-03', 3, 0), day('2026-10-04', 1, 0)]
    expect(mealStreak(days, '2026-10-04')).toBe(3)
    expect(mealStreak([...days.slice(0, 3), day('2026-10-04', 3, 0)], '2026-10-04')).toBe(4)
    expect(mealStreak([day('2026-10-03', 2, 0)], '2026-10-04')).toBe(0)
  })

  it('selo do dia: refeições e água', () => {
    expect(dayAchievement(day('2026-10-01', 3, 2000), 'hoje')?.title).toBe('Dia perfeito!')
    expect(dayAchievement(day('2026-10-01', 3, 1000), 'hoje')?.title).toBe('Dia completo!')
    expect(dayAchievement(day('2026-10-01', 1, 2500), 'hoje')?.title).toBe('Hidratação em dia!')
    expect(dayAchievement(day('2026-10-01', 2, 1000), 'hoje')).toBeNull()
  })

  it('selo da semana e do mês, só quando está mandando bem', () => {
    const week = (meals: number[], water: number[]) =>
      summarize(meals.map((m, i) => day(addDays('2026-09-28', i), m, water[i])), '2026-10-04')
    expect(weekAchievement(week([3, 3, 3, 3, 3, 3, 3], [0, 0, 0, 0, 0, 0, 0]), 'x')?.title).toBe('Semana impecável!')
    expect(weekAchievement(week([3, 3, 3, 3, 3, 3, 2], [2000, 2000, 2000, 2000, 2000, 2000, 2000]), 'x')?.title).toBe('Semana nota 10!')
    expect(weekAchievement(week([3, 3, 3, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0, 0]), 'x')?.title).toBe('Mandando bem!')
    expect(weekAchievement(week([1, 1, 1, 1, 1, 1, 1], [500, 500, 500, 500, 500, 500, 500]), 'x')).toBeNull()
    // Poucos dias ainda não dão selo.
    expect(weekAchievement(summarize([day('2026-10-01', 3, 2000)], '2026-10-01'), 'x')).toBeNull()

    const month = (n: number, meals: number, water: number) =>
      summarize(dateRange('2026-09-01', addDays('2026-09-01', n - 1)).map((d) => day(d, meals, water)), '2026-10-04')
    expect(monthAchievement(month(20, 3, 0), 'x')?.title).toBe('Mês de campeão!')
    expect(monthAchievement(month(20, 1, 2000), 'x')?.title).toBe('Mês hidratado!')
    expect(monthAchievement(month(2, 3, 2000), 'x')).toBeNull()
  })
})
