import { useEffect, useState } from 'react'
import { estimateMealWithAi } from '../lib/ai'
import type { AiAccess } from '../lib/ai'
import { createCustomMeal, findCustomMealByName, searchCustomMealsInDb, touchCustomMeal } from '../lib/customMeals'
import type { CustomMeal } from '../lib/customMeals'
import type { OffPlanFood, Swap } from '../lib/mealLogs'
import { formatNumber } from '../lib/plan'
import type { MealItem } from '../lib/plan'
import { fold } from '../lib/planParser'
import { FoodEntry } from './FoodEntry'
import type { FoodEntryStage } from './FoodEntry'

type Props = {
  mealName: string
  /** Alimentos da refeição (cada um é um grupo que pode ser trocado). */
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

/**
 * "Fazer trocas": (1) por alimento, o do plano, as trocas previstas ou
 * "Outro…" (desmarcar deixa o grupo vazio = não comeu); ou (2) outra comida
 * no lugar da refeição inteira (FoodEntry).
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
  // Grupos com o campo "Outro…" aberto (troca escrita, fora das previstas no plano).
  const [customOpen, setCustomOpen] = useState<Set<string>>(
    () =>
      new Set(
        initialSwaps
          .filter((s) => !swapItems.find((i) => i.id === s.item_id)?.substitutions.some((sub) => sub.text === s.substitution))
          .map((s) => s.item_id),
      ),
  )
  // Por alimento, alimentos já trocados antes que combinam com o digitado no "Outro…".
  const [itemMatches, setItemMatches] = useState<Record<string, CustomMeal[]>>({})
  const [entryStage, setEntryStage] = useState<FoodEntryStage>('search')
  const [busy, setBusy] = useState(false)
  const [busyText, setBusyText] = useState<string | null>(null)

  const aiReady = !!access?.vip && access.consented && access.monthSpentUsd < access.monthLimitUsd

  const customTexts = swaps
    .filter((s) => customOpen.has(s.item_id))
    .map((s) => `${s.item_id}=${s.substitution}`)
    .join('|')
  useEffect(() => {
    let active = true
    const id = window.setTimeout(() => {
      const pairs = customTexts ? customTexts.split('|').map((p) => p.split('=') as [string, string]) : []
      Promise.all(pairs.map(([itemId, typed]) => searchCustomMealsInDb('item', typed, 4).then((rows) => [itemId, rows] as const)))
        .then((results) => active && setItemMatches(Object.fromEntries(results)))
        .catch(() => active && setItemMatches({}))
    }, 250)
    return () => {
      active = false
      window.clearTimeout(id)
    }
  }, [customTexts])

  /** Sugestões do "Outro…" de um alimento (sem repetir o que já está escrito). */
  const itemSuggestions = (itemId: string, typed: string) =>
    typed.trim() ? (itemMatches[itemId] ?? []).filter((m) => fold(m.name) !== fold(typed.trim())) : []

  const swapFor = (itemId: string) => swaps.find((s) => s.item_id === itemId)?.substitution ?? ''
  const skippedFor = (itemId: string) => swaps.some((s) => s.item_id === itemId && s.skipped)

  /** Grupo vazio (opção desmarcada): o alimento não foi comido e conta zero. */
  function skipItem(item: MealItem) {
    const others = swaps.filter((s) => s.item_id !== item.id)
    setSwaps([
      ...others,
      { item_id: item.id, food: item.food, substitution: 'Não comi', skipped: true, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    ])
    setCustomOpen((open) => {
      const next = new Set(open)
      next.delete(item.id)
      return next
    })
  }

  function chooseSwap(item: MealItem, substitution: string, custom = false) {
    const others = swaps.filter((s) => s.item_id !== item.id)
    setSwaps(substitution ? [...others, { item_id: item.id, food: item.food, substitution }] : others)
    setCustomOpen((open) => {
      const next = new Set(open)
      if (custom) next.add(item.id)
      else next.delete(item.id)
      return next
    })
  }

  /**
   * Valores da troca: da lista "Já comi antes" se já existir (sem IA); senão,
   * estimados pela IA (VIP) e guardados na lista para a próxima vez. Sem IA,
   * o alimento continua contando pelos valores do plano.
   */
  async function withNutrition(swap: Swap): Promise<Swap> {
    if (swap.kcal !== null && swap.kcal !== undefined) return swap
    const key = swap.substitution.trim()
    // Alimento já calculado antes (de preferência como alimento; senão, qualquer um com o mesmo nome).
    const known = await findCustomMealByName(key, 'item')
    if (known) {
      await touchCustomMeal(known)
      return { ...swap, kcal: known.kcal, protein_g: known.protein_g, carbs_g: known.carbs_g, fat_g: known.fat_g }
    }
    if (!aiReady) return swap
    const item = swapItems.find((i) => i.id === swap.item_id)
    const result = await estimateMealWithAi(
      `${key} (no lugar de ${item?.food ?? swap.food}${item?.qty_text ? `, ${item.qty_text}` : ''}; ` +
        'se a troca não disser a quantidade, considere a mesma porção do original)',
    )
    if (!result.ok) return swap
    const e = result.estimate
    onAccessChange({ ...access!, monthSpentUsd: access!.monthSpentUsd + result.costUsd })
    await createCustomMeal({
      name: key.slice(0, 80),
      description: e.description?.slice(0, 300) || null,
      kcal: e.kcal,
      protein_g: e.protein_g,
      carbs_g: e.carbs_g,
      fat_g: e.fat_g,
      source: 'ai',
      kind: 'item',
    })
    return { ...swap, kcal: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g }
  }

  async function confirmSwaps() {
    setBusy(true)
    let enriched = swaps
    try {
      if (swaps.some((s) => s.kcal === null || s.kcal === undefined)) {
        setBusyText('Calculando as trocas…')
        enriched = await Promise.all(swaps.map(withNutrition))
      }
    } catch {
      // Sem cálculo, salva assim mesmo: o alimento conta pelos valores do plano.
    }
    setBusyText(null)
    const ok = await onConfirmSwaps(enriched)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet offplan-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offplan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="offplan-title">Trocas · {mealName}</h2>

        {entryStage === 'search' && swapItems.length > 0 && (
          <section className="swap-section" aria-label="Trocas do plano">
            {/* Um grupo por alimento: o do plano (já selecionado), as trocas previstas e "Outro…". */}
            {swapItems.map((item) => {
              const skipped = skippedFor(item.id)
              const chosen = skipped ? '' : swapFor(item.id)
              const isCustom = !skipped && customOpen.has(item.id)
              return (
                <div key={item.id} className="swap-group">
                  <div className="swap-chips" role="radiogroup" aria-label={`Opções para ${item.food}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!chosen && !isCustom && !skipped}
                      className={`swap-chip${!chosen && !isCustom && !skipped ? ' is-selected' : ''}`}
                      // Tocar de novo na opção selecionada desmarca: grupo vazio = não comeu.
                      onClick={() => (!chosen && !isCustom && !skipped ? skipItem(item) : chooseSwap(item, ''))}
                    >
                      {item.food}
                      {item.qty_text && ` (${item.qty_text})`}
                    </button>
                    {item.substitutions.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        role="radio"
                        aria-checked={!isCustom && chosen === sub.text}
                        className={`swap-chip${!isCustom && chosen === sub.text ? ' is-selected' : ''}`}
                        onClick={() => (!isCustom && chosen === sub.text ? skipItem(item) : chooseSwap(item, sub.text))}
                      >
                        {sub.text}
                      </button>
                    ))}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isCustom}
                      className={`swap-chip${isCustom ? ' is-selected' : ''}`}
                      onClick={() => (isCustom ? skipItem(item) : chooseSwap(item, '', true))}
                    >
                      Outro…
                    </button>
                  </div>
                  {isCustom && (
                    <>
                      <input
                        className="swap-custom"
                        value={chosen}
                        maxLength={80}
                        autoFocus
                        aria-label={`Troca para ${item.food}`}
                        placeholder="Alimento e quantidade"
                        onChange={(e) => chooseSwap(item, e.target.value, true)}
                      />
                      {itemSuggestions(item.id, chosen).length > 0 && (
                        <div className="swap-suggestions" aria-label="Alimentos que você já trocou">
                          {itemSuggestions(item.id, chosen).map((m) => (
                            <button key={m.id} type="button" className="swap-chip swap-suggestion" onClick={() => chooseSwap(item, m.name, true)}>
                              {m.name}
                              {m.kcal !== null && <small> · {formatNumber(m.kcal)} kcal</small>}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={confirmSwaps}>
              {busyText ?? (doneOnPlan ? 'Salvar trocas' : 'Salvar trocas e registrar')}
            </button>
            <div className="divider">ou</div>
          </section>
        )}

        <FoodEntry
          access={access}
          onAccessChange={onAccessChange}
          onConfirm={async (food) => {
            const ok = await onConfirm(food)
            if (ok) onClose()
            return ok
          }}
          placeholder="Busque uma refeição que você já registrou ou descreva uma nova (alimentos, quantidades, peso)"
          confirmLabel="Marcar refeição"
          manualLabel="Trocar à mão"
          autoFocus={swapItems.length === 0}
          onStageChange={setEntryStage}
        />

        <button type="button" className="btn-link" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
