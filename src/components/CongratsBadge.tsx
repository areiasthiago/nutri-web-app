import { useState } from 'react'
import type { Achievement } from '../lib/stats'

// Selo de parabéns quando a pessoa está mandando bem, com compartilhamento nas
// redes. Compartilha só a conquista (nada do plano, comidas ou números de dieta).

const APP_URL = 'https://areiasthiago.github.io/nutri-web-app/'

function MedalIcon() {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
      <path d="M15 4h8l4 12h-8z" fill="#2f8fd1" />
      <path d="M33 4h-8l-4 12h8z" fill="#f85048" />
      <circle cx="24" cy="29" r="14" fill="#f09820" />
      <circle cx="24" cy="29" r="10" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2" />
      <path d="M24 22.5l2 4.2 4.6.6-3.3 3.2.8 4.6-4.1-2.2-4.1 2.2.8-4.6-3.3-3.2 4.6-.6z" fill="#fff" />
    </svg>
  )
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

  // Medalha
  const cx = size / 2
  ctx.fillStyle = '#2f8fd1'
  ctx.beginPath()
  ctx.moveTo(cx - 150, 150); ctx.lineTo(cx - 50, 150); ctx.lineTo(cx + 10, 330); ctx.lineTo(cx - 90, 330)
  ctx.fill()
  ctx.fillStyle = '#f85048'
  ctx.beginPath()
  ctx.moveTo(cx + 150, 150); ctx.lineTo(cx + 50, 150); ctx.lineTo(cx - 10, 330); ctx.lineTo(cx + 90, 330)
  ctx.fill()
  ctx.fillStyle = '#f09820'
  ctx.beginPath()
  ctx.arc(cx, 420, 150, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.arc(cx, 420, 110, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 70 : 30
    const ang = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.lineTo(cx + r * Math.cos(ang), 420 + r * Math.sin(ang))
  }
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = font(800, 84)
  ctx.fillText(a.title, cx, 690)
  ctx.font = font(500, 46)
  wrap(ctx, a.detail, 860).forEach((line, i) => ctx.fillText(line, cx, 780 + i * 60))
  ctx.font = font(700, 40)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillText('Nutriê', cx, 1000)

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
      <MedalIcon />
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
