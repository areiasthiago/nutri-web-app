import type { SupabaseClient } from '@supabase/supabase-js'
import type { Plan } from './plan'
import { supabase } from './supabaseClient'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

// Rascunho de plano em edição (tela de revisão/edição). Números ficam como
// texto enquanto a pessoa digita ("1.503", "80,5"); viram número ao salvar.

export type DraftItem = {
  key: string
  food: string
  qty_text: string
  qty_value: string
  qty_unit: '' | 'g' | 'mL' | 'un'
  kcal: string
  protein_g: string
  carbs_g: string
  fat_g: string
  /** Uma troca por linha. */
  substitutions: string
}

export type DraftMeal = { key: string; name: string; time: string; items: DraftItem[] }

export type DraftSlot = { key: string; time: string; ml: string; label: string }

export type PlanDraft = {
  origin: 'pdf' | 'manual'
  name: string
  status_note: string
  targets: { kcal: string; protein_g: string; carbs_g: string; fat_g: string; water_ml: string }
  /** Uma observação por linha. */
  notes: string
  meals: DraftMeal[]
  hydration_slots: DraftSlot[]
  /** Pontos que a IA marcou para conferir (não são salvos). */
  warnings: string[]
  /** O que uma edição com IA mudou (não é salvo). */
  changes: string[]
}

/** Formato que a IA devolve (supabase/functions/ai-extract-plan). */
export type ExtractedPlan = {
  name: string
  status_note: string | null
  targets: Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'water_ml', number | null>
  notes: string[]
  meals: {
    name: string
    time: string
    items: {
      food: string
      qty_text: string
      qty_value: number | null
      qty_unit: 'g' | 'mL' | 'un' | null
      kcal: number | null
      protein_g: number | null
      carbs_g: number | null
      fat_g: number | null
      substitutions: string[]
    }[]
  }[]
  hydration_slots: { time: string; ml: number; label: string | null }[]
  warnings: string[]
  /** Só na edição com IA: lista do que mudou. */
  changes?: string[]
}

let keySeq = 0
export const newKey = () => `k${++keySeq}`

const numText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

export function emptyItem(): DraftItem {
  return {
    key: newKey(),
    food: '',
    qty_text: '',
    qty_value: '',
    qty_unit: '',
    kcal: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
    substitutions: '',
  }
}

export function emptyMeal(): DraftMeal {
  return { key: newKey(), name: '', time: '', items: [emptyItem()] }
}

export function emptySlot(): DraftSlot {
  return { key: newKey(), time: '', ml: '', label: '' }
}

export function emptyDraft(): PlanDraft {
  return {
    origin: 'manual',
    name: '',
    status_note: '',
    targets: { kcal: '', protein_g: '', carbs_g: '', fat_g: '', water_ml: '' },
    notes: '',
    meals: [emptyMeal()],
    hydration_slots: [],
    warnings: [],
    changes: [],
  }
}

export function draftFromExtracted(p: ExtractedPlan): PlanDraft {
  return {
    origin: 'pdf',
    name: p.name ?? '',
    status_note: p.status_note ?? '',
    targets: {
      kcal: numText(p.targets?.kcal),
      protein_g: numText(p.targets?.protein_g),
      carbs_g: numText(p.targets?.carbs_g),
      fat_g: numText(p.targets?.fat_g),
      water_ml: numText(p.targets?.water_ml),
    },
    notes: (p.notes ?? []).join('\n'),
    meals: (p.meals ?? []).map((m) => ({
      key: newKey(),
      name: m.name ?? '',
      time: (m.time ?? '').slice(0, 5),
      items: (m.items ?? []).map((i) => ({
        key: newKey(),
        food: i.food ?? '',
        qty_text: i.qty_text ?? '',
        qty_value: numText(i.qty_value),
        qty_unit: i.qty_unit ?? '',
        kcal: numText(i.kcal),
        protein_g: numText(i.protein_g),
        carbs_g: numText(i.carbs_g),
        fat_g: numText(i.fat_g),
        substitutions: (i.substitutions ?? []).join('\n'),
      })),
    })),
    hydration_slots: (p.hydration_slots ?? []).map((s) => ({
      key: newKey(),
      time: (s.time ?? '').slice(0, 5),
      ml: numText(s.ml),
      label: s.label ?? '',
    })),
    warnings: p.warnings ?? [],
    changes: p.changes ?? [],
  }
}

/** Plano salvo -> formato da IA/rascunho (sem ids), para editar à mão ou com IA. */
export function planToExtracted(plan: Plan): ExtractedPlan {
  return {
    name: plan.name,
    status_note: plan.status_note,
    targets: {
      kcal: plan.target_kcal,
      protein_g: plan.target_protein_g,
      carbs_g: plan.target_carbs_g,
      fat_g: plan.target_fat_g,
      water_ml: plan.target_water_ml,
    },
    notes: plan.notes,
    meals: plan.meals.map((m) => ({
      name: m.name,
      time: m.time.slice(0, 5),
      items: m.meal_items.map((i) => ({
        food: i.food,
        qty_text: i.qty_text,
        qty_value: i.qty_value,
        qty_unit: i.qty_unit,
        kcal: i.kcal,
        protein_g: i.protein_g,
        carbs_g: i.carbs_g,
        fat_g: i.fat_g,
        substitutions: i.substitutions.map((s) => s.text),
      })),
    })),
    hydration_slots: plan.hydration_slots.map((s) => ({ time: s.time.slice(0, 5), ml: s.ml, label: s.label })),
    warnings: [],
  }
}

/** Rascunho para editar o plano atual (salvar cria uma versão nova, origem "manual"). */
export function draftFromPlan(plan: Plan): PlanDraft {
  return { ...draftFromExtracted(planToExtracted(plan)), origin: 'manual' }
}

/** "1.503" / "80,5" / "" -> 1503 / 80.5 / null. Texto inválido também vira null. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, '')
  if (!t) return null
  // Ponto como milhar quando seguido de 3 dígitos e houver vírgula ou nada depois.
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** Problemas que impedem salvar. Lista vazia = pode salvar. */
export function validateDraft(d: PlanDraft): string[] {
  const problems: string[] = []
  const meals = d.meals.filter((m) => m.name.trim() || m.items.some((i) => i.food.trim()))
  if (meals.length === 0) problems.push('Inclua pelo menos uma refeição.')
  meals.forEach((m, idx) => {
    const label = m.name.trim() || `Refeição ${idx + 1}`
    if (!m.name.trim()) problems.push(`${label}: falta o nome.`)
    if (!/^\d{2}:\d{2}$/.test(m.time)) problems.push(`${label}: falta o horário.`)
  })
  d.hydration_slots.forEach((s, idx) => {
    if (!s.time && !s.ml) return
    if (!/^\d{2}:\d{2}$/.test(s.time) || !(parseNumber(s.ml) && parseNumber(s.ml)! > 0)) {
      problems.push(`Água, horário ${idx + 1}: preencha hora e quantidade em mL.`)
    }
  })
  const water = parseNumber(d.targets.water_ml)
  if (d.targets.water_ml.trim() && !(water && water > 0)) problems.push('Meta de água inválida.')
  return problems
}

function toPayload(d: PlanDraft) {
  const water = parseNumber(d.targets.water_ml)
  return {
    origin: d.origin,
    name: d.name.trim(),
    status_note: d.status_note.trim() || null,
    notes: lines(d.notes),
    targets: {
      kcal: parseNumber(d.targets.kcal),
      protein_g: parseNumber(d.targets.protein_g),
      carbs_g: parseNumber(d.targets.carbs_g),
      fat_g: parseNumber(d.targets.fat_g),
      water_ml: water ? Math.round(water) : null,
    },
    meals: d.meals
      .filter((m) => m.name.trim() || m.items.some((i) => i.food.trim()))
      .map((m) => ({
        name: m.name.trim(),
        time: m.time,
        items: m.items
          .filter((i) => i.food.trim())
          .map((i) => ({
            food: i.food.trim(),
            qty_text: i.qty_text.trim(),
            qty_value: i.qty_unit ? parseNumber(i.qty_value) : null,
            qty_unit: i.qty_unit && parseNumber(i.qty_value) !== null ? i.qty_unit : null,
            kcal: parseNumber(i.kcal),
            protein_g: parseNumber(i.protein_g),
            carbs_g: parseNumber(i.carbs_g),
            fat_g: parseNumber(i.fat_g),
            substitutions: lines(i.substitutions),
          })),
      })),
    hydration_slots: d.hydration_slots
      .filter((s) => s.time && parseNumber(s.ml))
      .map((s) => ({ time: s.time, ml: Math.round(parseNumber(s.ml)!), label: s.label.trim() || null })),
  }
}

/**
 * Salva como plano ativo (o anterior é desativado e fica guardado). Com
 * memberId, é o plano de uma pessoa da casa.
 */
export async function saveDraftAsActivePlan(d: PlanDraft, memberId: string | null = null): Promise<{ error: string | null }> {
  const { error } = await client.rpc('replace_active_plan', { p: toPayload(d), member: memberId })
  if (error) return { error: 'Não foi possível salvar o plano agora. Confira os campos e tente de novo.' }
  return { error: null }
}
