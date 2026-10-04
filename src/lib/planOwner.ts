import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { fetchMember } from './household'

/**
 * De quem é o plano nas telas "Meu plano" e "Novo plano": do próprio usuário,
 * ou de uma pessoa da casa (?pessoa=<id> no endereço).
 */
export function usePlanOwner() {
  const [params] = useSearchParams()
  const memberId = params.get('pessoa')
  const fromOnboarding = params.get('de') === 'comecar'
  const [loaded, setLoaded] = useState<{ id: string; nickname: string | null } | null>(null)

  useEffect(() => {
    if (!memberId) return
    let active = true
    fetchMember(memberId)
      .then((m) => active && setLoaded({ id: memberId, nickname: m?.nickname ?? null }))
      .catch(() => active && setLoaded({ id: memberId, nickname: null }))
    return () => {
      active = false
    }
  }, [memberId])

  const nickname = memberId && loaded?.id === memberId ? loaded.nickname : null
  return {
    memberId,
    /** Pessoa da casa ainda carregando (o título espera, para não piscar "Meu plano"). */
    loading: !!memberId && loaded?.id !== memberId,
    title: memberId ? `Plano de ${nickname ?? '…'}` : 'Meu plano',
    /** Para onde voltar depois de salvar. */
    homePath: memberId ? (fromOnboarding ? '/casa?de=comecar' : '/casa') : fromOnboarding ? '/comecar' : '/',
    homeLabel: memberId ? 'Minha casa' : 'Hoje',
    /** "Voltar" da tela "Novo plano". */
    backFromNew: fromOnboarding
      ? memberId
        ? { path: '/casa?de=comecar', label: 'Minha casa' }
        : { path: '/comecar', label: 'os primeiros passos' }
      : { path: memberId ? `/plano?pessoa=${memberId}` : '/plano', label: memberId ? `Plano de ${nickname ?? '…'}` : 'Meu plano' },
    /** O mesmo caminho, levando a pessoa junto. */
    withOwner: (path: string) => (memberId ? `${path}?pessoa=${memberId}${fromOnboarding ? '&de=comecar' : ''}` : path),
  }
}
