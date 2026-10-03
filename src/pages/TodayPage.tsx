import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchActivePlan,
  formatIn,
  formatNumber,
  formatTime,
  highlightedMealIndex,
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

function MealCard({ meal, badge }: { meal: Meal; badge: string | null }) {
  const totals = sumItems(meal.meal_items)
  return (
    <details className={`meal-card${badge ? ' meal-card-next' : ''}`} open={badge !== null}>
      <summary>
        <span className="meal-time">{formatTime(meal.time)}</span>
        <span className="meal-name">
          {meal.name}
          {badge && <span className="meal-badge">{badge}</span>}
        </span>
        <span className="meal-kcal">{formatNumber(totals.kcal)} kcal</span>
      </summary>
      <ul className="meal-items">
        {meal.meal_items.map((item) => (
          <li key={item.id}>
            <div className="meal-item-main">
              <span>{item.food}</span>
              <span className="meal-item-qty">{item.qty_text}</span>
            </div>
            {item.substitutions.length > 0 && (
              <p className="meal-item-subs">
                Trocas: {item.substitutions.map((s) => s.text).join(' · ')}
              </p>
            )}
          </li>
        ))}
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

      {state.status === 'ready' && state.plan && loaded && <PlanView plan={state.plan} now={now} />}
    </div>
  )
}

function PlanView({ plan, now }: { plan: Plan; now: number }) {
  const highlighted = highlightedMealIndex(plan.meals, now)
  const dayTotals = sumItems(plan.meals.flatMap((m) => m.meal_items))
  const protocolMl = plan.hydration_slots.reduce((sum, s) => sum + s.ml, 0)
  const nextSlot = plan.hydration_slots.find((s) => timeToMinutes(s.time) >= now)

  function badgeFor(index: number): string | null {
    if (index !== highlighted) return null
    const diff = timeToMinutes(plan.meals[index].time) - now
    return diff <= 0 ? 'Agora' : `Próxima · ${formatIn(diff)}`
  }

  return (
    <>
      {plan.status_note && <p className="banner banner-attention">{plan.status_note}</p>}

      {highlighted === -1 && (
        <p className="banner banner-info">As refeições de hoje já passaram. Até amanhã!</p>
      )}

      <section className="meal-list" aria-label="Refeições de hoje">
        {plan.meals.map((meal, index) => (
          <MealCard key={meal.id} meal={meal} badge={badgeFor(index)} />
        ))}
      </section>

      {plan.target_water_ml && (
        <section className="info-card water-card">
          <h2>Água</h2>
          <p className="water-target">
            Meta do dia: <strong>{formatNumber(plan.target_water_ml)} mL</strong>
          </p>
          {nextSlot && (
            <p>
              Próximo horário: <strong>{formatTime(nextSlot.time)}</strong> · {nextSlot.ml} mL
              {nextSlot.label && ` · ${nextSlot.label}`}
            </p>
          )}
          {protocolMl > 0 && protocolMl !== plan.target_water_ml && (
            <p className="muted">
              Os {plan.hydration_slots.length} horários do plano somam {formatNumber(protocolMl)} mL.
              O progresso é medido contra a meta de {formatNumber(plan.target_water_ml)} mL.
            </p>
          )}
          <p className="muted">O registro de água chega na próxima atualização.</p>
        </section>
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
