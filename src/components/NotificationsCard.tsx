import { useEffect, useState } from 'react'
import { currentSubscription, enablePush, pushSupport } from '../lib/push'

// "Minha conta": estado das notificações neste aparelho, botão para ativar e
// como liberar quando estiverem bloqueadas.

export function NotificationsCard() {
  const support = pushSupport()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [denied, setDenied] = useState(support.ok && Notification.permission === 'denied')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!support.ok) return
    let active = true
    currentSubscription()
      .then((sub) => active && setEnabled(!!sub && Notification.permission === 'granted'))
      .catch(() => active && setEnabled(false))
    return () => {
      active = false
    }
  }, [support.ok])

  async function enable() {
    setBusy(true)
    setError(false)
    try {
      if ((await enablePush()) === 'denied') setDenied(true)
      else setEnabled(true)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="info-card form-card push-card">
      <h2>Notificações</h2>
      <p className="muted">Os lembretes das refeições e da água chegam como notificação, mesmo com o app fechado.</p>

      {!support.ok ? (
        <p className="banner banner-attention">
          {support.reason === 'ios-not-installed'
            ? 'No iPhone, as notificações só funcionam com o app na tela de início. Instale o app (Compartilhar → Adicionar à Tela de Início) e abra por lá.'
            : 'Este navegador não recebe notificações. No celular, use o Chrome (Android) ou o app instalado (iPhone).'}
        </p>
      ) : denied ? (
        <div className="banner banner-attention">
          <p>As notificações estão bloqueadas para o Nutriê. Para liberar:</p>
          <ul className="push-help">
            <li>Android, app instalado: segure o ícone do Nutriê → Informações do app → Notificações → ativar.</li>
            <li>Android, no Chrome: toque no ícone à esquerda do endereço → Permissões → Notificações → Permitir.</li>
            <li>iPhone: Ajustes → Notificações → Nutriê → Permitir Notificações.</li>
          </ul>
          <p>Depois, volte aqui e toque em ativar.</p>
        </div>
      ) : enabled === false ? (
        <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar notificações neste aparelho'}
        </button>
      ) : enabled ? (
        <p className="push-status">Ativas neste aparelho.</p>
      ) : null}

      {error && <p className="banner banner-error">Não foi possível ativar as notificações agora. Tente de novo.</p>}
      {support.ok && (
        <p className="muted">No Android, se a notificação atrasar, libere o Nutriê (ou o Chrome) da economia de bateria.</p>
      )}
    </section>
  )
}
