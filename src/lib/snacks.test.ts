import { describe, expect, it } from 'vitest'
import { plusSnacks, snackTotals } from './snacks'
import type { SnackLog } from './snacks'

const snack = (name: string, kcal: number | null, protein_g: number | null = null): SnackLog => ({
  id: name, log_date: '2026-10-04', logged_at: '2026-10-04T18:00:00Z', name,
  kcal, protein_g, carbs_g: protein_g === null ? null : 10, fat_g: protein_g === null ? null : 5,
})

describe('comeu fora de hora', () => {
  it('soma calorias e macros do que foi comido fora das refeições', () => {
    expect(snackTotals([snack('Baton', 140, 2), snack('Bala', 20, 0)])).toEqual({ kcal: 160, protein_g: 2, carbs_g: 20, fat_g: 10 })
  })

  it('entra no total do dia e na diferença do plano (tudo acima do plano)', () => {
    const deviation = { kcal: -39, protein_g: null, carbs_g: null, fat_g: null }
    expect(plusSnacks(deviation, [snack('Baton', 140, 2)])).toEqual({ kcal: 101, protein_g: null, carbs_g: null, fat_g: null })
  })

  it('sem nada fora de hora, nada muda', () => {
    const t = { kcal: 500, protein_g: 30, carbs_g: 50, fat_g: 10 }
    expect(plusSnacks(t, [])).toEqual(t)
  })
})
