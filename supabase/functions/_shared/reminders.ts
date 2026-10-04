// Regras dos lembretes (refeição e água), puras e sem dependências: usadas pela
// Edge Function "push" (Deno) e testadas pelo Vitest (src/lib/reminders.test.ts).
// Horários em minutos desde a meia-noite, no fuso do usuário.

/** O agendamento roda a cada minuto; se atrasar, ainda envia até este tanto depois. */
export const CATCH_UP_MIN = 10
/** Refeição ainda não registrada: repete uma vez, este tanto depois do primeiro lembrete. */
export const REPEAT_AFTER_MIN = 30
/** Botão "Adiar" da notificação. */
export const SNOOZE_MIN = 15

export type ReminderSettings = {
  mealsEnabled: boolean
  waterEnabled: boolean
  /** Antecedência do lembrete (0 = na hora). */
  leadMin: number
  /**
   * Silêncio: de quietStart até quietEnd (pode atravessar a meia-noite).
   * quietStart null = automático: 31 min depois da última refeição do plano.
   */
  quietStart: number | null
  quietEnd: number
}

/** Silêncio automático: começa este tanto depois da última refeição (cabe a repetição de 30 min). */
export const AUTO_QUIET_AFTER_LAST_MEAL_MIN = REPEAT_AFTER_MIN + 1
/** Sem refeições no plano: silêncio a partir das 22:30. */
export const FALLBACK_QUIET_START = 22 * 60 + 30

/** Início do silêncio que vale: o escolhido, ou o automático pela última refeição. */
export function quietStartFor(settings: ReminderSettings, meals: ReminderMeal[]): number {
  if (settings.quietStart !== null) return settings.quietStart
  if (!meals.length) return FALLBACK_QUIET_START
  return (Math.max(...meals.map((m) => m.timeMin)) + AUTO_QUIET_AFTER_LAST_MEAL_MIN) % (24 * 60)
}

export const DEFAULT_SETTINGS: ReminderSettings = {
  mealsEnabled: true,
  waterEnabled: true,
  leadMin: 0,
  quietStart: null,
  quietEnd: 6 * 60 + 30,
}

export type ReminderMeal = { id: string; name: string; timeMin: number }
export type ReminderWaterSlot = { id: string; timeMin: number; ml: number }

export type DueInput = {
  nowMin: number
  settings: ReminderSettings
  meals: ReminderMeal[]
  /** Refeições já registradas hoje. */
  doneMealIds: Set<string>
  waterSlots: ReminderWaterSlot[]
  /** Água registrada hoje (mL). */
  waterMl: number
  /** Lembretes já enviados hoje: chave de sentKey(). */
  sent: Set<string>
  /** Lembretes adiados pelo botão da notificação, ainda não reenviados (horário local de hoje). */
  snoozes?: { id: string; kind: 'meal' | 'water'; refId: string; atMin: number }[]
}

export type DueReminder =
  | { kind: 'meal'; refId: string; attempt: 1 | 2; mealName: string; timeMin: number; snoozeId?: string }
  | { kind: 'water'; refId: string; attempt: 1; timeMin: number; ml: number; snoozeId?: string }

export const sentKey = (kind: 'meal' | 'water', refId: string, attempt: number) => `${kind}:${refId}:${attempt}`

/** "HH:MM:SS" ou "HH:MM" → minutos desde a meia-noite. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Está no horário de silêncio? (início incluso, fim excluso; atravessa a meia-noite). */
export function inQuietHours(nowMin: number, start: number, end: number): boolean {
  if (start === end) return false
  return start < end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end
}

/** Venceu agora (dentro da janela de tolerância)? */
const dueNow = (nowMin: number, at: number) => at >= 0 && nowMin >= at && nowMin < at + CATCH_UP_MIN

/**
 * Lembretes a enviar neste minuto. Não repete o que já foi enviado, não lembra
 * refeição já registrada nem água em dia com o protocolo, e respeita o silêncio
 * (o que vence no silêncio não é enviado depois).
 */
export function dueReminders(input: DueInput): DueReminder[] {
  const { nowMin, settings, sent } = input
  if (inQuietHours(nowMin, quietStartFor(settings, input.meals), settings.quietEnd)) return []
  const out: DueReminder[] = []

  if (settings.mealsEnabled) {
    for (const meal of input.meals) {
      if (input.doneMealIds.has(meal.id)) continue
      const first = meal.timeMin - settings.leadMin
      if (dueNow(nowMin, first) && !sent.has(sentKey('meal', meal.id, 1))) {
        out.push({ kind: 'meal', refId: meal.id, attempt: 1, mealName: meal.name, timeMin: meal.timeMin })
      } else if (
        sent.has(sentKey('meal', meal.id, 1)) &&
        !sent.has(sentKey('meal', meal.id, 2)) &&
        dueNow(nowMin, first + REPEAT_AFTER_MIN)
      ) {
        out.push({ kind: 'meal', refId: meal.id, attempt: 2, mealName: meal.name, timeMin: meal.timeMin })
      }
    }
  }

  if (settings.waterEnabled) {
    const slots = [...input.waterSlots].sort((a, b) => a.timeMin - b.timeMin)
    let expected = 0
    for (const slot of slots) {
      expected += slot.ml
      // Em dia com o protocolo até este horário: não precisa lembrar.
      if (input.waterMl >= expected) continue
      if (dueNow(nowMin, slot.timeMin - settings.leadMin) && !sent.has(sentKey('water', slot.id, 1))) {
        out.push({ kind: 'water', refId: slot.id, attempt: 1, timeMin: slot.timeMin, ml: slot.ml })
      }
    }
  }

  // Adiados pelo botão: voltam na hora marcada, se ainda fizer sentido.
  for (const z of input.snoozes ?? []) {
    if (!dueNow(nowMin, z.atMin) || out.some((d) => d.kind === z.kind && d.refId === z.refId)) continue
    if (z.kind === 'meal') {
      const meal = input.meals.find((m) => m.id === z.refId)
      if (!meal || input.doneMealIds.has(meal.id)) continue
      out.push({ kind: 'meal', refId: meal.id, attempt: 2, mealName: meal.name, timeMin: meal.timeMin, snoozeId: z.id })
    } else {
      const slots = [...input.waterSlots].sort((a, b) => a.timeMin - b.timeMin)
      const i = slots.findIndex((w) => w.id === z.refId)
      if (i < 0) continue
      const expected = slots.slice(0, i + 1).reduce((s, w) => s + w.ml, 0)
      if (input.waterMl >= expected) continue
      out.push({ kind: 'water', refId: z.refId, attempt: 1, timeMin: slots[i].timeMin, ml: slots[i].ml, snoozeId: z.id })
    }
  }
  return out
}

export type NotificationAction = { action: 'done' | 'snooze'; title: string }

/**
 * Botões da notificação, para o lembrete principal (a refeição, se houver;
 * senão a água): registrar e adiar. Devolve também a que lembrete se referem.
 */
export function notificationActions(due: DueReminder[]): { target: DueReminder; actions: NotificationAction[] } | null {
  const target = due.find((d) => d.kind === 'meal') ?? due[0]
  if (!target) return null
  const register = target.kind === 'meal' ? 'Registrar' : `Registrar ${target.ml} mL`
  return {
    target,
    actions: [
      { action: 'done', title: register },
      { action: 'snooze', title: `Adiar ${SNOOZE_MIN} min` },
    ],
  }
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/**
 * Uma notificação só para tudo o que venceu junto. Sem dado de saúde (aparece
 * na tela bloqueada): só o nome da refeição e o horário.
 */
export function composeNotification(due: DueReminder[]): { title: string; body: string; tag: string; section: 'refeicoes' | 'agua' } | null {
  if (!due.length) return null
  const meals = due.filter((d): d is Extract<DueReminder, { kind: 'meal' }> => d.kind === 'meal')
  const water = due.some((d) => d.kind === 'water')
  if (meals.length) {
    const m = meals[0]
    const names = meals.map((x) => x.mealName).join(' e ')
    const title = m.attempt === 2 && meals.length === 1 ? `${m.mealName}: ainda sem registro` : `Hora de: ${names}`
    const body = [`${meals.length === 1 ? `Às ${hhmm(m.timeMin)}. ` : ''}Toque para registrar.`, water ? 'E não esqueça a água.' : '']
      .filter(Boolean)
      .join(' ')
    return { title, body, tag: `nutrie-${m.refId}`, section: 'refeicoes' }
  }
  return { title: 'Hora da água', body: 'Toque para registrar.', tag: 'nutrie-agua', section: 'agua' }
}
