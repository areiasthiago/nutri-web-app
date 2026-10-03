// Detecção de plataforma e captura do convite de instalação do PWA.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const ua = navigator.userAgent

// iPadOS se apresenta como Mac; a diferença é ter tela de toque.
export const isIOS =
  /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isAndroid = /Android/i.test(ua)

export const isMobile = isIOS || isAndroid

/** Navegadores embutidos em apps (Instagram, Facebook...) não conseguem instalar. */
export const isInAppBrowser = /FBAN|FBAV|Instagram|Line\//i.test(ua)

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// O Chrome dispara `beforeinstallprompt` logo no carregamento, possivelmente
// antes do React montar a tela, então o evento é guardado aqui no módulo.
let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredPrompt = e as BeforeInstallPromptEvent
  notify()
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  notify()
})

export function canPromptInstall(): boolean {
  return deferredPrompt !== null
}

/** Abre o diálogo nativo de instalação (Android/Chrome). */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  const promptEvent = deferredPrompt
  deferredPrompt = null
  await promptEvent.prompt()
  const { outcome } = await promptEvent.userChoice
  notify()
  return outcome === 'accepted'
}

export function onInstallStateChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const SKIP_KEY = 'nutri:skip-install'

export function skipInstallForSession() {
  try {
    sessionStorage.setItem(SKIP_KEY, '1')
  } catch {
    // Sem sessionStorage (modo privado restrito): só segue sem lembrar.
  }
}

/** No celular, fora do app instalado, a primeira tela é o convite para instalar. */
export function shouldShowInstallInvite(): boolean {
  if (!isMobile || isStandalone()) return false

  // Volta do login com Google (?code= / ?error=): deixa o login terminar.
  const params = new URLSearchParams(window.location.search)
  if (params.has('code') || params.has('error')) return false

  try {
    return sessionStorage.getItem(SKIP_KEY) !== '1'
  } catch {
    return true
  }
}
