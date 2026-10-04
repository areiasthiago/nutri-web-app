import { describe, expect, it } from 'vitest'
import { expectedByNow, quickAmounts, remainingMl, slotStatuses, totalMl } from './water'
import type { HydrationSlot } from './plan'

// Protocolo FICTÍCIO: 4 horários que somam 1.300 mL, meta do plano 2.000 mL.
const slot = (time: string, ml: number): HydrationSlot => ({ id: time, time: `${time}:00`, ml, label: null })
const slots = [slot('08:00', 300), slot('11:00', 300), slot('15:00', 300), slot('20:00', 400)]
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

describe('soma de água do dia', () => {
  it('soma os registros', () => {
    expect(totalMl([{ ml: 200 }, { ml: 362 }, { ml: 500 }])).toBe(1062)
    expect(totalMl([])).toBe(0)
  })

  it('o que falta é medido contra a META, não contra o protocolo', () => {
    // Bebeu os 1.300 mL do protocolo: ainda faltam 700 para a meta de 2.000.
    expect(remainingMl(2000, 1300)).toBe(700)
  })

  it('passar da meta não dá negativo', () => {
    expect(remainingMl(2000, 2350)).toBe(0)
  })
})

describe('botões de registro rápido', () => {
  it('200 e 500 mL mais o volume do protocolo', () => {
    expect(quickAmounts([slot('07:00', 362), slot('09:00', 362), slot('22:00', 72)])).toEqual([200, 362, 500])
  })

  it('sem protocolo, só 200 e 500 mL', () => {
    expect(quickAmounts([])).toEqual([200, 500])
  })

  it('ignora volumes estranhos e não repete', () => {
    expect(quickAmounts([slot('07:00', 50), slot('08:00', 500), slot('09:00', 3000)])).toEqual([200, 500])
  })
})

describe('protocolo de horários como guia', () => {
  it('marca como cumprido conforme o total acumulado', () => {
    const s = slotStatuses(slots, 650, min('12:00'))
    expect(s.map((x) => x.reached)).toEqual([true, true, false, false])
    expect(s.map((x) => x.cumulativeMl)).toEqual([300, 600, 900, 1300])
  })

  it('marca quais horários já chegaram', () => {
    expect(slotStatuses(slots, 0, min('15:00')).map((x) => x.due)).toEqual([true, true, true, false])
  })

  it('quanto o protocolo previa até agora', () => {
    expect(expectedByNow(slots, min('07:59'))).toBe(0)
    expect(expectedByNow(slots, min('11:00'))).toBe(600)
    expect(expectedByNow(slots, min('23:00'))).toBe(1300)
  })
})
