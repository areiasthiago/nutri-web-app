import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlanEditor } from '../components/PlanEditor'
import { MAX_PDF_MB, acceptAiTerms, extractPlanFromPdf, fetchAiAccess, formatUsd } from '../lib/ai'
import type { AiAccess } from '../lib/ai'
import { draftFromExtracted, emptyDraft, saveDraftAsActivePlan } from '../lib/planDraft'
import type { PlanDraft } from '../lib/planDraft'

type Step =
  | { kind: 'choose' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'review'; draft: PlanDraft; costUsd: number | null }

/** Novo plano: ler do PDF com IA (VIP) ou montar à mão, sempre com revisão antes de salvar. */
export function NewPlanPage() {
  const navigate = useNavigate()
  const [access, setAccess] = useState<AiAccess | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    fetchAiAccess().then((a) => active && setAccess(a))
    return () => {
      active = false
    }
  }, [])

  async function handleAccept() {
    setError(null)
    if (await acceptAiTerms()) setAccess((a) => (a ? { ...a, consented: true } : a))
    else setError('Não foi possível registrar o aceite agora. Tente de novo.')
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.type && file.type !== 'application/pdf') {
      setError('Escolha um arquivo PDF.')
      return
    }
    setStep({ kind: 'reading', fileName: file.name })
    const result = await extractPlanFromPdf(file)
    if (fileInput.current) fileInput.current.value = ''
    fetchAiAccess().then(setAccess)
    if (!result.ok) {
      setError(result.error)
      setStep({ kind: 'choose' })
      return
    }
    if (result.plan.meals.length === 0) {
      setError(
        result.plan.warnings[0] ?? 'A IA não encontrou refeições neste PDF. Confira o arquivo ou monte o plano à mão.',
      )
      setStep({ kind: 'choose' })
      return
    }
    setStep({ kind: 'review', draft: draftFromExtracted(result.plan), costUsd: result.costUsd })
  }

  async function handleSave(draft: PlanDraft) {
    setSaving(true)
    const { error: saveError } = await saveDraftAsActivePlan(draft)
    setSaving(false)
    if (saveError) {
      setError(saveError)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    navigate('/', { replace: true })
  }

  if (step.kind === 'review') {
    return (
      <div className="page">
        <h1 className="page-title">Revise o plano</h1>
        <p className="muted page-lead">
          {step.draft.origin === 'pdf'
            ? 'Confira tudo com o PDF ao lado. A leitura da IA pode errar: corrija o que precisar antes de salvar.'
            : 'Preencha as refeições do seu plano. Só nome e horário de cada refeição são obrigatórios.'}
          {step.costUsd !== null && ` Custo desta leitura: ${formatUsd(step.costUsd)}.`}
        </p>
        {error && <p className="banner banner-error">{error}</p>}
        <PlanEditor
          initial={step.draft}
          saving={saving}
          onSave={handleSave}
          onCancel={() => {
            setError(null)
            setStep({ kind: 'choose' })
          }}
        />
      </div>
    )
  }

  const remaining = access ? access.monthLimitUsd - access.monthSpentUsd : 0

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Voltar para Hoje
      </Link>
      <h1 className="page-title">Novo plano</h1>

      {error && <p className="banner banner-error">{error}</p>}

      {step.kind === 'reading' && (
        <section className="info-card reading-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h2>Lendo o seu plano…</h2>
          <p className="muted">
            A IA está transcrevendo <strong>{step.fileName}</strong>. Costuma levar de 30 segundos a 1 minuto e
            meio. Não feche o app.
          </p>
        </section>
      )}

      {step.kind === 'choose' && (
        <>
          <section className="info-card form-card">
            <h2>Ler o PDF do nutricionista</h2>
            {!access && <p className="muted">Carregando…</p>}

            {access && !access.vip && (
              <p className="muted">
                A leitura automática do PDF com IA é exclusiva para usuários VIP. Você pode montar o plano à mão
                logo abaixo.
              </p>
            )}

            {access?.vip && !access.consented && (
              <>
                <p>Antes de usar a IA, leia como ela funciona:</p>
                <ul className="terms-list">
                  <li>
                    O PDF é enviado ao <strong>Claude</strong>, da empresa Anthropic, só para ser transcrito. Ele
                    não fica guardado no app.
                  </li>
                  <li>Pelas regras da Anthropic, o que é enviado pela API não é usado para treinar a IA.</li>
                  <li>A IA pode errar. Você revisa e corrige tudo antes de salvar.</li>
                  <li>A IA só transcreve o plano: não cria dieta nem faz recomendações.</li>
                </ul>
                <button type="button" className="btn btn-primary" onClick={handleAccept}>
                  Entendi e aceito
                </button>
              </>
            )}

            {access?.vip && access.consented && (
              <>
                <p className="muted">
                  Escolha o PDF (até {MAX_PDF_MB} MB). A IA lê o arquivo e você revisa tudo antes de salvar.
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="visually-hidden"
                  id="pdf-input"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                  disabled={remaining <= 0}
                />
                <label htmlFor="pdf-input" className={`btn btn-primary btn-file${remaining <= 0 ? ' is-disabled' : ''}`}>
                  Escolher PDF
                </label>
                <small className="muted">
                  Uso da IA neste mês: {formatUsd(access.monthSpentUsd)} de {formatUsd(access.monthLimitUsd)}.
                  {remaining <= 0 && ' Limite atingido; volta no começo do mês.'}
                </small>
              </>
            )}
          </section>

          <section className="info-card form-card">
            <h2>Montar à mão</h2>
            <p className="muted">Digite as refeições, os alimentos e as quantidades do seu plano.</p>
            <button
              type="button"
              className="btn btn-outline-neutral"
              onClick={() => setStep({ kind: 'review', draft: emptyDraft(), costUsd: null })}
            >
              Começar do zero
            </button>
          </section>

          <p className="muted account-footnote">Ao salvar, o novo plano vira o ativo. O atual fica guardado.</p>
        </>
      )}
    </div>
  )
}
