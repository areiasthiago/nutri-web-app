import type { SupabaseClient } from '@supabase/supabase-js'
import type { MealLog } from './mealLogs'
import { leftThePlan, mealActualTotals } from './mealLogs'
import type { Meal, Plan } from './plan'
import { sumItems } from './plan'
import { supabase } from './supabaseClient'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

// ---------------------------------------------------------------------------
// Datas (AAAA-MM-DD, dia local do usuário)
// ---------------------------------------------------------------------------

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Dias de `from` a `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Segunda-feira da semana de `date`. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() // 0 = domingo
  return addDays(date, -((weekday + 6) % 7))
}

export function monthStart(date: string): string {
  return `${date.slice(0, 8)}01`
}

export function monthEnd(date: string): string {
  const d = new Date(`${monthStart(date)}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Agregação por dia (pura, testada em stats.test.ts)
// ---------------------------------------------------------------------------

export type DayStat = {
  date: string
  mealsDone: number
  mealsPlanned: number
  /** Refeições marcadas fora do plano (outra comida ou troca livre). */
  mealsOffPlan: number
  waterMl: number
  waterTarget: number | null
  /** Comido no dia: refeições marcadas + fora de hora. */
  kcal: number
  /** Total do plano por dia (meta, ou soma das refeições se não houver meta). */
  kcalPlan: number | null
  snacks: number
  /** Teve algum registro (refeição ou água) — dia sem nada não conta como dia ruim do futuro. */
  hasData: boolean
}

/** Registro de refeição com a refeição (e os alimentos) a que se refere. */
export type LoggedMeal = MealLog & { meal: Meal & { plan_id: string } }

export type StatsInput = {
  dates: string[]
  /** Primeiro dia com algum registro (de todos os tempos), ou null se nunca registrou nada. */
  firstDate: string | null
  mealLogs: LoggedMeal[]
  waterLogs: { log_date: string; ml: number }[]
  snackLogs: { log_date: string; kcal: number | null }[]
  /** Refeições por plano (para saber quantas o plano previa no dia). */
  mealsPerPlan: Map<string, number>
  /** Plano ativo: referência para metas e para dias sem registro. */
  plan: Pick<Plan, 'target_kcal' | 'target_water_ml'> & { mealCount: number; mealsKcal: number }
}

export function aggregateDays(input: StatsInput): DayStat[] {
  return input.dates.map((date) => {
    const logs = input.mealLogs.filter((l) => l.log_date === date)
    // Quantas refeições o plano daquele dia previa: o plano das refeições marcadas; sem marcação, o atual.
    const planId = logs[0]?.meal.plan_id
    const mealsPlanned = (planId && input.mealsPerPlan.get(planId)) || input.plan.mealCount
    const water = input.waterLogs.filter((w) => w.log_date === date).reduce((s, w) => s + w.ml, 0)
    const snacks = input.snackLogs.filter((s) => s.log_date === date)
    const kcal =
      logs.reduce((s, l) => s + mealActualTotals(l.meal, l).kcal, 0) + snacks.reduce((s, x) => s + (x.kcal ?? 0), 0)
    return {
      date,
      mealsDone: logs.length,
      mealsPlanned,
      mealsOffPlan: logs.filter((l) => leftThePlan(l.meal, l)).length,
      waterMl: water,
      waterTarget: input.plan.target_water_ml,
      kcal,
      kcalPlan: input.plan.target_kcal ?? (input.plan.mealsKcal || null),
      snacks: snacks.length,
      hasData: logs.length > 0 || water > 0 || snacks.length > 0,
    }
  })
}

export const pct = (part: number, whole: number | null) => (whole && whole > 0 ? (part / whole) * 100 : 0)

export type PeriodSummary = {
  days: number
  /** Dias com algum registro. */
  daysTracked: number
  /** Média de % de refeições feitas (nos dias até hoje). */
  mealsPct: number
  /** Dias com todas as refeições feitas. */
  completeDays: number
  waterPct: number
  /** Dias em que a meta de água foi batida. */
  waterGoalDays: number
  /** Média de kcal comidas nos dias com registro. */
  kcalAvg: number
  offPlanMeals: number
  snacks: number
}

/**
 * Resumo de um período, contando só os dias de `since` (primeiro registro da
 * pessoa) até `today`: o futuro e os dias antes de começar não entram na média.
 */
export function summarize(days: DayStat[], today: string, since: string | null = null): PeriodSummary {
  const past = days.filter((d) => d.date <= today && (!since || d.date >= since))
  const tracked = past.filter((d) => d.hasData)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  return {
    days: past.length,
    daysTracked: tracked.length,
    mealsPct: avg(past.map((d) => Math.min(100, pct(d.mealsDone, d.mealsPlanned)))),
    completeDays: past.filter((d) => d.mealsPlanned > 0 && d.mealsDone >= d.mealsPlanned).length,
    waterPct: avg(past.map((d) => Math.min(100, pct(d.waterMl, d.waterTarget)))),
    waterGoalDays: past.filter((d) => d.waterTarget && d.waterMl >= d.waterTarget).length,
    kcalAvg: avg(tracked.map((d) => d.kcal)),
    offPlanMeals: past.reduce((s, d) => s + d.mealsOffPlan, 0),
    snacks: past.reduce((s, d) => s + d.snacks, 0),
  }
}

/**
 * Dias seguidos com todas as refeições feitas, contando para trás a partir de
 * hoje (hoje só conta se já estiver completo; um hoje ainda em andamento não quebra a sequência).
 */
export function mealStreak(days: DayStat[], today: string): number {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const complete = (d?: DayStat) => !!d && d.mealsPlanned > 0 && d.mealsDone >= d.mealsPlanned
  let streak = complete(byDate.get(today)) ? 1 : 0
  for (let d = addDays(today, -1); complete(byDate.get(d)); d = addDays(d, -1)) streak++
  return streak
}

export type Mascot = 'tomate' | 'alface' | 'cenoura'
export type Achievement = { title: string; detail: string; mascot: Mascot }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Selo do dia (tomate): só quando o dia foi bom. */
export function dayAchievement(day: DayStat, when: string): Achievement | null {
  const allMeals = day.mealsPlanned > 0 && day.mealsDone >= day.mealsPlanned
  const water = !!day.waterTarget && day.waterMl >= day.waterTarget
  if (allMeals && water) {
    return { title: 'Dia perfeito!', detail: `Todas as ${day.mealsPlanned} refeições do plano e a meta de água ${when}.`, mascot: 'tomate' }
  }
  if (allMeals) return { title: 'Dia completo!', detail: `Todas as ${day.mealsPlanned} refeições do plano ${when}.`, mascot: 'tomate' }
  if (water) return { title: 'Hidratação em dia!', detail: `Meta de água batida ${when}.`, mascot: 'tomate' }
  return null
}

/** Selo da semana (alface), a partir de 3 dias contados. */
export function weekAchievement(s: PeriodSummary, when: string): Achievement | null {
  if (s.days < 3) return null
  if (s.days === 7 && s.completeDays === 7) {
    return { title: 'Semana impecável!', detail: `Todas as refeições do plano nos 7 dias ${when}.`, mascot: 'alface' }
  }
  if (s.mealsPct >= 85 && s.waterPct >= 85) {
    return {
      title: 'Semana nota 10!',
      detail: `${Math.round(s.mealsPct)}% das refeições e ${Math.round(s.waterPct)}% da água ${when}.`,
      mascot: 'alface',
    }
  }
  if (s.completeDays >= 3) {
    return { title: 'Mandando bem!', detail: `${plural(s.completeDays, 'dia', 'dias')} com todas as refeições ${when}.`, mascot: 'alface' }
  }
  if (s.waterGoalDays >= 4) {
    return { title: 'Semana hidratada!', detail: `Meta de água batida em ${s.waterGoalDays} dias ${when}.`, mascot: 'alface' }
  }
  return null
}

/** Selo do mês (cenoura), a partir de 3 dias contados (já aparece no começo do mês). */
export function monthAchievement(s: PeriodSummary, when: string): Achievement | null {
  if (s.days < 3) return null
  if (s.mealsPct >= 90) {
    return { title: 'Mês de campeão!', detail: `${Math.round(s.mealsPct)}% das refeições do plano ${when}.`, mascot: 'cenoura' }
  }
  if (s.completeDays >= 10) {
    return { title: 'Mês consistente!', detail: `${s.completeDays} dias com todas as refeições ${when}.`, mascot: 'cenoura' }
  }
  if (s.waterPct >= 85) {
    return { title: 'Mês hidratado!', detail: `${Math.round(s.waterPct)}% da meta de água ${when}.`, mascot: 'cenoura' }
  }
  return null
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

export async function fetchStatsInput(plan: Plan, from: string, to: string): Promise<StatsInput> {
  const first = (table: string) =>
    client.from(table).select('log_date').order('log_date', { ascending: true }).limit(1)
  const [mealLogs, waterLogs, snackLogs, meals, ...firsts] = await Promise.all([
    client
      .from('meal_logs')
      .select(
        `id, meal_id, log_date, done_at, swaps, custom_meal_id, actual_name, actual_kcal, actual_protein_g,
         actual_carbs_g, actual_fat_g,
         meal:meals (id, name, time, position, plan_id,
           meal_items (id, food, qty_text, qty_value, qty_unit, kcal, protein_g, carbs_g, fat_g, position,
             substitutions (id, text, position)))`,
      )
      .gte('log_date', from)
      .lte('log_date', to),
    client.from('water_logs').select('log_date, ml').gte('log_date', from).lte('log_date', to),
    client.from('snack_logs').select('log_date, kcal').gte('log_date', from).lte('log_date', to),
    client.from('meals').select('plan_id'),
    first('meal_logs'),
    first('water_logs'),
    first('snack_logs'),
  ])
  for (const r of [mealLogs, waterLogs, snackLogs, meals, ...firsts]) if (r.error) throw r.error
  const firstDates = firsts.flatMap((r) => ((r.data ?? []) as { log_date: string }[]).map((x) => x.log_date)).sort()

  const mealsPerPlan = new Map<string, number>()
  for (const m of (meals.data ?? []) as { plan_id: string }[]) {
    mealsPerPlan.set(m.plan_id, (mealsPerPlan.get(m.plan_id) ?? 0) + 1)
  }
  return {
    dates: dateRange(from, to),
    firstDate: firstDates[0] ?? null,
    mealLogs: (mealLogs.data ?? []) as unknown as LoggedMeal[],
    waterLogs: (waterLogs.data ?? []) as { log_date: string; ml: number }[],
    snackLogs: (snackLogs.data ?? []) as { log_date: string; kcal: number | null }[],
    mealsPerPlan,
    plan: {
      target_kcal: plan.target_kcal,
      target_water_ml: plan.target_water_ml,
      mealCount: plan.meals.length,
      mealsKcal: sumItems(plan.meals.flatMap((m) => m.meal_items)).kcal,
    },
  }
}
