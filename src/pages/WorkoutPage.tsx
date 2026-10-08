import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { readWorkoutWithAi } from '../lib/ai'
import { extractPdfPages } from '../lib/pdfText'
import { fetchAiAccess } from '../lib/ai'
import { canUseAi } from '../lib/shoppingData'
import { AiTeaser } from '../components/AiTeaser'
import {
  draftFromWorkout,
  emptyExercise,
  emptyWorkout,
  fetchActiveWorkout,
  parseWorkoutPages,
  saveWorkout,
} from '../lib/workouts'
import type { WorkoutDraft, WorkoutPlan } from '../lib/workouts'

// Meu treino: a rotina do personal. PDF lido pela IA (só VIP, qualquer
// formato) ou pelo leitor no próprio celular (sem IA); sempre revisado antes
// de salvar. Também dá para montar à mão.

type Step = { kind: 'view' } | { kind: 'reading' } | { kind: 'review'; draft: WorkoutDraft; note: string | null }

export function WorkoutPage() {
  const navigate = useNavigate()
  const fromOnboarding = useSearchParams()[0].get('de') === 'comecar'
  const [plan, setPlan] = useState<WorkoutPlan | null | undefined>(undefined)
  const [step, setStep] = useState<Step>({ kind: 'view' })
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [vip, setVip] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    fetchAiAccess()
      .then((a) => active && setVip(a.vip))
      .catch(() => active && setVip(null))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchActiveWorkout()
      .then((p) => active && setPlan(p))
      .catch(() => active && setError('Não foi possível carregar o treino agora.'))
    return () => {
      active = false
    }
  }, [])

  const backPath = fromOnboarding ? '/comecar' : '/'
  const backLabel = fromOnboarding ? 'os primeiros passos' : 'Hoje'

  async function readPdf(file: File) {
    setError(null)
    setStep({ kind: 'reading' })
    // VIP: a IA lê qualquer formato. Sem VIP (ou se a IA falhar): leitor no celular.
    if (await canUseAi()) {
      const r = await readWorkoutWithAi(file)
      if (r.ok && r.data.routines.length) {
        const note = r.data.warnings.length ? `A IA avisou: ${r.data.warnings.join(' ')}` : null
        setStep({ kind: 'review', draft: { name: r.data.name || 'Meu treino', origin: 'pdf', routines: r.data.routines }, note })
        return
      }
      if (!r.ok) setError(`${r.error} Tentei ler no próprio celular.`)
    }
    try {
      const draft = parseWorkoutPages(await extractPdfPages(file))
      if (draft.routines.length) {
        setStep({ kind: 'review', draft, note: 'O celular leu o PDF sem IA. Confira tudo antes de salvar.' })
      } else {
        setStep({
          kind: 'review',
          draft: emptyWorkout(),
          note: 'Não consegui reconhecer os exercícios neste PDF. Monte o treino abaixo, olhando o PDF.',
        })
      }
    } catch {
      setError('Não foi possível ler este PDF. Monte o treino à mão.')
      setStep({ kind: 'view' })
    }
  }

  async function save(draft: WorkoutDraft) {
    setError(null)
    try {
      await saveWorkout(draft)
      if (fromOnboarding) {
        navigate('/comecar', { replace: true })
        return
      }
      setPlan(await fetchActiveWorkout())
      setStep({ kind: 'view' })
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Não foi possível salvar agora.')
    }
  }

  if (step.kind === 'review') {
    return (
      <div className="page">
        <h1 className="page-title">Revise o treino</h1>
        {step.note && <p className="banner banner-info">{step.note}</p>}
        {error && <p className="banner banner-error">{error}</p>}
        <WorkoutEditor initial={step.draft} onSave={save} onCancel={() => setStep({ kind: 'view' })} />
      </div>
    )
  }

  return (
    <div className="page workout-page">
      <Link to={backPath} className="back-link">
        ← Voltar para {backLabel}
      </Link>
      <h1 className="page-title">Meu treino</h1>
      {error && <p className="banner banner-error">{error}</p>}

      {step.kind === 'reading' && (
        <section className="info-card reading-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h2>Lendo o treino…</h2>
          <p className="muted">Pode levar alguns segundos.</p>
        </section>
      )}

      {plan === undefined && !error && <p className="muted">Carregando…</p>}

      {plan && step.kind === 'view' && (
        <>
          {plan.workout_routines.map((r) => (
            <section key={r.id} className="info-card workout-routine">
              <h2>{r.name}</h2>
              <ul>
                {r.workout_exercises.map((e) => (
                  <li key={e.id}>
                    <span>{e.name}</span>
                    <span className="muted">{[e.sets_text, e.load_text, e.rest_text].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <button type="button" className="btn btn-outline-neutral" onClick={() => setStep({ kind: 'review', draft: draftFromWorkout(plan), note: null })}>
            Editar o treino
          </button>
        </>
      )}

      {plan !== undefined && step.kind === 'view' && (
        <section className="info-card form-card">
          <h2>{plan ? 'Trocar de treino' : 'Cadastrar o treino'}</h2>
          <p className="muted">
            Envie o PDF do personal: o app lê, você confere e só então salva. Ou monte à mão. Com o treino cadastrado,
            dá para registrar na tela Hoje "Fiz o treino A" com a duração, e o gasto estimado entra no balanço do dia.
          </p>
          <input
            ref={fileInput}
            id="pdf-input"
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void readPdf(file)
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}>
            Enviar PDF do treino
          </button>
          <button type="button" className="btn btn-outline-neutral" onClick={() => setStep({ kind: 'review', draft: emptyWorkout(), note: null })}>
            Montar à mão
          </button>
          {vip === false && (
            <AiTeaser id="workout-pdf" title="Com IA, o PDF do treino é lido em qualquer formato, até PDF escaneado" />
          )}
        </section>
      )}
    </div>
  )
}

function WorkoutEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: WorkoutDraft
  onSave: (draft: WorkoutDraft) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<WorkoutDraft>(initial)
  const [saving, setSaving] = useState(false)

  const setRoutine = (i: number, change: Partial<WorkoutDraft['routines'][number]>) =>
    setDraft({ ...draft, routines: draft.routines.map((r, j) => (j === i ? { ...r, ...change } : r)) })

  return (
    <div className="workout-editor">
      <label className="field">
        <span>Nome do treino</span>
        <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} />
      </label>

      {draft.routines.map((r, i) => (
        <section key={i} className="info-card form-card">
          <label className="field">
            <span>Rotina</span>
            <input type="text" value={r.name} onChange={(e) => setRoutine(i, { name: e.target.value })} maxLength={80} placeholder="Ex.: Treino A: Membros inferiores" />
          </label>
          {r.exercises.map((ex, k) => (
            <div key={k} className="exercise-row">
              <input
                type="text"
                value={ex.name}
                onChange={(e) => setRoutine(i, { exercises: r.exercises.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)) })}
                placeholder="Exercício"
                aria-label="Exercício"
                maxLength={100}
              />
              <div className="exercise-fields">
                <input
                  type="text"
                  value={ex.sets_text}
                  onChange={(e) => setRoutine(i, { exercises: r.exercises.map((x, j) => (j === k ? { ...x, sets_text: e.target.value } : x)) })}
                  placeholder="Séries (4x15)"
                  aria-label="Séries"
                />
                <input
                  type="text"
                  value={ex.load_text}
                  onChange={(e) => setRoutine(i, { exercises: r.exercises.map((x, j) => (j === k ? { ...x, load_text: e.target.value } : x)) })}
                  placeholder="Carga"
                  aria-label="Carga"
                />
                <input
                  type="text"
                  value={ex.rest_text}
                  onChange={(e) => setRoutine(i, { exercises: r.exercises.map((x, j) => (j === k ? { ...x, rest_text: e.target.value } : x)) })}
                  placeholder="Intervalo"
                  aria-label="Intervalo"
                />
                <button
                  type="button"
                  className="btn-link"
                  aria-label="Tirar exercício"
                  onClick={() => setRoutine(i, { exercises: r.exercises.filter((_, j) => j !== k) })}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <div className="section-actions">
            <button type="button" className="btn-link" onClick={() => setRoutine(i, { exercises: [...r.exercises, emptyExercise()] })}>
              + Exercício
            </button>
            {draft.routines.length > 1 && (
              <button
                type="button"
                className="btn-link danger-link"
                onClick={() => setDraft({ ...draft, routines: draft.routines.filter((_, j) => j !== i) })}
              >
                Tirar rotina
              </button>
            )}
          </div>
        </section>
      ))}

      <button
        type="button"
        className="btn btn-outline-neutral"
        onClick={() =>
          setDraft({
            ...draft,
            routines: [...draft.routines, { name: `Treino ${String.fromCharCode(65 + draft.routines.length)}`, exercises: [emptyExercise()] }],
          })
        }
      >
        + Rotina
      </button>

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            await onSave(draft)
            setSaving(false)
          }}
        >
          {saving ? 'Salvando…' : 'Salvar treino'}
        </button>
        <button type="button" className="btn btn-outline-neutral" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
