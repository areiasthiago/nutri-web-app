import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlanEditor } from '../components/PlanEditor'
import {
  MAX_PDF_MB,
  acceptAiTerms,
  deleteExtraction,
  extractPlanFromPdf,
  fetchAiAccess,
  fetchLatestExtraction,
  formatUsd,
} from '../lib/ai'
import type { AiAccess, SavedExtraction } from '../lib/ai'
import { draftFromExtracted, emptyDraft, saveDraftAsActivePlan } from '../lib/planDraft'
import type { PlanDraft } from '../lib/planDraft'

type Step =
  | { kind: 'choose' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'review'; draft: PlanDraft; costUsd: number | null; extractionId: string | null }

// Se a conexão cair durante a leitura, o app procura o resultado guardado no
// servidor por até este tempo (a leitura costuma levar 30-90 s).
const RECOVER_TIMEOUT_MS = 150_000
const RECOVER_INTERVAL_MS = 5_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const timeLabel = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Novo plano: ler do PDF com IA (VIP) ou montar à mão, sempre com revisão antes de salvar. */
export function NewPlanPage() {
  const navigate = useNavigate()
  const [access, setAccess] = useState<AiAccess | null>(null)
  const [pending, setPending] = useState<SavedExtraction | null>(null)
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    fetchAiAccess().then((a) => active && setAccess(a))
    // Leitura que terminou mas não foi revisada (ex.: o app fechou na espera).
    fetchLatestExtraction().then((e) => active && setPending(e))
    return () => {
      active = false
    }
  }, [])

  function review(extraction: { plan: SavedExtraction['plan']; costUsd: number; id: string | null }) {
    if (extraction.plan.meals.length === 0) {
      setError(
        extraction.plan.warnings[0] ?? 'A IA não encontrou refeições neste PDF. Confira o arquivo ou monte o plano à mão.',
      )
      if (extraction.id) deleteExtraction(extraction.id)
      setPending(null)
      setStep({ kind: 'choose' })
      return
    }
    setStep({
      kind: 'review',
      draft: draftFromExtracted(extraction.plan),
      costUsd: extraction.costUsd,
      extractionId: extraction.id,
    })
  }

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
    const startedAt = new Date(Date.now() - 5_000) // folga para relógios diferentes
    setStep({ kind: 'reading', fileName: file.name })
    const result = await extractPlanFromPdf(file)
    if (fileInput.current) fileInput.current.value = ''

    if (result.ok) {
      fetchAiAccess().then(setAccess)
      review({ plan: result.plan, costUsd: result.costUsd, id: result.extractionId })
      return
    }

    if (result.network) {
      // A resposta não chegou, mas a leitura pode ter terminado no servidor.
      const deadline = Date.now() + RECOVER_TIMEOUT_MS
      while (Date.now() < deadline) {
        const found = await fetchLatestExtraction(startedAt)
        if (found) {
          fetchAiAccess().then(setAccess)
          review({ plan: found.plan, costUsd: found.costUsd, id: found.id })
          return
        }
        await sleep(RECOVER_INTERVAL_MS)
      }
    }

    fetchAiAccess().then(setAccess)
    setError(result.error)
    setStep({ kind: 'choose' })
  }

  async function handleDiscardPending() {
    if (pending) await deleteExtraction(pending.id)
    setPending(null)
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
          onSave={(draft) => handleSave(draft, step.extractionId)}
          onCancel={() => {
            setError(null)
            // A leitura continua guardada: dá para voltar a ela pelo aviso.
            fetchLatestExtraction().then(setPending)
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
            meio. Se a tela apagar, tudo bem: a leitura fica guardada e aparece aqui quando você voltar.
          </p>
        </section>
      )}

      {step.kind === 'choose' && pending && (
        <section className="info-card form-card pending-card">
          <h2>Leitura pronta</h2>
          <p className="muted">
            Você tem um PDF lido às {timeLabel(pending.createdAt)} que ainda não foi revisado.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => review({ plan: pending.plan, costUsd: pending.costUsd, id: pending.id })}
          >
            Revisar e salvar
          </button>
          <button type="button" className="btn-link" onClick={handleDiscardPending}>
            Descartar esta leitura
          </button>
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
                    O PDF é enviado ao <strong>Claude</strong>, da empresa Anthropic, só para ser transcrito. O
                    arquivo não fica guardado no app; só a transcrição, até você salvar ou descartar.
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
              onClick={() => setStep({ kind: 'review', draft: emptyDraft(), costUsd: null, extractionId: null })}
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
