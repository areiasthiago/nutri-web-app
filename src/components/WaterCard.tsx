import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { formatNumber, formatTime } from '../lib/plan'
import type { HydrationSlot } from '../lib/plan'
import {
  addWater,
  deleteWater,
  expectedByNow,
  fetchWaterLogs,
  quickAmounts,
  remainingMl,
  slotStatuses,
  totalMl,
} from '../lib/water'
import type { WaterLog } from '../lib/water'

type Props = {
  targetMl: number
  slots: HydrationSlot[]
  /** Dia local do usuário (AAAA-MM-DD). */
  date: string
  nowMinutes: number
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Água do dia: progresso contra a meta, registro em um toque e o protocolo do plano como guia. */
export function WaterCard({ targetMl, slots, date, nowMinutes }: Props) {
  const [logs, setLogs] = useState<{ date: string; rows: WaterLog[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState('')

  useEffect(() => {
    let active = true
    fetchWaterLogs(date)
      .then((rows) => active && setLogs({ date, rows }))
      .catch(() => active && setError('Não foi possível carregar a água de hoje.'))
    return () => {
      active = false
    }
  }, [date])

  const rows = logs?.date === date ? logs.rows : []
  const intake = totalMl(rows)
  const remaining = remainingMl(targetMl, intake)
  const percent = Math.min(100, Math.round((intake / targetMl) * 100))
  const statuses = slotStatuses(slots, intake, nowMinutes)
  const expected = expectedByNow(slots, nowMinutes)
  // Próximo horário pelo relógio (os que já passaram aparecem na lista, em laranja).
  const nextSlot = statuses.find((s) => !s.due)

  async function add(ml: number) {
    setError(null)
    setBusy(true)
    try {
      const row = await addWater(date, ml)
      setLogs((prev) => ({ date, rows: [row, ...(prev?.date === date ? prev.rows : [])] }))
    } catch {
      setError('Não foi possível registrar agora. Confira a internet e tente de novo.')
    }
    setBusy(false)
  }

  async function remove(id: string) {
    setError(null)
    try {
      await deleteWater(id)
      setLogs((prev) => ({ date, rows: (prev?.rows ?? []).filter((r) => r.id !== id) }))
    } catch {
      setError('Não foi possível apagar agora. Tente de novo.')
    }
  }

  async function handleCustom(e: FormEvent) {
    e.preventDefault()
    const ml = Math.round(Number(custom.replace(',', '.')))
    if (!Number.isFinite(ml) || ml < 1 || ml > 5000) {
      setError('Digite um valor entre 1 e 5.000 mL.')
      return
    }
    await add(ml)
    setCustom('')
    setCustomOpen(false)
  }

  return (
    <section className="info-card water-card" aria-label="Água de hoje">
      <div className="water-head">
        <h2>Água</h2>
        <p className="water-amount">
          <strong>{formatNumber(intake)}</strong> / {formatNumber(targetMl)} mL
        </p>
      </div>

      <div
        className="quota-bar water-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={targetMl}
        aria-valuenow={intake}
        aria-label="Água bebida hoje"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="water-status">
        {remaining === 0 ? (
          <strong>Meta do dia batida!</strong>
        ) : (
          <>
            Faltam <strong>{formatNumber(remaining)} mL</strong>
            {expected > intake && <span className="muted"> · pelos horários, já seriam {formatNumber(expected)} mL</span>}
          </>
        )}
      </p>

      {error && <p className="banner banner-error">{error}</p>}

      <div className="water-buttons">
        {quickAmounts(slots).map((ml) => (
          <button key={ml} type="button" className="btn water-button" disabled={busy || !logs} onClick={() => add(ml)}>
            +{ml}
            <small> mL</small>
          </button>
        ))}
        <button
          type="button"
          className="btn water-button water-button-other"
          disabled={busy || !logs}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((o) => !o)}
        >
          Outro
        </button>
      </div>

      {customOpen && (
        <form className="water-custom" onSubmit={handleCustom}>
          <input
            inputMode="numeric"
            placeholder="mL"
            aria-label="Quantidade em mL"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Registrar
          </button>
        </form>
      )}

      {nextSlot && (
        <p className="water-next">
          Próximo horário do plano: <strong>{formatTime(nextSlot.time)}</strong> · {nextSlot.ml} mL
          {nextSlot.label && ` · ${nextSlot.label}`}
        </p>
      )}

      {statuses.length > 0 && (
        <details className="water-details">
          <summary>Horários do plano ({statuses.filter((s) => s.reached).length} de {statuses.length})</summary>
          <ul className="water-slots">
            {statuses.map((s) => (
              <li key={s.id} className={s.reached ? 'is-reached' : s.due ? 'is-due' : undefined}>
                <span className="water-slot-mark" aria-hidden="true">
                  {s.reached ? '✓' : '○'}
                </span>
                <span className="water-slot-time">{formatTime(s.time)}</span>
                <span className="water-slot-label">{s.label ?? 'Água'}</span>
                <span className="water-slot-ml">{s.ml} mL</span>
              </li>
            ))}
          </ul>
          {statuses[statuses.length - 1].cumulativeMl !== targetMl && (
            <p className="muted water-note">
              Os horários somam {formatNumber(statuses[statuses.length - 1].cumulativeMl)} mL. O progresso é medido
              contra a meta de {formatNumber(targetMl)} mL.
            </p>
          )}
        </details>
      )}

      {rows.length > 0 && (
        <details className="water-details">
          <summary>Registros de hoje ({rows.length})</summary>
          <ul className="water-logs">
            {rows.map((r) => (
              <li key={r.id}>
                <span>{timeOf(r.logged_at)}</span>
                <span>{r.ml} mL</span>
                <button type="button" className="btn-link water-remove" onClick={() => remove(r.id)}>
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
