import { describe, expect, it } from 'vitest'
import { searchWords } from './customMeals'

// A busca na lista "Já comi antes" roda no banco (coluna search_text, sem
// acento); aqui fica testado o preparo do que a pessoa digitou.
describe('palavras da busca', () => {
  it('ignora acento e maiúsculas', () => {
    expect(searchWords('Abóbora COZIDA')).toEqual(['abobora', 'cozida'])
    expect(searchWords('açaí')).toEqual(['acai'])
  })

  it('separa por espaço e pontuação e descarta palavras de 1 letra', () => {
    expect(searchWords('pipoca, 1 tigela-média e manteiga')).toEqual(['pipoca', 'tigela', 'media', 'manteiga'])
  })

  it('texto curto demais não busca nada', () => {
    expect(searchWords('p')).toEqual([])
    expect(searchWords('   ')).toEqual([])
  })
})
