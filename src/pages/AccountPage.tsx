import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AiQuotaBar } from '../components/AiQuota'
import { NotificationsCard } from '../components/NotificationsCard'
import { ReminderPrefsForm } from '../components/ReminderPrefsForm'
import { fetchAiAccess } from '../lib/ai'
import type { AiAccess } from '../lib/ai'
import { useProfile } from '../lib/profile'
import { timezoneOptions } from '../lib/timezones'

// Quem entra pelo Google e cria senha continua só com "google" na sessão;
// por isso a senha vem à parte (hasPassword).
function providerLabel(providers: unknown, hasPassword: boolean): string {
  const list = Array.isArray(providers) ? providers.map(String) : []
  if (hasPassword && !list.includes('email')) list.push('email')
  const names = list.map((p) => (p === 'google' ? 'Google' : p === 'email' ? 'e-mail e senha' : p))
  return names.length ? names.join(' e ') : 'e-mail e senha'
}

export function AccountPage() {
  const { session, signOut, updatePassword, hasPassword: checkHasPassword } = useAuth()
  const { profile, loaded, saveProfile } = useProfile()
  // null enquanto confere no banco.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [aiAccess, setAiAccess] = useState<AiAccess | null>(null)

  useEffect(() => {
    let active = true
    fetchAiAccess().then((a) => active && setAiAccess(a))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    checkHasPassword().then((has) => active && setHasPassword(has))
    return () => {
      active = false
    }
  }, [checkHasPassword])

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Voltar para Hoje
      </Link>
      <h1 className="page-title">Minha conta</h1>

      <NotificationsCard />
      <ReminderPrefsForm />

      <section className="info-card">
        <h2>Acesso</h2>
        <p>
          <span className="muted">E-mail</span>
          <br />
          <strong>{session?.user.email}</strong>
        </p>
        <p>
          <span className="muted">Entra com</span>
          <br />
          {providerLabel(session?.user.app_metadata.providers, hasPassword === true)}
        </p>
      </section>

      {aiAccess?.vip && (
        <section className="info-card form-card">
          <h2>Inteligência artificial</h2>
          <p className="muted">Sua conta é VIP: você pode usar a IA para ler o PDF do plano.</p>
          <AiQuotaBar access={aiAccess} />
        </section>
      )}

      {/* Monta só depois que o perfil chega, para o formulário começar com os dados salvos. */}
      {loaded && <ProfileForm initial={profile} onSave={saveProfile} />}

      {hasPassword !== null && (
        <PasswordForm hasPassword={hasPassword} onSave={updatePassword} onSaved={() => setHasPassword(true)} />
      )}

      <button type="button" className="btn btn-outline" onClick={() => signOut()}>
        Sair da conta
      </button>
      <p className="muted account-footnote">
        Para trocar o e-mail ou apagar a conta, fale com seu nutri por enquanto. Apagar a conta pelo
        próprio app chega numa próxima atualização.
      </p>
    </div>
  )
}

function ProfileForm({
  initial,
  onSave,
}: {
  initial: { display_name: string | null; timezone: string }
  onSave: (changes: { display_name: string | null; timezone: string }) => Promise<{ error: string | null }>
}) {
  const [name, setName] = useState(initial.display_name ?? '')
  const [timezone, setTimezone] = useState(initial.timezone)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  const options = timezoneOptions(initial.timezone)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    const { error } = await onSave({ display_name: name.trim() || null, timezone })
    setMessage(error ? { kind: 'error', text: error } : { kind: 'info', text: 'Dados salvos.' })
    setSaving(false)
  }

  return (
    <form className="info-card form-card" onSubmit={handleSubmit}>
      <h2>Seus dados</h2>
      <label className="field">
        <span>Como quer ser chamado</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="nickname"
          placeholder="Ex.: Thiago"
        />
      </label>
      <label className="field">
        <span>Fuso horário</span>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {options.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <small className="muted">Define quando começa o seu dia e os horários das refeições.</small>
      </label>
      {message && <p className={`banner banner-${message.kind}`}>{message.text}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  )
}

function PasswordForm({
  hasPassword,
  onSave,
  onSaved,
}: {
  hasPassword: boolean
  onSave: (password: string) => Promise<{ error: string | null }>
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (password !== confirm) {
      setMessage({ kind: 'error', text: 'As duas senhas não são iguais.' })
      return
    }
    setSaving(true)
    const { error } = await onSave(password)
    if (error) {
      setMessage({ kind: 'error', text: error })
    } else {
      setMessage({
        kind: 'info',
        text: hasPassword
          ? 'Senha trocada.'
          : 'Senha criada. Agora você também pode entrar com e-mail e senha.',
      })
      setPassword('')
      setConfirm('')
      onSaved()
    }
    setSaving(false)
  }

  return (
    <form className="info-card form-card" onSubmit={handleSubmit}>
      {hasPassword ? (
        <>
          <h2>Trocar senha</h2>
          <p className="muted">A senha que você usa para entrar com e-mail.</p>
        </>
      ) : (
        <>
          <h2>Criar senha</h2>
          <p className="muted">
            Crie uma senha para entrar também com e-mail e senha. Isso não muda nada na sua conta
            Google: o login com Google continua funcionando, e a senha do Google continua só com o
            Google.
          </p>
        </>
      )}
      <label className="field">
        <span>Nova senha</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          autoComplete="new-password"
        />
      </label>
      <label className="field">
        <span>Repita a nova senha</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={6}
          required
          autoComplete="new-password"
        />
      </label>
      {message && <p className={`banner banner-${message.kind}`}>{message.text}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Salvando…' : hasPassword ? 'Trocar senha' : 'Criar senha'}
      </button>
    </form>
  )
}
