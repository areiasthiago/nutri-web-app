import { describe, expect, it } from 'vitest'
import {
  CATCH_UP_MIN,
  DEFAULT_SETTINGS,
  REPEAT_AFTER_MIN,
  composeNotification,
  dueReminders,
  inQuietHours,
  notificationActions,
  quietStartFor,
  sentKey,
  toMinutes,
} from '../../supabase/functions/_shared/reminders'
import type { DueInput } from '../../supabase/functions/_shared/reminders'

// Plano FICTÍCIO: almoço 12:30 e jantar 19:00; água às 12:30 (300 mL) e 15:00 (500 mL).
const ALMOCO = { id: 'almoco', name: 'Almoço', timeMin: toMinutes('12:30') }
const JANTAR = { id: 'jantar', name: 'Jantar', timeMin: toMinutes('19:00') }
const AGUA_1 = { id: 'agua1', timeMin: toMinutes('12:30'), ml: 300 }
const AGUA_2 = { id: 'agua2', timeMin: toMinutes('15:00'), ml: 500 }

const input = (over: Partial<DueInput>): DueInput => ({
  nowMin: 0,
  settings: DEFAULT_SETTINGS,
  meals: [ALMOCO, JANTAR],
  doneMealIds: new Set(),
  waterSlots: [AGUA_1, AGUA_2],
  waterMl: 0,
  sent: new Set(),
  ...over,
})

describe('horário de silêncio', () => {
  it('atravessa a meia-noite (22:30 às 06:30)', () => {
    const [s, e] = [toMinutes('22:30'), toMinutes('06:30')]
    expect(inQuietHours(toMinutes('23:00'), s, e)).toBe(true)
    expect(inQuietHours(toMinutes('03:00'), s, e)).toBe(true)
    expect(inQuietHours(toMinutes('06:30'), s, e)).toBe(false)
    expect(inQuietHours(toMinutes('12:00'), s, e)).toBe(false)
  })

  it('dentro do mesmo dia (13:00 às 14:00)', () => {
    expect(inQuietHours(toMinutes('13:30'), toMinutes('13:00'), toMinutes('14:00'))).toBe(true)
    expect(inQuietHours(toMinutes('14:00'), toMinutes('13:00'), toMinutes('14:00'))).toBe(false)
  })

  it('por padrão começa 31 min depois da última refeição (cabe a repetição dela)', () => {
    expect(quietStartFor(DEFAULT_SETTINGS, [ALMOCO, JANTAR])).toBe(toMinutes('19:31'))
    // Repetição do jantar às 19:30 ainda sai; água às 20:00 já cai no silêncio.
    const sent = new Set([sentKey('meal', 'jantar', 1)])
    expect(dueReminders(input({ nowMin: toMinutes('19:30'), sent, waterSlots: [] }))).toMatchObject([{ attempt: 2 }])
    const late = { id: 'tarde', timeMin: toMinutes('20:00'), ml: 300 }
    expect(dueReminders(input({ nowMin: late.timeMin, meals: [ALMOCO, JANTAR], waterSlots: [late] }))).toEqual([])
    // Ceia 23:45: o silêncio automático passa da meia-noite (00:16).
    expect(quietStartFor(DEFAULT_SETTINGS, [{ id: 'ceia', name: 'Ceia', timeMin: toMinutes('23:45') }])).toBe(toMinutes('00:16'))
  })

  it('horário escolhido pela pessoa vale sobre o automático', () => {
    const settings = { ...DEFAULT_SETTINGS, quietStart: toMinutes('22:30') }
    expect(quietStartFor(settings, [ALMOCO, JANTAR])).toBe(toMinutes('22:30'))
    const late = { id: 'tarde', timeMin: toMinutes('20:00'), ml: 300 }
    expect(dueReminders(input({ nowMin: late.timeMin, settings, waterSlots: [late] }))).toHaveLength(1)
  })
})

describe('lembretes de refeição', () => {
  it('no horário, e uma notificação só quando refeição e água caem juntas', () => {
    const due = dueReminders(input({ nowMin: ALMOCO.timeMin }))
    expect(due.map((d) => `${d.kind}:${d.refId}:${d.attempt}`)).toEqual(['meal:almoco:1', 'water:agua1:1'])
    const n = composeNotification(due)
    expect(n?.title).toBe('Hora de: Almoço')
    expect(n?.body).toBe('Às 12:30. Toque para registrar. E não esqueça a água.')
  })

  it('não repete o que já foi enviado (o agendamento roda a cada minuto)', () => {
    const sent = new Set([sentKey('meal', 'almoco', 1), sentKey('water', 'agua1', 1)])
    expect(dueReminders(input({ nowMin: ALMOCO.timeMin + 1, sent }))).toEqual([])
  })

  it('não lembra refeição já registrada', () => {
    const due = dueReminders(input({ nowMin: ALMOCO.timeMin, doneMealIds: new Set(['almoco']), waterSlots: [] }))
    expect(due).toEqual([])
  })

  it('repete uma vez, 30 min depois, se continuar sem registro', () => {
    const at = ALMOCO.timeMin + REPEAT_AFTER_MIN
    const sent1 = new Set([sentKey('meal', 'almoco', 1)])
    const due = dueReminders(input({ nowMin: at, sent: sent1, waterSlots: [] }))
    expect(due).toMatchObject([{ kind: 'meal', refId: 'almoco', attempt: 2 }])
    expect(composeNotification(due)?.title).toBe('Almoço: ainda sem registro')
    // Registrou antes da repetição: não repete.
    expect(dueReminders(input({ nowMin: at, sent: sent1, doneMealIds: new Set(['almoco']), waterSlots: [] }))).toEqual([])
    // Já repetiu: para.
    const sent2 = new Set([...sent1, sentKey('meal', 'almoco', 2)])
    expect(dueReminders(input({ nowMin: at + 1, sent: sent2, waterSlots: [] }))).toEqual([])
    // Sem o primeiro (ex.: caiu no silêncio), não há repetição.
    expect(dueReminders(input({ nowMin: at, waterSlots: [] }))).toEqual([])
  })

  it('tolera atraso do agendamento, mas não manda lembrete velho', () => {
    expect(dueReminders(input({ nowMin: ALMOCO.timeMin + CATCH_UP_MIN - 1, waterSlots: [] }))).toHaveLength(1)
    expect(dueReminders(input({ nowMin: ALMOCO.timeMin + CATCH_UP_MIN, waterSlots: [] }))).toEqual([])
    expect(dueReminders(input({ nowMin: ALMOCO.timeMin - 1, waterSlots: [] }))).toEqual([])
  })

  it('antecedência configurável e liga/desliga por tipo', () => {
    const settings = { ...DEFAULT_SETTINGS, leadMin: 10, waterEnabled: false }
    expect(dueReminders(input({ nowMin: ALMOCO.timeMin - 10, settings }))).toMatchObject([{ kind: 'meal', refId: 'almoco' }])
    const off = { ...DEFAULT_SETTINGS, mealsEnabled: false }
    expect(dueReminders(input({ nowMin: ALMOCO.timeMin, settings: off })).map((d) => d.kind)).toEqual(['water'])
  })
})

describe('lembretes de água', () => {
  it('pula o horário se a água já está em dia com o protocolo', () => {
    // Às 15:00 o protocolo espera 800 mL (300 + 500).
    expect(dueReminders(input({ nowMin: AGUA_2.timeMin, meals: [], waterMl: 800 }))).toEqual([])
    const due = dueReminders(input({ nowMin: AGUA_2.timeMin, meals: [], waterMl: 500 }))
    expect(due).toMatchObject([{ kind: 'water', refId: 'agua2' }])
    expect(composeNotification(due)).toMatchObject({ title: 'Hora da água', section: 'agua' })
  })
})

describe('botões da notificação e lembrete adiado', () => {
  it('registrar e adiar a refeição; água registra o volume do horário', () => {
    const both = dueReminders(input({ nowMin: ALMOCO.timeMin }))
    expect(notificationActions(both)).toMatchObject({
      target: { kind: 'meal', refId: 'almoco' },
      actions: [{ action: 'done', title: 'Registrar' }, { action: 'snooze', title: 'Adiar 15 min' }],
    })
    const water = dueReminders(input({ nowMin: AGUA_2.timeMin, meals: [], waterMl: 300 }))
    expect(notificationActions(water)?.actions[0].title).toBe('Registrar 500 mL')
  })

  it('adiado volta na hora marcada, só se ainda fizer sentido', () => {
    const at = ALMOCO.timeMin + 15
    const sent = new Set([sentKey('meal', 'almoco', 1), sentKey('meal', 'almoco', 2)])
    const snoozes = [{ id: 'z1', kind: 'meal' as const, refId: 'almoco', atMin: at }]
    expect(dueReminders(input({ nowMin: at, sent, snoozes, waterSlots: [] }))).toMatchObject([
      { kind: 'meal', refId: 'almoco', snoozeId: 'z1' },
    ])
    // Registrou antes: não volta.
    expect(dueReminders(input({ nowMin: at, sent, snoozes, doneMealIds: new Set(['almoco']), waterSlots: [] }))).toEqual([])
    // Água adiada que já ficou em dia: não volta.
    const w = [{ id: 'z2', kind: 'water' as const, refId: 'agua1', atMin: at }]
    expect(dueReminders(input({ nowMin: at, meals: [], snoozes: w, waterMl: 300 }))).toEqual([])
    expect(dueReminders(input({ nowMin: at, meals: [], snoozes: w, waterMl: 0 }))).toMatchObject([{ kind: 'water', snoozeId: 'z2' }])
  })
})
