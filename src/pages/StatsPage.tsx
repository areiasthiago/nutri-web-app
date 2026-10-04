import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart } from '../components/BarChart'
import { CongratsBadge } from '../components/CongratsBadge'
import { StatTile } from '../components/StatTile'
import type { StatTileData } from '../components/StatTile'
import { fetchActivePlan, formatNumber, localDateIn } from '../lib/plan'
import type { Plan } from '../lib/plan'
import { useProfile } from '../lib/profile'
import {
  addDays,
  aggregateDays,
  dateRange,
  dayAchievement,
  fetchStatsInput,
  kcalOnTarget,
  mealStreak,
  monthAchievement,
  monthEnd,
  monthStart,
  pct,
  summarize,
  weekAchievement,
  weekStart,
} from '../lib/stats'
import type { DayStat, StatsInput } from '../lib/stats'

type Granularity = 'dia' | 'semana' | 'mes'

const TABS: { key: Granularity; label: string }[] = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
]

/** Quadros da semana e do mês que vão para a imagem de compartilhar (sem calorias nem quantidades). */
const SHARED_LABELS = ['Refeições feitas', 'Meta de água', 'Calorias no alvo']

const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

const asDate = (d: string) => new Date(`${d}T12:00:00Z`)
const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => asDate(d).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opts })
const dayLabel = (d: string) => fmt(d, { weekday: 'short', day: '2-digit', month: '2-digit' })
const round = (n: number) => formatNumber(Math.round(n))

/** Intervalo do período que contém `anchor`. */
function periodOf(g: Granularity, anchor: string): { from: string; to: string } {
  if (g === 'dia') return { from: anchor, to: anchor }
  if (g === 'semana') return { from: weekStart(anchor), to: addDays(weekStart(anchor), 6) }
  return { from: monthStart(anchor), to: monthEnd(anchor) }
}

/** Mesmo período, deslocado para trás (-1) ou para frente (+1). */
function shift(g: Granularity, anchor: string, dir: -1 | 1): string {
  if (g === 'dia') return addDays(anchor, dir)
  if (g === 'semana') return addDays(anchor, 7 * dir)
  const d = asDate(monthStart(anchor))
  d.setUTCMonth(d.getUTCMonth() + dir)
  return d.toISOString().slice(0, 10)
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function periodTitle(g: Granularity, from: string, to: string, today: string): string {
  if (g === 'dia') return from === today ? 'Hoje' : from === addDays(today, -1) ? 'Ontem' : capitalize(fmt(from, { weekday: 'long', day: 'numeric', month: 'long' }))
  if (g === 'semana') {
    if (from === weekStart(today)) return 'Esta semana'
    return `${fmt(from, { day: '2-digit', month: '2-digit' })} a ${fmt(to, { day: '2-digit', month: '2-digit' })}`
  }
  return capitalize(fmt(from, { month: 'long', year: 'numeric' }))
}

/** Período no meio de uma frase, para o selo: "hoje", "nesta semana", "em setembro de 2026"… */
function periodPhrase(g: Granularity, from: string, to: string, today: string): string {
  const ddmm = (d: string) => fmt(d, { day: '2-digit', month: '2-digit' })
  if (g === 'dia') return from === today ? 'hoje' : from === addDays(today, -1) ? 'ontem' : `em ${ddmm(from)}`
  if (g === 'semana') return from === weekStart(today) ? 'nesta semana' : `na semana de ${ddmm(from)} a ${ddmm(to)}`
  return from === monthStart(today) ? 'neste mês' : `em ${fmt(from, { month: 'long', year: 'numeric' })}`
}

export function StatsPage() {
  const { profile, loaded } = useProfile()
  const today = localDateIn(profile.timezone)
  const [granularity, setGranularity] = useState<Granularity>('semana')
  const [anchor, setAnchor] = useState(today)
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined)
  const [input, setInput] = useState<StatsInput | null>(null)
  const [error, setError] = useState(false)

  const { from, to } = periodOf(granularity, anchor)
  // Busca também os últimos 30 dias, para a sequência e o selo de parabéns.
  const fetchFrom = from < addDays(today, -30) ? from : addDays(today, -30)
  const fetchTo = to > today ? to : today

  useEffect(() => {
    let active = true
    fetchActivePlan()
      .then((p) => active && setPlan(p))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!plan || !loaded) return
    let active = true
    fetchStatsInput(plan, fetchFrom, fetchTo)
      .then((data) => active && setInput(data))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [plan, loaded, fetchFrom, fetchTo])

  const allDays = useMemo(() => (input ? aggregateDays(input) : []), [input])
  const byDate = useMemo(() => new Map(allDays.map((d) => [d.date, d])), [allDays])
  const since = input?.firstDate ?? null

  if (error) return <div className="page"><p className="banner banner-error">Não foi possível carregar as estatísticas. Tente de novo.</p></div>
  if (plan === null) {
    return (
      <div className="page">
        <h1 className="page-title">Estatísticas</h1>
        <p className="page-lead">Você ainda não tem um plano. <Link to="/plano/novo">Suba seu plano</Link> para começar a acompanhar.</p>
      </div>
    )
  }

  const ready = !!input && input.dates[0] <= from && input.dates[input.dates.length - 1] >= to
  const days: DayStat[] = ready ? dateRange(from, to).map((d) => byDate.get(d)!) : []
  const counts = (d: DayStat) => d.date <= today && (!since || d.date >= since)
  const summary = summarize(days, today, since)
  const streak = ready ? mealStreak(allDays, today) : 0
  const when = periodPhrase(granularity, from, to, today)
  const badge = !ready
    ? null
    : granularity === 'dia'
      ? counts(days[0]) ? dayAchievement(days[0], when) : null
      : granularity === 'semana'
        ? weekAchievement(summary, when)
        : monthAchievement(summary, when)
  const waterTarget = plan?.target_water_ml ?? null
  const kcalPlan = days[0]?.kcalPlan ?? null
  const tiles: StatTileData[] = !ready ? [] : granularity === 'dia' ? dayTiles(days[0]) : [
    {
      label: 'Refeições feitas',
      value: `${round(summary.mealsPct)}%`,
      sub: `${summary.completeDays} de ${summary.days} ${summary.days === 1 ? 'dia completo' : 'dias completos'}`,
      meter: summary.mealsPct,
      series: 'meals',
    },
    {
      label: 'Meta de água',
      value: waterTarget ? `${round(summary.waterPct)}%` : '—',
      sub: waterTarget ? `batida em ${summary.waterGoalDays} de ${summary.days} ${summary.days === 1 ? 'dia' : 'dias'}` : 'plano sem meta de água',
      meter: waterTarget ? summary.waterPct : undefined,
      series: 'water',
    },
    {
      label: 'Média comida por dia',
      value: summary.daysTracked ? `${round(summary.kcalAvg)} kcal` : '—',
      sub: kcalPlan ? `total do plano: ${round(kcalPlan)} kcal` : undefined,
    },
    {
      label: 'Calorias no alvo',
      value: kcalPlan ? `${summary.kcalOkDays} de ${summary.days}` : '—',
      sub: kcalPlan ? (summary.days === 1 ? 'dia no alvo' : 'dias no alvo') : 'plano sem total de calorias',
      meter: kcalPlan ? pct(summary.kcalOkDays, summary.days) : undefined,
      series: 'meals',
    },
    { label: 'Sequência', value: `${streak} ${streak === 1 ? 'dia' : 'dias'}`, sub: 'seguidos com todas as refeições' },
    {
      label: 'Fora do plano',
      value: `${summary.offPlanMeals} ${summary.offPlanMeals === 1 ? 'refeição' : 'refeições'}`,
      sub: `e ${summary.snacks} fora de hora`,
    },
  ]
  // Na imagem de compartilhar, só porcentagens (sem calorias nem quantidades).
  const shareTiles: StatTileData[] = !ready
    ? []
    : granularity === 'dia'
      ? [
          {
            label: 'Refeições feitas',
            value: `${round(pct(days[0].mealsDone, days[0].mealsPlanned))}%`,
            sub: `${days[0].mealsDone} de ${days[0].mealsPlanned} ${days[0].mealsPlanned === 1 ? 'refeição' : 'refeições'} do plano`,
            meter: pct(days[0].mealsDone, days[0].mealsPlanned),
            series: 'meals',
          },
          ...(waterTarget
            ? [{ label: 'Meta de água', value: `${round(pct(days[0].waterMl, waterTarget))}%`, sub: 'da meta do dia', meter: pct(days[0].waterMl, waterTarget), series: 'water' as const }]
            : []),
          ...(kcalPlan && days[0].hasData
            ? [{
                label: 'Calorias',
                value: `${round(pct(days[0].kcal, kcalPlan))}%`,
                sub: kcalOnTarget(days[0]) ? 'do plano, no alvo' : 'do total do plano',
                meter: pct(days[0].kcal, kcalPlan),
                series: 'meals' as const,
              }]
            : []),
        ]
      : tiles.filter((t) => SHARED_LABELS.includes(t.label) && t.value !== '—')

  return (
    <div className="page stats-page">
      <h1 className="page-title">Estatísticas</h1>

      <div className="segmented" role="tablist" aria-label="Período">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={granularity === t.key}
            className={granularity === t.key ? 'is-active' : ''}
            onClick={() => {
              setGranularity(t.key)
              setAnchor(today)
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="period-nav">
        <button type="button" className="period-arrow" aria-label="Período anterior" onClick={() => setAnchor(shift(granularity, anchor, -1))}>
          ‹
        </button>
        <span className="period-title">{periodTitle(granularity, from, to, today)}</span>
        <button
          type="button"
          className="period-arrow"
          aria-label="Próximo período"
          disabled={to >= today}
          onClick={() => setAnchor(shift(granularity, anchor, 1))}
        >
          ›
        </button>
      </div>

      {!ready ? (
        <p className="centered-message">Carregando…</p>
      ) : (
        <>
          {badge && <CongratsBadge achievement={badge} tiles={shareTiles} />}

          {granularity === 'dia' ? (
            <div className="stat-grid">
              {tiles.map((t) => <StatTile key={t.label} {...t} />)}
            </div>
          ) : summary.days === 0 ? (
            <p className="page-lead">Nenhum registro neste período.</p>
          ) : (
            <>
              <div className="stat-grid">
                {tiles.map((t) => <StatTile key={t.label} {...t} />)}
              </div>

              <section className="info-card chart-card">
                <h2>Refeições feitas por dia</h2>
                <BarChart
                  label="Porcentagem das refeições do plano feitas em cada dia"
                  values={days.map((d) => (counts(d) ? pct(d.mealsDone, d.mealsPlanned) : null))}
                  ticks={ticksFor(granularity, days, today)}
                  color="var(--chart-meals)"
                  minMax={100}
                  formatAxis={(v) => `${round(v)}%`}
                  initialIndex={todayIndex(days, today)}
                  describe={(i) => {
                    const d = days[i]
                    if (!counts(d)) return `${dayLabel(d.date)}: sem registro`
                    return `${dayLabel(d.date)}: ${d.mealsDone} de ${d.mealsPlanned} refeições (${round(pct(d.mealsDone, d.mealsPlanned))}%)`
                  }}
                />
              </section>

              <section className="info-card chart-card">
                <h2>Água por dia</h2>
                <BarChart
                  label="Água tomada em cada dia, em mililitros"
                  values={days.map((d) => (counts(d) ? d.waterMl : null))}
                  ticks={ticksFor(granularity, days, today)}
                  color="var(--chart-water)"
                  reference={waterTarget ? { value: waterTarget, label: `meta ${formatNumber(waterTarget)} mL` } : undefined}
                  formatAxis={(v) => (v >= 1000 ? `${formatNumber(Math.round(v / 100) / 10)} L` : `${round(v)}`)}
                  initialIndex={todayIndex(days, today)}
                  describe={(i) => {
                    const d = days[i]
                    if (!counts(d)) return `${dayLabel(d.date)}: sem registro`
                    return `${dayLabel(d.date)}: ${formatNumber(d.waterMl)} mL${waterTarget ? ` (${round(pct(d.waterMl, waterTarget))}% da meta)` : ''}`
                  }}
                />
              </section>

              <section className="info-card chart-card">
                <h2>Calorias comidas por dia</h2>
                <BarChart
                  label="Calorias comidas em cada dia (refeições marcadas e fora de hora)"
                  values={days.map((d) => (counts(d) && d.hasData ? d.kcal : null))}
                  ticks={ticksFor(granularity, days, today)}
                  color="var(--chart-meals)"
                  reference={kcalPlan ? { value: kcalPlan, label: `plano ${formatNumber(kcalPlan)} kcal` } : undefined}
                  formatAxis={(v) => round(v)}
                  initialIndex={todayIndex(days, today)}
                  describe={(i) => {
                    const d = days[i]
                    if (!counts(d) || !d.hasData) return `${dayLabel(d.date)}: sem registro`
                    return `${dayLabel(d.date)}: ${formatNumber(Math.round(d.kcal))} kcal${d.snacks ? ` (com ${d.snacks} fora de hora)` : ''}`
                  }}
                />
                <p className="muted">
                  Soma das refeições marcadas e do que foi comido fora de hora. "No alvo": até 10% acima ou abaixo do total do plano.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}

function todayIndex(days: DayStat[], today: string): number | undefined {
  const i = days.findIndex((d) => d.date === today)
  return i >= 0 ? i : undefined
}

/** Semana: letra do dia. Mês: dia 1, 5, 10, 15… e hoje (sem encostar no rótulo vizinho). */
function ticksFor(g: Granularity, days: DayStat[], today: string): string[] {
  const todayDay = today.slice(0, 7) === days[0]?.date.slice(0, 7) ? Number(today.slice(8)) : null
  return days.map((d) => {
    const day = Number(d.date.slice(8))
    if (g === 'semana') return WEEKDAY_LETTERS[asDate(d.date).getUTCDay()]
    if (day === todayDay) return String(day)
    if (todayDay !== null && Math.abs(day - todayDay) === 1) return ''
    return day === 1 || day % 5 === 0 ? String(day) : ''
  })
}

function dayTiles(day: DayStat): StatTileData[] {
  const mealsPct = pct(day.mealsDone, day.mealsPlanned)
  const waterPct = pct(day.waterMl, day.waterTarget)
  return [
    { label: 'Refeições feitas', value: `${day.mealsDone} de ${day.mealsPlanned}`, sub: `${round(mealsPct)}% do plano`, meter: mealsPct, series: 'meals' },
    {
      label: 'Água',
      value: `${formatNumber(day.waterMl)} mL`,
      sub: day.waterTarget ? `${round(waterPct)}% da meta de ${formatNumber(day.waterTarget)} mL` : undefined,
      meter: day.waterTarget ? waterPct : undefined,
      series: 'water',
    },
    {
      label: 'Comido no dia',
      value: `${formatNumber(Math.round(day.kcal))} kcal`,
      sub: day.kcalPlan ? `de ${formatNumber(Math.round(day.kcalPlan))} kcal do plano` : undefined,
      meter: day.kcalPlan ? pct(day.kcal, day.kcalPlan) : undefined,
      series: 'meals',
    },
    {
      label: 'Fora do plano',
      value: `${day.mealsOffPlan} ${day.mealsOffPlan === 1 ? 'refeição' : 'refeições'}`,
      sub: `e ${day.snacks} fora de hora`,
    },
  ]
}
