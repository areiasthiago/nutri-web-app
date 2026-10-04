// Gera o nome do app (src/components/Wordmark.tsx) e o logo completo
// (src/assets/brand/logo-lockup.svg) a partir do símbolo (src/assets/logo-mark.svg).
// Uso: node scripts/brand/generate-logo.cjs
// Baixe antes a fonte Nunito Black para scripts/brand/nunito-black.ttf (licença OFL):
//   https://fonts.google.com/specimen/Nunito (peso 900), arquivo .ttf estático.
const fs = require('fs')
const path = require('path')
const { build } = require('./word.cjs')
const root = path.join(__dirname, '..', '..')
const markFile = path.join(root, 'src/assets/logo-mark.svg')
const lockupFile = path.join(root, 'src/assets/brand/logo-lockup.svg')
const wordmarkFile = path.join(root, 'src/components/Wordmark.tsx')
const TRACKING = -16

// 1) Componente React: letras em currentColor; o fio entre letras usa a cor de fundo (CSS).
{
  const w = build({ x: 0, y: 290, size: 312, tracking: TRACKING, letterAttrs: 'className="wordmark-letter"' })
  const pad = 6
  const vbX = Math.floor(w.box.x1) - pad, vbY = Math.min(w.apexY, Math.floor(w.box.y1)) - pad
  const vbW = Math.ceil(w.box.x2) + pad - vbX, vbH = Math.ceil(w.box.y2) + pad - vbY
  const tsx = `// GERADO a partir da fonte Nunito Black (licença OFL) convertida em desenho; não edite à mão.
// O nome "Nutriê" como no logo: letras juntas (cada uma por cima da anterior, separadas
// por um fio da cor do fundo) e circunflexo com as folhas do tomate do símbolo.
// Cor das letras: currentColor (defina pelo CSS, ex. .app-brand); fio: .wordmark-letter.

type Props = { height: number; className?: string }

export function Wordmark({ height, className }: Props) {
  return (
    <svg
      className={className}
      viewBox="${vbX} ${vbY} ${vbW} ${vbH}"
      height={height}
      width={Math.round((height * ${vbW}) / ${vbH})}
      role="img"
      aria-label="Nutriê"
    >
      ${w.letters.replace(/\n\s*/g, '\n      ')}
      ${w.accent}
    </svg>
  )
}
`
  fs.writeFileSync(wordmarkFile, tsx)
  console.log('wordmark viewBox', vbX, vbY, vbW, vbH)
}

// 2) Logo completo em SVG (símbolo + nome), para usar fora do app.
{
  const w = build({ x: 652, y: 548, size: 312, tracking: TRACKING, letterAttrs: 'fill="#104030" stroke="#fff" stroke-width="9" stroke-linejoin="round" paint-order="stroke"' })
  const mark = fs.readFileSync(markFile, 'utf8')
  const inner = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  const right = Math.ceil(w.box.x2) + 25
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="185 225 ${right - 185} 435" role="img" aria-label="Nutriê">
  <!-- Logo completo do Nutriê: símbolo + nome. O nome é a fonte Nunito Black (OFL)
       convertida em desenho, com as letras juntas e o circunflexo feito com as folhas
       do tomate espelhadas. Gerado por script; para mudar, regenere. -->${inner}
  <!-- Nome -->
  <g>
    ${w.letters}
  </g>
  ${w.accent}
</svg>
`
  fs.writeFileSync(lockupFile, svg)
  console.log('lockup width', right - 185)
}
