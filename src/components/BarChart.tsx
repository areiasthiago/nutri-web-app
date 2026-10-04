import { useEffect, useRef, useState } from 'react'

// Gráfico de barras simples (SVG, sem biblioteca), uma série por gráfico: o
// título do cartão nomeia a série, então não há legenda. Barras de no máximo
// 24 px, topo arredondado (4 px) e base reta, 2 px de folga entre elas, grade
// fininha. Tocar (ou passar o mouse) numa barra mostra o valor na linha de leitura.

type Props = {
  /** Um valor por dia; null = dia sem dado (futuro ou antes de começar), sem barra. */
  values: (number | null)[]
  /** Rótulo curto embaixo de cada barra ('' = sem rótulo). */
  ticks: string[]
  /** Texto da linha de leitura para a barra tocada. */
  describe: (index: number) => string
  /** Cor da série (token CSS). */
  color: string
  /** Linha de referência (meta / total do plano), no mesmo eixo. */
  reference?: { value: number; label: string }
  /** Rótulo do eixo para um valor (ex.: "100%", "1.500"). */
  formatAxis: (value: number) => string
  /** Topo mínimo da escala (ex.: 100 para porcentagem). */
  minMax?: number
  /** Barra inicialmente selecionada (ex.: hoje). */
  initialIndex?: number
  label: string
}

const HEIGHT = 150
const PAD = { top: 10, right: 4, bottom: 20, left: 40 }

/** Topo da escala "redondo" para as marcas do eixo. */
function niceMax(v: number): number {
  if (v <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * step >= v) return m * step
  return 10 * step
}

/** Retângulo com só o topo arredondado (a base fica reta, encostada no eixo). */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export function BarChart({ values, ticks, describe, color, reference, formatAxis, minMax = 0, initialIndex, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [selected, setSelected] = useState<number | null>(initialIndex ?? null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const top = Math.max(reference?.value ?? 0, ...values.map((v) => v ?? 0))
  // Porcentagem: escala até 100% se nada passar disso; senão, um topo "redondo" com folga.
  const max = minMax && top <= minMax ? minMax : niceMax(Math.max(minMax, top) * 1.05)
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const slot = plotW / values.length
  const barW = Math.max(2, Math.min(24, slot - 2))
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH
  const gridValues = [0, max / 2, max]

  return (
    <div className="bar-chart" ref={wrapRef}>
      <svg width={width} height={HEIGHT} role="img" aria-label={label} onMouseLeave={() => setSelected(initialIndex ?? null)}>
        {gridValues.map((g) => (
          <g key={g}>
            <line className="chart-grid" x1={PAD.left} x2={width - PAD.right} y1={y(g)} y2={y(g)} />
            <text className="chart-axis" x={PAD.left - 6} y={y(g)} dy="0.32em" textAnchor="end">
              {formatAxis(g)}
            </text>
          </g>
        ))}

        {values.map((v, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2
          const h = v ? Math.max(1, (v / max) * plotH) : 0
          return (
            <g key={i}>
              {v !== null && v > 0 && (
                <path
                  d={barPath(x, PAD.top + plotH - h, barW, h, 4)}
                  fill={color}
                  opacity={selected === null || selected === i ? 1 : 0.45}
                />
              )}
              {ticks[i] && (
                <text className={`chart-axis${selected === i ? ' is-selected' : ''}`} x={x + barW / 2} y={HEIGHT - 5} textAnchor="middle">
                  {ticks[i]}
                </text>
              )}
              {/* Área de toque maior que a barra: a coluna inteira. */}
              <rect
                x={PAD.left + i * slot}
                y={PAD.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onClick={() => setSelected(i)}
                onMouseEnter={() => setSelected(i)}
              />
            </g>
          )
        })}

        {reference && (
          <g pointerEvents="none">
            <line className="chart-reference" x1={PAD.left} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} />
          </g>
        )}
      </svg>
      <p className="chart-readout" aria-live="polite">
        {selected !== null ? describe(selected) : 'Toque numa barra para ver o dia.'}
        {reference && <span className="chart-reference-key"> · tracejado: {reference.label}</span>}
      </p>
    </div>
  )
}
