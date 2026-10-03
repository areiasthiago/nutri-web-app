import { useEffect, useState } from 'react'
import { currentTheme, onSystemThemeChange, setTheme } from '../lib/theme'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

/**
 * Inverte o tema atual. `floating`: fixo no canto da tela (telas sem
 * cabeçalho, como login e convite); senão, fica dentro do cabeçalho.
 */
export function ThemeToggle({ floating = false }: { floating?: boolean }) {
  const [theme, setThemeState] = useState(currentTheme)

  // Sem escolha salva, acompanha quando o sistema muda de tema.
  useEffect(() => onSystemThemeChange(() => setThemeState(currentTheme())), [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  const label = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'

  return (
    <button
      type="button"
      className={floating ? 'icon-button theme-toggle-floating' : 'icon-button'}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
