import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHT_KG, metKcal, netKcal, parseWorkoutPages } from './workouts'

// Treino FICTÍCIO no mesmo formato do PDF do personal (nome de aluno inventado).
const header = ['Fulano de Tal', 'Rotina: 1° mês A B', 'Condicionamento físico', 'Adaptação']
const pageA = [
  ...header,
  'Membros inferiores',
  'Agachamento Livre com Barra',
  'Séries :   4x15',
  'Carga :   0kg',
  'Intervalo :   60s',
  'Leg Press 45',
  'Séries : 4x12',
  'Carga : 40kg',
  'Intervalo : 90s',
]
const pageB = [...header, 'membros superiores', 'Supino Inclinado com Halteres', 'Séries : 4x15', 'Carga : 0kg', 'Intervalo : 60s']

describe('leitura do treino sem IA', () => {
  it('uma rotina por página, com o título da seção e os campos de cada exercício', () => {
    const draft = parseWorkoutPages([pageA, pageB])
    expect(draft.routines.map((r) => r.name)).toEqual(['Treino A: Membros inferiores', 'Treino B: Membros superiores'])
    expect(draft.routines[0].exercises).toEqual([
      { name: 'Agachamento Livre com Barra', sets_text: '4x15', load_text: '0kg', rest_text: '60s' },
      { name: 'Leg Press 45', sets_text: '4x12', load_text: '40kg', rest_text: '90s' },
    ])
  })

  it('não guarda o nome do aluno nem o cabeçalho repetido', () => {
    const text = JSON.stringify(parseWorkoutPages([pageA, pageB]))
    expect(text).not.toContain('Fulano')
    expect(text).not.toContain('Rotina:')
  })

  it('PDF sem exercícios reconhecíveis não inventa rotina', () => {
    expect(parseWorkoutPages([['Texto qualquer', 'Outra linha']]).routines).toEqual([])
  })
})

describe('gasto pela tabela (MET) e balanço', () => {
  it('kcal = MET × 3,5 × peso ÷ 200 × minutos; sem peso, usa o padrão', () => {
    expect(metKcal(3.5, 60, 80)).toBe(294)
    expect(metKcal(3.5, 60, null)).toBe(metKcal(3.5, 60, DEFAULT_WEIGHT_KG))
  })

  it('balanço líquido = registrado − gasto', () => {
    expect(netKcal(1200, 320)).toBe(880)
  })
})
