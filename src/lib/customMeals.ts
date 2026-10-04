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
  /** 'meal': refeição inteira ("Comi outra coisa"); 'item': alimento trocado ("Outro…"). */
  kind: 'meal' | 'item'
  use_count: number
  last_used_at: string
}

export type CustomMealInput = Omit<CustomMeal, 'id' | 'use_count' | 'last_used_at'>

const COLUMNS = 'id, name, description, kcal, protein_g, carbs_g, fat_g, source, kind, use_count, last_used_at'

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

/** Palavras da busca: minúsculas, sem acento, com 2+ letras. */
export function searchWords(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2)
}

/**
 * Busca no banco (a lista cresce com o tempo): todas as palavras digitadas
 * precisam aparecer no nome ou na descrição (coluna search_text, sem acento).
 * Mais usados primeiro.
 */
export async function searchCustomMealsInDb(
  kind: CustomMeal['kind'] | null,
  query: string,
  limit = 5,
): Promise<CustomMeal[]> {
  const words = searchWords(query)
  if (words.length === 0) return []
  let request = client.from('custom_meals').select(COLUMNS)
  if (kind) request = request.eq('kind', kind)
  for (const w of words) request = request.ilike('search_text', `%${w}%`)
  const { data, error } = await request
    .order('use_count', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as CustomMeal[]
}

/** Item com exatamente este nome (ignorando acento e maiúsculas), de preferência do tipo pedido. */
export async function findCustomMealByName(name: string, kind: CustomMeal['kind']): Promise<CustomMeal | null> {
  const candidates = await searchCustomMealsInDb(null, name, 20)
  const same = candidates.filter((m) => fold(m.name) === fold(name.trim()))
  return same.find((m) => m.kind === kind) ?? same[0] ?? null
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
