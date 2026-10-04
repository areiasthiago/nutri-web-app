import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AI_ESTIMATE_ESTIMATE_USD, acceptAiTerms, estimateMealWithAi, quotaPercent } from '../lib/ai'
import type { AiAccess } from '../lib/ai'
import { createCustomMeal, fetchCustomMeals, searchCustomMeals, touchCustomMeal } from '../lib/customMeals'
import type { CustomMeal } from '../lib/customMeals'
import type { OffPlanFood, Swap } from '../lib/mealLogs'
import { formatNumber } from '../lib/plan'
import type { MealItem } from '../lib/plan'
import { parseNumber } from '../lib/planDraft'
import { AiTerms } from './AiTerms'

type Props = {
  mealName: string
  /** Alimentos da refeição que têm trocas previstas no plano. */
  swapItems: MealItem[]
  initialSwaps: Swap[]
  /** A refeição já está marcada como feita pelo plano (o botão vira "Salvar trocas"). */
  doneOnPlan: boolean
  /** Marca a refeição como feita com estas trocas do plano. */
  onConfirmSwaps: (swaps: Swap[]) => Promise<boolean>
  access: AiAccess | null
  onAccessChange: (access: AiAccess) => void
  onClose: () => void
  /** Registra a refeição como feita com esta comida no lugar. */
  onConfirm: (food: OffPlanFood) => Promise<boolean>
}

// Formulário com os valores (vindos da lista, da IA ou digitados), sempre editável.
type Form = { name: string; description: string; kcal: string; protein_g: string; carbs_g: string; fat_g: string }

const numText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

function kcalLine(m: { kcal: number | null; description: string | null }) {
  return [m.description, m.kcal !== null ? `${formatNumber(m.kcal)} kcal` : null].filter(Boolean).join(' · ')
}

/**
 * "Troquei algo": (1) trocas previstas no plano, por alimento; ou (2) outra
 * comida: escolhe da lista "Já comi antes" (sem IA), estima com IA (VIP) ou
 * digita à mão. O que for novo entra na lista para a próxima vez.
 */
export function OffPlanSheet({
  mealName,
  swapItems,
  initialSwaps,
  doneOnPlan,
  onConfirmSwaps,
  access,
  onAccessChange,
  onClose,
  onConfirm,
}: Props) {
  const [swaps, setSwaps] = useState<Swap[]>(initialSwaps)
  const [library, setLibrary] = useState<CustomMeal[]>([])
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<CustomMeal | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [aiNotes, setAiNotes] = useState<string[]>([])
  const [fromAi, setFromAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCustomMeals()
      .then(setLibrary)
      .catch(() => setLibrary([]))
  }, [])

  const matches = picked || form ? [] : searchCustomMeals(library, text)
  const recent = !text.trim() && !picked && !form ? library.slice(0, 5) : []
  const aiReady = !!access?.vip && access.consented && access.monthSpentUsd < access.monthLimitUsd

  const swapFor = (itemId: string) => swaps.find((s) => s.item_id === itemId)?.substitution ?? ''

  function chooseSwap(item: MealItem, substitution: string) {
    const others = swaps.filter((s) => s.item_id !== item.id)
    setSwaps(substitution ? [...others, { item_id: item.id, food: item.food, substitution }] : others)
  }

  async function confirmSwaps() {
    setError(null)
    setBusy(true)
    const ok = await onConfirmSwaps(swaps)
    setBusy(false)
    if (ok) onClose()
  }

  function pick(meal: CustomMeal) {
    setPicked(meal)
    setForm(null)
    setError(null)
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
    setForm({
      name: e.name,
      description: e.description,
      kcal: numText(e.kcal),
      protein_g: numText(e.protein_g),
      carbs_g: numText(e.carbs_g),
      fat_g: numText(e.fat_g),
    })
    onAccessChange({ ...access!, monthSpentUsd: access!.monthSpentUsd + result.costUsd })
  }

  function handleManual() {
    setFromAi(false)
    setAiNotes([])
    setForm({ name: text.trim().slice(0, 80), description: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '' })
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
        })
        food = { custom_meal_id: saved.id, name: saved.name, kcal: saved.kcal, protein_g: saved.protein_g, carbs_g: saved.carbs_g, fat_g: saved.fat_g }
      } else {
        setBusy(false)
        return
      }
      if (await onConfirm(food)) onClose()
    } catch {
      setError('Não foi possível salvar agora. Confira a internet e tente de novo.')
    }
    setBusy(false)
  }

  const setField = (key: keyof Form, value: string) => setForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet offplan-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offplan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="offplan-title">{swapItems.length > 0 ? `O que mudou no ${mealName}?` : `O que você comeu no lugar de ${mealName}?`}</h2>

        {!picked && !form && swapItems.length > 0 && (
          <section className="swap-section" aria-label="Trocas do plano">
            <span className="field-caption">Trocas do plano</span>
            {swapItems.map((item) => {
              const chosen = swapFor(item.id)
              return (
                <div key={item.id} className="swap-item">
                  <p>
                    {item.food} <small className="muted">{item.qty_text}</small>
                  </p>
                  <div className="swap-chips" role="radiogroup" aria-label={`Troca para ${item.food}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!chosen}
                      className={`swap-chip${!chosen ? ' is-selected' : ''}`}
                      onClick={() => chooseSwap(item, '')}
                    >
                      Como no plano
                    </button>
                    {item.substitutions.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        role="radio"
                        aria-checked={chosen === sub.text}
                        className={`swap-chip${chosen === sub.text ? ' is-selected' : ''}`}
                        onClick={() => chooseSwap(item, sub.text)}
                      >
                        {sub.text}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={confirmSwaps}>
              {doneOnPlan ? 'Salvar trocas' : 'Marcar com estas trocas'}
            </button>
            <div className="divider">ou comi outra coisa</div>
          </section>
        )}

        {!picked && !form && (
          <>
            <textarea
              className="offplan-input"
              rows={2}
              maxLength={300}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: pipoca de panela, 1 tigela média"
              autoFocus={swapItems.length === 0}
            />

            {(matches.length > 0 || recent.length > 0) && (
              <div className="offplan-library">
                <span className="field-caption">{matches.length > 0 ? 'Já comi antes' : 'Recentes'}</span>
                <ul>
                  {(matches.length > 0 ? matches : recent).map((m) => (
                    <li key={m.id}>
                      <button type="button" className="offplan-choice" onClick={() => pick(m)}>
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
              Preencher à mão
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
              {busy ? 'Salvando…' : 'Marcar refeição'}
            </button>
            <button type="button" className="btn-link" onClick={() => setPicked(null)}>
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
              <input value={form.name} maxLength={80} onChange={(e) => setField('name', e.target.value)} />
            </label>
            <label className="field">
              <span>Quantidade</span>
              <input value={form.description} maxLength={300} onChange={(e) => setField('description', e.target.value)} placeholder="Ex.: 1 tigela média" />
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
            <small className="muted">
              {fromAi ? 'Valores estimados pela IA; ajuste se souber os certos. ' : ''}Fica salvo em "Já comi antes"
              para a próxima vez.
            </small>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Marcar refeição'}
            </button>
            <button type="button" className="btn-link" onClick={() => setForm(null)}>
              Voltar
            </button>
          </form>
        )}

        {error && <p className="banner banner-error">{error}</p>}

        <button type="button" className="btn-link" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
