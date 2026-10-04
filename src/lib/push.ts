import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

// Notificações (Web Push): inscrição deste aparelho e o teste "com o app fechado".
// O envio é feito pela Edge Function "push", chamada pelo agendamento do banco.

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

export const TEST_DELAY_MIN = 2

export type PushTest = { id: string; send_at: string; sent_at: string | null; result: string | null }

/** Agenda a notificação de teste para daqui a alguns minutos. */
export async function schedulePushTest(): Promise<PushTest> {
  const sendAt = new Date(Date.now() + TEST_DELAY_MIN * 60_000).toISOString()
  const { data, error } = await client
    .from('push_tests')
    .insert({ send_at: sendAt })
    .select('id, send_at, sent_at, result')
    .single()
  if (error) throw error
  return data as PushTest
}

/** Último teste agendado (para mostrar se já foi enviado). */
export async function latestPushTest(): Promise<PushTest | null> {
  const { data, error } = await client
    .from('push_tests')
    .select('id, send_at, sent_at, result')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as PushTest | null
}
