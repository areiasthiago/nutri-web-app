// Monta o nome "Nutriê" como no logo: Nunito Black convertida em desenho, letras
// bem juntas (cada letra por cima da anterior, separada por um fio da cor do
// fundo: o "t" sobre o "u", o "ê" sobre o "i") e circunflexo com as folhas do
// tomate espelhadas na vertical.
const opentype = require('opentype.js')
// Fonte: Nunito Black (OFL), baixada por generate-logo.cjs para esta pasta (fora do Git).
const font = opentype.loadSync(__dirname + '/nunito-black.ttf')

const TOMATO_LEAVES = [
  'M431,331 C413,303 394,289 387,294 C389,316 408,331 431,331 Z',
  'M435,333 C451,309 471,300 481,306 C473,328 453,336 435,333 Z',
]
const LEAF_DEPTH = 45 // quanto as folhas descem a partir da junção

/**
 * @param {object} o
 * @param {number} o.x, o.y   posição da linha de base
 * @param {number} o.size     tamanho da fonte
 * @param {number} o.tracking espaço extra entre letras (negativo junta)
 * @param {string} o.letterAttrs atributos de cada letra (cor e fio separador)
 */
function build({ x, y, size, tracking, letterAttrs }) {
  const glyphs = font.stringToGlyphs('Nutrie')
  let pen = x
  const letters = []
  let eBox = null
  const box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
  glyphs.forEach((g, i) => {
    const p = g.getPath(pen, y, size)
    const bb = p.getBoundingBox()
    box.x1 = Math.min(box.x1, bb.x1); box.y1 = Math.min(box.y1, bb.y1)
    box.x2 = Math.max(box.x2, bb.x2); box.y2 = Math.max(box.y2, bb.y2)
    if (i === glyphs.length - 1) eBox = bb
    letters.push(`<path ${letterAttrs} d="${p.toPathData(1)}" />`)
    pen += (g.advanceWidth / font.unitsPerEm) * size + tracking
  })
  const scale = 1.3, gap = 8
  const cx = (eBox.x1 + eBox.x2) / 2
  const apex = Math.round(eBox.y1 - gap - LEAF_DEPTH * scale)
  const accent = `<g transform="translate(${cx.toFixed(1)} ${apex}) scale(${scale} ${-scale}) translate(-433 -334)">${TOMATO_LEAVES.map((d) => `<path fill="#409828" d="${d}" />`).join('')}</g>`
  return { letters: letters.join('\n    '), accent, box, apexY: apex }
}

module.exports = { build }
