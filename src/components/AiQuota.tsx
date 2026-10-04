import type { AiAccess } from '../lib/ai'
import { quotaPercent } from '../lib/ai'

/** Mês seguinte, para "renova em 1º de novembro". A cota zera no dia 1º (UTC). */
function renewLabel(now = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return `1º de ${next.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })}`
}

/** Barra com quanto da cota mensal de IA já foi usado. */
export function AiQuotaBar({ access }: { access: AiAccess }) {
  const used = quotaPercent(access.monthSpentUsd, access.monthLimitUsd)
  const level = used >= 100 ? 'full' : used >= 80 ? 'high' : 'ok'
  return (
    <div className="quota">
      <div className="quota-head">
        <span>Uso da IA neste mês</span>
        <strong>{used}%</strong>
      </div>
      <div
        className={`quota-bar quota-${level}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={used}
        aria-label="Uso da cota de IA neste mês"
      >
        <span style={{ width: `${Math.min(used, 100)}%` }} />
      </div>
      <small className="muted">
        {used >= 100 ? 'Cota esgotada. ' : `Restam ${100 - used}%. `}A cota renova em {renewLabel()}.
      </small>
    </div>
  )
}
