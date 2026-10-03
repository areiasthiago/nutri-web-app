import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import logoMark from '../assets/logo-mark.svg'

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
    return 'Este e-mail não está autorizado a usar o app. Fale com o Thiago para liberar o acesso.'
  }
  return 'Não foi possível entrar com o Google agora. Tente de novo em instantes.'
}

export function LoginPage() {
  const { signInWithGoogle, signInWithPassword, signUpWithPassword, backendError } = useAuth()
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

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logoMark} alt="" className="login-logo" width={56} height={56} />
        <h1>Nutri Helper</h1>
        <p className="login-subtitle">Entre para ver seu plano alimentar e de água.</p>

        {backendError && <p className="banner banner-error">{backendError}</p>}
        {error && <p className="banner banner-error">{error}</p>}
        {info && <p className="banner banner-info">{info}</p>}

        <button
          type="button"
          className="btn btn-google"
          onClick={handleGoogle}
          disabled={submitting}
        >
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
          O cadastro é só para convidados. Se seu e-mail não foi liberado, fale com o Thiago.
        </p>
      </div>
    </div>
  )
}
