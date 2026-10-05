import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { estimateActivityWithAi } from '../lib/ai'
import type { AiAccess } from '../lib/ai'
import { formatNumber } from '../lib/plan'
import { useProfile } from '../lib/profile'
import { ACTIVITIES, STRENGTH_MET, fetchActiveWorkout, metKcal } from '../lib/workouts'
import type { ActivityLog, WorkoutPlan } from '../lib/workouts'

type NewActivity = Omit<ActivityLog, 'id' | 'logged_at' | 'log_date'>

type Props = {
  activities: ActivityLog[]
  access: AiAccess | null
  onAdd: (activity: NewActivity) => Promise<boolean>
  onRemove: (id: string) => void
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** "1 h 10 min", "45 min". */
function durationText(min: number) {
  const h = Math.floor(min / 60)
  return h ? `${h} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`
}

function parseMinutes(text: string): number | null {
  const n = Math.round(Number(text.trim().replace(',', '.')))
  return Number.isFinite(n) && n >= 1 && n <= 600 ? n : null
}

/**
 * Treino e atividades do dia: o gasto estimado sai do balanço (registrado −
 * gasto). VIP: a IA estima (o treino com os exercícios, ou a atividade
 * descrita em texto). Sem VIP: tabela de gasto por atividade (MET), no celular.
 */
export function ActivityCard({ activities, access, onAdd, onRemove }: Props) {
  const { profile } = useProfile()
  const [workout, setWorkout] = useState<WorkoutPlan | null | undefined>(undefined)
  const [kind, setKind] = useState<'treino' | 'outra'>('treino')
  const [routineId, setRoutineId] = useState('')
  const [activityKey, setActivityKey] = useState(ACTIVITIES[1].key)
  const [description, setDescription] = useState('')
  const [minutes, setMinutes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const useAi = !!access && access.vip && access.consented && access.monthSpentUsd < access.monthLimitUsd
  const weight = profile.weight_kg

  useEffect(() => {
    let active = true
    fetchActiveWorkout()
      .then((w) => {
        if (!active) return
        setWorkout(w)
        if (w?.workout_routines.length) setRoutineId(w.workout_routines[0].id)
        else setKind('outra')
      })
      .catch(() => active && setWorkout(null))
    return () => {
      active = false
    }
  }, [])

  const total = activities.reduce((s, a) => s + a.kcal, 0)
  const routine = workout?.workout_routines.find((r) => r.id === routineId) ?? null
  const freeText = kind === 'outra' && useAi

  async function register() {
    setError(null)
    setNote(null)
    const min = parseMinutes(minutes)
    if (!freeText && min === null) return setError('Informe a duração em minutos (1 a 600).')
    if (freeText && !description.trim()) return setError('Descreva a atividade (o que fez e por quanto tempo).')
    if (kind === 'treino' && !routine) return setError('Escolha a rotina do treino.')

    setBusy(true)
    let entry: NewActivity | null = null
    if (useAi) {
      const r = await estimateActivityWithAi(
        kind === 'treino'
          ? {
              weight_kg: weight,
              duration_min: min!,
              routine: {
                name: routine!.name,
                exercises: routine!.workout_exercises.map(({ name, sets_text, load_text }) => ({ name, sets_text, load_text })),
              },
            }
          : { weight_kg: weight, description: description.trim() },
      )
      if (r.ok && r.data.kcal > 0) {
        const duration = kind === 'treino' ? min! : Math.min(600, Math.max(1, Math.round(r.data.duration_min)))
        entry = {
          routine_id: kind === 'treino' ? routine!.id : null,
          name: (kind === 'treino' ? routine!.name : r.data.name || description.trim()).slice(0, 100),
          duration_min: duration,
          kcal: Math.min(5000, Math.round(r.data.kcal)),
          kcal_source: 'ai',
          note: r.data.notes.join(' ').slice(0, 500) || null,
        }
      } else if (r.ok) {
        setBusy(false)
        return setError(r.data.notes.join(' ') || 'A IA não reconheceu uma atividade física no texto.')
      } else if (kind === 'outra') {
        setBusy(false)
        return setError(r.error)
      } else {
        setNote(`${r.error} Usei a tabela de gasto.`)
      }
    }
    if (!entry) {
      const act = ACTIVITIES.find((a) => a.key === activityKey)!
      entry =
        kind === 'treino'
          ? {
              routine_id: routine!.id,
              name: routine!.name,
              duration_min: min!,
              kcal: metKcal(STRENGTH_MET, min!, weight),
              kcal_source: 'table',
              note: null,
            }
          : { routine_id: null, name: act.label, duration_min: min!, kcal: metKcal(act.met, min!, weight), kcal_source: 'table', note: null }
    }
    const ok = await onAdd(entry)
    setBusy(false)
    if (ok) {
      setMinutes('')
      setDescription('')
    }
  }

  return (
    <section className="info-card snack-card activity-card" aria-label="Treino e atividades">
      <div className="snack-head">
        <h2>Treinou hoje?</h2>
        {activities.length > 0 && <span className="activity-total">−{formatNumber(total)} kcal</span>}
      </div>

      {activities.length > 0 && (
        <ul className="snack-list">
          {activities.map((a) => (
            <li key={a.id}>
              <span className="snack-time">{timeOf(a.logged_at)}</span>
              <span className="snack-name">
                {a.name}
                <span className="muted"> · {durationText(a.duration_min)}</span>
              </span>
              <span className="snack-kcal">−{formatNumber(a.kcal)} kcal</span>
              <button type="button" className="btn-link water-remove" onClick={() => onRemove(a.id)}>
                Apagar
              </button>
            </li>
          ))}
        </ul>
      )}

      {workout !== undefined && (
        <>
          <div className="segmented" role="tablist" aria-label="O que você fez">
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'treino'}
              className={kind === 'treino' ? 'is-active' : ''}
              onClick={() => setKind('treino')}
            >
              Meu treino
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'outra'}
              className={kind === 'outra' ? 'is-active' : ''}
              onClick={() => setKind('outra')}
            >
              Outra atividade
            </button>
          </div>

          {kind === 'treino' && !workout && (
            <p className="muted">
              Cadastre o treino do seu personal para registrar com um toque.{' '}
              <Link to="/treino">Cadastrar meu treino</Link>
            </p>
          )}

          {kind === 'treino' && workout && (
            <label className="field">
              <span>Qual treino?</span>
              <select value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
                {workout.workout_routines.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {kind === 'outra' && !useAi && (
            <label className="field">
              <span>Atividade</span>
              <select value={activityKey} onChange={(e) => setActivityKey(e.target.value)}>
                {ACTIVITIES.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {freeText && (
            <label className="field">
              <span>O que você fez?</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: caminhei 40 min no parque, ritmo leve"
                maxLength={300}
              />
            </label>
          )}

          {!freeText && (kind === 'outra' || workout) && (
            <label className="field">
              <span>Duração (minutos)</span>
              <input type="text" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="Ex.: 50" />
            </label>
          )}

          {error && <p className="banner banner-error">{error}</p>}
          {note && <p className="banner banner-info">{note}</p>}

          {(kind === 'outra' || workout) && (
            <button type="button" className="btn btn-primary" onClick={register} disabled={busy}>
              {busy ? (useAi ? 'Calculando com a IA…' : 'Registrando…') : 'Registrar atividade'}
            </button>
          )}

          <p className="muted activity-foot">
            Gasto estimado {useAi ? 'pela IA' : 'pela tabela de gasto por atividade'}
            {weight ? `, com ${String(weight).replace('.', ',')} kg` : ', com 70 kg (informe seu peso em Minha conta)'}.
            Valores aproximados.
          </p>
        </>
      )}
    </section>
  )
}
