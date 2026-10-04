// Horário digitado à mão ("730", "19:3", "7h30") -> "HH:MM".

/** Máscara enquanto digita: só números, ":" antes dos dois últimos dígitos ("730" -> "7:30"). */
export function maskTime(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}`
}

/** "7:30" / "0730" / "19" / "7h30" -> "07:30" / "07:30" / "19:00" / "07:30"; inválido -> null. */
export function normalizeTime(text: string): string | null {
  const digits = text.replace(/\D/g, '')
  if (!digits || digits.length > 4) return null
  const hour = Number(digits.length <= 2 ? digits : digits.slice(0, digits.length - 2))
  const minute = digits.length <= 2 ? 0 : Number(digits.slice(-2))
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}
