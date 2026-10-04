// Edge Function "delete-account": a pessoa apaga a própria conta pelo app
// (briefing, seção 10). Apaga o login e, em cascata, TODOS os dados ligados a
// ele (planos, pessoas da casa, registros, lista de compras, lembretes, uso de
// IA, inscrições de notificação); também tira o e-mail da lista de convites.
//
// Só a própria pessoa (JWT da sessão) e com a confirmação digitada no corpo:
// { "confirm": "APAGAR" }. O app não tem permissão de apagar login sozinho.

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405)

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  })

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const { data: userData, error: userError } = await admin.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: "Sessão expirada. Entre de novo." }, 401)

  let body: { confirm?: string } = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: "Envio inválido." }, 400)
  }
  if (body.confirm !== "APAGAR") return json({ error: "Digite APAGAR para confirmar." }, 400)

  const user = userData.user
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) {
    console.error("delete user failed", deleteError.status)
    return json({ error: "Não foi possível apagar a conta agora. Tente de novo em instantes." }, 500)
  }
  if (user.email) {
    await admin.from("allowed_emails").delete().eq("email", user.email.toLowerCase())
  }
  return json({ deleted: true })
})
