/** Quadro de número da tela de estatísticas (também desenhado na imagem de compartilhar). */
export type StatTileData = {
  label: string
  value: string
  sub?: string
  /** Barrinha de progresso (0–100+), na cor da série. */
  meter?: number
  series?: 'meals' | 'water'
}

/** Cores das séries (as mesmas de --chart-meals e --chart-water no CSS). */
export const SERIES_COLOR = { meals: '#237f58', water: '#2f8fd1' } as const

export function StatTile({ label, value, sub, meter, series }: StatTileData) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
      {meter !== undefined && (
        <span className="stat-meter" aria-hidden="true">
          <span style={{ width: `${Math.min(100, meter)}%`, background: series ? `var(--chart-${series})` : undefined }} />
        </span>
      )}
    </div>
  )
}
