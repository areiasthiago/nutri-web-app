// Fusos do Brasil. Se o perfil tiver outro (ex.: alguém morando fora), ele
// entra na lista também, para o select não "perder" o valor salvo.
export const BRAZIL_TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Sao_Paulo', label: 'Horário de Brasília' },
  { value: 'America/Manaus', label: 'Amazonas, RO, RR (−1h)' },
  { value: 'America/Cuiaba', label: 'MT e MS (−1h)' },
  { value: 'America/Rio_Branco', label: 'Acre (−2h)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (+1h)' },
]

/** Opções do seletor de fuso, incluindo o atual se não for do Brasil. */
export function timezoneOptions(current: string) {
  return BRAZIL_TIMEZONES.some((t) => t.value === current)
    ? BRAZIL_TIMEZONES
    : [...BRAZIL_TIMEZONES, { value: current, label: current }]
}
