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
import { extractPdfLines } from '../lib/pdfText'
import { parsePlanText } from '../lib/planParser'
import type { ParseResult } from '../lib/planParser'
import { draftFromExtracted, emptyDraft, saveDraftAsActivePlan } from '../lib/planDraft'
import type { ExtractedPlan, PlanDraft } from '../lib/planDraft'

// Camadas: 1) leitura no aparelho, sem IA e sem custo; 2) se ficar fraca (ou
// a pessoa pedir), leitura com IA para VIP; 3) sempre dá para montar à mão.

type Step =
  | { kind: 'choose' }
  | { kind: 'reading'; fileName: string; by: 'device' | 'ai' }
  | { kind: 'offer-ai'; file: File; local: ParseResult | null; reason: string }
  | { kind: 'review'; draft: PlanDraft; costUsd: number | null; extractionId: string | null; file: File | null; by: 'device' | 'ai' | 'manual' }

// Se a conexão cair durante a leitura com IA, o app procura o resultado
// guardado no servidor por até este tempo (a leitura costuma levar 30-90 s).
const RECOVER_TIMEOUT_MS = 150_000
const RECOVER_INTERVAL_MS = 5_000
// Estimativa mostrada no botão; o custo real aparece depois da leitura.
const AI_COST_HINT = 'cerca de US$ 0,06'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const timeLabel = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function localFailureReason(r: ParseResult): string {
  if (r.quality === 'empty' && r.textChars < 80) {
    return 'Este PDF parece ser uma imagem (escaneado ou foto), sem texto que o celular consiga ler.'
  }
  if (r.quality === 'empty') return 'Não consegui reconhecer as refeições neste PDF.'
  const meals = r.plan.meals.length
  const items = r.plan.meals.reduce((s, m) => s + m.items.length, 0)
  return `Consegui ler só parte do plano: ${meals} refeição(ões) e ${items} alimento(s).`
}

function AiTerms({ onAccept }: { onAccept: () => void }) {
  return (
    <>
      <p>Antes de usar a IA, leia como ela funciona:</p>
      <ul className="terms-list">
        <li>
          O PDF é enviado ao <strong>Claude</strong>, da empresa Anthropic, só para ser transcrito. O arquivo não
          fica guardado no app; só a transcrição, até você salvar ou descartar.
        </li>
        <li>Pelas regras da Anthropic, o que é enviado pela API não é usado para treinar a IA.</li>
        <li>A IA pode errar. Você revisa e corrige tudo antes de salvar.</li>
        <li>A IA só transcreve o plano: não cria dieta nem faz recomendações.</li>
      </ul>
      <button type="button" className="btn btn-primary" onClick={onAccept}>
        Entendi e aceito
      </button>
    </>
  )
}

/** Novo plano: ler o PDF (no aparelho; com IA se precisar) ou montar à mão, sempre com revisão. */
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
    // Leitura com IA que terminou mas não foi revisada (ex.: o app fechou na espera).
    fetchLatestExtraction().then((e) => active && setPending(e))
    return () => {
      active = false
    }
  }, [])

  const aiRemaining = access ? access.monthLimitUsd - access.monthSpentUsd : 0
  const aiAvailable = !!access?.vip && aiRemaining > 0

  function toReview(plan: ExtractedPlan, opts: { costUsd: number | null; extractionId: string | null; file: File | null; by: 'device' | 'ai' }) {
    setStep({ kind: 'review', draft: draftFromExtracted(plan), ...opts })
  }

  async function handleAccept() {
    setError(null)
    if (await acceptAiTerms()) setAccess((a) => (a ? { ...a, consented: true } : a))
    else setError('Não foi possível registrar o aceite agora. Tente de novo.')
  }

  // 1ª camada: leitura no aparelho.
  async function handleFile(file: File | undefined) {
    if (!file) return
    if (fileInput.current) fileInput.current.value = ''
    setError(null)
    if (file.type && file.type !== 'application/pdf') {
      setError('Escolha um arquivo PDF.')
      return
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setError(`O PDF passa de ${MAX_PDF_MB} MB.`)
      return
    }

    setStep({ kind: 'reading', fileName: file.name, by: 'device' })
    let local: ParseResult
    try {
      local = parsePlanText(await extractPdfLines(file))
    } catch {
      // PDF com senha ou corrompido: a IA também não abriria; mas um PDF
      // "estranho" para o pdf.js às vezes abre na IA, então ainda oferece.
      setStep({ kind: 'offer-ai', file, local: null, reason: 'Não consegui abrir este PDF no celular.' })
      return
    }

    if (local.quality === 'good') {
      toReview(local.plan, { costUsd: null, extractionId: null, file, by: 'device' })
    } else {
      setStep({ kind: 'offer-ai', file, local, reason: localFailureReason(local) })
    }
  }

  // 2ª camada: leitura com IA (VIP).
  async function readWithAi(file: File) {
    setError(null)
    const startedAt = new Date(Date.now() - 5_000) // folga para relógios diferentes
    setStep({ kind: 'reading', fileName: file.name, by: 'ai' })
    const result = await extractPlanFromPdf(file)
    const fallback: Step = { kind: 'offer-ai', file, local: null, reason: 'A leitura com IA não deu certo.' }

    const finish = (found: { plan: ExtractedPlan; costUsd: number; id: string | null }) => {
      fetchAiAccess().then(setAccess)
      if (found.plan.meals.length === 0) {
        setError(found.plan.warnings[0] ?? 'A IA não encontrou refeições neste PDF. Confira o arquivo ou monte o plano à mão.')
        if (found.id) deleteExtraction(found.id)
        setStep(fallback)
        return
      }
      toReview(found.plan, { costUsd: found.costUsd, extractionId: found.id, file, by: 'ai' })
    }

    if (result.ok) {
      finish({ plan: result.plan, costUsd: result.costUsd, id: result.extractionId })
      return
    }

    if (result.network) {
      // A resposta não chegou, mas a leitura pode ter terminado no servidor.
      const deadline = Date.now() + RECOVER_TIMEOUT_MS
      while (Date.now() < deadline) {
        const found = await fetchLatestExtraction(startedAt)
        if (found) {
          finish({ plan: found.plan, costUsd: found.costUsd, id: found.id })
          return
        }
        await sleep(RECOVER_INTERVAL_MS)
      }
    }

    fetchAiAccess().then(setAccess)
    setError(result.error)
    setStep(fallback)
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

  // -------------------------------------------------------------------------
  // Revisão
  // -------------------------------------------------------------------------
  if (step.kind === 'review') {
    const lead =
      step.by === 'ai'
        ? 'Confira tudo com o PDF ao lado. A leitura da IA pode errar: corrija o que precisar antes de salvar.'
        : step.by === 'device'
          ? 'O celular leu o PDF sem IA. Confira tudo com o PDF ao lado e corrija o que precisar antes de salvar.'
          : 'Preencha as refeições do seu plano. Só nome e horário de cada refeição são obrigatórios.'
    const reviewFile = step.file
    return (
      <div className="page">
        <h1 className="page-title">Revise o plano</h1>
        <p className="muted page-lead">
          {lead}
          {step.costUsd !== null && ` Custo desta leitura: ${formatUsd(step.costUsd)}.`}
        </p>
        {step.by === 'device' && reviewFile && aiAvailable && (
          <button
            type="button"
            className="btn-link retry-ai"
            onClick={() => {
              if (!window.confirm('Ler este PDF com IA? As correções feitas aqui serão descartadas.')) return
              if (access?.consented) readWithAi(reviewFile)
              else setStep({ kind: 'offer-ai', file: reviewFile, local: null, reason: 'Você pediu a leitura com IA.' })
            }}
          >
            Não ficou bom? Ler com IA ({AI_COST_HINT})
          </button>
        )}
        {error && <p className="banner banner-error">{error}</p>}
        <PlanEditor
          initial={step.draft}
          saving={saving}
          onSave={(draft) => handleSave(draft, step.extractionId)}
          onCancel={() => {
            setError(null)
            // Uma leitura com IA continua guardada: dá para voltar a ela pelo aviso.
            fetchLatestExtraction().then(setPending)
            setStep({ kind: 'choose' })
          }}
        />
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Escolha, leitura e oferta de IA
  // -------------------------------------------------------------------------
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
          {step.by === 'device' ? (
            <>
              <h2>Lendo o PDF…</h2>
              <p className="muted">
                O celular está lendo <strong>{step.fileName}</strong>, sem enviar o arquivo para lugar nenhum.
              </p>
            </>
          ) : (
            <>
              <h2>Lendo com IA…</h2>
              <p className="muted">
                A IA está transcrevendo <strong>{step.fileName}</strong>. Costuma levar de 30 segundos a 1 minuto e
                meio. Se a tela apagar, tudo bem: a leitura fica guardada e aparece aqui quando você voltar.
              </p>
            </>
          )}
        </section>
      )}

      {step.kind === 'offer-ai' && (
        <section className="info-card form-card">
          <h2>Não deu para ler bem sem IA</h2>
          <p className="muted">{step.reason}</p>

          {access?.vip && aiRemaining > 0 && !access.consented && <AiTerms onAccept={handleAccept} />}

          {access?.vip && aiRemaining > 0 && access.consented && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => readWithAi(step.file)}>
                Ler com IA ({AI_COST_HINT})
              </button>
              <small className="muted">
                Uso da IA neste mês: {formatUsd(access.monthSpentUsd)} de {formatUsd(access.monthLimitUsd)}.
              </small>
            </>
          )}
          {access?.vip && aiRemaining <= 0 && (
            <p className="muted">Você atingiu o limite de uso da IA deste mês; ele volta no começo do mês.</p>
          )}
          {access && !access.vip && (
            <p className="muted">A leitura com IA é exclusiva para usuários VIP.</p>
          )}

          {step.local && step.local.quality === 'weak' && (
            <button
              type="button"
              className="btn btn-outline-neutral"
              onClick={() => toReview(step.local!.plan, { costUsd: null, extractionId: null, file: step.file, by: 'device' })}
            >
              Revisar o que foi lido
            </button>
          )}
          <button
            type="button"
            className="btn btn-outline-neutral"
            onClick={() => setStep({ kind: 'review', draft: emptyDraft(), costUsd: null, extractionId: null, file: null, by: 'manual' })}
          >
            Montar à mão
          </button>
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setError(null)
              setStep({ kind: 'choose' })
            }}
          >
            Escolher outro PDF
          </button>
        </section>
      )}

      {step.kind === 'choose' && pending && (
        <section className="info-card form-card pending-card">
          <h2>Leitura pronta</h2>
          <p className="muted">Você tem um PDF lido com IA às {timeLabel(pending.createdAt)} que ainda não foi revisado.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => toReview(pending.plan, { costUsd: pending.costUsd, extractionId: pending.id, file: null, by: 'ai' })}
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
            <p className="muted">
              O celular lê o PDF (até {MAX_PDF_MB} MB) sem enviá-lo para lugar nenhum, e você revisa tudo antes de
              salvar.
              {access?.vip && ' Se a leitura não ficar boa, você pode tentar com IA.'}
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="visually-hidden"
              id="pdf-input"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <label htmlFor="pdf-input" className="btn btn-primary btn-file">
              Escolher PDF
            </label>
            {access?.vip && (
              <small className="muted">
                Uso da IA neste mês: {formatUsd(access.monthSpentUsd)} de {formatUsd(access.monthLimitUsd)}.
              </small>
            )}
          </section>

          <section className="info-card form-card">
            <h2>Montar à mão</h2>
            <p className="muted">Digite as refeições, os alimentos e as quantidades do seu plano.</p>
            <button
              type="button"
              className="btn btn-outline-neutral"
              onClick={() => setStep({ kind: 'review', draft: emptyDraft(), costUsd: null, extractionId: null, file: null, by: 'manual' })}
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
