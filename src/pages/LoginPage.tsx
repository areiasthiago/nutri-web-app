import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import logoMark from '../assets/logo-mark.svg'
import { Wordmark } from '../components/Wordmark'

// "G" oficial do Google, nas cores da marca (permitido pelas diretrizes de
// botão "Sign in with Google"; não recolorir).
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function readOAuthError(): string | null {
  const params = new URLSearchParams(window.location.search)
  const description = params.get('error_description') || params.get('error')
  if (!description) return null

  // Limpa a URL para não repetir o erro se a pessoa recarregar a página.
  const clean = new URL(window.location.href)
  clean.search = ''
  window.history.replaceState({}, '', clean.toString())

  const normalized = description.toLowerCase()
  if (normalized.includes('not authorized') || normalized.includes('database error')) {
    return 'Este e-mail não está autorizado a usar o app. Fale com seu nutri para liberar o acesso.'
  }
  return 'Não foi possível entrar com o Google agora. Tente de novo em instantes.'
}

export function LoginPage() {
  const { session, signInWithGoogle, signInWithPassword, signUpWithPassword, backendError } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() => readOAuthError())
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleGoogle() {
    setError(null)
    setSubmitting(true)
    const { error: err } = await signInWithGoogle()
    if (err) setError(err)
    setSubmitting(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    const result =
      mode === 'signin'
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password)

    if (result.error) {
      setError(result.error)
    } else if (mode === 'signup') {
      setInfo('Conta criada. Você já pode entrar.')
      setMode('signin')
    }
    setSubmitting(false)
  }

  // Já logado (inclusive logo depois de entrar com e-mail e senha): vai para Hoje.
  if (session) return <Navigate to="/" replace />

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src={logoMark} alt="" className="login-logo" width={52} height={48} />
          <h1 className="brand-title">
            <Wordmark height={40} />
          </h1>
        </div>
        <p className="login-subtitle">Entre para ver seu plano alimentar, meta de água, lista de compra e muito mais.</p>

        {backendError && <p className="banner banner-error">{backendError}</p>}
        {error && <p className="banner banner-error">{error}</p>}
        {info && <p className="banner banner-info">{info}</p>}

        <button
          type="button"
          className="btn btn-google"
          onClick={handleGoogle}
          disabled={submitting}
        >
          <GoogleLogo />
          Entrar com Google
        </button>

        <div className="divider">ou</div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <button
          type="button"
          className="btn-link"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setInfo(null)
          }}
        >
          {mode === 'signin' ? 'Ainda não tem conta? Criar conta' : 'Já tem conta? Entrar'}
        </button>

        <p className="login-note">
          O cadastro é só para convidados. Se seu e-mail não foi liberado, fale com seu nutri.
        </p>
      </div>
    </div>
  )
}
