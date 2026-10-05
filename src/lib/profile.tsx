import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from './supabaseClient'

// Só é usado dentro das telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

export type OnboardingStep = 'boas-vindas' | 'nome' | 'plano' | 'treino' | 'notificacoes' | 'casa' | 'pronto'

export type Profile = {
  display_name: string | null
  timezone: string
  /** Primeiros passos: onde parou; e quando terminou (ou pulou). */
  onboarding_step: OnboardingStep | null
  onboarding_done_at: string | null
  /** Dia de compras (0 = domingo … 6 = sábado). */
  shopping_day: number
  /** Peso (kg), opcional: só para estimar o gasto das atividades. */
  weight_kg: number | null
}

const COLUMNS = 'display_name, timezone, onboarding_step, onboarding_done_at, shopping_day, weight_kg'

type ProfileContextValue = {
  profile: Profile
  /** false até o perfil chegar do banco (antes disso, valores padrão). */
  loaded: boolean
  saveProfile: (changes: Partial<Profile>) => Promise<{ error: string | null }>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [profile, setProfile] = useState<Profile>({
    display_name: null,
    timezone: DEFAULT_TIMEZONE,
    onboarding_step: null,
    onboarding_done_at: null,
    shopping_day: 6,
    weight_kg: null,
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!userId) return
    let active = true
    client
      .from('profiles')
      .select(COLUMNS)
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        if (data) setProfile({ ...(data as Profile), weight_kg: data.weight_kg === null ? null : Number(data.weight_kg) })
        setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [userId])

  const saveProfile = useCallback(
    async (changes: Partial<Profile>) => {
      if (!userId) return { error: 'Sessão expirada. Entre de novo.' }
      const { data, error } = await client
        .from('profiles')
        .update(changes)
        .eq('id', userId)
        .select(COLUMNS)
        .single()
      if (error) return { error: 'Não foi possível salvar agora. Tente de novo em instantes.' }
      setProfile({ ...(data as Profile), weight_kg: data.weight_kg === null ? null : Number(data.weight_kg) })
      return { error: null }
    },
    [userId],
  )

  return (
    <ProfileContext.Provider value={{ profile, loaded, saveProfile }}>{children}</ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile precisa estar dentro de <ProfileProvider>')
  return ctx
}
