// Tema claro/escuro. Sem escolha salva, o app segue o sistema operacional;
// o botão de trocar tema grava a escolha e marca data-theme no <html>.

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'nutri:theme'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function readSaved(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : null
  } catch {
    return null
  }
}

export function currentTheme(): Theme {
  return readSaved() ?? (darkQuery.matches ? 'dark' : 'light')
}

/** Aplica a escolha salva antes da primeira pintura (chamado em main.tsx). */
export function applySavedTheme() {
  const saved = readSaved()
  if (saved) document.documentElement.dataset.theme = saved
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Sem localStorage: o tema vale só até fechar a página.
  }
}

export function onSystemThemeChange(fn: () => void): () => void {
  darkQuery.addEventListener('change', fn)
  return () => darkQuery.removeEventListener('change', fn)
}
