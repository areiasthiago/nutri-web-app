import type { SupabaseClient } from '@supabase/supabase-js'
import { estimateActivityWithAi } from './ai'
import { findExercise } from './exerciseCatalog'
import { supabase } from './supabaseClient'
import { STRENGTH_MET, metKcal } from './workouts'
import type { ActivityLog, Routine } from './workouts'

// Modo treino: a rotina na tela, série por série, com cronômetro de descanso
// e aviso sonoro. Cada série feita vai para workout_set_logs (carga e
// repetições, ou o tempo), e ao terminar a sessão vira uma atividade do dia.
// Regras testadas em workoutSession.test.ts.

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ---------------------------------------------------------------------------
// Leitura dos textos do treino ("3x10-12", "60s", "4kg")
// ---------------------------------------------------------------------------

/** "45s", "1 min", "1min30", "1'30", "1:30" → segundos; número solto conta como segundos. */
export function parseDuration(text: string): number | null {
  // Faixa ("30-45s", "30 a 45 s"): vale o começo, o mais leve.
  const t = fold(text).replace(',', '.').trim().replace(/(\d+)\s*(?:-|a)\s*\d+/, '$1')
  if (!t) return null
  const clock = t.match(/(\d+)\s*(?:'|:)\s*(\d{1,2})/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const min = t.match(/(\d+(?:\.\d+)?)\s*(?:min|minutos?|m\b)\s*(?:e\s*)?(\d+)?\s*(?:s|seg|segundos?)?/)
  if (min) return Math.round(Number(min[1]) * 60) + Number(min[2] ?? 0)
  const sec = t.match(/(\d+)\s*(?:s|seg|segundos?)\b/)
  if (sec) return Number(sec[1])
  const bare = t.match(/^(\d+)$/)
  return bare ? Number(bare[1]) : null
}

export type SetsPlan = {
  sets: number
  /** O que aparece como meta de cada série ("10-12", "8 cada lado", "30s"). */
  target: string
  /** Séries por tempo (prancha, esteira): a duração de cada uma. */
  seconds: number | null
  /** Repetições sugeridas no campo (o menor número da meta). */
  reps: number | null
}

const DEFAULT_SETS = 3

/** "3x10-12" → 3 séries de "10-12"; "2x20s" → 2 de 20 s; "10 min" → 1 de 10 min. */
export function parseSets(text: string): SetsPlan {
  const t = text.trim()
  if (!t) return { sets: DEFAULT_SETS, target: '', seconds: null, reps: null }
  const m = t.match(/^(\d{1,2})\s*[x×]\s*(.+)$/i)
  const sets = m ? Math.min(10, Math.max(1, Number(m[1]))) : 1
  const target = (m ? m[2] : t).trim()
  const seconds = /\d\s*(s\b|seg|min|'|segundos?)/i.test(fold(target)) ? parseDuration(target) : null
  const reps = seconds ? null : Number(target.match(/^\d+/)?.[0] ?? NaN)
  return { sets, target, seconds, reps: Number.isFinite(reps) && reps ? reps : null }
}

/** Descanso entre as séries; vazio: 60 s, ou nenhum numa série única por tempo (cardio). */
export function restSeconds(restText: string, plan: SetsPlan): number {
  const s = parseDuration(restText)
  if (s !== null) return Math.min(600, s)
  return plan.seconds && plan.sets === 1 ? 0 : 60
}

/** "4kg", "4,5 kg" → 4.5; texto sem kg ("halter leve") → null. */
export function parseLoadKg(text: string): number | null {
  const m = fold(text).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*kg/)
  return m ? Number(m[1]) : null
}

/** 0–500 kg, uma casa; vazio → null; inválido → undefined. */
export function parseKg(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= 500 ? Math.round(n * 10) / 10 : undefined
}

/** "1:05", "12:30", "1:02:03". */
export function clockText(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60))
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm.padStart(2, '0')}:${ss}` : `${mm}:${ss}`
}

// ---------------------------------------------------------------------------
// Sessão em andamento (guardada no aparelho: sobrevive a recarregar o app)
// ---------------------------------------------------------------------------

export type DoneSet = { id: string | null; reps: number | null; load_kg: number | null; seconds: number | null }

export type Session = {
  routineId: string
  startedAt: number
  /** Séries feitas por exercício (id do exercício). */
  done: Record<string, DoneSet[]>
}

const SESSION_KEY = 'nutrie.treino-em-andamento'

/** State da navegação que leva à rotina já começando o treino (sem passar pela prévia). */
export const START_STATE = { start: true }

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const s = raw ? (JSON.parse(raw) as Session) : null
    // Sessão esquecida aberta há mais de 12 h: descarta.
    return s && Date.now() - s.startedAt < 12 * 3600 * 1000 ? s : null
  } catch {
    return null
  }
}

export function storeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // sem armazenamento (aba anônima): a sessão vale só enquanto a tela estiver aberta
  }
}

// ---------------------------------------------------------------------------
// Gasto da sessão (o mesmo cálculo do registro manual na tela Hoje)
// ---------------------------------------------------------------------------

/** MET da rotina: só aeróbicos (esteira, bicicleta…) → a média deles; senão, musculação. */
export function routineMet(routine: Pick<Routine, 'workout_exercises'>): number {
  const mets = routine.workout_exercises.map((e) => findExercise(e.name)?.met)
  if (!mets.length || mets.some((m) => m === undefined)) return STRENGTH_MET
  return Math.round(((mets as number[]).reduce((s, m) => s + m, 0) / mets.length) * 10) / 10
}

export type NewActivity = Omit<ActivityLog, 'id' | 'logged_at' | 'log_date'>

/**
 * A rotina feita, como atividade do dia. Com IA (VIP), ela estima pelo treino;
 * sem IA, ou se a IA falhar, a tabela (MET). `note` explica uma falha da IA.
 */
export async function routineActivity(
  routine: Routine,
  minutes: number,
  weightKg: number | null,
  useAi: boolean,
): Promise<{ entry: NewActivity; note: string | null }> {
  let note: string | null = null
  if (useAi) {
    const r = await estimateActivityWithAi({
      weight_kg: weightKg,
      duration_min: minutes,
      routine: {
        name: routine.name,
        exercises: routine.workout_exercises.map(({ name, sets_text, load_text }) => ({ name, sets_text, load_text })),
      },
    })
    if (r.ok && r.data.kcal > 0) {
      return {
        entry: {
          routine_id: routine.id,
          name: routine.name.slice(0, 100),
          duration_min: minutes,
          kcal: Math.min(5000, Math.round(r.data.kcal)),
          kcal_source: 'ai',
          note: r.data.notes.join(' ').slice(0, 500) || null,
        },
        note: null,
      }
    }
    note = `${r.ok ? 'A IA não estimou este treino.' : r.error} Usei a tabela de gasto.`
  }
  return {
    entry: {
      routine_id: routine.id,
      name: routine.name.slice(0, 100),
      duration_min: minutes,
      kcal: metKcal(routineMet(routine), minutes, weightKg),
      kcal_source: 'table',
      note: null,
    },
    note,
  }
}

// ---------------------------------------------------------------------------
// Banco: séries feitas e "da última vez"
// ---------------------------------------------------------------------------

export type SetLog = {
  id: string
  log_date: string
  logged_at: string
  exercise_name: string
  set_number: number
  reps: number | null
  load_kg: number | null
  seconds: number | null
}

const SET_COLUMNS = 'id, log_date, logged_at, exercise_name, set_number, reps, load_kg, seconds'

export async function addSetLog(log: Omit<SetLog, 'id' | 'logged_at'>): Promise<string> {
  const { data, error } = await client.from('workout_set_logs').insert(log).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function deleteSetLog(id: string): Promise<void> {
  const { error } = await client.from('workout_set_logs').delete().eq('id', id)
  if (error) throw error
}

/** Por exercício (nome), as séries do dia mais recente entre os registros recebidos. */
export function lastSessionByExercise(logs: SetLog[]): Map<string, SetLog[]> {
  const out = new Map<string, SetLog[]>()
  const sorted = [...logs].sort((a, b) => b.logged_at.localeCompare(a.logged_at))
  for (const l of sorted) {
    const list = out.get(l.exercise_name)
    if (!list) out.set(l.exercise_name, [l])
    else if (list[0].log_date === l.log_date) list.push(l)
  }
  for (const list of out.values()) list.sort((a, b) => a.set_number - b.set_number)
  return out
}

export async function fetchLastSets(names: string[], before: number): Promise<Map<string, SetLog[]>> {
  if (!names.length) return new Map()
  const { data, error } = await client
    .from('workout_set_logs')
    .select(SET_COLUMNS)
    .in('exercise_name', names)
    .lt('logged_at', new Date(before).toISOString())
    .order('logged_at', { ascending: false })
    .limit(300)
  if (error) throw error
  return lastSessionByExercise(((data ?? []) as SetLog[]).map((l) => ({ ...l, load_kg: l.load_kg === null ? null : Number(l.load_kg) })))
}

/** "4 kg × 10, 10, 8" · "8 kg × 10, 6 kg × 8" · "30 s, 30 s". */
export function lastTimeText(sets: SetLog[]): string {
  const part = (s: SetLog) => {
    if (s.seconds) return s.seconds < 60 ? `${s.seconds} s` : s.seconds % 60 ? clockText(s.seconds) : `${s.seconds / 60} min`
    const load = s.load_kg !== null ? `${String(s.load_kg).replace('.', ',')} kg × ` : ''
    return `${load}${s.reps ?? '?'}`
  }
  // Mesma carga em seguida: "4 kg × 10, 10" em vez de repetir a carga.
  const out: string[] = []
  let prevLoad: number | null | undefined
  for (const s of sets) {
    if (!s.seconds && s.load_kg !== null && s.load_kg === prevLoad) out.push(String(s.reps ?? '?'))
    else out.push(part(s))
    prevLoad = s.seconds ? undefined : s.load_kg
  }
  return out.join(', ')
}
