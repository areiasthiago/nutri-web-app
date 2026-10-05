import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { DEFAULT_PREFS, fetchReminderPrefs, saveReminderPrefs } from '../lib/push'
import type { ReminderPrefs } from '../lib/push'
import { fetchActivePlan } from '../lib/plan'
import { AUTO_QUIET_AFTER_LAST_MEAL_MIN, REPEAT_AFTER_MIN } from '../../supabase/functions/_shared/reminders'
import { TimeField } from './TimeField'

// "Minha conta": quais lembretes mandar, com que antecedência e o horário de
// silêncio. As regras ficam em supabase/functions/_shared/reminders.ts.

const LEAD_OPTIONS = [
  { value: 0, label: 'Na hora' },
  { value: 5, label: '5 min antes' },
  { value: 10, label: '10 min antes' },
  { value: 15, label: '15 min antes' },
  { value: 30, label: '30 min antes' },
]

const toHHMM = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function ReminderPrefsForm() {
  const [prefs, setPrefs] = useState<ReminderPrefs | null>(null)
  /** Início automático do silêncio (31 min depois da última refeição do plano). */
  const [autoStart, setAutoStart] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    fetchReminderPrefs()
      .then((p) => active && setPrefs(p))
      .catch(() => active && setPrefs(DEFAULT_PREFS))
    fetchActivePlan()
      .then((plan) => {
        if (!active || !plan?.meals.length) return
        const last = Math.max(...plan.meals.map((m) => Number(m.time.slice(0, 2)) * 60 + Number(m.time.slice(3, 5))))
        setAutoStart(toHHMM(last + AUTO_QUIET_AFTER_LAST_MEAL_MIN))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  if (!prefs) return null
  const update = (changes: Partial<ReminderPrefs>) => {
    setPrefs({ ...prefs, ...changes })
    setMessage(null)
  }
  const customQuiet = prefs.quiet_start !== null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!prefs) return
    if (customQuiet && !prefs.quiet_start) {
      setMessage({ kind: 'error', text: 'Informe o início do silêncio.' })
      return
    }
    if (!prefs.quiet_end) {
      setMessage({ kind: 'error', text: 'Informe o fim do silêncio.' })
      return
    }
    setSaving(true)
    try {
      await saveReminderPrefs(prefs)
      setMessage({ kind: 'info', text: 'Lembretes salvos.' })
    } catch {
      setMessage({ kind: 'error', text: 'Não foi possível salvar agora. Tente de novo.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="info-card form-card" onSubmit={handleSubmit}>
      <h2>Lembretes</h2>

      <label className="check-row">
        <input type="checkbox" checked={prefs.meals_enabled} onChange={(e) => update({ meals_enabled: e.target.checked })} />
        <span>
          Refeições
          <small className="muted">
            No horário de cada refeição. Se não registrar, lembra mais uma vez {REPEAT_AFTER_MIN} min depois.
          </small>
        </span>
      </label>

      <label className="check-row">
        <input type="checkbox" checked={prefs.water_enabled} onChange={(e) => update({ water_enabled: e.target.checked })} />
        <span>
          Água
          <small className="muted">Nos horários do protocolo do plano. Pula se a água já estiver em dia.</small>
        </span>
      </label>

      <label className="check-row">
        <input type="checkbox" checked={prefs.weight_enabled} onChange={(e) => update({ weight_enabled: e.target.checked })} />
        <span>
          Peso
          <small className="muted">
            Todo dia às {prefs.quiet_end || '06:30'}, quando o silêncio acaba. Pula se o peso do dia já estiver registrado.
          </small>
        </span>
      </label>

      <label className="field">
        <span>Quando avisar</span>
        <select value={prefs.lead_minutes} onChange={(e) => update({ lead_minutes: Number(e.target.value) })}>
          {LEAD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="quiet-fieldset">
        <legend>Silêncio (nenhum lembrete)</legend>
        <label className="check-row">
          <input type="radio" name="quiet" checked={!customQuiet} onChange={() => update({ quiet_start: null })} />
          <span>
            Automático{autoStart ? `: a partir das ${autoStart}` : ''}
            <small className="muted">{AUTO_QUIET_AFTER_LAST_MEAL_MIN} min depois da última refeição do plano.</small>
          </span>
        </label>
        <label className="check-row">
          <input
            type="radio"
            name="quiet"
            checked={customQuiet}
            onChange={() => update({ quiet_start: autoStart ?? '22:30' })}
          />
          <span>Escolher o horário</span>
        </label>
        <div className="quiet-times">
          {customQuiet && (
            <label className="field">
              <span>Começa às</span>
              <TimeField value={prefs.quiet_start ?? ''} onChange={(v) => update({ quiet_start: v || '' })} ariaLabel="Início do silêncio" />
            </label>
          )}
          <label className="field">
            <span>Termina às</span>
            <TimeField value={prefs.quiet_end} onChange={(v) => update({ quiet_end: v })} ariaLabel="Fim do silêncio" />
          </label>
        </div>
      </fieldset>

      {message && <p className={`banner banner-${message.kind}`}>{message.text}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar lembretes'}
      </button>
    </form>
  )
}
