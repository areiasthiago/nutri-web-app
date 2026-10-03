// Leitura do plano SEM IA: interpreta as linhas de texto do PDF procurando o
// que quase todo plano brasileiro tem (nomes de refeição, horários, alimentos
// com quantidade, trocas, meta de água). Não depende do layout de um
// nutricionista específico, mas é heurística: o resultado sempre passa pela
// tela de revisão, e a "qualidade" diz se vale oferecer a leitura com IA.

import type { ExtractedPlan } from './planDraft'

type Meal = ExtractedPlan['meals'][number]
type Item = Meal['items'][number]

export type ParseQuality = 'good' | 'weak' | 'empty'

export type ParseResult = {
  plan: ExtractedPlan
  quality: ParseQuality
  /** Quantos caracteres de texto o PDF tinha (perto de zero = PDF escaneado). */
  textChars: number
}

/** Minúsculas e sem acento, com o MESMO tamanho do texto original (índices batem). */
export function fold(text: string): string {
  return [...text].map((ch) => ch.normalize('NFD')[0]).join('').toLowerCase()
}

// ---------------------------------------------------------------------------
// Refeições
// ---------------------------------------------------------------------------

type MealKind = { pattern: RegExp; name: string; defaultTime: string }

// Ordem importa: os mais específicos primeiro.
const MEAL_KINDS: MealKind[] = [
  { pattern: /^(cafe da manha|desjejum|cafe)\b/, name: 'Café da manhã', defaultTime: '07:00' },
  { pattern: /^colacao\b/, name: 'Colação', defaultTime: '10:00' },
  { pattern: /^lanche da manha\b/, name: 'Lanche da manhã', defaultTime: '10:00' },
  { pattern: /^almoco\b/, name: 'Almoço', defaultTime: '12:30' },
  { pattern: /^lanche da tarde\b/, name: 'Lanche da tarde', defaultTime: '16:00' },
  { pattern: /^lanche da noite\b/, name: 'Lanche da noite', defaultTime: '21:00' },
  { pattern: /^(pre[- ]?treino)\b/, name: 'Pré-treino', defaultTime: '17:00' },
  { pattern: /^(pos[- ]?treino)\b/, name: 'Pós-treino', defaultTime: '19:00' },
  { pattern: /^jantar\b/, name: 'Jantar', defaultTime: '19:30' },
  { pattern: /^ceia\b/, name: 'Ceia', defaultTime: '21:30' },
  { pattern: /^(lanche|merenda)\b/, name: 'Lanche', defaultTime: '16:00' },
]

// 07:00, 7:00, 7h, 7h30, 07h00, 12:30h
const TIME_RE = /\b([01]?\d|2[0-3])\s*(?::\s*([0-5]\d)\s*h?|h\s*([0-5]\d)?)(?![\w])/

function findTime(folded: string): { time: string; index: number; length: number } | null {
  const m = TIME_RE.exec(folded)
  if (!m) return null
  const minutes = m[2] ?? m[3] ?? '00'
  return { time: `${m[1].padStart(2, '0')}:${minutes}`, index: m.index, length: m[0].length }
}

// Prefixos de numeração/enfeite antes do nome da refeição: "1.", "1ª refeição -", "•", "Refeição:".
const MEAL_PREFIX_RE = /^[\s•\-–—*#|]*(?:\d+\s*[ºª.)-]?\s*(?:refeicao)?\s*[-–:.]?\s*)?(?:refeicao\s*[-–:]\s*)?/

function detectMealHeader(line: string): { name: string; time: string | null } | null {
  const folded = fold(line)
  const time = findTime(folded)
  // Tira o horário e a numeração para ver se sobra um nome de refeição.
  let rest = time ? folded.slice(0, time.index) + ' ' + folded.slice(time.index + time.length) : folded
  rest = rest.replace(MEAL_PREFIX_RE, '').replace(/^[\s\-–:|()]+/, '').trim()
  const kind = MEAL_KINDS.find((k) => k.pattern.test(rest))
  if (!kind) return null
  // Linha longa com quantidade é alimento que começa com "café" etc., não cabeçalho.
  const afterName = rest.replace(kind.pattern, '').replace(/[\s\-–:|()]+/g, ' ').trim()
  if (afterName.length > 25 || findQuantity(afterName)) return null
  return { name: kind.name, time: time?.time ?? null }
}

// ---------------------------------------------------------------------------
// Quantidades
// ---------------------------------------------------------------------------

const NUMBER = String.raw`(\d+(?:[.,]\d+)?|\d+\s*/\s*\d+|meia|meio|uma|um|duas|dois|tres|quatro)`
const UNIT = String.raw`(kg|g|gr|gramas?|ml|l|litros?|un|und|unid\.?|unidades?|fatias?|colher(?:es)?(?:\s+de)?\s*(?:sopa|cha|sobremesa|cafe)?(?:\s+(?:cheias?|rasas?))?|col\.?\s*(?:de\s*)?(?:sopa|cha|sob\.?|sobremesa|cafe)|xicaras?(?:\s+de\s+cha)?|xic\.?|copos?(?:\s+(?:americanos?|duplos?))?|conchas?(?:\s+(?:media|pequena|grande)s?)?|escumadeiras?|potes?|porcao|porcoes|pedacos?|files?|bifes?|pegadores?|ramos?|folhas?|pires|punhados?|scoops?|medidas?|doses?)`
const QTY_RE = new RegExp(String.raw`(?<![\w])${NUMBER}\s*${UNIT}(?![a-z])`)
const GRAMS_RE = /\(?\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gramas?|ml)\s*\)?(?![a-z])/
const KCAL_RE = /(\d+(?:[.,]\d+)?)\s*kcal\b/
const FREE_QTY_RE = /\b(a vontade|livre|quanto quiser)\b/

const WORD_NUMBERS: Record<string, number> = { meia: 0.5, meio: 0.5, uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4 }

function toNumber(text: string): number | null {
  const t = text.trim()
  if (t in WORD_NUMBERS) return WORD_NUMBERS[t]
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function findQuantity(folded: string) {
  const m = QTY_RE.exec(folded)
  if (!m) return null
  return { index: m.index, length: m[0].length, number: m[1], unit: m[2] }
}

/** Valor e unidade para a lista de compras: g, mL ou unidades. */
function normalizeAmount(number: string, unit: string, folded: string): { value: number | null; unit: Item['qty_unit'] } {
  const n = toNumber(number)
  const u = unit.replace(/\.$/, '')
  if (n !== null) {
    if (/^(g|gr|gramas?)$/.test(u)) return { value: n, unit: 'g' }
    if (u === 'kg') return { value: n * 1000, unit: 'g' }
    if (u === 'ml') return { value: n, unit: 'mL' }
    if (/^(l|litros?)$/.test(u)) return { value: n * 1000, unit: 'mL' }
    if (/^(un|und|unid|unidades?)$/.test(u)) return { value: n, unit: 'un' }
  }
  // Medida caseira com peso entre parênteses: "1 fatia (25 g)".
  const grams = GRAMS_RE.exec(folded)
  if (grams) {
    const value = toNumber(grams[1])
    return { value, unit: grams[2] === 'ml' ? 'mL' : 'g' }
  }
  return { value: null, unit: null }
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

const BULLET_RE = /^[\s•\-–—*·o>|]+(?=\S)/
const SEPARATORS_RE = /^[\s\-–—:|,;.]+|[\s\-–—:|,;]+$/g

function cleanFood(text: string): string {
  const cleaned = text
    .replace(BULLET_RE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(SEPARATORS_RE, '')
    .trim()
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** "Arroz branco 80 g (102 kcal)" -> item. Retorna null se a linha não tem quantidade. */
function parseItemText(original: string): Item | null {
  const folded = fold(original)
  const qty = findQuantity(folded)
  const free = qty ? null : FREE_QTY_RE.exec(folded)
  if (!qty && !free) return null

  const qtyStart = qty ? qty.index : free!.index
  let qtyEnd = qty ? qty.index + qty.length : free!.index + free![0].length
  // Inclui um parêntese logo depois: "1 fatia (25 g)".
  const after = /^\s*\([^)]{1,25}\)/.exec(original.slice(qtyEnd))
  if (after) qtyEnd += after[0].length

  const kcalMatch = KCAL_RE.exec(folded)
  let food = original.slice(0, qtyStart) + ' ' + original.slice(qtyEnd)
  if (kcalMatch) {
    const kcalText = original.slice(kcalMatch.index, kcalMatch.index + kcalMatch[0].length)
    food = food.replace(kcalText, '').replace(/\(\s*\)/g, '')
  }
  // "de" solto que ligava quantidade e alimento: "80 g de arroz".
  food = food.replace(/^\s*de\s+/i, '')

  const qtyText = original.slice(qtyStart, qtyEnd).trim()
  const amount = qty ? normalizeAmount(qty.number, qty.unit, fold(qtyText)) : { value: null, unit: null }

  return {
    food: cleanFood(food),
    qty_text: qtyText,
    qty_value: amount.value,
    qty_unit: amount.unit,
    kcal: kcalMatch ? toNumber(kcalMatch[1]) : null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    substitutions: [],
  }
}

function substitutionText(original: string): string {
  return cleanFood(original.replace(/^[\s•\-–—*]*(ou\b|opcao\s*\d*|opção\s*\d*|substitui\w*|troca\w*)\s*[:\-–]?\s*/i, ''))
}

// ---------------------------------------------------------------------------
// Outras informações
// ---------------------------------------------------------------------------

const SKIP_RE = /(crn|telefone|tel\.|whatsapp|e-?mail|@|www\.|https?:|pagina \d|cpf|endereco|paciente|nutricionista\b.*:|data:|assinatura)/
const SUBS_HEADER_RE = /^[\s•\-–—*]*(substitui\w*|trocas?|opcoes|equivalentes)\s*(?:de\s+\w+\s*)?[:\-–]?\s*$/
const SUBS_LINE_RE = /^[\s•\-–—*]*(ou\b|opcao\s*\d*\s*[:\-–]|substitui\w*\s*[:\-–]|troca\w*\s*[:\-–])/
const NOTES_HEADER_RE = /^[\s•\-–—*#]*(orientac\w*|observac\w*|recomendac\w*|dicas?|importante|lembretes?)(\s+gerais)?\s*[:\-–]?\s*$/
const WATER_RE = /(?:agua|hidratacao|liquidos?)[^\d]{0,40}?(\d+(?:[.,]\d+)?)\s*(l|litros?|ml)\b|(\d+(?:[.,]\d+)?)\s*(l|litros?|ml)\s*(?:de\s+)?(?:agua|liquidos?)/
const TARGET_KCAL_RE = /(?:vet|valor energetico|total(?: do dia| diario| de calorias)?|meta(?: calorica)?|calorias(?: totais)?)[^\d]{0,25}(\d[\d.,]*)\s*kcal/

function waterMl(folded: string): number | null {
  const m = WATER_RE.exec(folded)
  if (!m) return null
  const value = toNumber(m[1] ?? m[3])
  const unit = m[2] ?? m[4]
  if (value === null) return null
  return unit === 'ml' ? Math.round(value) : Math.round(value * 1000)
}

// ---------------------------------------------------------------------------
// Interpretação
// ---------------------------------------------------------------------------

export function parsePlanText(lines: string[]): ParseResult {
  const textChars = lines.join('').replace(/\s/g, '').length
  const meals: Meal[] = []
  const notes: string[] = []
  const warnings: string[] = []
  let waterTarget: number | null = null
  let kcalTarget: number | null = null
  let mode: 'items' | 'subs' | 'notes' | 'none' = 'none'
  const mealsWithoutTime = new Set<Meal>()

  const lastItem = () => {
    const meal = meals[meals.length - 1]
    return meal?.items[meal.items.length - 1]
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const folded = fold(line)
    if (SKIP_RE.test(folded)) continue

    if (waterTarget === null && /agua|hidratacao|liquido/.test(folded)) waterTarget = waterMl(folded)
    if (kcalTarget === null) {
      const k = TARGET_KCAL_RE.exec(folded)
      if (k) kcalTarget = toNumber(k[1].replace(/\.(?=\d{3}\b)/g, ''))
    }

    const header = detectMealHeader(line)
    if (header) {
      const meal: Meal = { name: header.name, time: header.time ?? '', items: [] }
      if (!header.time) mealsWithoutTime.add(meal)
      meals.push(meal)
      mode = 'items'
      continue
    }

    // Horário sozinho logo depois do nome da refeição ("Almoço" / "12:30").
    const current = meals[meals.length - 1]
    if (current && mealsWithoutTime.has(current) && current.items.length === 0) {
      const t = findTime(folded)
      if (t && folded.replace(TIME_RE, '').replace(/[\s\-–:|()h]+/g, '').length === 0) {
        current.time = t.time
        mealsWithoutTime.delete(current)
        continue
      }
    }

    if (NOTES_HEADER_RE.test(folded)) {
      mode = 'notes'
      continue
    }
    if (mode === 'notes') {
      if (line.length > 3 && !findQuantity(folded)) notes.push(cleanFood(line))
      continue
    }
    if (!current) continue

    if (SUBS_HEADER_RE.test(folded)) {
      mode = 'subs'
      continue
    }

    // Tabelas: " | " separa colunas.
    const cells = line.split(' | ').map((c) => c.trim()).filter(Boolean)

    // "ou ..." / "Opção: ..." / "Substituição: ..." -> troca do último alimento.
    if (SUBS_LINE_RE.test(folded) && lastItem()) {
      const text = substitutionText(line.replace(/ \| /g, ' '))
      if (text) lastItem()!.substitutions.push(text)
      continue
    }

    if (mode === 'subs') {
      if (findQuantity(folded) && lastItem()) lastItem()!.substitutions.push(cleanFood(line.replace(/ \| /g, ' ')))
      continue
    }

    // Mesma linha com alternativas: "Arroz 80 g ou batata-doce 100 g".
    const parts = line.replace(/ \| /g, ' ').split(/\s+ou\s+/i)
    if (parts.length > 1 && parts.every((p) => findQuantity(fold(p)))) {
      const item = parseItemText(parts[0])
      if (item) {
        item.substitutions.push(...parts.slice(1).map((p) => cleanFood(p)))
        current.items.push(item)
        continue
      }
    }

    // Linha de tabela: a 1ª célula com quantidade define o item; células
    // seguintes com quantidade viram trocas.
    if (cells.length > 1) {
      const qtyIndex = cells.findIndex((c) => findQuantity(fold(c)) || FREE_QTY_RE.test(fold(c)))
      if (qtyIndex >= 0) {
        const foodCells = cells.slice(0, qtyIndex).filter((c) => !findQuantity(fold(c)))
        const item = parseItemText(`${foodCells.join(' ')} ${cells[qtyIndex]}`)
        if (item) {
          for (const extra of cells.slice(qtyIndex + 1)) {
            const fe = fold(extra)
            const kcal = KCAL_RE.exec(fe)
            if (kcal && item.kcal === null && fe.replace(KCAL_RE, '').trim().length < 3) item.kcal = toNumber(kcal[1])
            else if (findQuantity(fe)) item.substitutions.push(substitutionText(extra))
          }
          current.items.push(item)
          continue
        }
      }
    }

    const item = parseItemText(line)
    if (item && item.food) {
      current.items.push(item)
      continue
    }
  }

  // Horários: preenche os que faltam com o típico da refeição e avisa.
  for (const meal of meals) {
    if (!meal.time) {
      meal.time = MEAL_KINDS.find((k) => k.name === meal.name)?.defaultTime ?? '12:00'
      warnings.push(`${meal.name}: o PDF não tinha horário; usei ${meal.time}. Confira.`)
    }
    if (meal.items.length === 0) warnings.push(`${meal.name}: não encontrei os alimentos. Preencha à mão.`)
  }
  meals.sort((a, b) => a.time.localeCompare(b.time))

  const totalItems = meals.reduce((sum, m) => sum + m.items.length, 0)
  const mealsWithItems = meals.filter((m) => m.items.length > 0).length

  let quality: ParseQuality
  // Sem refeições com alimentos = nada aproveitável (texto curto aqui costuma ser PDF escaneado).
  if (meals.length === 0 || totalItems === 0) quality = 'empty'
  else if (meals.length >= 2 && totalItems >= 3 && mealsWithItems / meals.length >= 0.75) quality = 'good'
  else quality = 'weak'

  if (quality !== 'empty') {
    warnings.unshift('Leitura automática sem IA: confira cada refeição com o PDF, principalmente as trocas.')
  }

  return {
    quality,
    textChars,
    plan: {
      name: 'Plano alimentar',
      status_note: null,
      targets: { kcal: kcalTarget, protein_g: null, carbs_g: null, fat_g: null, water_ml: waterTarget },
      notes,
      meals,
      hydration_slots: [],
      warnings,
    },
  }
}
