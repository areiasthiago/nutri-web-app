// Avisos do modo treino: bipe (Web Audio, sem arquivo de som), vibração e,
// com o app em segundo plano, notificação. A tela fica acesa durante o treino
// (Wake Lock): com o celular bloqueado, o navegador pode pausar o cronômetro.

let audio: AudioContext | null = null

/** Chame num toque da pessoa (o navegador só libera o som depois de um gesto). */
export function unlockAudio() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
}

function tone(at: number, freq: number, duration: number) {
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.4, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  osc.connect(gain).connect(audio.destination)
  osc.start(at)
  osc.stop(at + duration + 0.05)
}

/** Fim do descanso: três bipes subindo. Fim de uma série por tempo: dois bipes. */
export function alarm(kind: 'rest' | 'work') {
  try {
    if (audio) {
      const t = audio.currentTime + 0.05
      if (kind === 'rest') {
        tone(t, 660, 0.18)
        tone(t + 0.25, 660, 0.18)
        tone(t + 0.5, 990, 0.4)
      } else {
        tone(t, 880, 0.2)
        tone(t + 0.3, 880, 0.35)
      }
    }
    navigator.vibrate?.(kind === 'rest' ? [200, 100, 200, 100, 400] : [300, 150, 300])
  } catch {
    // sem som/vibração no aparelho: fica o aviso na tela
  }
}

/** Com o app em segundo plano, avisa por notificação (se a pessoa já permitiu notificações). */
export async function notifyIfHidden(title: string, body: string) {
  if (document.visibilityState === 'visible') return
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker?.ready
    await reg?.showNotification(title, {
      body,
      tag: 'nutrie-treino',
      icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icons/badge-96.png`,
      data: { url: location.href },
    })
  } catch {
    // sem notificação: o bipe e a tela bastam
  }
}

type WakeLockLike = { release: () => Promise<void> }

/** Mantém a tela acesa e volta a pedir quando o app reaparece. Devolve a função de soltar. */
export function keepScreenOn(): () => void {
  let lock: WakeLockLike | null = null
  let released = false
  const request = async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } }).wakeLock
      if (wl && !released && document.visibilityState === 'visible') lock = await wl.request('screen')
    } catch {
      lock = null
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') void request()
  }
  void request()
  document.addEventListener('visibilitychange', onVisible)
  return () => {
    released = true
    document.removeEventListener('visibilitychange', onVisible)
    void lock?.release().catch(() => {})
  }
}
