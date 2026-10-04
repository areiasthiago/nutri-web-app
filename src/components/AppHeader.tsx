import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import logoMark from '../assets/logo-mark.svg'
import { useAuth } from '../auth/AuthProvider'
import { useProfile } from '../lib/profile'
import { ThemeToggle } from './ThemeToggle'
import { Wordmark } from './Wordmark'

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  )
}

/** Cabeçalho das telas logadas: marca à esquerda; tema e menu da conta à direita. */
export function AppHeader() {
  const { session, signOut } = useAuth()
  const { profile } = useProfile()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fecha ao tocar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <header className="app-header">
      <Link to="/" className="app-brand" aria-label="Nutriê, ir para Hoje">
        <img src={logoMark} alt="" className="app-brand-logo" width={36} height={33} />
        <Wordmark height={26} />
        <span className="version-badge" title={`Versão ${__APP_VERSION__} (${__APP_COMMIT__})`}>
          beta v{__APP_VERSION__}
        </span>
      </Link>

      <div className="app-header-actions" ref={menuRef}>
        <ThemeToggle />
        <button
          type="button"
          className="icon-button"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={menuOpen}
          aria-controls="account-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MenuIcon open={menuOpen} />
        </button>

        {menuOpen && (
          <nav id="account-menu" className="account-menu" aria-label="Conta">
            <div className="account-menu-who">
              {profile.display_name && <strong>{profile.display_name}</strong>}
              <span>{session?.user.email}</span>
            </div>
            <Link to="/plano" className="account-menu-item" onClick={() => setMenuOpen(false)}>
              Meu plano
            </Link>
            <Link to="/estatisticas" className="account-menu-item" onClick={() => setMenuOpen(false)}>
              Estatísticas
            </Link>
            <Link to="/casa" className="account-menu-item" onClick={() => setMenuOpen(false)}>
              Minha casa
            </Link>
            <Link to="/comecar" className="account-menu-item" onClick={() => setMenuOpen(false)}>
              Primeiros passos
            </Link>
            <Link to="/conta" className="account-menu-item" onClick={() => setMenuOpen(false)}>
              Minha conta
            </Link>
            <button type="button" className="account-menu-item account-menu-danger" onClick={() => signOut()}>
              Sair
            </button>
          </nav>
        )}
      </div>
    </header>
  )
}
