// Notificações do Nutriê (Web Push). Carregado pelo service worker gerado pelo
// vite-plugin-pwa (workbox.importScripts em vite.config.ts).

const BADGE = 'icons/badge-96.png'
const ICON = 'icons/icon-192.png'

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nutriê', {
      body: data.body || '',
      icon: ICON,
      // Ícone pequeno da barra de status: o Android usa só a silhueta (transparência).
      badge: BADGE,
      tag: data.tag,
      // Botões "Registrar" e "Adiar 15 min" (o iPhone não mostra botões).
      actions: Array.isArray(data.actions) ? data.actions : [],
      data: {
        url: data.url || '/nutri-web-app/',
        actionToken: data.actionToken,
        actionUrl: data.actionUrl,
      },
    }),
  )
})

/** Toque num botão: avisa a função e troca a notificação pela confirmação. */
async function handleAction(notification, choice) {
  const { actionToken, actionUrl } = notification.data || {}
  let message = 'Não deu para registrar agora. Abra o app.'
  try {
    const res = await fetch(actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'notification-action', token: actionToken, choice }),
    })
    const body = await res.json()
    if (body && body.message) message = body.message
  } catch {
    // sem internet: fica a mensagem padrão
  }
  await self.registration.showNotification('Nutriê', {
    body: message,
    icon: ICON,
    badge: BADGE,
    tag: notification.tag,
    silent: true,
    data: { url: (notification.data && notification.data.url) || '/nutri-web-app/' },
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}

  // "open" (ex.: Registrar o peso) só abre o app; os outros botões vão para a função.
  if (event.action && event.action !== 'open' && data.actionToken && data.actionUrl) {
    event.waitUntil(handleAction(event.notification, event.action))
    return
  }

  // Tocar na notificação abre o app (ou traz para frente a janela já aberta).
  const url = new URL(data.url || '/nutri-web-app/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if ('focus' in w && 'navigate' in w && w.url.startsWith(self.location.origin + '/nutri-web-app/')) {
          return w.navigate(url).then((c) => (c || w).focus())
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
