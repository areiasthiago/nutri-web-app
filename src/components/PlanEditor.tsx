import { useState } from 'react'
import type { ReactNode } from 'react'
import { TimeField } from './TimeField'
import { emptyItem, emptyMeal, emptySlot, validateDraft } from '../lib/planDraft'
import type { DraftItem, DraftMeal, DraftSlot, PlanDraft } from '../lib/planDraft'

type Props = {
  initial: PlanDraft
  saving: boolean
  onSave: (draft: PlanDraft) => void
  onCancel: () => void
  /** Quem preencheu o rascunho: só a IA "pede para conferir"; a leitura no celular também deixa avisos. */
  by: 'ai' | 'device' | 'manual'
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-button remove-button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}

/** Tela de revisão/edição do plano: tudo editável, nada salvo até "Salvar plano". */
export function PlanEditor({ initial, saving, onSave, onCancel, by }: Props) {
  const [draft, setDraft] = useState(initial)
  const [problems, setProblems] = useState<string[]>([])

  const set = (changes: Partial<PlanDraft>) => setDraft((d) => ({ ...d, ...changes }))
  const setTarget = (key: keyof PlanDraft['targets'], value: string) =>
    setDraft((d) => ({ ...d, targets: { ...d.targets, [key]: value } }))

  const updateMeal = (key: string, changes: Partial<DraftMeal>) =>
    setDraft((d) => ({ ...d, meals: d.meals.map((m) => (m.key === key ? { ...m, ...changes } : m)) }))
  const updateItem = (mealKey: string, itemKey: string, changes: Partial<DraftItem>) =>
    setDraft((d) => ({
      ...d,
      meals: d.meals.map((m) =>
        m.key === mealKey ? { ...m, items: m.items.map((i) => (i.key === itemKey ? { ...i, ...changes } : i)) } : m,
      ),
    }))
  const updateSlot = (key: string, changes: Partial<DraftSlot>) =>
    setDraft((d) => ({
      ...d,
      hydration_slots: d.hydration_slots.map((s) => (s.key === key ? { ...s, ...changes } : s)),
    }))

  function handleSave() {
    const found = validateDraft(draft)
    setProblems(found)
    if (found.length === 0) onSave(draft)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="plan-editor">
      {problems.length > 0 && (
        <div className="banner banner-error">
          <strong>Falta corrigir:</strong>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.changes.length > 0 && (
        <div className="banner banner-info">
          <strong>O que a IA mudou:</strong>
          <ul>
            {draft.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.warnings.length > 0 && (
        <div className="banner banner-attention">
          <strong>{by === 'ai' ? 'A IA pediu para você conferir:' : 'Confira estes pontos:'}</strong>
          <ul>
            {draft.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="info-card form-card">
        <h2>Plano</h2>
        <Field label="Nome do plano">
          <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Plano de outubro" />
        </Field>
        <div className="field-grid">
          <Field label="Calorias (kcal)">
            <input inputMode="decimal" value={draft.targets.kcal} onChange={(e) => setTarget('kcal', e.target.value)} />
          </Field>
          <Field label="Proteína (g)">
            <input inputMode="decimal" value={draft.targets.protein_g} onChange={(e) => setTarget('protein_g', e.target.value)} />
          </Field>
          <Field label="Carboidrato (g)">
            <input inputMode="decimal" value={draft.targets.carbs_g} onChange={(e) => setTarget('carbs_g', e.target.value)} />
          </Field>
          <Field label="Gordura (g)">
            <input inputMode="decimal" value={draft.targets.fat_g} onChange={(e) => setTarget('fat_g', e.target.value)} />
          </Field>
        </div>
        <small className="muted">Metas do dia, como estão no plano. Pode deixar em branco.</small>
      </section>

      <h2 className="editor-section-title">Refeições</h2>
      {draft.meals.map((meal, mealIndex) => (
        <section key={meal.key} className="info-card form-card editor-meal">
          <div className="editor-meal-head">
            <Field label="Horário" className="field-time">
              <TimeField value={meal.time} onChange={(time) => updateMeal(meal.key, { time })} ariaLabel="Horário da refeição" />
            </Field>
            <Field label="Refeição" className="field-grow">
              <input value={meal.name} onChange={(e) => updateMeal(meal.key, { name: e.target.value })} placeholder="Ex.: Almoço" />
            </Field>
            <RemoveButton
              label={`Remover ${meal.name || `refeição ${mealIndex + 1}`}`}
              onClick={() => set({ meals: draft.meals.filter((m) => m.key !== meal.key) })}
            />
          </div>

          {meal.items.map((item) => (
            <div key={item.key} className="editor-item">
              <div className="editor-item-head">
                <Field label="Alimento" className="field-grow">
                  <input value={item.food} onChange={(e) => updateItem(meal.key, item.key, { food: e.target.value })} />
                </Field>
                <RemoveButton
                  label={`Remover ${item.food || 'alimento'}`}
                  onClick={() => updateMeal(meal.key, { items: meal.items.filter((i) => i.key !== item.key) })}
                />
              </div>
              <div className="field-grid">
                <Field label="Quantidade">
                  <input
                    value={item.qty_text}
                    onChange={(e) => updateItem(meal.key, item.key, { qty_text: e.target.value })}
                    placeholder="Ex.: 80 g"
                  />
                </Field>
                <Field label="kcal">
                  <input inputMode="decimal" value={item.kcal} onChange={(e) => updateItem(meal.key, item.key, { kcal: e.target.value })} />
                </Field>
              </div>
              <details className="editor-more">
                <summary>
                  Macros e trocas
                  {item.substitutions.trim() && ` · ${item.substitutions.trim().split('\n').length} troca(s)`}
                </summary>
                <div className="field-grid field-grid-3">
                  <Field label="Proteína (g)">
                    <input inputMode="decimal" value={item.protein_g} onChange={(e) => updateItem(meal.key, item.key, { protein_g: e.target.value })} />
                  </Field>
                  <Field label="Carbo (g)">
                    <input inputMode="decimal" value={item.carbs_g} onChange={(e) => updateItem(meal.key, item.key, { carbs_g: e.target.value })} />
                  </Field>
                  <Field label="Gordura (g)">
                    <input inputMode="decimal" value={item.fat_g} onChange={(e) => updateItem(meal.key, item.key, { fat_g: e.target.value })} />
                  </Field>
                </div>
                <div className="field-grid">
                  <Field label="Peso para a lista de compras">
                    <input inputMode="decimal" value={item.qty_value} onChange={(e) => updateItem(meal.key, item.key, { qty_value: e.target.value })} placeholder="Ex.: 80" />
                  </Field>
                  <Field label="Unidade">
                    <select
                      value={item.qty_unit}
                      onChange={(e) => updateItem(meal.key, item.key, { qty_unit: e.target.value as DraftItem['qty_unit'] })}
                    >
                      <option value="">—</option>
                      <option value="g">g</option>
                      <option value="mL">mL</option>
                      <option value="un">unidade</option>
                    </select>
                  </Field>
                </div>
                <Field label="Trocas (uma por linha)">
                  <textarea
                    rows={3}
                    value={item.substitutions}
                    onChange={(e) => updateItem(meal.key, item.key, { substitutions: e.target.value })}
                    placeholder="Ex.: Batata-doce cozida (100 g)"
                  />
                </Field>
              </details>
            </div>
          ))}

          <button type="button" className="btn-link" onClick={() => updateMeal(meal.key, { items: [...meal.items, emptyItem()] })}>
            + Alimento
          </button>
        </section>
      ))}
      <button type="button" className="btn btn-outline-neutral" onClick={() => set({ meals: [...draft.meals, emptyMeal()] })}>
        + Refeição
      </button>

      <h2 className="editor-section-title">Água</h2>
      <section className="info-card form-card">
        <Field label="Meta do dia (mL)">
          <input inputMode="numeric" value={draft.targets.water_ml} onChange={(e) => setTarget('water_ml', e.target.value)} placeholder="Ex.: 3000" />
        </Field>
        {draft.hydration_slots.length > 0 && <span className="field-caption">Horários (opcional)</span>}
        {draft.hydration_slots.map((slot) => (
          <div key={slot.key} className="editor-slot">
            <TimeField value={slot.time} onChange={(time) => updateSlot(slot.key, { time })} ariaLabel="Horário da água" />
            <input inputMode="numeric" aria-label="Quantidade em mL" placeholder="mL" value={slot.ml} onChange={(e) => updateSlot(slot.key, { ml: e.target.value })} />
            <input aria-label="Descrição" placeholder="Ex.: Ao acordar" value={slot.label} onChange={(e) => updateSlot(slot.key, { label: e.target.value })} />
            <RemoveButton
              label="Remover horário"
              onClick={() => set({ hydration_slots: draft.hydration_slots.filter((s) => s.key !== slot.key) })}
            />
          </div>
        ))}
        <button type="button" className="btn-link" onClick={() => set({ hydration_slots: [...draft.hydration_slots, emptySlot()] })}>
          + Horário de água
        </button>
      </section>

      <h2 className="editor-section-title">Observações</h2>
      <section className="info-card form-card">
        <Field label="Uma por linha">
          <textarea rows={4} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ex.: Pouco sal" />
        </Field>
      </section>

      <p className="muted editor-save-note">Ao salvar, este vira o seu plano ativo. O plano atual fica guardado.</p>
      <div className="editor-actions">
        <button type="button" className="btn-link" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar plano'}
        </button>
      </div>
    </div>
  )
}
