import { useState } from 'react'
import alface from '../assets/mascots/alface.webp'
import cenoura from '../assets/mascots/cenoura.webp'
import tomate from '../assets/mascots/tomate.webp'
import logoMark from '../assets/logo-mark.svg'
import { renderShareImage } from '../lib/shareImage'
import type { ShareSummary } from '../lib/shareImage'
import type { Achievement, Mascot } from '../lib/stats'
import { Wordmark } from './Wordmark'

// Selo de parabéns quando a pessoa está mandando bem, com compartilhamento nas
// redes: a imagem "Meu resumo" (src/lib/shareImage.ts) leva só porcentagens e
// contagens, nada de calorias, quantidades ou o que foi comido.

const APP_URL = 'https://areiasthiago.github.io/nutri-web-app/'

/** Um mascote por período: alface no dia, tomate na semana, cenoura no mês. */
const MASCOTS: Record<Mascot, { src: string; alt: string }> = {
  tomate: { src: tomate, alt: 'Tomate pulando de alegria' },
  alface: { src: alface, alt: 'Alface de gravatinha acenando' },
  cenoura: { src: cenoura, alt: 'Cenoura fazendo joinha com as duas mãos' },
}

/** O que vai na imagem além da conquista e do mascote. */
export type ShareContent = Omit<ShareSummary, 'achievement' | 'mascotSrc'>

export function CongratsBadge({ achievement, share: content }: { achievement: Achievement; share: ShareContent }) {
  const [message, setMessage] = useState<string | null>(null)
  const text = `${content.heading}: ${achievement.title} 🥕 #Nutriê`

  async function share() {
    setMessage(null)
    try {
      const file = await renderShareImage({ ...content, achievement: achievement.title, mascotSrc: MASCOTS[achievement.mascot].src })
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
        return
      }
      if (navigator.share) {
        await navigator.share({ title: achievement.title, text, url: APP_URL })
        return
      }
      // Sem compartilhamento nativo (computador): copia o texto e baixa a imagem.
      await navigator.clipboard?.writeText(`${text} ${APP_URL}`)
      if (file) {
        const url = URL.createObjectURL(file)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
        URL.revokeObjectURL(url)
      }
      setMessage('Texto copiado e imagem baixada. É só colar na rede social.')
    } catch (e) {
      // Fechar a janela de compartilhar não é erro.
      if ((e as Error).name !== 'AbortError') setMessage('Não deu para compartilhar agora.')
    }
  }

  return (
    <section className="congrats-badge" aria-label="Conquista">
      <div className="congrats-brand-row">
        <div className="congrats-brand">
          <img src={logoMark} alt="" width={30} height={28} />
          <Wordmark height={22} />
        </div>
      </div>
      <img className="congrats-mascot" src={MASCOTS[achievement.mascot].src} alt={MASCOTS[achievement.mascot].alt} />
      <div className="congrats-text">
        <h2>{achievement.title}</h2>
        <p>{achievement.detail}</p>
        <button type="button" className="btn btn-small congrats-share" onClick={share}>
          Compartilhar
        </button>
        {message && <p className="congrats-message">{message}</p>}
      </div>
    </section>
  )
}
