import { useEffect, useRef, useState } from 'react'

// Gráfico de linha do peso (SVG, sem biblioteca), uma série: o título do
// cartão nomeia a série. A escala não começa no zero (o que interessa é a
// variação), com folga em cima e embaixo. Linha de 2 px ligando os dias com
// registro, marcadores de 8 px; tocar num dia mostra o valor na linha de leitura.

type Props = {
  /** Um valor por dia; null = dia sem registro. */
  values: (number | null)[]
  ticks: string[]
  describe: (index: number) => string
  formatAxis: (value: number) => string
  initialIndex?: number
  label: string
}

const HEIGHT = 150
const PAD = { top: 12, right: 8, bottom: 20, left: 40 }

export function WeightChart({ values, ticks, describe, formatAxis, initialIndex, label }: Props) {
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

  const present = values.filter((v): v is number => v !== null)
  // Escala de 1 em 1 kg, com pelo menos 2 kg de altura e folga de meio kg.
  const lo = Math.floor(Math.min(...present) - 0.5)
  let hi = Math.max(lo + 2, Math.ceil(Math.max(...present) + 0.5))
  // Altura par: a linha do meio cai num quilo inteiro.
  if ((hi - lo) % 2) hi++
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const slot = plotW / values.length
  const x = (i: number) => PAD.left + i * slot + slot / 2
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH
  const points = values.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as const]))
  const gridValues = [lo, (lo + hi) / 2, hi]

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

        {points.length > 1 && (
          <polyline
            points={points.map(([px, py]) => `${px},${py}`).join(' ')}
            fill="none"
            stroke="var(--chart-meals)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {values.map((v, i) => (
          <g key={i}>
            {v !== null && (
              <circle
                cx={x(i)}
                cy={y(v)}
                r={selected === i ? 5 : 4}
                fill="var(--chart-meals)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            )}
            {ticks[i] && (
              <text className={`chart-axis${selected === i ? ' is-selected' : ''}`} x={x(i)} y={HEIGHT - 5} textAnchor="middle">
                {ticks[i]}
              </text>
            )}
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
        ))}
      </svg>
      <p className="chart-readout" aria-live="polite">
        {selected !== null ? describe(selected) : 'Toque num dia para ver o peso.'}
      </p>
    </div>
  )
}
