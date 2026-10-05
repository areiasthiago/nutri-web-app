// Edge Function "push": lembretes do Nutriê por Web Push.
//
// Ações (POST com JSON {action}):
// - "public-key": devolve a chave pública VAPID para o aparelho se inscrever
//   (pessoa logada). Na primeira vez, gera o par de chaves e guarda no Vault.
// - "dispatch": chamada pelo agendamento do banco a cada minuto (cabeçalho
//   x-cron-secret). Para cada pessoa com aparelho inscrito, escolhe os lembretes
//   de refeição, água e peso que venceram (regras em ../_shared/reminders.ts), envia
//   uma notificação só (com os botões "Registrar" e "Adiar 15 min") e apaga as
//   inscrições que não existem mais.
// - "notification-action": toque num botão da notificação (vem do service
//   worker, sem sessão). Vale pelo código de uso único que a notificação levou.
//
// O texto da notificação não traz dado de saúde (aparece na tela bloqueada).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import * as webpush from "jsr:@negrel/webpush@0.5.0"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  DEFAULT_SETTINGS,
  SNOOZE_MIN,
  composeNotification,
  dueReminders,
  notificationActions,
  sentKey,
  toMinutes,
} from "../_shared/reminders.ts"
import type { ReminderKind, ReminderSettings } from "../_shared/reminders.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/** Contato exigido pelo VAPID: o endereço do app (sem e-mail pessoal). */
const CONTACT = "https://areiasthiago.github.io/nutri-web-app/"
const APP_URL = "/nutri-web-app/"
/** Para onde o service worker manda o toque nos botões. */
const ACTION_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/push`

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
  weight_enabled: boolean
  lead_minutes: number
  quiet_start: string | null
  quiet_end: string
}

/** Lembretes de uma pessoa neste minuto. Devolve quantos aparelhos receberam. */
async function remindOwner(server: () => Promise<webpush.ApplicationServer>, ownerId: string): Promise<number> {
  const [profile, settingsRow, plan] = await Promise.all([
    admin.from("profiles").select("timezone").eq("id", ownerId).maybeSingle(),
    admin.from("reminder_settings").select("meals_enabled, water_enabled, weight_enabled, lead_minutes, quiet_start, quiet_end").eq("owner_id", ownerId).maybeSingle(),
    admin
      .from("plans")
      .select("id, meals (id, name, time), hydration_slots (id, time, ml)")
      .eq("owner_id", ownerId)
      .eq("active", true)
      // Só o plano da própria pessoa (as pessoas da casa não recebem lembretes).
      .is("household_member_id", null)
      .maybeSingle(),
  ])
  // Sem plano ainda: só o lembrete de peso pode sair.
  const tz = (profile.data?.timezone as string | undefined) ?? "America/Sao_Paulo"
  const { date, minutes } = localNow(tz)

  const row = settingsRow.data as SettingsRow | null
  const settings: ReminderSettings = row
    ? {
        mealsEnabled: row.meals_enabled,
        waterEnabled: row.water_enabled,
        weightEnabled: row.weight_enabled,
        leadMin: row.lead_minutes,
        quietStart: row.quiet_start ? toMinutes(row.quiet_start) : null,
        quietEnd: toMinutes(row.quiet_end),
      }
    : DEFAULT_SETTINGS

  const p = (plan.data ?? { meals: [], hydration_slots: [] }) as {
    meals: { id: string; name: string; time: string }[]
    hydration_slots: { id: string; time: string; ml: number }[]
  }
  const [logs, water, weight, sends, snoozes] = await Promise.all([
    admin.from("meal_logs").select("meal_id").eq("owner_id", ownerId).eq("log_date", date),
    admin.from("water_logs").select("ml").eq("owner_id", ownerId).eq("log_date", date),
    admin.from("weight_logs").select("id").eq("owner_id", ownerId).eq("log_date", date).limit(1),
    admin.from("reminder_sends").select("kind, ref_id, attempt").eq("owner_id", ownerId).eq("local_date", date),
    admin.from("reminder_snoozes").select("id, kind, ref_id, send_at").eq("owner_id", ownerId).eq("local_date", date).is("sent_at", null),
  ])

  const due = dueReminders({
    nowMin: minutes,
    settings,
    meals: p.meals.map((m) => ({ id: m.id, name: m.name, timeMin: toMinutes(m.time) })),
    doneMealIds: new Set((logs.data ?? []).map((l: { meal_id: string }) => l.meal_id)),
    waterSlots: p.hydration_slots.map((h) => ({ id: h.id, timeMin: toMinutes(h.time), ml: Number(h.ml) })),
    waterMl: (water.data ?? []).reduce((s: number, w: { ml: number }) => s + Number(w.ml), 0),
    weightLogged: (weight.data ?? []).length > 0,
    weightRef: ownerId,
    sent: new Set((sends.data ?? []).map((x: { kind: ReminderKind; ref_id: string; attempt: number }) => sentKey(x.kind, x.ref_id, x.attempt))),
    snoozes: (snoozes.data ?? []).map((z: { id: string; kind: ReminderKind; ref_id: string; send_at: string }) => ({
      id: z.id,
      kind: z.kind,
      refId: z.ref_id,
      atMin: localNow(tz, new Date(z.send_at)).minutes,
    })),
  })
  if (!due.length) return 0

  // Registra antes de enviar: o que outra execução já registrou não sai de novo.
  const regular = due.filter((d) => !d.snoozeId)
  const claimedKeys = new Set<string>()
  if (regular.length) {
    const { data: claimed, error } = await admin
      .from("reminder_sends")
      .upsert(
        regular.map((d) => ({ owner_id: ownerId, local_date: date, kind: d.kind, ref_id: d.refId, attempt: d.attempt })),
        { onConflict: "owner_id,local_date,kind,ref_id,attempt", ignoreDuplicates: true },
      )
      .select("kind, ref_id, attempt")
    if (error) throw error
    for (const x of (claimed ?? []) as { kind: ReminderKind; ref_id: string; attempt: number }[]) {
      claimedKeys.add(sentKey(x.kind, x.ref_id, x.attempt))
    }
  }
  const snoozeIds = due.flatMap((d) => (d.snoozeId ? [d.snoozeId] : []))
  const claimedSnoozes = new Set<string>()
  if (snoozeIds.length) {
    const { data, error } = await admin
      .from("reminder_snoozes")
      .update({ sent_at: new Date().toISOString() })
      .in("id", snoozeIds)
      .is("sent_at", null)
      .select("id")
    if (error) throw error
    for (const z of (data ?? []) as { id: string }[]) claimedSnoozes.add(z.id)
  }
  const toSend = due.filter((d) =>
    d.snoozeId ? claimedSnoozes.has(d.snoozeId) : claimedKeys.has(sentKey(d.kind, d.refId, d.attempt))
  )
  const notification = composeNotification(toSend)
  if (!notification) return 0

  // Botões: código de uso único para o lembrete principal.
  const buttons = notificationActions(toSend)
  let actionToken: string | null = null
  if (buttons) {
    const t = buttons.target
    const { data, error } = await admin
      .from("notification_actions")
      .insert({ owner_id: ownerId, local_date: date, kind: t.kind, ref_id: t.refId, ml: t.kind === "water" ? t.ml : null })
      .select("token")
      .single()
    if (!error) actionToken = (data as { token: string }).token
  }

  const r = await sendToOwner(await server(), ownerId, {
    title: notification.title,
    body: notification.body,
    tag: notification.tag,
    url: `${APP_URL}#/?secao=${notification.section}`,
    ...(actionToken && buttons ? { actions: buttons.actions, actionToken, actionUrl: ACTION_URL } : {}),
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

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`

type ActionRow = {
  owner_id: string
  local_date: string
  kind: ReminderKind
  ref_id: string
  ml: number | null
  used_at: string | null
  created_at: string
}

/** Toque num botão da notificação. Devolve a mensagem de confirmação. */
async function notificationAction(token: string, choice: "done" | "snooze"): Promise<string> {
  const { data: row, error } = await admin
    .from("notification_actions")
    .select("owner_id, local_date, kind, ref_id, ml, used_at, created_at")
    .eq("token", token)
    .maybeSingle()
  if (error) throw error
  const a = row as ActionRow | null
  if (!a || Date.now() - new Date(a.created_at).getTime() > 24 * 3600_000) {
    return "Este lembrete expirou. Abra o app para registrar."
  }
  if (a.used_at) return "Já feito."
  // Uso único: marca antes de agir (dois toques rápidos não registram duas vezes).
  const { data: claimed } = await admin
    .from("notification_actions")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select("token")
  if (!claimed?.length) return "Já feito."

  if (choice === "snooze") {
    const sendAt = new Date(Date.now() + SNOOZE_MIN * 60_000)
    await admin.from("reminder_snoozes").insert({
      owner_id: a.owner_id,
      local_date: a.local_date,
      kind: a.kind,
      ref_id: a.ref_id,
      send_at: sendAt.toISOString(),
    })
    // Adiar substitui a repetição automática de 30 min.
    if (a.kind === "meal") {
      await admin
        .from("reminder_sends")
        .upsert(
          { owner_id: a.owner_id, local_date: a.local_date, kind: "meal", ref_id: a.ref_id, attempt: 2 },
          { onConflict: "owner_id,local_date,kind,ref_id,attempt", ignoreDuplicates: true },
        )
    }
    const { data: profile } = await admin.from("profiles").select("timezone").eq("id", a.owner_id).maybeSingle()
    const tz = (profile?.timezone as string | undefined) ?? "America/Sao_Paulo"
    return `Adiado para ${hhmm(localNow(tz, sendAt).minutes)}.`
  }

  // O peso precisa ser digitado: o botão "Registrar" abre o app (não chega aqui).
  if (a.kind === "weight") return "Abra o app para registrar o peso."

  if (a.kind === "meal") {
    const { data: meal } = await admin
      .from("meals")
      .select("id, name, time")
      .eq("id", a.ref_id)
      .eq("owner_id", a.owner_id)
      .maybeSingle()
    if (!meal) return "Não encontrei a refeição. Abra o app para registrar."
    const m = meal as { id: string; name: string; time: string }
    // Se já estava registrada (ex.: com trocas), não mexe.
    const { error: logError } = await admin.from("meal_logs").upsert(
      {
        owner_id: a.owner_id,
        meal_id: m.id,
        log_date: a.local_date,
        meal_name: m.name,
        meal_time: m.time,
        done_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,log_date,meal_id", ignoreDuplicates: true },
    )
    if (logError) throw logError
    return `Registrado: ${m.name}.`
  }

  const ml = a.ml ?? 250
  const { error: waterError } = await admin.from("water_logs").insert({ owner_id: a.owner_id, log_date: a.local_date, ml })
  if (waterError) throw waterError
  return `Registrado: ${ml} mL de água.`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Use POST." }, 405)

  let body: { action?: string; token?: string; choice?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: "Corpo inválido." }, 400)
  }
  const action = body.action ?? ""

  try {
    if (action === "dispatch") {
      const secret = req.headers.get("x-cron-secret") ?? ""
      const { data: valid } = await admin.rpc("push_check_cron_secret", { secret })
      if (!valid) return json({ error: "Não autorizado." }, 401)
      return json(await dispatch())
    }

    if (action === "notification-action") {
      const token = body.token ?? ""
      if (!/^[0-9a-f-]{36}$/i.test(token) || (body.choice !== "done" && body.choice !== "snooze")) {
        return json({ error: "Pedido inválido." }, 400)
      }
      return json({ message: await notificationAction(token, body.choice) })
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
