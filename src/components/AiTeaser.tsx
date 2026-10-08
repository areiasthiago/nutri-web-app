import { useState } from 'react'

// Prévia trancada de um recurso com IA, para quem não é VIP: mostra o que a IA
// faria ali, ao lado do caminho sem IA (que continua funcionando). Não é um
// formulário: não há campo nem botão que chame a IA (e a função de IA recusa
// quem não é VIP de qualquer jeito). Fechada no ✕, não volta neste aparelho.

const STORAGE_KEY = 'nutrie-ai-teasers-closed'

function closedSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

type Props = {
  /** Identifica a prévia (para lembrar que foi fechada). */
  id: string
  /** O que a IA faz aqui, curto. */
  title: string
  /** Exemplo do que a pessoa digitaria (aparece como num campo). */
  example?: string
}

export function AiTeaser({ id, title, example }: Props) {
  const [closed, setClosed] = useState(() => closedSet().has(id))
  if (closed) return null

  function close() {
    setClosed(true)
    try {
      const set = closedSet()
      set.add(id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
    } catch {
      // sem armazenamento: fecha só nesta visita
    }
  }

  return (
    <aside className="ai-teaser" aria-label={`Recurso VIP: ${title}`}>
      <div className="ai-teaser-head">
        <span className="ai-teaser-title">
          <span aria-hidden="true">✨</span> {title}
        </span>
        <button type="button" className="ai-teaser-close" aria-label="Esconder esta dica" onClick={close}>
          ✕
        </button>
      </div>
      {example && (
        <div className="ai-teaser-field" aria-hidden="true">
          <span>{example}</span>
          <span className="ai-teaser-lock">🔒</span>
        </div>
      )}
      <p className="ai-teaser-foot">
        <span className="ai-teaser-badge">Recurso VIP</span> Fale com quem te convidou.
      </p>
    </aside>
  )
}
