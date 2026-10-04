import logoLockup from '../assets/brand/logo-lockup.svg'

// Imagem "Meu resumo" para postar nas redes, em primeira pessoa: faixa verde com
// logo, mascote, título e conquista; cartão de destaque e quadros com ícone.
// Só porcentagens e contagens — nada de calorias, mL ou o que foi comido.

export type ShareIcon = 'meals' | 'water' | 'target' | 'gauge' | 'streak'

export type ShareStat = { icon: ShareIcon; label: string; value: string; sub?: string }

export type ShareSummary = {
  /** "Meu resumo semanal" */
  heading: string
  /** "28/09 a 04/10" */
  period: string
  /** Título da conquista ("Semana impecável!"). */
  achievement: string
  mascotSrc: string
  hero: ShareStat
  stats: ShareStat[]
  /** Macros em % da meta do plano, numa faixa discreta embaixo (só quando todas são conhecidas). */
  macros?: { label: string; value: string }[]
}

/** Cores das bolinhas das macros (proteína, carboidrato, gordura). */
const MACRO_DOTS = ['#e5443c', '#f09820', '#2f8fd1']

/** Ícones em grade 24×24 (traço), os mesmos da barra de navegação quando existem. */
const ICON_PATHS: Record<ShareIcon, string> = {
  meals: 'M4 11h16a8 8 0 0 1-16 0z M8 7c0-1.5 1-2.5 2-3 M12 7c0-1.5 1-2.5 2-3',
  water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  target: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  gauge: 'M4.5 17a8 8 0 1 1 15 0 M12 16.5l3.5-4.5 M12 15.5a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  streak: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.6 1.5-3.8 2-5.5 1 1 1.6 2 1.8 3 .5-2.8.2-5.3 1.2-7.5z',
}

/** Cor do ícone e fundo do círculo. */
const ICON_COLORS: Record<ShareIcon, { fg: string; bg: string }> = {
  meals: { fg: '#237f58', bg: '#e3f1ea' },
  water: { fg: '#2f8fd1', bg: '#e2f0fa' },
  target: { fg: '#d9790e', bg: '#fdeedb' },
  gauge: { fg: '#104030', bg: '#e6ece9' },
  streak: { fg: '#e5443c', bg: '#fde6e4' },
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const font = (weight: number, px: number) => `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

/** Quebra o texto em linhas que cabem na largura. */
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

/** Fonte do tamanho que couber na largura (do maior para o menor). */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number) {
  ctx.font = font(weight, size)
  while (ctx.measureText(text).width > maxWidth && size > 20) ctx.font = font(weight, (size -= 2))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[], fill: string | CanvasGradient, shadow = false) {
  ctx.save()
  if (shadow) {
    ctx.shadowColor = 'rgba(16,64,48,0.18)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 8
  }
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
  ctx.restore()
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: ShareIcon, cx: number, cy: number, d: number) {
  const { fg, bg } = ICON_COLORS[icon]
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2)
  ctx.fill()
  const s = (d * 0.52) / 24
  ctx.save()
  ctx.translate(cx - 12 * s, cy - 12 * s)
  ctx.scale(s, s)
  ctx.strokeStyle = fg
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(new Path2D(ICON_PATHS[icon]))
  ctx.restore()
}

export async function renderShareImage(s: ShareSummary): Promise<File | null> {
  const W = 1080
  const PAD = 48
  const bandH = 760
  const heroY = 700
  const heroH = 160
  const gap = 24
  const tilesY = heroY + heroH + 28
  const th = 196
  const rows = Math.ceil(s.stats.length / 2)
  const tilesEnd = tilesY + rows * th + Math.max(0, rows - 1) * gap
  const macroH = 150
  const H = tilesEnd + (s.macros?.length ? gap + macroH : 0) + PAD + 8

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const cx = W / 2

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Faixa verde com cantos de baixo arredondados
  const band = ctx.createLinearGradient(0, 0, W, bandH)
  band.addColorStop(0, '#104030')
  band.addColorStop(1, '#237f58')
  roundRect(ctx, 0, 0, W, bandH, [0, 0, 72, 72], band)

  // Logo numa pílula branca
  const logo = await loadImage(logoLockup)
  const lh = 62
  const lw = (1358 / 435) * lh
  roundRect(ctx, cx - lw / 2 - 36, 40, lw + 72, lh + 32, (lh + 32) / 2, '#ffffff')
  ctx.drawImage(logo, cx - lw / 2, 56, lw, lh)

  // Mascote centrado numa área de 340×270
  const mascot = await loadImage(s.mascotSrc)
  const fit = Math.min(340 / mascot.width, 270 / mascot.height)
  const mw = mascot.width * fit
  const mh = mascot.height * fit
  ctx.drawImage(mascot, cx - mw / 2, 160 + (270 - mh), mw, mh)

  // Título, período e conquista
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  fitFont(ctx, s.heading, 800, 66, W - 2 * PAD)
  ctx.fillText(s.heading, cx, 512)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = font(500, 34)
  ctx.fillText(s.period, cx, 564)
  ctx.font = font(800, 34)
  const chip = `★  ${s.achievement}`
  const chipW = ctx.measureText(chip).width + 64
  roundRect(ctx, cx - chipW / 2, 596, chipW, 64, 32, '#f09820')
  ctx.fillStyle = '#2b1800'
  ctx.fillText(chip, cx, 640)

  // Cartão de destaque
  const heroX = PAD + 40
  const heroW = W - 2 * heroX
  roundRect(ctx, heroX, heroY, heroW, heroH, 40, '#ffffff', true)
  // Conteúdo centrado: ícone + número + rótulo
  ctx.textAlign = 'left'
  ctx.font = font(800, 84)
  const hv = s.hero.value
  const hvW = ctx.measureText(hv).width
  ctx.font = font(500, 32)
  const hl = s.hero.label
  const hs = s.hero.sub ?? ''
  const textW = Math.max(hvW, ctx.measureText(hl).width, ctx.measureText(hs).width)
  const iconD = 112
  const blockW = iconD + 36 + textW
  const bx = cx - blockW / 2
  drawIcon(ctx, s.hero.icon, bx + iconD / 2, heroY + heroH / 2, iconD)
  const tx = bx + iconD + 36
  ctx.fillStyle = '#16201b'
  ctx.font = font(800, 84)
  ctx.fillText(hv, tx, heroY + 92)
  ctx.fillStyle = '#5b655f'
  ctx.font = font(500, 32)
  ctx.fillText(hs ? `${hl} · ${hs}` : hl, tx, heroY + 134)

  // Quadros
  const tw = (W - 2 * PAD - gap) / 2
  s.stats.forEach((t, i) => {
    const x = PAD + (i % 2) * (tw + gap)
    const y = tilesY + Math.floor(i / 2) * (th + gap)
    roundRect(ctx, x, y, tw, th, 36, '#f4f6f5')
    const d = 92
    drawIcon(ctx, t.icon, x + 34 + d / 2, y + th / 2, d)
    const ix = x + 34 + d + 26
    const iw = x + tw - 24 - ix
    ctx.textAlign = 'left'
    ctx.fillStyle = '#5b655f'
    ctx.font = font(700, 24)
    const label = t.label.toUpperCase()
    const labelLines = wrap(ctx, label, iw).slice(0, 2)
    const top = y + (labelLines.length > 1 ? 50 : 62)
    labelLines.forEach((line, j) => ctx.fillText(line, ix, top + j * 28))
    const vy = top + (labelLines.length - 1) * 28 + 68
    ctx.fillStyle = '#16201b'
    fitFont(ctx, t.value, 800, 60, iw)
    ctx.fillText(t.value, ix, vy)
    if (t.sub) {
      ctx.fillStyle = '#5b655f'
      ctx.font = font(500, 24)
      ctx.fillText(wrap(ctx, t.sub, iw)[0], ix, vy + 38)
    }
  })

  // Macros, com menos destaque
  if (s.macros?.length) {
    const y = tilesEnd + gap
    roundRect(ctx, PAD, y, W - 2 * PAD, macroH, 36, '#f4f6f5')
    ctx.textAlign = 'left'
    ctx.fillStyle = '#5b655f'
    ctx.font = font(700, 24)
    ctx.fillText('MACROS EM RELAÇÃO AO PLANO', PAD + 34, y + 46)
    const colW = (W - 2 * PAD - 68) / s.macros.length
    s.macros.forEach((m, i) => {
      const x = PAD + 34 + i * colW
      ctx.fillStyle = MACRO_DOTS[i % MACRO_DOTS.length]
      ctx.beginPath()
      ctx.arc(x + 8, y + 98, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#5b655f'
      ctx.font = font(500, 28)
      ctx.fillText(m.label, x + 26, y + 108)
      const lw = ctx.measureText(m.label).width
      ctx.fillStyle = '#16201b'
      ctx.font = font(800, 34)
      ctx.fillText(m.value, x + 26 + lw + 12, y + 110)
    })
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? new File([blob], 'nutrie-meu-resumo.png', { type: 'image/png' }) : null
}
