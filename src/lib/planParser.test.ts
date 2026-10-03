import { describe, expect, it } from 'vitest'
import { fold, parsePlanText } from './planParser'

// Planos FICTÍCIOS em layouts comuns de nutricionistas. Nenhum dado real.

describe('fold', () => {
  it('tira acento e põe em minúsculas sem mudar o tamanho', () => {
    const text = 'Café da Manhã – Colação'
    expect(fold(text)).toBe('cafe da manha – colacao')
    expect(fold(text).length).toBe(text.length)
  })
})

describe('parsePlanText: lista simples com horário na mesma linha', () => {
  const result = parsePlanText([
    'PLANO ALIMENTAR',
    'Nutricionista Fulana de Tal - CRN 00000',
    'Café da manhã - 07:00',
    '• Ovos mexidos 2 unidades (100 g)',
    '• Pão integral 1 fatia (25 g)',
    'ou 2 colheres de sopa de aveia',
    'Almoço 12h30',
    'Arroz branco cozido 80 g',
    'Feijão 1 concha (80 g)',
    'Frango grelhado 150 g ou Tilápia 180 g',
    'Salada verde à vontade',
    'Jantar - 19h',
    'Carne moída 120 g (250 kcal)',
    'Orientações gerais:',
    'Beber 3 litros de água por dia.',
    'Evitar frituras.',
  ])

  it('acha as refeições com horário, em ordem', () => {
    expect(result.plan.meals.map((m) => [m.name, m.time])).toEqual([
      ['Café da manhã', '07:00'],
      ['Almoço', '12:30'],
      ['Jantar', '19:00'],
    ])
    expect(result.quality).toBe('good')
  })

  it('separa alimento e quantidade', () => {
    const [ovos, pao] = result.plan.meals[0].items
    expect(ovos.food).toBe('Ovos mexidos')
    expect(ovos.qty_text).toBe('2 unidades (100 g)')
    expect(ovos.qty_value).toBe(2)
    expect(ovos.qty_unit).toBe('un')
    expect(pao.food).toBe('Pão integral')
    expect(pao.qty_text).toBe('1 fatia (25 g)')
    expect(pao.qty_value).toBe(25)
    expect(pao.qty_unit).toBe('g')
  })

  it('liga "ou ..." ao alimento anterior como troca', () => {
    expect(result.plan.meals[0].items[1].substitutions).toEqual(['2 colheres de sopa de aveia'])
  })

  it('entende alternativas na mesma linha', () => {
    const frango = result.plan.meals[1].items[2]
    expect(frango.food).toBe('Frango grelhado')
    expect(frango.substitutions).toEqual(['Tilápia 180 g'])
  })

  it('aceita "à vontade" como quantidade', () => {
    const salada = result.plan.meals[1].items[3]
    expect(salada.food).toBe('Salada verde')
    expect(salada.qty_text).toBe('à vontade')
    expect(salada.qty_value).toBeNull()
  })

  it('lê kcal do item, meta de água e observações, e ignora contato do nutricionista', () => {
    expect(result.plan.meals[2].items[0].kcal).toBe(250)
    expect(result.plan.meals[2].items[0].food).toBe('Carne moída')
    expect(result.plan.targets.water_ml).toBe(3000)
    expect(result.plan.notes).toContain('Evitar frituras.')
    expect(JSON.stringify(result.plan)).not.toContain('CRN')
  })
})

describe('parsePlanText: tabela com colunas (separadas por " | ")', () => {
  const result = parsePlanText([
    'Refeição | Alimento | Quantidade | Substituição',
    '1ª Refeição - Desjejum (7:30)',
    'Leite desnatado | 200 ml | Iogurte natural 170 g',
    'Banana | 1 unidade | Maçã 1 unidade',
    '2ª Refeição - Almoço (12:00)',
    'Arroz integral | 4 colheres de sopa | Quinoa 3 colheres de sopa',
    'Peito de frango | 120 g',
  ])

  it('lê refeições numeradas com horário entre parênteses', () => {
    expect(result.plan.meals.map((m) => [m.name, m.time])).toEqual([
      ['Café da manhã', '07:30'],
      ['Almoço', '12:00'],
    ])
  })

  it('usa a coluna de quantidade e põe a coluna de substituição nas trocas', () => {
    const [leite, banana] = result.plan.meals[0].items
    expect(leite.food).toBe('Leite desnatado')
    expect(leite.qty_value).toBe(200)
    expect(leite.qty_unit).toBe('mL')
    expect(leite.substitutions).toEqual(['Iogurte natural 170 g'])
    expect(banana.substitutions).toEqual(['Maçã 1 unidade'])
    expect(result.plan.meals[1].items[1]).toMatchObject({ food: 'Peito de frango', qty_value: 120, qty_unit: 'g' })
  })
})

describe('parsePlanText: horário na linha de baixo e bloco de substituições', () => {
  const result = parsePlanText([
    'COLAÇÃO',
    '10:00',
    'Mamão papaia 1 fatia média (100 g)',
    'Substituições:',
    'Melão 1 fatia (150 g)',
    'Abacaxi 1 rodela (100 g)',
    'CEIA',
    '21:30',
    'Chá de camomila 1 xícara',
  ])

  it('pega o horário da linha seguinte ao nome da refeição', () => {
    expect(result.plan.meals.map((m) => [m.name, m.time])).toEqual([
      ['Colação', '10:00'],
      ['Ceia', '21:30'],
    ])
  })

  it('coloca o bloco "Substituições:" nas trocas do último alimento', () => {
    expect(result.plan.meals[0].items).toHaveLength(1)
    expect(result.plan.meals[0].items[0].substitutions).toEqual(['Melão 1 fatia (150 g)', 'Abacaxi 1 rodela (100 g)'])
  })
})

describe('parsePlanText: casos fracos', () => {
  it('PDF sem texto (escaneado) dá "empty"', () => {
    expect(parsePlanText([]).quality).toBe('empty')
    expect(parsePlanText(['1', '2']).quality).toBe('empty')
  })

  it('texto sem refeições reconhecíveis dá "empty"', () => {
    const r = parsePlanText([
      'Avaliação antropométrica do paciente realizada em consultório com balança calibrada.',
      'Peso, altura e circunferências registrados na ficha de acompanhamento.',
    ])
    expect(r.quality).toBe('empty')
  })

  it('refeição sem horário recebe horário típico e um aviso', () => {
    const r = parsePlanText(['Almoço', 'Arroz 80 g', 'Feijão 80 g', 'Jantar', 'Sopa 300 ml'])
    expect(r.plan.meals.map((m) => m.time)).toEqual(['12:30', '19:30'])
    expect(r.plan.warnings.join(' ')).toContain('não tinha horário')
  })

  it('poucos itens dá "weak"', () => {
    const r = parsePlanText(['Almoço 12:00', 'Arroz 80 g'])
    expect(r.quality).toBe('weak')
  })

  it('alimento que começa com "café" não vira refeição', () => {
    const r = parsePlanText(['Café da manhã 07:00', 'Café sem açúcar 1 xícara', 'Pão francês 1 unidade'])
    expect(r.plan.meals).toHaveLength(1)
    expect(r.plan.meals[0].items.map((i) => i.food)).toEqual(['Café sem açúcar', 'Pão francês'])
  })
})
