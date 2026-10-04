// Edge Function "push": Web Push do Nutriê.
//
// Ações (POST com JSON {action}):
// - "public-key": devolve a chave pública VAPID para o aparelho se inscrever
//   (pessoa logada). Na primeira vez, gera o par de chaves e guarda no Vault.
// - "dispatch": chamada pelo agendamento do banco a cada minuto (cabeçalho
//   x-cron-secret). Envia as notificações de teste que venceram e apaga as
//   inscrições que o serviço de push diz que não existem mais.
//
// O texto da notificação não traz dado de saúde (aparece na tela bloqueada).

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import * as webpush from "jsr:@negrel/webpush@0.5.0"
import { createClient } from "npm:@supabase/supabase-js@2"

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

async function dispatch() {
  const { data: due, error } = await admin
    .from("push_tests")
    .select("id, owner_id")
    .is("sent_at", null)
    .lte("send_at", new Date().toISOString())
    .limit(50)
  if (error) throw error
  if (!due?.length) return { sent: 0 }

  const server = await webpush.ApplicationServer.new({ contactInformation: CONTACT, vapidKeys: await vapidKeys() })
  let sent = 0
  for (const t of due as { id: string; owner_id: string }[]) {
    const r = await sendToOwner(server, t.owner_id, {
      title: "Nutriê",
      body: "Teste: o lembrete chegou com o app fechado.",
      url: APP_URL,
      tag: "nutrie-teste",
    })
    sent += r.ok
    const result =
      r.total === 0
        ? "nenhum aparelho inscrito"
        : `enviado para ${r.ok} de ${r.total} aparelho(s)${r.errors.length ? ` — ${r.errors.join("; ")}` : ""}`
    await admin.from("push_tests").update({ sent_at: new Date().toISOString(), result: result.slice(0, 500) }).eq("id", t.id)
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
