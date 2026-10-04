import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { WaterCard } from '../components/WaterCard'
import { fetchMealLogs, markMealDone, unmarkMeal, updateSwaps } from '../lib/mealLogs'
import type { MealLog, Swap } from '../lib/mealLogs'
import {
  CURRENT_MEAL_WINDOW_MIN,
  fetchActivePlan,
  formatIn,
  formatNumber,
  formatTime,
  highlightedMealIndex,
  localDateIn,
  nowMinutesIn,
  sumItems,
  timeToMinutes,
} from '../lib/plan'
import type { Meal, Plan, Totals } from '../lib/plan'
import { useProfile } from '../lib/profile'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; plan: Plan | null }

/** Hora atual, atualizada a cada 30 s para a refeição em destaque mudar sozinha. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** "1.461 kcal · P 155 g · C 114 g · G 40 g"; partes sem valor (null) são omitidas. */
function MacroLine({ totals }: { totals: { [K in keyof Totals]: number | null } }) {
  const parts = [
    totals.kcal !== null && `${formatNumber(totals.kcal)} kcal`,
    totals.protein_g !== null && `P ${formatNumber(totals.protein_g)} g`,
    totals.carbs_g !== null && `C ${formatNumber(totals.carbs_g)} g`,
    totals.fat_g !== null && `G ${formatNumber(totals.fat_g)} g`,
  ].filter(Boolean)
  return <>{parts.join(' · ')}</>
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

const doneTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

type MealCardProps = {
  meal: Meal
  badge: string | null
  late: boolean
  log: MealLog | undefined
  /** Trocas escolhidas antes de marcar (ainda não salvas). */
  draftSwaps: Swap[]
  busy: boolean
  onToggle: () => void
  onSwapChange: (swaps: Swap[]) => void
}

function MealCard({ meal, badge, late, log, draftSwaps, busy, onToggle, onSwapChange }: MealCardProps) {
  const totals = sumItems(meal.meal_items)
  const done = !!log
  const swaps = log?.swaps ?? draftSwaps
  const swapFor = (itemId: string) => swaps.find((sw) => sw.item_id === itemId)?.substitution ?? ''

  function chooseSwap(itemId: string, food: string, substitution: string) {
    const others = swaps.filter((sw) => sw.item_id !== itemId)
    onSwapChange(substitution ? [...others, { item_id: itemId, food, substitution }] : others)
  }

  function handleCheck(e: MouseEvent) {
    // O botão fica dentro do <summary>: sem isto, o toque também abriria/fecharia o cartão.
    e.preventDefault()
    e.stopPropagation()
    onToggle()
  }

  const classes = ['meal-card', badge && 'meal-card-next', done && 'meal-card-done'].filter(Boolean).join(' ')

  return (
    <details className={classes} open={badge !== null}>
      <summary>
        <button
          type="button"
          className={`meal-check${done ? ' is-done' : ''}`}
          onClick={handleCheck}
          disabled={busy}
          aria-pressed={done}
          aria-label={done ? `Desmarcar ${meal.name}` : `Marcar ${meal.name} como feita`}
        >
          {done && <CheckIcon />}
        </button>
        <span className="meal-time">{formatTime(meal.time)}</span>
        <span className="meal-name">
          {meal.name}
          {done && <span className="meal-badge meal-badge-done">Feita às {doneTime(log.done_at)}</span>}
          {!done && badge && <span className="meal-badge">{badge}</span>}
          {!done && !badge && late && <span className="meal-badge meal-badge-late">Não marcada</span>}
        </span>
        <span className="meal-kcal">{formatNumber(totals.kcal)} kcal</span>
      </summary>
      <ul className="meal-items">
        {meal.meal_items.map((item) => {
          const chosen = swapFor(item.id)
          return (
            <li key={item.id}>
              <div className="meal-item-main">
                <span className={chosen ? 'meal-item-swapped' : undefined}>{item.food}</span>
                <span className="meal-item-qty">{item.qty_text}</span>
              </div>
              {item.substitutions.length > 0 && (
                <label className="meal-item-swap">
                  <span>{chosen ? 'Usei a troca:' : 'Trocas:'}</span>
                  <select value={chosen} onChange={(e) => chooseSwap(item.id, item.food, e.target.value)}>
                    <option value="">Como no plano</option>
                    {item.substitutions.map((sub) => (
                      <option key={sub.id} value={sub.text}>
                        {sub.text}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

export function TodayPage() {
  const { profile, loaded } = useProfile()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const nowDate = useNow()
  const now = nowMinutesIn(profile.timezone, nowDate)

  useEffect(() => {
    let active = true
    fetchActivePlan()
      .then((plan) => active && setState({ status: 'ready', plan }))
      .catch(() => active && setState({ status: 'error' }))
    return () => {
      active = false
    }
  }, [])

  // "sábado, 3 de outubro" -> "Sábado, 3 de outubro"
  const weekdayDate = new Intl.DateTimeFormat('pt-BR', {
    timeZone: profile.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(nowDate)
  const dateLabel = weekdayDate.charAt(0).toUpperCase() + weekdayDate.slice(1)

  return (
    <div className="page">
      <div className="page-heading">
        <h1 className="page-title">
          {profile.display_name ? `Olá, ${profile.display_name}!` : 'Hoje'}
        </h1>
        <p className="page-date">{dateLabel}</p>
      </div>

      {state.status === 'loading' && <p className="centered-message muted">Carregando seu plano…</p>}

      {state.status === 'error' && (
        <p className="banner banner-error">
          Não foi possível carregar seu plano agora. Confira a internet e abra o app de novo.
        </p>
      )}

      {state.status === 'ready' && !state.plan && (
        <div className="empty-state">
          <p>Você ainda não tem um plano alimentar cadastrado.</p>
          <p className="muted">Envie o PDF do seu nutricionista ou monte o plano à mão.</p>
          <Link to="/plano/novo" className="btn btn-primary btn-link-as-button">
            Cadastrar meu plano
          </Link>
        </div>
      )}

      {state.status === 'ready' && state.plan && loaded && (
        <PlanView plan={state.plan} now={now} date={localDateIn(profile.timezone, nowDate)} />
      )}
    </div>
  )
}

function PlanView({ plan, now, date }: { plan: Plan; now: number; date: string }) {
  // Registros do dia; recarrega quando vira o dia (date muda à meia-noite local).
  const [logs, setLogs] = useState<{ date: string; byMeal: Map<string, MealLog> } | null>(null)
  const [draftSwaps, setDraftSwaps] = useState<Record<string, Swap[]>>({})
  const [busyMeal, setBusyMeal] = useState<string | null>(null)
  const [logError, setLogError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchMealLogs(date)
      .then((rows) => active && setLogs({ date, byMeal: new Map(rows.map((r) => [r.meal_id, r])) }))
      .catch(() => active && setLogError('Não foi possível carregar as refeições marcadas hoje.'))
    return () => {
      active = false
    }
  }, [date])

  const byMeal = logs?.date === date ? logs.byMeal : new Map<string, MealLog>()
  const doneIds = new Set(byMeal.keys())
  const doneCount = plan.meals.filter((m) => doneIds.has(m.id)).length

  function setLog(mealId: string, log: MealLog | null) {
    setLogs((prev) => {
      const next = new Map(prev?.date === date ? prev.byMeal : [])
      if (log) next.set(mealId, log)
      else next.delete(mealId)
      return { date, byMeal: next }
    })
  }

  async function toggleMeal(meal: Meal) {
    setLogError(null)
    setBusyMeal(meal.id)
    const existing = byMeal.get(meal.id)
    try {
      if (existing) {
        await unmarkMeal(meal.id, date)
        setLog(meal.id, null)
        // As trocas escolhidas continuam na tela, caso marque de novo.
        setDraftSwaps((d) => ({ ...d, [meal.id]: existing.swaps }))
      } else {
        const log = await markMealDone(meal, date, draftSwaps[meal.id] ?? [])
        setLog(meal.id, log)
      }
    } catch {
      setLogError('Não foi possível salvar agora. Confira a internet e tente de novo.')
    }
    setBusyMeal(null)
  }

  async function changeSwaps(meal: Meal, swaps: Swap[]) {
    const log = byMeal.get(meal.id)
    if (!log) {
      setDraftSwaps((d) => ({ ...d, [meal.id]: swaps }))
      return
    }
    setLog(meal.id, { ...log, swaps })
    try {
      await updateSwaps(log.id, swaps)
    } catch {
      setLog(meal.id, log)
      setLogError('Não foi possível salvar a troca agora. Tente de novo.')
    }
  }

  const highlighted = highlightedMealIndex(plan.meals, now, doneIds)
  const dayTotals = sumItems(plan.meals.flatMap((m) => m.meal_items))

  function badgeFor(index: number): string | null {
    if (index !== highlighted) return null
    const diff = timeToMinutes(plan.meals[index].time) - now
    return diff <= 0 ? 'Agora' : `Próxima · ${formatIn(diff)}`
  }

  return (
    <>
      {plan.status_note && <p className="banner banner-attention">{plan.status_note}</p>}

      <div className="day-progress">
        <div className="quota-head">
          <span>Refeições de hoje</span>
          <strong>
            {doneCount} de {plan.meals.length} feitas
          </strong>
        </div>
        <div
          className="quota-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={plan.meals.length}
          aria-valuenow={doneCount}
          aria-label="Refeições feitas hoje"
        >
          <span style={{ width: `${plan.meals.length ? (doneCount / plan.meals.length) * 100 : 0}%` }} />
        </div>
      </div>

      {logError && <p className="banner banner-error">{logError}</p>}

      {logs && doneCount === plan.meals.length && plan.meals.length > 0 && (
        <p className="banner banner-info">Todas as refeições de hoje feitas. Muito bem!</p>
      )}
      {logs && highlighted === -1 && doneCount < plan.meals.length && (
        <p className="banner banner-info">Ficou refeição sem marcar hoje. Se você comeu, toque no círculo dela.</p>
      )}

      <section className="meal-list" aria-label="Refeições de hoje">
        {plan.meals.map((meal, index) => (
          <MealCard
            key={meal.id}
            meal={meal}
            badge={badgeFor(index)}
            late={timeToMinutes(meal.time) + CURRENT_MEAL_WINDOW_MIN <= now}
            log={byMeal.get(meal.id)}
            draftSwaps={draftSwaps[meal.id] ?? []}
            busy={busyMeal === meal.id || !logs}
            onToggle={() => toggleMeal(meal)}
            onSwapChange={(swaps) => changeSwaps(meal, swaps)}
          />
        ))}
      </section>

      {plan.target_water_ml && (
        <WaterCard targetMl={plan.target_water_ml} slots={plan.hydration_slots} date={date} nowMinutes={now} />
      )}

      <section className="info-card">
        <h2>Resumo do plano</h2>
        <p>
          <span className="muted">Soma das refeições:</span>
          <br />
          <MacroLine totals={dayTotals} />
        </p>
        {plan.target_kcal !== null && (
          <p>
            <span className="muted">Meta do plano:</span>
            <br />
            <MacroLine
              totals={{
                kcal: plan.target_kcal,
                protein_g: plan.target_protein_g,
                carbs_g: plan.target_carbs_g,
                fat_g: plan.target_fat_g,
              }}
            />
          </p>
        )}
        <p className="muted">Valores aproximados. {plan.name}.</p>
      </section>

      {plan.notes.length > 0 && (
        <section className="info-card">
          <h2>Observações</h2>
          <ul className="notes-list">
            {plan.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
