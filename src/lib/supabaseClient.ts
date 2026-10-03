import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuração do Supabase ausente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE puts the OAuth result in a `?code=` query param instead of a
    // `#access_token=...` hash fragment, so it doesn't collide with
    // react-router's HashRouter (which owns the URL hash for routes).
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
