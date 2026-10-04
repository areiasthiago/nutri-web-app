import { describe, expect, it } from 'vitest'
import { maskTime, normalizeTime } from './timeText'

describe('horário digitado', () => {
  it('máscara põe os dois-pontos sozinha enquanto digita', () => {
    expect(maskTime('7')).toBe('7')
    expect(maskTime('73')).toBe('73')
    expect(maskTime('730')).toBe('7:30')
    expect(maskTime('1930')).toBe('19:30')
    expect(maskTime('19:305')).toBe('19:30')
  })

  it('normaliza para HH:MM', () => {
    expect(normalizeTime('730')).toBe('07:30')
    expect(normalizeTime('7:30')).toBe('07:30')
    expect(normalizeTime('7h30')).toBe('07:30')
    expect(normalizeTime('19')).toBe('19:00')
    expect(normalizeTime('0')).toBe('00:00')
    expect(normalizeTime('23:59')).toBe('23:59')
  })

  it('recusa horário impossível ou vazio', () => {
    expect(normalizeTime('2430')).toBeNull()
    expect(normalizeTime('1975')).toBeNull()
    expect(normalizeTime('')).toBeNull()
    expect(normalizeTime('12345')).toBeNull()
  })
})
