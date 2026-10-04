// Notificações do Nutriê (Web Push). Carregado pelo service worker gerado pelo
// vite-plugin-pwa (workbox.importScripts em vite.config.ts).

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
      icon: 'icons/icon-192.png',
      // Ícone pequeno da barra de status: o Android usa só a silhueta (transparência).
      badge: 'icons/badge-96.png',
      tag: data.tag,
      data: { url: data.url || '/nutri-web-app/' },
    }),
  )
})

// Tocar na notificação abre o app (ou traz para frente a janela já aberta).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/nutri-web-app/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(url) && 'focus' in w) return w.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
