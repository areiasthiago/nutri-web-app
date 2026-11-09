import { describe, expect, it } from 'vitest'
import { findExercise } from './exerciseCatalog'
import { STRENGTH_MET } from './workouts'
import {
  clockText,
  lastSessionByExercise,
  lastTimeText,
  parseDuration,
  parseKg,
  parseLoadKg,
  parseSets,
  restSeconds,
  routineMet,
} from './workoutSession'
import type { SetLog } from './workoutSession'

describe('textos do treino', () => {
  it('lê durações em vários formatos', () => {
    expect(parseDuration('60s')).toBe(60)
    expect(parseDuration('90 s')).toBe(90)
    expect(parseDuration('1 min')).toBe(60)
    expect(parseDuration('1min30')).toBe(90)
    expect(parseDuration('1 min 30 s')).toBe(90)
    expect(parseDuration("1'30")).toBe(90)
    expect(parseDuration('1:30')).toBe(90)
    expect(parseDuration('10 minutos')).toBe(600)
    expect(parseDuration('45')).toBe(45)
    expect(parseDuration('30-45s')).toBe(30)
    expect(parseDuration('0s')).toBe(0)
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('à vontade')).toBeNull()
  })

  it('separa séries e meta', () => {
    expect(parseSets('3x10-12')).toEqual({ sets: 3, target: '10-12', seconds: null, reps: 10 })
    expect(parseSets('2x8 cada lado')).toEqual({ sets: 2, target: '8 cada lado', seconds: null, reps: 8 })
    expect(parseSets('4 X 15')).toEqual({ sets: 4, target: '15', seconds: null, reps: 15 })
    expect(parseSets('3x o máximo, menos 2')).toEqual({ sets: 3, target: 'o máximo, menos 2', seconds: null, reps: null })
  })

  it('reconhece séries por tempo', () => {
    expect(parseSets('2x20s')).toEqual({ sets: 2, target: '20s', seconds: 20, reps: null })
    expect(parseSets('3x30-45s').seconds).toBe(30)
    expect(parseSets('10 min')).toEqual({ sets: 1, target: '10 min', seconds: 600, reps: null })
  })

  it('sem séries informadas, sugere 3', () => {
    expect(parseSets('')).toEqual({ sets: 3, target: '', seconds: null, reps: null })
  })

  it('descanso: o do treino, ou 60 s; cardio de uma série não descansa', () => {
    expect(restSeconds('45s', parseSets('2x10'))).toBe(45)
    expect(restSeconds('', parseSets('2x10'))).toBe(60)
    expect(restSeconds('', parseSets('10 min'))).toBe(0)
    expect(restSeconds('0s', parseSets('2x10'))).toBe(0)
    expect(restSeconds('20 min', parseSets('2x10'))).toBe(600)
  })

  it('carga em kg', () => {
    expect(parseLoadKg('4kg')).toBe(4)
    expect(parseLoadKg('4,5 kg')).toBe(4.5)
    expect(parseLoadKg('halter leve')).toBeNull()
    expect(parseKg('')).toBeNull()
    expect(parseKg('7,5')).toBe(7.5)
    expect(parseKg('-1')).toBeUndefined()
    expect(parseKg('abc')).toBeUndefined()
  })

  it('cronômetro', () => {
    expect(clockText(5)).toBe('0:05')
    expect(clockText(754)).toBe('12:34')
    expect(clockText(3723)).toBe('1:02:03')
  })
})

describe('catálogo', () => {
  it('acha o exercício pelo nome, do mais específico ao geral', () => {
    expect(findExercise('Remada unilateral com halter leve, apoiado no banco')?.key).toBe('remada-unilateral')
    expect(findExercise('Remada curvada com halteres')?.key).toBe('remada-curvada')
    expect(findExercise('Prancha lateral')?.key).toBe('prancha-lateral')
    expect(findExercise('Prancha')?.key).toBe('prancha')
    expect(findExercise('Agachamento búlgaro (pé de trás no banco)')?.key).toBe('agachamento-bulgaro')
    expect(findExercise('Sentar e levantar do banco')?.key).toBe('sentar-levantar')
    expect(findExercise('Flexão com as mãos no banco')?.key).toBe('flexao-inclinada')
    expect(findExercise('Elevação de quadril deitado no chão')?.key).toBe('elevacao-quadril')
    expect(findExercise('Desaquecimento na bicicleta')?.key).toBe('bicicleta')
    expect(findExercise('Leg Press 45')).toBeNull()
  })

  it('MET da rotina: só aeróbicos usam a média deles; com musculação, a da musculação', () => {
    const ex = (name: string) => ({ id: name, name, sets_text: '', load_text: '', rest_text: '', position: 0 })
    expect(routineMet({ workout_exercises: [ex('Esteira'), ex('Bicicleta')] })).toBe(4.9)
    expect(routineMet({ workout_exercises: [ex('Esteira'), ex('Prancha')] })).toBe(STRENGTH_MET)
    expect(routineMet({ workout_exercises: [] })).toBe(STRENGTH_MET)
  })
})

describe('da última vez', () => {
  const log = (name: string, date: string, set: number, reps: number | null, load: number | null, seconds: number | null = null): SetLog => ({
    id: `${name}${date}${set}`,
    log_date: date,
    logged_at: `${date}T10:0${set}:00Z`,
    exercise_name: name,
    set_number: set,
    reps,
    load_kg: load,
    seconds,
  })

  it('pega só as séries do dia mais recente de cada exercício, em ordem', () => {
    const last = lastSessionByExercise([
      log('Remada', '2026-11-01', 1, 10, 4),
      log('Remada', '2026-11-05', 2, 9, 6),
      log('Remada', '2026-11-05', 1, 10, 6),
      log('Prancha', '2026-11-03', 1, null, null, 20),
    ])
    expect(last.get('Remada')?.map((s) => s.set_number)).toEqual([1, 2])
    expect(last.get('Remada')?.[0].load_kg).toBe(6)
    expect(last.get('Prancha')).toHaveLength(1)
  })

  it('resume sem repetir a carga', () => {
    expect(lastTimeText([log('R', 'd', 1, 10, 4), log('R', 'd', 2, 10, 4), log('R', 'd', 3, 8, 4)])).toBe('4 kg × 10, 10, 8')
    expect(lastTimeText([log('R', 'd', 1, 10, 8), log('R', 'd', 2, 8, 6.5)])).toBe('8 kg × 10, 6,5 kg × 8')
    expect(lastTimeText([log('F', 'd', 1, 8, null), log('F', 'd', 2, 7, null)])).toBe('8, 7')
    expect(lastTimeText([log('P', 'd', 1, null, null, 30), log('E', 'd', 2, null, null, 600)])).toBe('30 s, 10 min')
  })
})
