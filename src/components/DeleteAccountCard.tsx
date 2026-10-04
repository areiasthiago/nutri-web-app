import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

// "Minha conta": apagar a conta e todos os dados pelo próprio app (briefing,
// seção 10). Quem apaga é a Edge Function "delete-account"; aqui só a
// confirmação, digitando APAGAR.

const client = supabase as SupabaseClient

/** Aviso para a tela de login depois de apagar a conta. */
export const ACCOUNT_DELETED_FLAG = 'nutrie:conta-apagada'

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    const { error: fnError } = await client.functions.invoke('delete-account', { body: { confirm: 'APAGAR' } })
    if (fnError) {
      let message = 'Não foi possível apagar a conta agora. Tente de novo em instantes.'
      if (fnError instanceof FunctionsHttpError) {
        const body = await fnError.context.json().catch(() => null)
        if (body?.error) message = body.error
      }
      setError(message)
      setBusy(false)
      return
    }
    try {
      localStorage.setItem(ACCOUNT_DELETED_FLAG, '1')
    } catch {
      // sem armazenamento: só não mostra o aviso
    }
    // A conta já não existe: limpa a sessão deste aparelho e volta ao login.
    await client.auth.signOut({ scope: 'local' }).catch(() => {})
    window.location.replace(`${import.meta.env.BASE_URL}#/login`)
  }

  return (
    <section className="info-card form-card delete-card">
      <h2>Apagar conta</h2>
      <p className="muted">
        Apaga o seu login e todos os seus dados: planos (os seus e os de quem mora com você), registros de refeições,
        água e fora de hora, estatísticas, lista de compras, lembretes e uso de IA. Não dá para desfazer.
      </p>
      {!open ? (
        <button type="button" className="btn btn-outline danger-outline" onClick={() => setOpen(true)}>
          Apagar minha conta
        </button>
      ) : (
        <>
          <p>
            Para voltar a usar o Nutriê depois, será preciso um novo convite. Para confirmar, digite <strong>APAGAR</strong>:
          </p>
          <label className="field">
            <span className="sr-only">Confirmação</span>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="APAGAR"
            />
          </label>
          {error && <p className="banner banner-error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy || typed.trim().toUpperCase() !== 'APAGAR'}>
              {busy ? 'Apagando…' : 'Apagar tudo agora'}
            </button>
            <button
              type="button"
              className="btn btn-outline-neutral"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError(null)
              }}
              disabled={busy}
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </section>
  )
}
