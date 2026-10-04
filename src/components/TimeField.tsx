import { useRef, useState } from 'react'
import { maskTime, normalizeTime } from '../lib/timeText'

type Props = {
  /** "HH:MM" ou "" (vazio/inválido). */
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
}

/**
 * Horário que dá para digitar (teclado numérico, ":" automático: "730" vira
 * 07:30) ou escolher no relógio do celular pelo ícone ao lado.
 */
export function TimeField({ value, onChange, ariaLabel }: Props) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  const picker = useRef<HTMLInputElement>(null)

  // Valor mudou por fora (relógio, outro estado): mostra o novo.
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }

  function handleType(raw: string) {
    const masked = maskTime(raw)
    setText(masked)
    const digits = masked.replace(/\D/g, '')
    // Com 3 ou 4 dígitos já dá para saber o horário; com menos, espera sair do campo.
    const normalized = digits.length >= 3 ? normalizeTime(masked) : null
    setLastValue(normalized ?? '')
    onChange(normalized ?? '')
  }

  function handleBlur() {
    const normalized = normalizeTime(text)
    setText(normalized ?? text)
    setLastValue(normalized ?? '')
    onChange(normalized ?? '')
  }

  function openPicker() {
    const input = picker.current
    if (!input) return
    try {
      input.showPicker()
    } catch {
      input.focus()
      input.click()
    }
  }

  return (
    <div className="time-field">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="hh:mm"
        maxLength={5}
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => handleType(e.target.value)}
        onBlur={handleBlur}
      />
      <button type="button" className="time-field-clock" aria-label="Escolher no relógio" onClick={openPicker}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      {/* Seletor nativo, escondido: abre pelo ícone. */}
      <input
        ref={picker}
        type="time"
        className="time-field-native"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => {
          setText(e.target.value)
          setLastValue(e.target.value)
          onChange(e.target.value)
        }}
      />
    </div>
  )
}
