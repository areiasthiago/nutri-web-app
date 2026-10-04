import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { currentSubscription, enablePush, pushSupport } from '../lib/push'

// Aviso na tela Hoje para ativar as notificações neste aparelho. A permissão só
// é pedida no toque do botão. "Agora não" esconde o aviso por 7 dias.

const SNOOZE_KEY = 'nutrie:notif-prompt-snoozed-until'
const SNOOZE_DAYS = 7

function snoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now()
  } catch {
    return false
  }
}

export function NotificationPrompt() {
  const support = pushSupport()
  // 'checking': conferindo se já está inscrito (não mostra nada, para não piscar).
  const [state, setState] = useState<'checking' | 'ask' | 'denied' | 'done' | 'hidden'>(() =>
    !support.ok || snoozed() ? 'hidden' : Notification.permission === 'denied' ? 'denied' : 'checking',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (state !== 'checking') return
    let active = true
    currentSubscription()
      .then((sub) => active && setState(sub && Notification.permission === 'granted' ? 'hidden' : 'ask'))
      .catch(() => active && setState('ask'))
    return () => {
      active = false
    }
  }, [state])

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000))
    } catch {
      // sem armazenamento: só esconde agora
    }
    setState('hidden')
  }

  async function enable() {
    setBusy(true)
    setError(false)
    try {
      setState((await enablePush()) === 'denied' ? 'denied' : 'done')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'hidden' || state === 'checking') return null

  if (state === 'done') {
    return (
      <section className="notif-prompt" aria-live="polite">
        <p className="notif-prompt-title">Notificações ativas neste aparelho.</p>
        <p>
          Quer conferir? Em <Link to="/conta">Minha conta</Link>, toque em "Testar com o app fechado".
        </p>
        <button type="button" className="btn-link" onClick={() => setState('hidden')}>
          Fechar
        </button>
      </section>
    )
  }

  if (state === 'denied') {
    return (
      <section className="notif-prompt">
        <p className="notif-prompt-title">As notificações estão bloqueadas para o Nutriê.</p>
        <p>
          Para receber os lembretes, libere nas configurações do celular (Notificações do app ou do site). Em{' '}
          <Link to="/conta">Minha conta</Link> tem o passo a passo.
        </p>
        <button type="button" className="btn-link" onClick={snooze}>
          Agora não
        </button>
      </section>
    )
  }

  return (
    <section className="notif-prompt">
      <p className="notif-prompt-title">Ative as notificações</p>
      <p>Para receber os lembretes das refeições e da água na hora certa, mesmo com o app fechado.</p>
      <div className="notif-prompt-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={enable} disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
        <button type="button" className="btn-link" onClick={snooze}>
          Agora não
        </button>
      </div>
      {error && <p className="notif-prompt-error">Não foi possível ativar agora. Tente de novo.</p>}
    </section>
  )
}
