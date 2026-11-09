import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchAiAccess } from '../lib/ai'
import { exerciseImage, findExercise } from '../lib/exerciseCatalog'
import { formatNumber, localDateIn } from '../lib/plan'
import { useProfile } from '../lib/profile'
import { alarm, keepScreenOn, notifyIfHidden, unlockAudio } from '../lib/workoutAlarm'
import {
  addSetLog,
  clockText,
  deleteSetLog,
  fetchLastSets,
  lastTimeText,
  loadSession,
  parseKg,
  parseLoadKg,
  parseSets,
  restSeconds,
  routineActivity,
  START_STATE,
  storeSession,
} from '../lib/workoutSession'
import type { DoneSet, NewActivity, Session, SetLog, SetsPlan } from '../lib/workoutSession'
import { addActivity, fetchActiveWorkout } from '../lib/workouts'
import type { Exercise, Routine } from '../lib/workouts'

// Modo treino: a rotina série por série. Marcar a série anota carga e
// repetições e começa o descanso; no fim do descanso, bipe, vibração e (com o
// app em segundo plano) notificação. Séries por tempo (prancha, esteira) têm
// o próprio cronômetro. "Terminar" registra a atividade do dia com a duração
// real. A sessão fica guardada no aparelho até terminar ou descartar.
// Sem sessão, a tela é a prévia da rotina (todos os exercícios abertos);
// vindo do botão "Começar" (state.start), o treino já começa.

type Timer = {
  kind: 'rest' | 'work'
  startedAt: number
  endsAt: number
  label: string
  /** Série por tempo: o exercício e o número da série que o cronômetro está contando. */
  work?: { exercise: Exercise; setNumber: number }
}

type Finish = { kind: 'saving' } | { kind: 'done'; entry: NewActivity; sets: number; note: string | null }

export function WorkoutSessionPage() {
  const { routineId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile } = useProfile()
  const [routine, setRoutine] = useState<Routine | null | undefined>(undefined)
  const [session, setSession] = useState<Session | null>(() => {
    const s = loadSession()
    if (s) return s.routineId === routineId ? s : null
    if (!(location.state as typeof START_STATE | null)?.start) return null
    // O toque em "Começar" ainda vale como gesto para liberar o som.
    unlockAudio()
    const started: Session = { routineId: routineId!, startedAt: Date.now(), done: {} }
    storeSession(started)
    return started
  })
  const [otherSession] = useState(() => {
    const s = loadSession()
    return s && s.routineId !== routineId ? s : null
  })
  const [last, setLast] = useState<Map<string, SetLog[]>>(new Map())
  // Exercício aberto: undefined = o primeiro com série por fazer; null = todos fechados.
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)
  const [timer, setTimer] = useState<Timer | null>(null)
  const [restOver, setRestOver] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [finish, setFinish] = useState<Finish | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [useAi, setUseAi] = useState(false)

  const today = localDateIn(profile.timezone)
  const exercises = routine?.workout_exercises ?? []

  useEffect(() => {
    let active = true
    fetchActiveWorkout()
      .then((p) => active && setRoutine(p?.workout_routines.find((r) => r.id === routineId) ?? null))
      .catch(() => active && setError('Não foi possível carregar o treino agora.'))
    fetchAiAccess()
      .then((a) => active && setUseAi(a.vip && a.consented && a.monthSpentUsd < a.monthLimitUsd))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [routineId])

  // "Da última vez": as séries anteriores ao começo desta sessão.
  const startedAt = session?.startedAt
  useEffect(() => {
    if (!routine) return
    let active = true
    fetchLastSets(
      routine.workout_exercises.map((e) => e.name.trim()),
      startedAt ?? Date.now(),
    )
      .then((m) => active && setLast(m))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [routine, startedAt])

  const pending = exercises.find((e) => (session?.done[e.id]?.length ?? 0) < parseSets(e.sets_text).sets)
  const shownId = openId === undefined ? (pending ?? exercises[0])?.id ?? null : openId

  // Relógio da tela e tela acesa durante a sessão.
  const running = !!session && !finish
  useEffect(() => {
    if (!running) return
    const tick = setInterval(() => setNow(Date.now()), 250)
    const release = keepScreenOn()
    return () => {
      clearInterval(tick)
      release()
    }
  }, [running])

  // Já começou: tira o "começar" do histórico, para voltar ou recarregar não abrir outro treino.
  useEffect(() => {
    if ((location.state as typeof START_STATE | null)?.start) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])

  useEffect(() => {
    if (!restOver) return
    const t = setTimeout(() => setRestOver(null), 5000)
    return () => clearTimeout(t)
  }, [restOver])

  function update(next: Session) {
    setSession(next)
    storeSession(next)
  }

  function start() {
    unlockAudio()
    update({ routineId: routineId!, startedAt: Date.now(), done: {} })
  }

  /** O que vem depois desta série: a próxima do mesmo exercício ou o próximo exercício. */
  function nextAfter(exercise: Exercise, done: Record<string, DoneSet[]>): { exercise: Exercise; setNumber: number } | null {
    const count = (e: Exercise) => done[e.id]?.length ?? 0
    if (count(exercise) < parseSets(exercise.sets_text).sets) return { exercise, setNumber: count(exercise) + 1 }
    const i = exercises.indexOf(exercise)
    const rest = [...exercises.slice(i + 1), ...exercises.slice(0, i)]
    const e = rest.find((x) => count(x) < parseSets(x.sets_text).sets)
    return e ? { exercise: e, setNumber: count(e) + 1 } : null
  }

  async function logSet(exercise: Exercise, values: Omit<DoneSet, 'id'>) {
    if (!session) return
    unlockAudio()
    setError(null)
    // Chamado também pelo fim do cronômetro: o guardado no aparelho é o mais recente.
    const current = loadSession() ?? session
    const done = current.done[exercise.id] ?? []
    let id: string | null = null
    try {
      id = await addSetLog({ log_date: today, exercise_name: exercise.name.trim(), set_number: done.length + 1, ...values })
    } catch {
      setError('A série foi marcada, mas não entrou no histórico (sem internet?).')
    }
    const next: Session = { ...current, done: { ...current.done, [exercise.id]: [...(current.done[exercise.id] ?? []), { id, ...values }] } }
    update(next)

    const plan = parseSets(exercise.sets_text)
    const following = nextAfter(exercise, next.done)
    if (following && following.exercise.id !== exercise.id) {
      setOpenId(following.exercise.id)
      requestAnimationFrame(() => document.getElementById(`ex-${following.exercise.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
    const rest = restSeconds(exercise.rest_text, plan)
    if (following && rest > 0) {
      const t = Date.now()
      setTimer({
        kind: 'rest',
        startedAt: t,
        endsAt: t + rest * 1000,
        label: `A seguir: ${following.exercise.name} · série ${following.setNumber}`,
      })
    } else {
      setTimer(null)
    }
  }

  async function undoSet(exercise: Exercise) {
    if (!session) return
    const done = session.done[exercise.id] ?? []
    const lastSet = done[done.length - 1]
    if (!lastSet) return
    if (lastSet.id) await deleteSetLog(lastSet.id).catch(() => setError('Não consegui apagar a série do histórico.'))
    update({ ...session, done: { ...session.done, [exercise.id]: done.slice(0, -1) } })
    setTimer(null)
  }

  function startWork(exercise: Exercise, seconds: number) {
    unlockAudio()
    const setNumber = (session?.done[exercise.id]?.length ?? 0) + 1
    const t = Date.now()
    setTimer({ kind: 'work', startedAt: t, endsAt: t + seconds * 1000, label: `${exercise.name} · série ${setNumber}`, work: { exercise, setNumber } })
  }

  async function timerDone(t: Timer) {
    if (timer !== t) return
    if (t.kind === 'work' && t.work) {
      alarm('work')
      void notifyIfHidden('Série concluída', t.work.exercise.name)
      await logSet(t.work.exercise, { reps: null, load_kg: null, seconds: Math.round((t.endsAt - t.startedAt) / 1000) })
      return
    }
    alarm('rest')
    const next = t.label.replace(/^A seguir: /, '')
    void notifyIfHidden('Descanso acabou', next)
    setTimer(null)
    setRestOver(next)
  }

  /** Para a série por tempo antes do fim: conta o tempo feito. */
  async function stopWork(t: Timer) {
    if (!t.work) return
    const seconds = Math.max(1, Math.round((Date.now() - t.startedAt) / 1000))
    setTimer(null)
    await logSet(t.work.exercise, { reps: null, load_kg: null, seconds })
  }

  function shiftRest(delta: number) {
    if (!timer) return
    const endsAt = Math.max(Date.now() + 1000, timer.endsAt + delta * 1000)
    setTimer({ ...timer, endsAt })
  }

  const setsDone = session ? Object.values(session.done).reduce((s, l) => s + l.length, 0) : 0

  async function finishWorkout() {
    if (!session || !routine) return
    setTimer(null)
    setFinish({ kind: 'saving' })
    const minutes = Math.min(600, Math.max(1, Math.round((Date.now() - session.startedAt) / 60000)))
    const { entry, note } = await routineActivity(routine, minutes, profile.weight_kg, useAi)
    try {
      await addActivity({ ...entry, log_date: today })
    } catch {
      setFinish(null)
      setError('Não foi possível registrar o treino agora. Tente de novo.')
      return
    }
    storeSession(null)
    setFinish({ kind: 'done', entry, sets: setsDone, note })
  }

  async function discard() {
    if (session) {
      const ids = Object.values(session.done).flatMap((l) => l.map((s) => s.id).filter((id): id is string => !!id))
      await Promise.all(ids.map((id) => deleteSetLog(id).catch(() => {})))
    }
    storeSession(null)
    navigate('/treino', { replace: true })
  }

  // Fim do cronômetro (descanso ou série por tempo). O ref aponta para o
  // timerDone da última renderização, que enxerga o estado atual.
  const onTimerEnd = useRef<(t: Timer) => Promise<void>>(async () => {})
  useEffect(() => {
    onTimerEnd.current = timerDone
  })
  useEffect(() => {
    if (!timer) return
    const t = setTimeout(() => void onTimerEnd.current(timer), Math.max(0, timer.endsAt - Date.now()))
    return () => clearTimeout(t)
  }, [timer])

  if (finish?.kind === 'done') {
    const { entry, sets, note } = finish
    return (
      <div className="page session-page">
        <section className="info-card session-summary" aria-live="polite">
          <h1>Treino feito!</h1>
          <p className="session-summary-name">{entry.name}</p>
          <div className="session-summary-stats">
            <span>
              <strong>{entry.duration_min}</strong> min
            </span>
            <span>
              <strong>{sets}</strong> {sets === 1 ? 'série' : 'séries'}
            </span>
            <span>
              <strong>−{formatNumber(entry.kcal)}</strong> kcal
            </span>
          </div>
          <p className="muted">Registrado na tela Hoje. Gasto estimado {entry.kcal_source === 'ai' ? 'pela IA' : 'pela tabela de gasto'}, valores aproximados.</p>
          {note && <p className="banner banner-info">{note}</p>}
        </section>
        <Link to="/" className="btn btn-primary btn-link-as-button">
          Voltar para Hoje
        </Link>
      </div>
    )
  }

  if (routine === null) {
    return (
      <div className="page">
        <Link to="/treino" className="back-link">
          ← Meu treino
        </Link>
        <p className="banner banner-error">Essa rotina não está no seu treino atual.</p>
      </div>
    )
  }

  const timerLeft = timer ? Math.max(0, (timer.endsAt - now) / 1000) : 0
  const timerTotal = timer ? (timer.endsAt - timer.startedAt) / 1000 : 1

  return (
    <div className={`page session-page${timer ? ' has-timer' : ''}`}>
      <Link to="/treino" className="back-link">
        ← Meu treino
      </Link>
      <div className="session-head">
        <h1 className="page-title">{routine?.name ?? 'Treino'}</h1>
        {session && <span className="session-clock" aria-label="Tempo de treino">{clockText((now - session.startedAt) / 1000)}</span>}
      </div>
      {error && <p className="banner banner-error">{error}</p>}
      {routine === undefined && !error && <p className="muted">Carregando…</p>}

      {routine && !session && <p className="muted">Prévia: nada é marcado até você tocar em “Começar treino”.</p>}

      {otherSession && !session && (
        <p className="banner banner-attention">
          Você tem outro treino em andamento.{' '}
          <Link to={`/treino/fazer/${otherSession.routineId}`}>Continuar aquele</Link>
        </p>
      )}

      {exercises.map((e) => (
        <ExerciseCard
          key={e.id}
          exercise={e}
          open={!session || shownId === e.id}
          done={session?.done[e.id] ?? []}
          last={last.get(e.name.trim()) ?? null}
          active={!!session && !finish}
          timerBusy={!!timer && timer.kind === 'work'}
          onToggle={() => setOpenId(shownId === e.id ? null : e.id)}
          onDone={(values) => void logSet(e, values)}
          onUndo={() => void undoSet(e)}
          onStartWork={(s) => startWork(e, s)}
        />
      ))}

      {routine && !session && (
        <button type="button" className="btn btn-primary session-start" onClick={start}>
          Começar treino
        </button>
      )}

      {session && !confirmLeave && (
        <div className="session-actions">
          <button type="button" className="btn btn-primary" onClick={() => void finishWorkout()} disabled={finish?.kind === 'saving' || !setsDone}>
            {finish?.kind === 'saving' ? (useAi ? 'Calculando o gasto com a IA…' : 'Registrando…') : 'Terminar e registrar'}
          </button>
          <button type="button" className="btn-link danger-link" onClick={() => setConfirmLeave(true)} disabled={finish?.kind === 'saving'}>
            Descartar treino
          </button>
        </div>
      )}

      {confirmLeave && (
        <section className="info-card session-confirm">
          <p>Descartar este treino? As séries anotadas hoje nele saem do histórico e nada é registrado no dia.</p>
          <div className="form-actions">
            <button type="button" className="btn btn-outline-neutral" onClick={() => void discard()}>
              Descartar
            </button>
            <button type="button" className="btn btn-outline-neutral" onClick={() => setConfirmLeave(false)}>
              Continuar treinando
            </button>
          </div>
        </section>
      )}

      {restOver && !timer && (
        <p className="session-toast" role="status">
          <strong>Descanso acabou!</strong> {restOver}
        </p>
      )}

      {timer && (
        <div className={`timer-sheet timer-${timer.kind}`} role="timer" aria-live="off">
          <div className="timer-bar" style={{ width: `${Math.min(100, (1 - timerLeft / timerTotal) * 100)}%` }} />
          <p className="timer-kind">{timer.kind === 'rest' ? 'Descanso' : 'Valendo!'}</p>
          <p className="timer-clock">{clockText(Math.ceil(timerLeft))}</p>
          <p className="timer-label">{timer.label}</p>
          <div className="timer-actions">
            {timer.kind === 'rest' ? (
              <>
                <button type="button" className="btn btn-outline-neutral" onClick={() => shiftRest(-15)}>
                  −15 s
                </button>
                <button type="button" className="btn btn-outline-neutral" onClick={() => shiftRest(15)}>
                  +15 s
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setTimer(null)}>
                  Pular
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void stopWork(timer)}>
                Terminei
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ExerciseCard({
  exercise,
  open,
  done,
  last,
  active,
  timerBusy,
  onToggle,
  onDone,
  onUndo,
  onStartWork,
}: {
  exercise: Exercise
  open: boolean
  done: DoneSet[]
  last: SetLog[] | null
  active: boolean
  timerBusy: boolean
  onToggle: () => void
  onDone: (values: Omit<DoneSet, 'id'>) => void
  onUndo: () => void
  onStartWork: (seconds: number) => void
}) {
  const plan: SetsPlan = parseSets(exercise.sets_text)
  const entry = findExercise(exercise.name)
  const image = entry ? exerciseImage(entry) : null
  const complete = done.length >= plan.sets
  const meta = [exercise.sets_text, exercise.load_text, exercise.rest_text && `descanso ${exercise.rest_text}`].filter(Boolean).join(' · ')

  return (
    <section id={`ex-${exercise.id}`} className={`info-card exercise-card${complete ? ' is-complete' : ''}`}>
      <button type="button" className="exercise-card-head" onClick={onToggle} aria-expanded={open}>
        <span className="exercise-card-name">{exercise.name}</span>
        <span className="exercise-card-count">
          {complete ? '✓' : `${done.length}/${plan.sets}`}
        </span>
      </button>
      {meta && <p className="muted exercise-card-meta">{meta}</p>}

      {open && (
        <>
          {image && <ExerciseImage src={image} name={exercise.name} />}
          {entry && <p className="exercise-tip">{entry.tip}</p>}
          {last && last.length > 0 && <p className="exercise-last">Da última vez: {lastTimeText(last)}</p>}

          <ol className="set-list">
            {Array.from({ length: Math.max(plan.sets, done.length) }, (_, i) =>
              i < done.length ? (
                <li key={i} className="set-row is-done">
                  <span className="set-number">Série {i + 1}</span>
                  <span className="set-values">{doneText(done[i])}</span>
                  {i === done.length - 1 && active ? (
                    <button type="button" className="btn-link" onClick={onUndo}>
                      Desfazer
                    </button>
                  ) : (
                    <span className="set-check" aria-label="Feita">
                      ✓
                    </span>
                  )}
                </li>
              ) : i === done.length && active ? (
                <NextSet
                  key={`${i}-${last ? 'h' : ''}`}
                  number={i + 1}
                  plan={plan}
                  exercise={exercise}
                  previous={done[i - 1] ?? null}
                  lastTime={last?.[i] ?? last?.[last.length - 1] ?? null}
                  active={active && !timerBusy}
                  onDone={onDone}
                  onStartWork={onStartWork}
                />
              ) : (
                <li key={i} className="set-row is-todo">
                  <span className="set-number">Série {i + 1}</span>
                  <span className="set-values muted">{plan.target}</span>
                </li>
              ),
            )}
          </ol>
          {complete && active && (
            <button type="button" className="btn-link" onClick={() => onDone({ reps: plan.reps, load_kg: done[done.length - 1]?.load_kg ?? null, seconds: null })}>
              + Série extra
            </button>
          )}
        </>
      )}
    </section>
  )
}

function doneText(s: DoneSet): string {
  if (s.seconds) return s.seconds < 60 ? `${s.seconds} s` : clockText(s.seconds)
  const load = s.load_kg !== null ? `${String(s.load_kg).replace('.', ',')} kg × ` : ''
  return `${load}${s.reps ?? '—'} ${s.reps === 1 ? 'rep.' : 'reps'}`
}

function NextSet({
  number,
  plan,
  exercise,
  previous,
  lastTime,
  active,
  onDone,
  onStartWork,
}: {
  number: number
  plan: SetsPlan
  exercise: Exercise
  previous: DoneSet | null
  lastTime: SetLog | null
  active: boolean
  onDone: (values: Omit<DoneSet, 'id'>) => void
  onStartWork: (seconds: number) => void
}) {
  const initialKg = previous?.load_kg ?? lastTime?.load_kg ?? parseLoadKg(exercise.load_text)
  const [kg, setKg] = useState(initialKg !== null ? String(initialKg).replace('.', ',') : '')
  const [reps, setReps] = useState(String(previous?.reps ?? plan.reps ?? lastTime?.reps ?? ''))
  const [invalid, setInvalid] = useState(false)

  if (plan.seconds) {
    return (
      <li className="set-row is-next">
        <span className="set-number">Série {number}</span>
        <span className="set-values">{plan.target}</span>
        <span className="set-buttons">
          <button type="button" className="btn btn-primary btn-small" disabled={!active} onClick={() => onStartWork(plan.seconds!)}>
            ▶ Iniciar
          </button>
          <button type="button" className="btn-link" disabled={!active} onClick={() => onDone({ reps: null, load_kg: null, seconds: plan.seconds })}>
            Já fiz
          </button>
        </span>
      </li>
    )
  }

  function submit() {
    const load = parseKg(kg)
    const r = reps.trim() ? Number(reps) : null
    if (load === undefined || (r !== null && (!Number.isInteger(r) || r < 0 || r > 500))) return setInvalid(true)
    setInvalid(false)
    onDone({ reps: r, load_kg: load, seconds: null })
  }

  return (
    <li className="set-row is-next">
      <span className="set-number">Série {number}</span>
      <span className="set-inputs">
        <label>
          <input type="text" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="—" aria-label={`Carga da série ${number} (kg)`} />
          <span>kg</span>
        </label>
        <label>
          <input type="text" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder={plan.target || '—'} aria-label={`Repetições da série ${number}`} />
          <span>reps</span>
        </label>
      </span>
      <button type="button" className="btn btn-primary btn-small set-done" disabled={!active} onClick={submit} aria-label={`Marcar série ${number} como feita`}>
        ✓
      </button>
      {invalid && <span className="set-invalid">Confira a carga (kg) e as repetições.</span>}
    </li>
  )
}

/** As duas fotos (início e fim do movimento) alternando, como um GIF. */
function ExerciseImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <div className="exercise-image">
      <img src={src} alt={`Execução: ${name}`} onError={() => setFailed(true)} loading="lazy" />
    </div>
  )
}
