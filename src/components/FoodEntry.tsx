import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AI_ESTIMATE_ESTIMATE_USD, acceptAiTerms, estimateMealWithAi, quotaPercent } from '../lib/ai'
import type { AiAccess } from '../lib/ai'
import { createCustomMeal, searchCustomMealsInDb, touchCustomMeal } from '../lib/customMeals'
import type { CustomMeal } from '../lib/customMeals'
import type { OffPlanFood } from '../lib/mealLogs'
import { formatNumber } from '../lib/plan'
import { parseNumber } from '../lib/planDraft'
import { AiTerms } from './AiTerms'

/** Em que passo está: digitando/buscando, escolheu um já registrado, ou conferindo valores. */
export type FoodEntryStage = 'search' | 'picked' | 'form'

type Props = {
  access: AiAccess | null
  onAccessChange: (access: AiAccess) => void
  /** Registra a comida. Devolve true se deu certo (o campo então volta ao início). */
  onConfirm: (food: OffPlanFood) => Promise<boolean>
  placeholder: string
  confirmLabel: string
  manualLabel: string
  autoFocus?: boolean
  onStageChange?: (stage: FoodEntryStage) => void
}

// Formulário com os valores (vindos da IA ou digitados), sempre editável.
type Form = { name: string; description: string; kcal: string; protein_g: string; carbs_g: string; fat_g: string }

const numText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

function kcalLine(m: { kcal: number | null; description: string | null }) {
  return [m.description, m.kcal !== null ? `${formatNumber(m.kcal)} kcal` : null].filter(Boolean).join(' · ')
}

/**
 * Descrever o que comeu: enquanto digita, busca no banco o que já foi
 * registrado ("Já comi antes", sem IA); senão, calcula com IA (VIP) ou
 * preenche à mão. O que for novo entra na lista para a próxima vez.
 * Usado em "Fazer trocas" (refeição inteira) e em "Comeu fora de hora?".
 */
export function FoodEntry({
  access,
  onAccessChange,
  onConfirm,
  placeholder,
  confirmLabel,
  manualLabel,
  autoFocus,
  onStageChange,
}: Props) {
  const [text, setText] = useState('')
  const [matches, setMatches] = useState<CustomMeal[]>([])
  const [picked, setPicked] = useState<CustomMeal | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [aiNotes, setAiNotes] = useState<string[]>([])
  const [fromAi, setFromAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const aiReady = !!access?.vip && access.consented && access.monthSpentUsd < access.monthLimitUsd

  // Busca o que já foi registrado enquanto digita (com uma pequena pausa, para não buscar a cada letra).
  useEffect(() => {
    let active = true
    const id = window.setTimeout(() => {
      searchCustomMealsInDb('meal', text)
        .then((rows) => active && setMatches(rows))
        .catch(() => active && setMatches([]))
    }, 250)
    return () => {
      active = false
      window.clearTimeout(id)
    }
  }, [text])

  function goTo(stage: FoodEntryStage, next: { picked?: CustomMeal | null; form?: Form | null }) {
    setPicked(next.picked ?? null)
    setForm(next.form ?? null)
    onStageChange?.(stage)
  }

  function reset() {
    setText('')
    setAiNotes([])
    setFromAi(false)
    goTo('search', {})
  }

  async function handleAi() {
    if (!text.trim()) return
    setError(null)
    setBusy(true)
    const result = await estimateMealWithAi(text.trim())
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const e = result.estimate
    setFromAi(true)
    setAiNotes(e.notes ?? [])
    goTo('form', {
      form: {
        name: e.name,
        description: e.description,
        kcal: numText(e.kcal),
        protein_g: numText(e.protein_g),
        carbs_g: numText(e.carbs_g),
        fat_g: numText(e.fat_g),
      },
    })
    onAccessChange({ ...access!, monthSpentUsd: access!.monthSpentUsd + result.costUsd })
  }

  function handleManual() {
    setFromAi(false)
    setAiNotes([])
    goTo('form', { form: { name: text.trim().slice(0, 80), description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '' } })
  }

  async function handleAccept() {
    if (await acceptAiTerms()) onAccessChange({ ...access!, consented: true })
    else setError('Não foi possível registrar o aceite agora. Tente de novo.')
  }

  async function confirm(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      let food: OffPlanFood
      if (picked) {
        await touchCustomMeal(picked)
        food = { custom_meal_id: picked.id, name: picked.name, kcal: picked.kcal, protein_g: picked.protein_g, carbs_g: picked.carbs_g, fat_g: picked.fat_g }
      } else if (form) {
        if (!form.name.trim()) {
          setError('Dê um nome para o que você comeu.')
          setBusy(false)
          return
        }
        // Entra na lista "Já comi antes" para a próxima vez, sem IA.
        const saved = await createCustomMeal({
          name: form.name.trim().slice(0, 80),
          description: form.description.trim().slice(0, 300) || null,
          kcal: parseNumber(form.kcal),
          protein_g: parseNumber(form.protein_g),
          carbs_g: parseNumber(form.carbs_g),
          fat_g: parseNumber(form.fat_g),
          source: fromAi ? 'ai' : 'manual',
          kind: 'meal',
        })
        food = { custom_meal_id: saved.id, name: saved.name, kcal: saved.kcal, protein_g: saved.protein_g, carbs_g: saved.carbs_g, fat_g: saved.fat_g }
      } else {
        setBusy(false)
        return
      }
      if (await onConfirm(food)) reset()
    } catch {
      setError('Não foi possível salvar agora. Confira a internet e tente de novo.')
    }
    setBusy(false)
  }

  const setField = (key: keyof Form, value: string) => setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <div className="food-entry">
      {!picked && !form && (
        <>
          <textarea
            className="offplan-input"
            rows={3}
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
          />

          {matches.length > 0 && (
            <div className="offplan-library">
              <span className="field-caption">Já comi antes</span>
              <ul>
                {matches.map((m) => (
                  <li key={m.id}>
                    <button type="button" className="offplan-choice" onClick={() => goTo('picked', { picked: m })}>
                      <strong>{m.name}</strong>
                      <small>{kcalLine(m)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {access?.vip && !access.consented && text.trim() && <AiTerms onAccept={handleAccept} />}
          {aiReady && (
            <button type="button" className="btn btn-primary" disabled={!text.trim() || busy} onClick={handleAi}>
              {busy ? 'Calculando…' : `Calcular com IA (usa cerca de ${quotaPercent(AI_ESTIMATE_ESTIMATE_USD, access!.monthLimitUsd)}% da cota)`}
            </button>
          )}
          <button type="button" className="btn btn-outline-neutral" disabled={busy} onClick={handleManual}>
            {manualLabel}
          </button>
        </>
      )}

      {picked && (
        <div className="offplan-picked">
          <p>
            <strong>{picked.name}</strong>
            <br />
            <span className="muted">{kcalLine(picked) || 'Sem valores registrados'}</span>
          </p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => confirm()}>
            {busy ? 'Salvando…' : confirmLabel}
          </button>
          <button type="button" className="btn-link" onClick={() => goTo('search', {})}>
            Escolher outra coisa
          </button>
        </div>
      )}

      {form && (
        <form className="offplan-form" onSubmit={confirm}>
          {aiNotes.length > 0 && (
            <div className="banner banner-info">
              {aiNotes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
          <label className="field">
            <span>O que você comeu</span>
            <input value={form.name} maxLength={80} onChange={(e) => setField('name', e.target.value)} placeholder="Nome" />
          </label>
          <label className="field">
            <span>Quantidade</span>
            <input value={form.description} maxLength={300} onChange={(e) => setField('description', e.target.value)} placeholder="Quantidade, peso, etc." />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Calorias (kcal)</span>
              <input inputMode="decimal" value={form.kcal} onChange={(e) => setField('kcal', e.target.value)} />
            </label>
            <label className="field">
              <span>Proteína (g)</span>
              <input inputMode="decimal" value={form.protein_g} onChange={(e) => setField('protein_g', e.target.value)} />
            </label>
            <label className="field">
              <span>Carboidrato (g)</span>
              <input inputMode="decimal" value={form.carbs_g} onChange={(e) => setField('carbs_g', e.target.value)} />
            </label>
            <label className="field">
              <span>Gordura (g)</span>
              <input inputMode="decimal" value={form.fat_g} onChange={(e) => setField('fat_g', e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : confirmLabel}
          </button>
          <button type="button" className="btn-link" onClick={() => goTo('search', {})}>
            Voltar
          </button>
        </form>
      )}

      {error && <p className="banner banner-error">{error}</p>}
    </div>
  )
}
