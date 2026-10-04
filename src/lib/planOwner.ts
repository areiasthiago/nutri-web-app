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
    homePath: memberId ? '/casa' : '/',
    homeLabel: memberId ? 'Minha casa' : 'Hoje',
    /** O mesmo caminho, levando a pessoa junto. */
    withOwner: (path: string) => (memberId ? `${path}?pessoa=${memberId}` : path),
  }
}
