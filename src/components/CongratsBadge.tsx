import { useState } from 'react'
import alface from '../assets/mascots/alface.webp'
import cenoura from '../assets/mascots/cenoura.webp'
import tomate from '../assets/mascots/tomate.webp'
import logoLockup from '../assets/brand/logo-lockup.svg'
import logoMark from '../assets/logo-mark.svg'
import type { Achievement, Mascot } from '../lib/stats'
import { SERIES_COLOR } from './StatTile'
import type { StatTileData } from './StatTile'
import { Wordmark } from './Wordmark'

// Selo de parabéns quando a pessoa está mandando bem, com compartilhamento nas
// redes. Compartilha só a conquista (nada do plano, comidas ou números de dieta).

const APP_URL = 'https://areiasthiago.github.io/nutri-web-app/'

/** Um mascote por período: alface no dia, tomate na semana, cenoura (comemorando) no mês. */
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

/**
 * Imagem do selo para postar: fundo creme, logo, mascote e o título, e embaixo
 * só os números em porcentagem do período (nada de calorias ou quantidades).
 * Quadrada (1080×1080) com uma linha de quadros.
 */
async function badgeImage(a: Achievement, tiles: StatTileData[]): Promise<File | null> {
  const W = 1080
  const PAD = 48
  const gap = 28
  const cardH = 560
  const tilesY = PAD + cardH + gap
  const th = 396
  // Até 3 quadros lado a lado (2 se forem só 2 ou 4).
  const cols = tiles.length % 3 === 0 || tiles.length === 1 ? Math.min(3, tiles.length) : 2
  const rows = Math.ceil(tiles.length / cols)
  const H = tilesY + rows * th + Math.max(0, rows - 1) * gap + PAD
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const font = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  const box = (x: number, y: number, w: number, h: number, r: number, fill: string, shadow = false) => {
    ctx.save()
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.12)'
      ctx.shadowBlur = 14
      ctx.shadowOffsetY = 4
    }
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = '#fdf1e1'
  ctx.fillRect(0, 0, W, H)

  const logo = await loadImage(logoLockup)
  const lh = 96
  const lw = (1358 / 435) * lh
  const pillW = lw + 96
  box((W - pillW) / 2, PAD + 36, pillW, lh + 40, (lh + 40) / 2, '#ffffff', true)
  ctx.drawImage(logo, (W - lw) / 2, PAD + 56, lw, lh)

  const mascot = await loadImage(MASCOTS[a.mascot].src)
  const mh = 330
  const mw = (mascot.width / mascot.height) * mh
  const mTop = PAD + 200
  const mx = PAD + 50 + (240 - mw) / 2
  ctx.drawImage(mascot, mx, mTop, mw, mh)

  const textX = PAD + 330
  const textW = W - PAD - 40 - textX
  ctx.font = font(500, 40)
  const lines = wrap(ctx, a.detail, textW)
  const blockH = 72 + lines.length * 54
  let ty = mTop + mh / 2 - blockH / 2 + 56
  ctx.textAlign = 'left'
  ctx.fillStyle = '#7a4600'
  ctx.font = font(800, 62)
  ctx.fillText(a.title, textX, ty)
  ctx.font = font(500, 40)
  ty += 70
  lines.forEach((line, i) => ctx.fillText(line, textX, ty + i * 54))

  // Quadros com as porcentagens
  const tw = (W - 2 * PAD - gap * (cols - 1)) / cols
  const narrow = cols === 3
  const inset = narrow ? 30 : 40
  tiles.forEach((t, i) => {
    const x = PAD + (i % cols) * (tw + gap)
    const y = tilesY + Math.floor(i / cols) * (th + gap)
    box(x, y, tw, th, 36, '#ffffff', true)
    const ix = x + inset
    const iw = tw - 2 * inset
    ctx.textAlign = 'left'
    ctx.fillStyle = '#5b655f'
    ctx.font = font(500, narrow ? 34 : 40)
    const labelLines = wrap(ctx, t.label, iw).slice(0, 2)
    labelLines.forEach((line, j) => ctx.fillText(line, ix, y + 70 + j * 42))
    const vy = y + 210
    ctx.fillStyle = '#16201b'
    // Diminui o número até caber no quadro (ex.: "23 de 30").
    let size = narrow ? 88 : 112
    ctx.font = font(800, size)
    while (ctx.measureText(t.value).width > iw && size > 40) ctx.font = font(800, (size -= 4))
    ctx.fillText(t.value, ix, vy)
    if (t.sub) {
      ctx.fillStyle = '#5b655f'
      ctx.font = font(400, narrow ? 29 : 34)
      wrap(ctx, t.sub, iw)
        .slice(0, 2)
        .forEach((line, j) => ctx.fillText(line, ix, vy + 58 + j * 38))
    }
    if (t.meter !== undefined) {
      box(ix, y + th - 56, iw, 18, 9, '#e1e6e3')
      const fill = Math.max(18, (Math.min(100, t.meter) / 100) * iw)
      box(ix, y + th - 56, fill, 18, 9, t.series ? SERIES_COLOR[t.series] : '#237f58')
    }
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? new File([blob], 'nutrie-conquista.png', { type: 'image/png' }) : null
}

export function CongratsBadge({ achievement, tiles }: { achievement: Achievement; tiles: StatTileData[] }) {
  const [message, setMessage] = useState<string | null>(null)
  const text = `${achievement.title} ${achievement.detail} 🥕 #Nutriê`

  async function share() {
    setMessage(null)
    try {
      const file = await badgeImage(achievement, tiles)
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
