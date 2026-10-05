import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useProfile } from '../lib/profile'
import { fetchLatestWeights, formatKg, formatKgDelta, saveWeight } from '../lib/weight'
import type { WeightLog } from '../lib/weight'
import { parseWeight } from '../lib/workouts'

const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`

/**
 * Peso do dia: um registro por dia (registrar de novo troca o valor). Mostra a
 * diferença para o registro anterior, sem julgar. O lembrete chega quando o
 * silêncio acaba (Minha conta → Lembretes).
 */
export function WeightCard({ date }: { date: string }) {
  const { saveProfile } = useProfile()
  const [latest, setLatest] = useState<{ date: string; rows: WeightLog[] } | null>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchLatestWeights(date, 2)
      .then((rows) => active && setLatest({ date, rows }))
      .catch(() => active && setLatest({ date, rows: [] }))
    return () => {
      active = false
    }
  }, [date])

  const rows = latest?.date === date ? latest.rows : []
  const today = rows[0]?.log_date === date ? rows[0] : null
  const previous = today ? rows[1] : rows[0]

  async function submit(e: FormEvent) {
    e.preventDefault()
    const kg = parseWeight(text)
    if (kg === null || kg === undefined) return setError('Informe o peso em kg, entre 25 e 400 (ex.: 82,5).')
    setError(null)
    setBusy(true)
    try {
      const row = await saveWeight(date, kg)
      // O perfil acompanha o registro mais recente (gatilho no banco); aqui só atualiza a tela.
      void saveProfile({ weight_kg: kg })
      setLatest((prev) => ({ date, rows: [row, ...(prev?.rows ?? []).filter((r) => r.log_date !== date)].slice(0, 2) }))
      setEditing(false)
      setText('')
    } catch {
      setError('Não foi possível salvar agora. Confira a internet e tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="info-card weight-card" aria-label="Peso">
      <div className="snack-head">
        <h2>Seu peso hoje</h2>
        {today && !editing && (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setText(formatKg(today.weight_kg))
              setEditing(true)
            }}
          >
            Trocar
          </button>
        )}
      </div>

      {latest === null ? (
        <p className="muted">Carregando…</p>
      ) : today && !editing ? (
        <p className="weight-today">
          <strong>{formatKg(today.weight_kg)} kg</strong>
          {previous && (
            <span className="muted">
              {formatKgDelta(today.weight_kg - previous.weight_kg)} kg desde {ddmm(previous.log_date)}
            </span>
          )}
        </p>
      ) : (
        <form className="weight-form" onSubmit={submit}>
          <label className="field">
            <span>Peso (kg)</span>
            <input
              type="text"
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={previous ? formatKg(previous.weight_kg) : 'Ex.: 82,5'}
              aria-label="Peso em kg"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Registrar'}
          </button>
          {error && <p className="banner banner-error">{error}</p>}
          <p className="muted weight-tip">
            {previous ? `Último registro: ${formatKg(previous.weight_kg)} kg em ${ddmm(previous.log_date)}. ` : ''}
            De preferência de manhã, em jejum, depois do banheiro.
          </p>
        </form>
      )}
    </section>
  )
}
