// Edge Function "push": lembretes do Nutriê por Web Push.
//
// Ações (POST com JSON {action}):
// - "public-key": devolve a chave pública VAPID para o aparelho se inscrever
//   (pessoa logada). Na primeira vez, gera o par de chaves e guarda no Vault.
// - "dispatch": chamada pelo agendamento do banco a cada minuto (cabeçalho
//   x-cron-secret). Para cada pessoa com aparelho inscrito, escolhe os lembretes
//   de refeição e água que venceram (regras em ../_shared/reminders.ts), envia
//   uma notificação só e apaga as inscrições que não existem mais.
//
// O texto da notificação não traz dado de saúde (aparece na tela bloqueada).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import * as webpush from "jsr:@negrel/webpush@0.5.0"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  DEFAULT_SETTINGS,
  composeNotification,
  dueReminders,
  sentKey,
  toMinutes,
} from "../_shared/reminders.ts"
import type { ReminderSettings } from "../_shared/reminders.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/** Contato exigido pelo VAPID: o endereço do app (sem e-mail pessoal). */
const CONTACT = "https://areiasthiago.github.io/nutri-web-app/"
const APP_URL = "/nutri-web-app/"

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

/** Chaves VAPID do Vault; gera e guarda na primeira vez. */
async function vapidKeys(): Promise<CryptoKeyPair> {
  const { data: stored, error } = await admin.rpc("push_get_vapid_keys")
  if (error) throw error
  let exported = stored as string | null
  if (!exported) {
    const fresh = await webpush.generateVapidKeys({ extractable: true })
    const candidate = JSON.stringify(await webpush.exportVapidKeys(fresh))
    const { data: kept, error: setError } = await admin.rpc("push_set_vapid_keys", { keys: candidate })
    if (setError) throw setError
    exported = kept as string
  }
  return await webpush.importVapidKeys(JSON.parse(exported), { extractable: true })
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }

/** Envia uma notificação para cada aparelho; apaga os que não existem mais. Devolve quantos receberam. */
async function sendToOwner(server: webpush.ApplicationServer, ownerId: string, payload: unknown) {
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("owner_id", ownerId)
  if (error) throw error
  let ok = 0
  const errors: string[] = []
  for (const s of (subs ?? []) as Sub[]) {
    try {
      const subscriber = server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
      await subscriber.pushTextMessage(JSON.stringify(payload), { ttl: 600, urgency: webpush.Urgency.High })
      ok++
      await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", s.id)
    } catch (e) {
      if (e instanceof webpush.PushMessageError && e.isGone()) {
        await admin.from("push_subscriptions").delete().eq("id", s.id)
        errors.push("inscrição expirada (apagada)")
      } else {
        errors.push(String(e))
      }
    }
  }
  return { ok, total: (subs ?? []).length, errors }
}

/** Data (AAAA-MM-DD) e minutos desde a meia-noite no fuso da pessoa. */
function localNow(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) }
}

type SettingsRow = {
  meals_enabled: boolean
  water_enabled: boolean
  lead_minutes: number
  quiet_start: string | null
  quiet_end: string
}

/** Lembretes de uma pessoa neste minuto. Devolve quantos aparelhos receberam. */
async function remindOwner(server: () => Promise<webpush.ApplicationServer>, ownerId: string): Promise<number> {
  const [profile, settingsRow, plan] = await Promise.all([
    admin.from("profiles").select("timezone").eq("id", ownerId).maybeSingle(),
    admin.from("reminder_settings").select("meals_enabled, water_enabled, lead_minutes, quiet_start, quiet_end").eq("owner_id", ownerId).maybeSingle(),
    admin
      .from("plans")
      .select("id, meals (id, name, time), hydration_slots (id, time, ml)")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .maybeSingle(),
  ])
  if (!plan.data) return 0
  const tz = (profile.data?.timezone as string | undefined) ?? "America/Sao_Paulo"
  const { date, minutes } = localNow(tz)

  const row = settingsRow.data as SettingsRow | null
  const settings: ReminderSettings = row
    ? {
        mealsEnabled: row.meals_enabled,
        waterEnabled: row.water_enabled,
        leadMin: row.lead_minutes,
        quietStart: row.quiet_start ? toMinutes(row.quiet_start) : null,
        quietEnd: toMinutes(row.quiet_end),
      }
    : DEFAULT_SETTINGS

  const p = plan.data as {
    meals: { id: string; name: string; time: string }[]
    hydration_slots: { id: string; time: string; ml: number }[]
  }
  const [logs, water, sends] = await Promise.all([
    admin.from("meal_logs").select("meal_id").eq("owner_id", ownerId).eq("log_date", date),
    admin.from("water_logs").select("ml").eq("owner_id", ownerId).eq("log_date", date),
    admin.from("reminder_sends").select("kind, ref_id, attempt").eq("owner_id", ownerId).eq("local_date", date),
  ])

  const due = dueReminders({
    nowMin: minutes,
    settings,
    meals: p.meals.map((m) => ({ id: m.id, name: m.name, timeMin: toMinutes(m.time) })),
    doneMealIds: new Set((logs.data ?? []).map((l: { meal_id: string }) => l.meal_id)),
    waterSlots: p.hydration_slots.map((h) => ({ id: h.id, timeMin: toMinutes(h.time), ml: Number(h.ml) })),
    waterMl: (water.data ?? []).reduce((s: number, w: { ml: number }) => s + Number(w.ml), 0),
    sent: new Set((sends.data ?? []).map((x: { kind: "meal" | "water"; ref_id: string; attempt: number }) => sentKey(x.kind, x.ref_id, x.attempt))),
  })
  if (!due.length) return 0

  // Registra antes de enviar: o que outra execução já registrou não sai de novo.
  const { data: claimed, error } = await admin
    .from("reminder_sends")
    .upsert(
      due.map((d) => ({ owner_id: ownerId, local_date: date, kind: d.kind, ref_id: d.refId, attempt: d.attempt })),
      { onConflict: "owner_id,local_date,kind,ref_id,attempt", ignoreDuplicates: true },
    )
    .select("kind, ref_id, attempt")
  if (error) throw error
  const claimedKeys = new Set((claimed ?? []).map((x: { kind: "meal" | "water"; ref_id: string; attempt: number }) => sentKey(x.kind, x.ref_id, x.attempt)))
  const toSend = due.filter((d) => claimedKeys.has(sentKey(d.kind, d.refId, d.attempt)))
  const notification = composeNotification(toSend)
  if (!notification) return 0

  const r = await sendToOwner(await server(), ownerId, {
    title: notification.title,
    body: notification.body,
    tag: notification.tag,
    url: `${APP_URL}#/?secao=${notification.section}`,
  })
  if (r.errors.length) console.warn(ownerId, r.errors)
  return r.ok
}

async function dispatch() {
  const { data: subs, error } = await admin.from("push_subscriptions").select("owner_id")
  if (error) throw error
  const owners = [...new Set((subs ?? []).map((s: { owner_id: string }) => s.owner_id))]
  if (!owners.length) return { sent: 0 }

  // As chaves só são carregadas se alguém tiver lembrete neste minuto.
  let serverPromise: Promise<webpush.ApplicationServer> | null = null
  const server = () =>
    (serverPromise ??= vapidKeys().then((vapidKeys) => webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys })))

  let sent = 0
  for (const owner of owners) {
    try {
      sent += await remindOwner(server, owner)
    } catch (e) {
      console.error(owner, e)
    }
  }
  return { sent }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Use POST." }, 405)

  let action = ""
  try {
    action = ((await req.json()) as { action?: string }).action ?? ""
  } catch {
    return json({ error: "Corpo inválido." }, 400)
  }

  try {
    if (action === "dispatch") {
      const secret = req.headers.get("x-cron-secret") ?? ""
      const { data: valid } = await admin.rpc("push_check_cron_secret", { secret })
      if (!valid) return json({ error: "Não autorizado." }, 401)
      return json(await dispatch())
    }

    if (action === "public-key") {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
      const { data: userData, error: userError } = await admin.auth.getUser(jwt)
      if (userError || !userData.user) return json({ error: "Entre na sua conta." }, 401)
      return json({ publicKey: await webpush.exportApplicationServerKey(await vapidKeys()) })
    }

    return json({ error: "Ação desconhecida." }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: "Falha no envio de notificações." }, 500)
  }
})
