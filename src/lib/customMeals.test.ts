import { describe, expect, it } from 'vitest'
import { searchCustomMeals } from './customMeals'
import type { CustomMeal } from './customMeals'

// Lista FICTÍCIA de coisas já comidas fora do plano.
const meal = (name: string, description: string | null, use_count = 1): CustomMeal => ({
  id: name,
  name,
  description,
  kcal: 100,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  source: 'ai',
  use_count,
  last_used_at: '2026-10-01T12:00:00Z',
})

const list = [
  meal('Pipoca de panela', '1 tigela média, com manteiga', 3),
  meal('Pipoca de micro-ondas', '1 pacote', 1),
  meal('Pão de queijo', '3 unidades médias', 5),
  meal('Açaí na tigela', '300 mL com granola', 2),
]

describe('busca na lista "Já comi antes"', () => {
  it('acha pelo começo do nome, ignorando acento e maiúsculas', () => {
    expect(searchCustomMeals(list, 'PIPOCA').map((m) => m.name)).toEqual(['Pipoca de panela', 'Pipoca de micro-ondas'])
    expect(searchCustomMeals(list, 'acai').map((m) => m.name)).toEqual(['Açaí na tigela'])
  })

  it('todas as palavras precisam aparecer (nome ou descrição)', () => {
    expect(searchCustomMeals(list, 'pipoca manteiga').map((m) => m.name)).toEqual(['Pipoca de panela'])
    expect(searchCustomMeals(list, 'tigela').map((m) => m.name).sort()).toEqual(['Açaí na tigela', 'Pipoca de panela'])
  })

  it('nome começando igual vem antes; depois, o mais usado', () => {
    expect(searchCustomMeals(list, 'pao')[0].name).toBe('Pão de queijo')
    expect(searchCustomMeals(list, 'de').map((m) => m.name)[0]).toBe('Pão de queijo')
  })

  it('texto curto demais ou sem combinação não sugere nada', () => {
    expect(searchCustomMeals(list, 'p')).toEqual([])
    expect(searchCustomMeals(list, 'lasanha')).toEqual([])
  })
})
