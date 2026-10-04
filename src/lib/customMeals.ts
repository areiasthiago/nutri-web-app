import type { SupabaseClient } from '@supabase/supabase-js'
import { fold } from './planParser'
import { supabase } from './supabaseClient'

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

/** Algo comido fora do plano, guardado na lista "Já comi antes". */
export type CustomMeal = {
  id: string
  name: string
  description: string | null
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  source: 'ai' | 'manual'
  use_count: number
  last_used_at: string
}

export type CustomMealInput = Omit<CustomMeal, 'id' | 'use_count' | 'last_used_at'>

const COLUMNS = 'id, name, description, kcal, protein_g, carbs_g, fat_g, source, use_count, last_used_at'

// ---------------------------------------------------------------------------
// Busca (pura, testada em customMeals.test.ts)
// ---------------------------------------------------------------------------

/**
 * Itens da lista que combinam com o que a pessoa está digitando, ignorando
 * acento e maiúsculas. Todas as palavras digitadas precisam aparecer no nome
 * ou na descrição. Mais usados primeiro; nome começando igual vem antes.
 */
export function searchCustomMeals(list: CustomMeal[], query: string, limit = 5): CustomMeal[] {
  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 2)
  if (words.length === 0) return []
  const start = fold(query).trim()
  return list
    .filter((m) => {
      const hay = fold(`${m.name} ${m.description ?? ''}`)
      return words.every((w) => hay.includes(w))
    })
    .sort((a, b) => {
      const aStarts = fold(a.name).startsWith(start) ? 1 : 0
      const bStarts = fold(b.name).startsWith(start) ? 1 : 0
      return bStarts - aStarts || b.use_count - a.use_count
    })
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

/** A lista "Já comi antes", da mais recente para a mais antiga. */
export async function fetchCustomMeals(): Promise<CustomMeal[]> {
  const { data, error } = await client
    .from('custom_meals')
    .select(COLUMNS)
    .order('last_used_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as CustomMeal[]
}

export async function createCustomMeal(input: CustomMealInput): Promise<CustomMeal> {
  const { data, error } = await client
    .from('custom_meals')
    .insert({ ...input, use_count: 1 })
    .select(COLUMNS)
    .single()
  if (error) throw error
  return data as CustomMeal
}

/** Marca que o item foi usado de novo (sobe na lista). */
export async function touchCustomMeal(meal: CustomMeal): Promise<void> {
  await client
    .from('custom_meals')
    .update({ use_count: meal.use_count + 1, last_used_at: new Date().toISOString() })
    .eq('id', meal.id)
}
