import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'

// AuthProvider only ever renders when src/App.tsx has already confirmed
// supabaseConfigError is null, so `supabase` is guaranteed to be set here.
const client = supabase as SupabaseClient

type AuthContextValue = {
  session: Session | null
  loading: boolean
  /** Mensagem amigável quando o Supabase não responde (ex.: projeto pausado). */
  backendError: string | null
  signInWithGoogle: () => Promise<{ error: string | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  /** Define ou troca a senha da conta logada (serve também para quem entrou pelo Google). */
  updatePassword: (password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function redirectUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

/** Traduz os erros mais comuns do Supabase Auth para português simples. */
function translateAuthError(message: string): string {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('not authorized') ||
    normalized.includes('e-mail não autorizado') ||
    normalized.includes('database error')
  ) {
    return 'Este e-mail não está autorizado a usar o app. Fale com seu nutri para liberar o acesso.'
  }
  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (normalized.includes('user already registered')) {
    return 'Já existe uma conta com esse e-mail. Tente entrar em vez de criar uma conta.'
  }
  if (normalized.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.'
  }
  if (normalized.includes('failed to fetch') || normalized.includes('networkerror')) {
    return 'Não foi possível falar com o servidor agora. Veja a seção "Problemas de conexão" abaixo.'
  }
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [backendError, setBackendError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setBackendError(translateAuthError(error.message))
        }
        setSession(data.session ?? null)
      })
      .catch(() => {
        if (!active) return
        setBackendError(
          'Não foi possível falar com o servidor agora. O projeto pode estar pausado ou sem internet.',
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: listener } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setBackendError(null)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signInWithGoogle() {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl() },
    })
    return { error: error ? translateAuthError(error.message) : null }
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await client.auth.signInWithPassword({ email, password })
    return { error: error ? translateAuthError(error.message) : null }
  }

  async function signUpWithPassword(email: string, password: string) {
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl() },
    })
    return { error: error ? translateAuthError(error.message) : null }
  }

  async function updatePassword(password: string) {
    const { error } = await client.auth.updateUser({ password })
    if (error?.message.toLowerCase().includes('should be different')) {
      return { error: 'A nova senha precisa ser diferente da atual.' }
    }
    return { error: error ? translateAuthError(error.message) : null }
  }

  async function signOut() {
    await client.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        backendError,
        signInWithGoogle,
        signInWithPassword,
        signUpWithPassword,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
