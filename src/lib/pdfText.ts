// Extrai o texto de um PDF no próprio aparelho (pdf.js), em linhas na ordem
// de leitura. O arquivo não sai do celular. A biblioteca (~1 MB) só é baixada
// quando a pessoa escolhe um PDF.

type PositionedText = { str: string; x: number; y: number; width: number }

// Itens com diferença de altura menor que isto estão na mesma linha.
const SAME_LINE_TOLERANCE = 3
// Espaço horizontal maior que isto separa colunas de tabela (" | ").
const COLUMN_GAP = 14

export async function extractPdfLines(file: File): Promise<string[]> {
  return (await extractPdfPages(file)).flat()
}

/** Como extractPdfLines, mas com as linhas separadas por página. */
export async function extractPdfPages(file: File): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist')
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  const pages: string[][] = []

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: PositionedText[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      items.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width })
    }
    pages.push(groupIntoLines(items))
  }

  await task.destroy()
  return pages
}

/** Agrupa pedaços de texto por altura (linha) e os junta da esquerda para a direita. */
export function groupIntoLines(items: PositionedText[]): string[] {
  // PDF conta y de baixo para cima: maior y = mais alto na página.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: PositionedText[][] = []
  for (const item of sorted) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(row[0].y - item.y) <= SAME_LINE_TOLERANCE) row.push(item)
    else rows.push([item])
  }

  return rows
    .map((row) => {
      row.sort((a, b) => a.x - b.x)
      let text = ''
      let lastEnd: number | null = null
      for (const piece of row) {
        if (lastEnd === null) text = piece.str
        else {
          const gap = piece.x - lastEnd
          const joiner = gap > COLUMN_GAP ? ' | ' : gap > 1 && !text.endsWith(' ') && !piece.str.startsWith(' ') ? ' ' : ''
          text += joiner + piece.str
        }
        lastEnd = piece.x + piece.width
      }
      return text.replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
}
