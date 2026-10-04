import type { AiAccess } from '../lib/ai'
import type { OffPlanFood } from '../lib/mealLogs'
import { formatNumber } from '../lib/plan'
import type { SnackLog } from '../lib/snacks'
import { snackTotals } from '../lib/snacks'
import { FoodEntry } from './FoodEntry'

type Props = {
  snacks: SnackLog[]
  access: AiAccess | null
  onAccessChange: (access: AiAccess) => void
  onAdd: (food: OffPlanFood) => Promise<boolean>
  onRemove: (id: string) => void
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** "Comeu fora de hora?": o que foi comido fora das refeições soma no total do dia. */
export function SnackCard({ snacks, access, onAccessChange, onAdd, onRemove }: Props) {
  const total = snackTotals(snacks)
  return (
    <section className="info-card snack-card" aria-label="Fora de hora">
      <div className="snack-head">
        <h2>Comeu fora de hora?</h2>
        {snacks.length > 0 && <span className="snack-total">+{formatNumber(total.kcal)} kcal</span>}
      </div>

      {snacks.length > 0 && (
        <ul className="snack-list">
          {snacks.map((s) => (
            <li key={s.id}>
              <span className="snack-time">{timeOf(s.logged_at)}</span>
              <span className="snack-name">{s.name}</span>
              <span className="snack-kcal">{s.kcal !== null ? `${formatNumber(s.kcal)} kcal` : ''}</span>
              <button type="button" className="btn-link water-remove" onClick={() => onRemove(s.id)}>
                Apagar
              </button>
            </li>
          ))}
        </ul>
      )}

      <FoodEntry
        access={access}
        onAccessChange={onAccessChange}
        onConfirm={onAdd}
        placeholder="Ex.: um chocolate Baton. Busque o que já registrou ou descreva (quantidade, peso)"
        confirmLabel="Adicionar ao dia"
        manualLabel="Preencher à mão"
      />
    </section>
  )
}
