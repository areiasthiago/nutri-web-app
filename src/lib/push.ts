import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Notificações (Web Push): inscrição deste aparelho. O envio é feito pela Edge
// Function "push", chamada pelo agendamento do banco.

// Só usado nas telas logadas, quando supabaseConfigError já é null.
const client = supabase as SupabaseClient

export type PushSupport =
  | { ok: true }
  /** iPhone/iPad no navegador: só funciona com o app na tela de início. */
  | { ok: false; reason: 'ios-not-installed' }
  | { ok: false; reason: 'unsupported' }

export function pushSupport(): PushSupport {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  if (ios && !standalone) return { ok: false, reason: 'ios-not-installed' }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' }
  }
  return { ok: true }
}

/** Chave pública VAPID (base64url) → bytes, como o navegador pede. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Inscrição deste aparelho, se já existir. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  // getRegistration responde na hora (sem service worker ainda: nenhuma inscrição).
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/**
 * Pede permissão (deve ser chamado num toque) e inscreve este aparelho.
 * Devolve 'denied' se a pessoa recusar.
 */
export async function enablePush(): Promise<'ok' | 'denied'> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const { data, error } = await client.functions.invoke('push', { body: { action: 'public-key' } })
  if (error || !data?.publicKey) throw new Error('Não foi possível preparar as notificações.')

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) }))
  const json = sub.toJSON()
  const { error: saveError } = await client.from('push_subscriptions').upsert(
    { endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' },
  )
  if (saveError) throw saveError
  return 'ok'
}

/** Preferências de lembrete (tabela reminder_settings; sem linha = padrões). */
export type ReminderPrefs = {
  meals_enabled: boolean
  water_enabled: boolean
  /** Antecedência em minutos (0 = na hora). */
  lead_minutes: number
  /** "HH:MM", ou null = automático (31 min depois da última refeição). */
  quiet_start: string | null
  quiet_end: string
}

export const DEFAULT_PREFS: ReminderPrefs = {
  meals_enabled: true,
  water_enabled: true,
  lead_minutes: 0,
  quiet_start: null,
  quiet_end: '06:30',
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null)

export async function fetchReminderPrefs(): Promise<ReminderPrefs> {
  const { data, error } = await client
    .from('reminder_settings')
    .select('meals_enabled, water_enabled, lead_minutes, quiet_start, quiet_end')
    .maybeSingle()
  if (error) throw error
  if (!data) return DEFAULT_PREFS
  return { ...data, quiet_start: hhmm(data.quiet_start), quiet_end: hhmm(data.quiet_end) ?? '06:30' } as ReminderPrefs
}

export async function saveReminderPrefs(prefs: ReminderPrefs): Promise<void> {
  const { error } = await client
    .from('reminder_settings')
    .upsert({ ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'owner_id' })
  if (error) throw error
}
