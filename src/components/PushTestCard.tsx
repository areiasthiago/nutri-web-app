import { useEffect, useState } from 'react'
import { TEST_DELAY_MIN, currentSubscription, enablePush, latestPushTest, pushSupport, schedulePushTest } from '../lib/push'
import type { PushTest } from '../lib/push'

// Prova de ponta a ponta dos lembretes: ativar notificações neste aparelho e
// receber um teste com o app fechado. Os lembretes de refeição e água vêm depois.

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export function PushTestCard() {
  const support = pushSupport()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [denied, setDenied] = useState(support.ok && Notification.permission === 'denied')
  const [test, setTest] = useState<PushTest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!support.ok) return
    let active = true
    currentSubscription()
      .then((sub) => active && setEnabled(!!sub && Notification.permission === 'granted'))
      .catch(() => active && setEnabled(false))
    latestPushTest()
      .then((t) => active && setTest(t))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [support.ok])

  // Enquanto o teste não sai, confere a cada 20 s (útil com o app aberto).
  useEffect(() => {
    if (!test || test.sent_at) return
    const id = window.setInterval(() => {
      latestPushTest().then((t) => t && setTest(t)).catch(() => {})
    }, 20_000)
    return () => window.clearInterval(id)
  }, [test])

  async function enable() {
    setBusy(true)
    setError(null)
    try {
      const r = await enablePush()
      if (r === 'denied') setDenied(true)
      else setEnabled(true)
    } catch {
      setError('Não foi possível ativar as notificações agora. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  async function scheduleTest() {
    setBusy(true)
    setError(null)
    try {
      setTest(await schedulePushTest())
    } catch {
      setError('Não foi possível agendar o teste.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="info-card form-card push-card">
      <h2>Notificações (teste)</h2>
      <p className="muted">
        Antes dos lembretes de refeição e água, um teste: ative as notificações neste aparelho, agende um aviso e
        feche o app. Ele deve chegar em uns {TEST_DELAY_MIN} minutos, mesmo com a tela bloqueada.
      </p>

      {!support.ok ? (
        <p className="banner banner-attention">
          {support.reason === 'ios-not-installed'
            ? 'No iPhone, as notificações só funcionam com o app na tela de início. Instale o app (Compartilhar → Adicionar à Tela de Início) e abra por lá.'
            : 'Este navegador não recebe notificações. No celular, use o Chrome (Android) ou o app instalado (iPhone).'}
        </p>
      ) : denied ? (
        <p className="banner banner-attention">
          As notificações estão bloqueadas para o Nutriê. Para liberar, abra as configurações do navegador (ou do app,
          se instalado), procure Notificações e permita para este site. Depois, volte aqui.
        </p>
      ) : enabled === false ? (
        <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar notificações neste aparelho'}
        </button>
      ) : enabled ? (
        <>
          <p>Notificações ativas neste aparelho.</p>
          <button type="button" className="btn btn-primary" onClick={scheduleTest} disabled={busy || (!!test && !test.sent_at)}>
            {busy ? 'Agendando…' : 'Testar com o app fechado'}
          </button>
        </>
      ) : null}

      {test && (
        <p className="push-test-status" aria-live="polite">
          {test.sent_at
            ? `Teste das ${timeOf(test.send_at)}: ${test.result ?? 'enviado'}.`
            : `Teste agendado para ${timeOf(test.send_at)}. Pode fechar o app agora.`}
        </p>
      )}
      {error && <p className="banner banner-error">{error}</p>}
      <p className="muted">
        No Android, se a notificação atrasar, libere o Nutriê (ou o Chrome) da economia de bateria.
      </p>
    </section>
  )
}
