import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AiQuotaBar } from '../components/AiQuota'
import { AiTerms } from '../components/AiTerms'
import { PlanEditor } from '../components/PlanEditor'
import {
  AI_EDIT_ESTIMATE_USD,
  MAX_INSTRUCTION_CHARS,
  acceptAiTerms,
  deleteExtraction,
  editPlanWithAi,
  fetchAiAccess,
  fetchLatestExtraction,
  quotaPercent,
  waitForSavedResult,
} from '../lib/ai'
import type { AiAccess, SavedExtraction } from '../lib/ai'
import { fetchActivePlan, formatNumber, formatTime, sumItems } from '../lib/plan'
import type { Plan } from '../lib/plan'
import { draftFromExtracted, draftFromPlan, planToExtracted, saveDraftAsActivePlan } from '../lib/planDraft'
import type { ExtractedPlan, PlanDraft } from '../lib/planDraft'

type Step =
  | { kind: 'overview' }
  | { kind: 'ai-running' }
  | { kind: 'review'; draft: PlanDraft; by: 'ai' | 'manual'; costUsd: number | null; extractionId: string | null }

const timeLabel = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// Uma edição com IA guardada tem "changes"; uma leitura de PDF, não.
const isEditResult = (e: SavedExtraction) => Array.isArray(e.plan.changes)

/** Meu plano: ver o plano atual, editar com IA ou à mão, ou trocar de plano. */
export function MyPlanPage() {
  const navigate = useNavigate()
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined)
  const [access, setAccess] = useState<AiAccess | null>(null)
  const [pending, setPending] = useState<SavedExtraction | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'overview' })
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    fetchActivePlan()
      .then((p) => active && setPlan(p))
      .catch(() => active && setError('Não foi possível carregar seu plano agora.'))
    fetchAiAccess().then((a) => active && setAccess(a))
    fetchLatestExtraction().then((e) => active && setPending(e))
    return () => {
      active = false
    }
  }, [])

  function reviewAiResult(result: { plan: ExtractedPlan; costUsd: number; id: string | null }) {
    setStep({
      kind: 'review',
      draft: { ...draftFromExtracted(result.plan), origin: 'manual' },
      by: 'ai',
      costUsd: result.costUsd,
      extractionId: result.id,
    })
  }

  async function handleAccept() {
    setError(null)
    if (await acceptAiTerms()) setAccess((a) => (a ? { ...a, consented: true } : a))
    else setError('Não foi possível registrar o aceite agora. Tente de novo.')
  }

  async function handleAiEdit(e: FormEvent) {
    e.preventDefault()
    if (!plan || !instruction.trim()) return
    setError(null)
    const startedAt = new Date(Date.now() - 5_000) // folga para relógios diferentes
    setStep({ kind: 'ai-running' })
    const result = await editPlanWithAi(planToExtracted(plan), instruction.trim())
    fetchAiAccess().then(setAccess)

    if (result.ok) {
      reviewAiResult({ plan: result.plan, costUsd: result.costUsd, id: result.extractionId })
      return
    }
    if (result.network) {
      const found = await waitForSavedResult(startedAt)
      if (found) {
        reviewAiResult({ plan: found.plan, costUsd: found.costUsd, id: found.id })
        return
      }
    }
    setError(result.error)
    setStep({ kind: 'overview' })
  }

  async function handleSave(draft: PlanDraft, extractionId: string | null) {
    setSaving(true)
    const { error: saveError } = await saveDraftAsActivePlan(draft)
    setSaving(false)
    if (saveError) {
      setError(saveError)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (extractionId) await deleteExtraction(extractionId)
    navigate('/', { replace: true })
  }

  async function discardPending() {
    if (pending) await deleteExtraction(pending.id)
    setPending(null)
  }

  // -------------------------------------------------------------------------
  // Revisão (edição com IA ou à mão)
  // -------------------------------------------------------------------------
  if (step.kind === 'review') {
    const nothingChanged = step.by === 'ai' && step.draft.changes.length === 0
    return (
      <div className="page">
        <h1 className="page-title">Revise o plano</h1>
        <p className="muted page-lead">
          {step.by === 'ai'
            ? 'Confira as mudanças da IA e corrija o que precisar antes de salvar.'
            : 'Edite o que quiser. Ao salvar, esta vira a versão ativa do seu plano.'}
          {step.costUsd !== null &&
            access &&
            ` Esta edição usou ${quotaPercent(step.costUsd, access.monthLimitUsd)}% da sua cota de IA do mês.`}
        </p>
        {nothingChanged && (
          <p className="banner banner-attention">A IA não mudou nada no plano. Veja o motivo abaixo.</p>
        )}
        {error && <p className="banner banner-error">{error}</p>}
        <PlanEditor
          initial={step.draft}
          saving={saving}
          onSave={(draft) => handleSave(draft, step.extractionId)}
          onCancel={() => {
            setError(null)
            fetchLatestExtraction().then(setPending)
            setStep({ kind: 'overview' })
          }}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Visão geral
  // -------------------------------------------------------------------------
  const aiRemaining = access ? access.monthLimitUsd - access.monthSpentUsd : 0

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Voltar para Hoje
      </Link>
      <h1 className="page-title">Meu plano</h1>

      {error && <p className="banner banner-error">{error}</p>}

      {plan === undefined && !error && <p className="muted">Carregando…</p>}

      {plan === null && (
        <section className="info-card form-card">
          <h2>Você ainda não tem um plano</h2>
          <p className="muted">Envie o PDF do seu nutricionista ou monte o plano à mão.</p>
          <Link to="/plano/novo" className="btn btn-primary btn-link-as-button">
            Cadastrar meu plano
          </Link>
        </section>
      )}

      {step.kind === 'ai-running' && (
        <section className="info-card reading-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h2>Editando com IA…</h2>
          <p className="muted">
            Costuma levar de 20 segundos a 1 minuto. Se a tela apagar, tudo bem: o resultado fica guardado e aparece
            aqui quando você voltar.
          </p>
        </section>
      )}

      {step.kind === 'overview' && pending && (
        <section className="info-card form-card pending-card">
          <h2>{isEditResult(pending) ? 'Edição com IA pronta' : 'Leitura de PDF pronta'}</h2>
          <p className="muted">
            {isEditResult(pending)
              ? `Uma edição feita às ${timeLabel(pending.createdAt)} ainda não foi revisada.`
              : `Um PDF lido às ${timeLabel(pending.createdAt)} ainda não foi revisado.`}
          </p>
          {isEditResult(pending) ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => reviewAiResult({ plan: pending.plan, costUsd: pending.costUsd, id: pending.id })}
            >
              Revisar e salvar
            </button>
          ) : (
            <Link to="/plano/novo" className="btn btn-primary btn-link-as-button">
              Revisar e salvar
            </Link>
          )}
          <button type="button" className="btn-link" onClick={discardPending}>
            Descartar
          </button>
        </section>
      )}

      {step.kind === 'overview' && plan && (
        <>
          <section className="info-card plan-summary">
            <h2>{plan.name}</h2>
            <p className="muted">
              {plan.meals.length} refeições · {formatNumber(sumItems(plan.meals.flatMap((m) => m.meal_items)).kcal)} kcal
              {plan.target_water_ml ? ` · água ${formatNumber(plan.target_water_ml)} mL` : ''}
            </p>
            <ul className="plan-summary-meals">
              {plan.meals.map((m) => (
                <li key={m.id}>
                  <span className="meal-time">{formatTime(m.time)}</span> {m.name}
                </li>
              ))}
            </ul>
          </section>

          <section className="info-card form-card">
            <h2>Editar com IA</h2>
            {!access && <p className="muted">Carregando…</p>}
            {access && !access.vip && <p className="muted">A edição com IA é exclusiva para usuários VIP.</p>}
            {access?.vip && !access.consented && <AiTerms onAccept={handleAccept} />}
            {access?.vip && access.consented && (
              <form className="ai-edit-form" onSubmit={handleAiEdit}>
                <label className="field">
                  <span>O que você quer mudar?</span>
                  <textarea
                    rows={3}
                    maxLength={MAX_INSTRUCTION_CHARS}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Ex.: Atrase o lanche da tarde e a ceia em meia hora. Jantar, em uma hora."
                  />
                </label>
                <small className="muted">
                  A IA só aplica o que você pedir, e você revisa antes de salvar. Ajustes de dieta (calorias,
                  quantidades) são com o seu nutricionista.
                </small>
                <button type="submit" className="btn btn-primary" disabled={!instruction.trim() || aiRemaining <= 0}>
                  Aplicar com IA (usa cerca de {quotaPercent(AI_EDIT_ESTIMATE_USD, access.monthLimitUsd)}% da sua cota)
                </button>
                <AiQuotaBar access={access} />
              </form>
            )}
          </section>

          <section className="info-card form-card">
            <h2>Editar à mão</h2>
            <p className="muted">Mude horários, alimentos, quantidades, trocas, água e observações.</p>
            <button
              type="button"
              className="btn btn-outline-neutral"
              onClick={() =>
                setStep({ kind: 'review', draft: draftFromPlan(plan), by: 'manual', costUsd: null, extractionId: null })
              }
            >
              Abrir editor
            </button>
          </section>

          <section className="info-card form-card">
            <h2>Trocar de plano</h2>
            <p className="muted">Recebeu um plano novo do nutricionista? Envie o PDF ou monte do zero.</p>
            <Link to="/plano/novo" className="btn btn-outline-neutral btn-link-as-button">
              Enviar novo plano
            </Link>
          </section>

          <p className="muted account-footnote">Cada vez que você salva, a versão anterior do plano fica guardada.</p>
        </>
      )}
    </div>
  )
}
