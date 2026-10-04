import { describe, expect, it } from 'vitest'
import { ALL_HOME_MEALS, toggleHomeMeal } from './household'
import { buildShoppingList, defaultYield, foodKey, formatAmount, mealSlot, weekStartFor } from './shopping'
import type { ShoppingInput } from './shopping'

// Casa FICTÍCIA: o usuário com plano, a Ana com plano e o Pedro (7 anos) sem
// plano, que almoça na escola de segunda a sexta.
const pedroMeals = [1, 2, 3, 4, 5].reduce((codes, d) => toggleHomeMeal(codes, d, 'almoco'), ALL_HOME_MEALS)

const base = (over: Partial<ShoppingInput> = {}): ShoppingInput => ({
  planPeople: [],
  housePeople: [],
  houseFoods: [],
  extras: [],
  yields: new Map(),
  ...over,
})

describe('rendimento e nomes', () => {
  it('padrões do briefing: carne 0,72, arroz 2,7, feijão 2,3, resto 1', () => {
    expect(defaultYield('Frango grelhado')).toBe(0.72)
    expect(defaultYield('Patinho moído')).toBe(0.72)
    expect(defaultYield('Arroz integral')).toBe(2.7)
    expect(defaultYield('Feijão carioca')).toBe(2.3)
    expect(defaultYield('Banana')).toBe(1)
  })

  it('junta nomes iguais com acento e maiúsculas diferentes', () => {
    expect(foodKey('  Feijão   Carioca ')).toBe(foodKey('feijao carioca'))
  })

  it('refeição do plano vira refeição da casa pelo nome ou horário', () => {
    expect(mealSlot('Café da manhã', '07:00:00')).toBe('cafe')
    expect(mealSlot('Colação', '10:00:00')).toBe('lanche')
    expect(mealSlot('Ceia', '21:30:00')).toBe('lanche')
    expect(mealSlot('Refeição 3', '12:30:00')).toBe('almoco')
    expect(mealSlot('Refeição 5', '20:00:00')).toBe('jantar')
  })
})

describe('soma da semana', () => {
  it('plano: quantidade × 7 dias, convertida para cru; soma pessoas e guarda a parte de cada uma', () => {
    const { lines } = buildShoppingList(
      base({
        planPeople: [
          { label: 'Você', homeMeals: null, meals: [{ name: 'Almoço', time: '12:30:00', items: [{ food: 'Arroz branco', qty_value: 81, qty_unit: 'g' }, { food: 'Banana', qty_value: 1, qty_unit: 'un' }] }] },
          { label: 'Ana', homeMeals: null, meals: [{ name: 'Almoço', time: '12:00:00', items: [{ food: 'arroz  branco', qty_value: 54, qty_unit: 'g' }] }] },
        ],
      }),
    )
    const arroz = lines.find((l) => l.name === 'Arroz branco')!
    // (81 + 54) g pronto × 7 dias ÷ 2,7 = 350 g cru
    expect(arroz.total).toBeCloseTo(350)
    expect(arroz.parts).toEqual([
      { label: 'Você', amount: expect.closeTo(210) },
      { label: 'Ana', amount: expect.closeTo(140) },
    ])
    // Unidade não converte.
    expect(lines.find((l) => l.name === 'Banana')!.total).toBe(7)
  })

  it('plano de quem almoça fora em dias úteis conta só os dias em casa', () => {
    const { lines } = buildShoppingList(
      base({
        planPeople: [{ label: 'Ana', homeMeals: pedroMeals, meals: [{ name: 'Almoço', time: '12:00:00', items: [{ food: 'Banana', qty_value: 1, qty_unit: 'un' }] }] }],
      }),
    )
    expect(lines[0].total).toBe(2)
  })

  it('sem plano: porção da casa × fator × refeições em casa', () => {
    const { lines } = buildShoppingList(
      base({
        housePeople: [{ label: 'Pedro', factor: 0.7, homeMeals: pedroMeals }],
        houseFoods: [
          { name: 'Feijão', slot: 'almoco', qty_value: 115, qty_unit: 'g' },
          { name: 'Leite', slot: 'cafe', qty_value: 200, qty_unit: 'mL' },
        ],
      }),
    )
    // Feijão: 115 × 0,7 × 2 almoços ÷ 2,3 = 70 g cru. Leite: 200 × 0,7 × 7 = 980 mL.
    expect(lines.find((l) => l.name === 'Feijão')!.total).toBeCloseTo(70)
    expect(lines.find((l) => l.name === 'Leite')!.total).toBeCloseTo(980)
  })

  it('extras entram como estão (kg e L viram g e mL) e somam com o resto', () => {
    const { lines } = buildShoppingList(
      base({
        housePeople: [{ label: 'Pedro', factor: 1, homeMeals: ALL_HOME_MEALS }],
        houseFoods: [{ name: 'Leite integral', slot: 'cafe', qty_value: 200, qty_unit: 'mL' }],
        extras: [{ name: 'leite integral', qty_value: 2, qty_unit: 'L' }],
      }),
    )
    const leite = lines[0]
    expect(leite.total).toBe(1400 + 2000)
    expect(leite.parts.map((p) => p.label)).toEqual(['Pedro', 'Extras da casa'])
  })

  it('rendimento escolhido pela pessoa vale sobre o padrão', () => {
    const { lines } = buildShoppingList(
      base({
        planPeople: [{ label: 'Você', homeMeals: null, meals: [{ name: 'Jantar', time: '20:00:00', items: [{ food: 'Frango', qty_value: 100, qty_unit: 'g' }] }] }],
        yields: new Map([['frango', 0.5]]),
      }),
    )
    expect(lines[0].total).toBe(1400)
    expect(lines[0].yield).toBe(0.5)
  })

  it('item sem quantidade numérica vai para a parte separada, com quem come', () => {
    const { lines, unquantified } = buildShoppingList(
      base({
        planPeople: [
          { label: 'Você', homeMeals: null, meals: [{ name: 'Almoço', time: '12:00:00', items: [{ food: 'Salada verde', qty_value: null, qty_unit: null }] }] },
          { label: 'Ana', homeMeals: null, meals: [{ name: 'Almoço', time: '12:00:00', items: [{ food: 'Salada Verde', qty_value: null, qty_unit: null }] }] },
        ],
      }),
    )
    expect(lines).toEqual([])
    expect(unquantified).toEqual([{ key: 'salada verde', name: 'Salada verde', who: ['Você', 'Ana'] }])
  })
})

describe('exibição e semana', () => {
  it('arredonda para cima e troca para kg/L acima de mil', () => {
    expect(formatAmount(342, 'g')).toBe('350 g')
    expect(formatAmount(1260, 'g')).toBe('1,3 kg')
    expect(formatAmount(2000, 'mL')).toBe('2 L')
    expect(formatAmount(12.2, 'un')).toBe('13 un')
  })

  it('semana começa no dia de compras: hoje, se for o dia; senão o próximo', () => {
    // 2026-10-04 é domingo; sábado = 6.
    expect(weekStartFor('2026-10-04', 6)).toBe('2026-10-10')
    expect(weekStartFor('2026-10-10', 6)).toBe('2026-10-10')
    expect(weekStartFor('2026-10-04', 0)).toBe('2026-10-04')
  })
})
