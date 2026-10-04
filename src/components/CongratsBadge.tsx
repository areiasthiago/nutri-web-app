import { useState } from 'react'
import alface from '../assets/mascots/alface.webp'
import cenoura from '../assets/mascots/cenoura.webp'
import tomate from '../assets/mascots/tomate.webp'
import logoLockup from '../assets/brand/logo-lockup.svg'
import logoMark from '../assets/logo-mark.svg'
import type { Achievement, Mascot } from '../lib/stats'
import { Wordmark } from './Wordmark'

// Selo de parabéns quando a pessoa está mandando bem, com compartilhamento nas
// redes. Compartilha só a conquista (nada do plano, comidas ou números de dieta).

const APP_URL = 'https://areiasthiago.github.io/nutri-web-app/'

/** Um mascote por período: tomate no dia, alface na semana, cenoura (comemorando) no mês. */
const MASCOTS: Record<Mascot, { src: string; alt: string }> = {
  tomate: { src: tomate, alt: 'Tomate sorridente' },
  alface: { src: alface, alt: 'Alface sorridente de gravatinha' },
  cenoura: { src: cenoura, alt: 'Cenoura comemorando com os braços para cima' },
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Quebra o texto em linhas que cabem na largura (para o canvas). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else line = test
  }
  if (line) lines.push(line)
  return lines
}

/** Imagem quadrada do selo (1080×1080) para postar. */
async function badgeImage(a: Achievement): Promise<File | null> {
  const size = 1080
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const font = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

  const bg = ctx.createLinearGradient(0, 0, size, size)
  bg.addColorStop(0, '#104030')
  bg.addColorStop(1, '#237f58')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, size, size)

  const cx = size / 2

  // Logo em destaque, numa faixa branca no topo
  const logo = await loadImage(logoLockup)
  const lh = 120
  const lw = (1358 / 435) * lh
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.roundRect(cx - lw / 2 - 48, 48, lw + 96, lh + 48, (lh + 48) / 2)
  ctx.fill()
  ctx.drawImage(logo, cx - lw / 2, 72, lw, lh)

  // Mascote sobre um halo claro
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.arc(cx, 470, 210, 0, Math.PI * 2)
  ctx.fill()
  const mascot = await loadImage(MASCOTS[a.mascot].src)
  const mh = 390
  const mw = (mascot.width / mascot.height) * mh
  ctx.drawImage(mascot, cx - mw / 2, 275, mw, mh)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = font(800, 80)
  ctx.fillText(a.title, cx, 790)
  ctx.font = font(500, 44)
  wrap(ctx, a.detail, 880).forEach((line, i) => ctx.fillText(line, cx, 870 + i * 58))

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? new File([blob], 'nutrie-conquista.png', { type: 'image/png' }) : null
}

export function CongratsBadge({ achievement }: { achievement: Achievement }) {
  const [message, setMessage] = useState<string | null>(null)
  const text = `${achievement.title} ${achievement.detail} 🥕 #Nutriê`

  async function share() {
    setMessage(null)
    try {
      const file = await badgeImage(achievement)
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
