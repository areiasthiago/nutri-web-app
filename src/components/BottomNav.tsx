import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// Navegação rápida das telas logadas, fixa embaixo: Refeições, Água e Resumo
// são seções da tela Hoje (rola até elas); Estatísticas é uma tela própria.

export type TodaySection = 'refeicoes' | 'agua' | 'resumo'

/** Rola a tela Hoje até a seção (o cabeçalho fixo é compensado por scroll-margin-top no CSS). */
export function scrollToSection(id: TodaySection) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)

const ITEMS: { key: TodaySection | 'estatisticas'; label: string; icon: ReactNode }[] = [
  {
    key: 'refeicoes',
    label: 'Refeições',
    icon: icon(
      <>
        <path d="M4 11h16a8 8 0 0 1-16 0z" />
        <path d="M8 7c0-1.5 1-2.5 2-3M12 7c0-1.5 1-2.5 2-3" />
      </>,
    ),
  },
  { key: 'agua', label: 'Água', icon: icon(<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />) },
  {
    key: 'resumo',
    label: 'Resumo',
    icon: icon(
      <>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>,
    ),
  },
  {
    key: 'estatisticas',
    label: 'Estatísticas',
    icon: icon(
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>,
    ),
  },
]

export function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const onToday = location.pathname === '/'
  const [visible, setVisible] = useState<TodaySection>('refeicoes')

  // Na tela Hoje, destaca a seção que está na tela.
  useEffect(() => {
    if (!onToday) return
    const ids: TodaySection[] = ['refeicoes', 'agua', 'resumo']
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (shown[0]) setVisible(shown[0].target.id as TodaySection)
      },
      { rootMargin: '-80px 0px -45% 0px' },
    )
    // As seções aparecem depois que o plano carrega: observa de novo quando o DOM muda.
    const attach = () => ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    attach()
    const mutation = new MutationObserver(attach)
    mutation.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      mutation.disconnect()
    }
  }, [onToday])

  // Mostra a barra e reserva espaço embaixo para ela (ver --bottom-nav-h no CSS).
  useEffect(() => {
    document.body.classList.add('with-bottom-nav')
    return () => document.body.classList.remove('with-bottom-nav')
  }, [])

  const active = location.pathname.startsWith('/estatisticas') ? 'estatisticas' : onToday ? visible : null

  function go(key: TodaySection | 'estatisticas') {
    if (key === 'estatisticas') {
      navigate('/estatisticas')
      return
    }
    if (onToday) scrollToSection(key)
    else navigate('/', { state: { scrollTo: key } })
  }

  return (
    <nav className="bottom-nav" aria-label="Navegação">
      {ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`bottom-nav-item${active === item.key ? ' is-active' : ''}`}
          aria-current={active === item.key ? 'page' : undefined}
          onClick={() => go(item.key)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
