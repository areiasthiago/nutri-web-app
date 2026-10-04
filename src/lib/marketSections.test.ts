import { describe, expect, it } from 'vitest'
import { defaultSection } from './marketSections'

describe('seções do mercado', () => {
  it('coloca cada item na seção certa, com os casos específicos antes dos gerais', () => {
    const cases: [string, string][] = [
      ['Tomate', 'hortifruti'],
      ['Cheiro verde', 'hortifruti'],
      ['Batata doce', 'hortifruti'],
      ['Banana', 'hortifruti'],
      ['Molho de tomate', 'mercearia'],
      ['Pão integral', 'padaria'],
      ['Peito de frango', 'carnes'],
      ['Patinho moído', 'carnes'],
      ['Tilápia', 'carnes'],
      ['Peito de peru', 'laticinios'],
      ['Ovo', 'laticinios'],
      ['Leite integral', 'laticinios'],
      ['Queijo minas', 'laticinios'],
      ['Arroz branco', 'mercearia'],
      ['Feijão carioca', 'mercearia'],
      ['Aveia em flocos', 'mercearia'],
      ['Azeite', 'mercearia'],
      ['Café em pó', 'mercearia'],
      ['Orégano', 'temperos'],
      ['Sal', 'temperos'],
      ['Água de coco', 'bebidas'],
      ['Leite de coco', 'mercearia'],
      ['Leite de amêndoa', 'bebidas'],
      ['Polpa de açaí', 'congelados'],
      ['Whey protein', 'mercearia'],
      ['Granola', 'mercearia'],
      ['Algo esquisito', 'outros'],
    ]
    for (const [name, section] of cases) expect([name, defaultSection(name)]).toEqual([name, section])
  })
})
