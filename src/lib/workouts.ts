import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Treino: a rotina do personal (PDF ou à mão), as atividades feitas no dia e o
// gasto estimado, que entra no balanço do dia (registrado − gasto). O app só
// faz a conta: não sugere comer mais nem compensar.
//
// Gasto: VIP pela IA (função ai-extract-plan, modo "activity"); sem VIP, pela
// tabela de gasto por atividade (MET), aqui. Regras testadas em workouts.test.ts.

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

// ---------------------------------------------------------------------------
// Rascunho do treino (o que a tela de revisão edita e o banco salva)
// ---------------------------------------------------------------------------

export type ExerciseDraft = { name: string; sets_text: string; load_text: string; rest_text: string }
export type RoutineDraft = { name: string; exercises: ExerciseDraft[] }
export type WorkoutDraft = { name: string; origin: 'pdf' | 'manual'; routines: RoutineDraft[] }

export const emptyExercise = (): ExerciseDraft => ({ name: '', sets_text: '', load_text: '', rest_text: '' })
export const emptyWorkout = (): WorkoutDraft => ({
  name: 'Meu treino',
  origin: 'manual',
  routines: [{ name: 'Treino A', exercises: [emptyExercise()] }],
})

// ---------------------------------------------------------------------------
// Leitura do PDF sem IA (quem não é VIP)
// ---------------------------------------------------------------------------

const FIELD = /^(s[ée]ries?|carga|intervalo|descanso|repeti[cç][oõ]es|reps?|tempo|cad[êe]ncia|obs)\b\s*:?/i

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Valor depois dos dois-pontos ("Séries :   4x15" → "4x15"). */
const fieldValue = (line: string) => line.replace(/^[^:]*:\s*/, '').replace(/\s+/g, ' ').trim()

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * Lê um treino em que cada exercício é uma linha seguida de campos como
 * "Séries : 4x15", "Carga : 0kg", "Intervalo : 60s". Cada página vira uma
 * rotina (Treino A, B…), com o título da seção ("Membros inferiores") quando
 * houver. Linhas repetidas em todas as páginas (cabeçalho com o nome do aluno,
 * academia…) são descartadas: nenhum nome de pessoa é guardado.
 */
export function parseWorkoutPages(pages: string[][]): WorkoutDraft {
  const clean = pages.map((lines) => lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean))
  // Cabeçalho = as primeiras linhas iguais em todas as páginas (nome do aluno, academia…).
  let headerSize = 0
  if (clean.length > 1) {
    while (clean.every((p) => p[headerSize] !== undefined && p[headerSize] === clean[0][headerSize])) headerSize++
  }

  const routines: RoutineDraft[] = []
  for (const lines of clean) {
    const body = lines.slice(headerSize)
    const exercises: ExerciseDraft[] = []
    let heading: string | null = null
    let current: ExerciseDraft | null = null
    for (let i = 0; i < body.length; i++) {
      const line = body[i]
      if (FIELD.test(line)) {
        if (!current) continue
        const f = fold(line)
        if (/^series?|^repeti|^reps?/.test(f)) current.sets_text = fieldValue(line)
        else if (/^carga/.test(f)) current.load_text = fieldValue(line)
        else if (/^(intervalo|descanso)/.test(f)) current.rest_text = fieldValue(line)
        continue
      }
      // Linha seguida de um campo é exercício; antes do primeiro, é o título da seção.
      if (body[i + 1] && FIELD.test(body[i + 1])) {
        current = { name: line.slice(0, 100), sets_text: '', load_text: '', rest_text: '' }
        exercises.push(current)
      } else if (!exercises.length) {
        heading = line
      }
    }
    if (!exercises.length) continue
    const letter = String.fromCharCode(65 + routines.length)
    routines.push({ name: heading ? `Treino ${letter}: ${capitalize(heading.toLowerCase())}` : `Treino ${letter}`, exercises })
  }
  return { name: 'Meu treino', origin: 'pdf', routines }
}

// ---------------------------------------------------------------------------
// Gasto pela tabela (MET), para quem não usa IA
// ---------------------------------------------------------------------------

/** "82,5" → 82.5; vazio → null; fora de 25–400 → undefined (inválido). */
export function parseWeight(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 25 && n <= 400 ? Math.round(n * 10) / 10 : undefined
}

/** Peso usado quando a pessoa não informou o dela. */
export const DEFAULT_WEIGHT_KG = 70

/** Musculação com vários exercícios, 8 a 15 repetições (Compendium of Physical Activities). */
export const STRENGTH_MET = 3.5

export const ACTIVITIES: { key: string; label: string; met: number }[] = [
  { key: 'musculacao', label: 'Musculação', met: 3.5 },
  { key: 'caminhada', label: 'Caminhada', met: 3.5 },
  { key: 'caminhada-rapida', label: 'Caminhada rápida', met: 4.3 },
  { key: 'corrida-leve', label: 'Corrida leve (trote)', met: 7 },
  { key: 'corrida', label: 'Corrida', met: 9 },
  { key: 'bicicleta', label: 'Bicicleta', met: 6.8 },
  { key: 'bike-ergometrica', label: 'Bicicleta ergométrica', met: 5.5 },
  { key: 'eliptico', label: 'Elíptico', met: 5 },
  { key: 'natacao', label: 'Natação', met: 6 },
  { key: 'funcional', label: 'Funcional / HIIT', met: 8 },
  { key: 'futebol', label: 'Futebol', met: 7 },
  { key: 'tenis', label: 'Tênis / beach tennis', met: 7 },
  { key: 'danca', label: 'Dança', met: 5 },
  { key: 'pilates', label: 'Pilates', met: 3 },
  { key: 'yoga', label: 'Yoga / alongamento', met: 2.5 },
]

/** kcal = MET × 3,5 × peso (kg) ÷ 200 × minutos. */
export function metKcal(met: number, minutes: number, weightKg: number | null): number {
  return Math.round(((met * 3.5 * (weightKg ?? DEFAULT_WEIGHT_KG)) / 200) * minutes)
}

// ---------------------------------------------------------------------------
// Balanço do dia
// ---------------------------------------------------------------------------

/** Registrado − gasto nas atividades (pode ficar negativo; o app não sugere nada com isso). */
export function netKcal(consumed: number, burned: number): number {
  return consumed - burned
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

export type Exercise = ExerciseDraft & { id: string; position: number }
export type Routine = { id: string; name: string; position: number; workout_exercises: Exercise[] }
export type WorkoutPlan = { id: string; name: string; origin: 'pdf' | 'manual'; workout_routines: Routine[] }

export async function fetchActiveWorkout(): Promise<WorkoutPlan | null> {
  const { data, error } = await client
    .from('workout_plans')
    .select('id, name, origin, workout_routines (id, name, position, workout_exercises (id, name, sets_text, load_text, rest_text, position))')
    .eq('active', true)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const plan = data as unknown as WorkoutPlan
  plan.workout_routines.sort((a, b) => a.position - b.position)
  for (const r of plan.workout_routines) r.workout_exercises.sort((a, b) => a.position - b.position)
  return plan
}

export function draftFromWorkout(plan: WorkoutPlan): WorkoutDraft {
  return {
    name: plan.name,
    origin: 'manual',
    routines: plan.workout_routines.map((r) => ({
      name: r.name,
      exercises: r.workout_exercises.map(({ name, sets_text, load_text, rest_text }) => ({ name, sets_text, load_text, rest_text })),
    })),
  }
}

export async function saveWorkout(draft: WorkoutDraft): Promise<void> {
  const routines = draft.routines
    .map((r) => ({ ...r, name: r.name.trim(), exercises: r.exercises.filter((e) => e.name.trim()) }))
    .filter((r) => r.exercises.length)
  if (!routines.length) throw new Error('Cadastre pelo menos um exercício.')
  const { error } = await client.rpc('replace_active_workout', { p: { ...draft, routines } })
  if (error) throw error
}

export type ActivityLog = {
  id: string
  log_date: string
  logged_at: string
  routine_id: string | null
  name: string
  duration_min: number
  kcal: number
  kcal_source: 'ai' | 'table'
  note: string | null
}

const LOG_COLUMNS = 'id, log_date, logged_at, routine_id, name, duration_min, kcal, kcal_source, note'

export async function fetchActivities(date: string): Promise<ActivityLog[]> {
  const { data, error } = await client.from('activity_logs').select(LOG_COLUMNS).eq('log_date', date).order('logged_at')
  if (error) throw error
  return (data ?? []).map((a) => ({ ...a, kcal: Number(a.kcal) })) as ActivityLog[]
}

export async function addActivity(log: Omit<ActivityLog, 'id' | 'logged_at'>): Promise<ActivityLog> {
  const { data, error } = await client.from('activity_logs').insert(log).select(LOG_COLUMNS).single()
  if (error) throw error
  return { ...data, kcal: Number(data.kcal) } as ActivityLog
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await client.from('activity_logs').delete().eq('id', id)
  if (error) throw error
}
