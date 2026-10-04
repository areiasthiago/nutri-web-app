import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { localDateIn } from '../lib/plan'
import { useProfile } from '../lib/profile'
import { SHOPPING_DAYS, buildShoppingList, defaultYield, foodKey, formatAmount, itemKey, ruleIngredients, weekStartFor } from '../lib/shopping'
import type { Ingredient, ItemSource, ShoppingInput, ShoppingLine, Unit } from '../lib/shopping'
import {
  canUseAi,
  clearChecks,
  fetchChecks,
  fetchShoppingInput,
  fillIngredientsWithAi,
  itemsWithoutIngredients,
  saveManualIngredients,
  saveYield,
  setChecked,
} from '../lib/shoppingData'

// Lista de compras da semana: o total da casa (planos, pessoas sem plano,
// comida da casa e extras), com a parte de cada um, em cru. Estimativa para
// compra; o app não monta cardápio.

const shortDate = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opts })

function addDays(d: string, n: number) {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

const yieldLabel = (y: number) => y.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export function ShoppingPage() {
  const { profile, loaded, saveProfile } = useProfile()
  const [input, setInput] = useState<ShoppingInput | null>(null)
  const [checks, setChecks] = useState<Set<string> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // IA (só VIP): separando ingredientes dos itens que ainda não têm.
  const [aiState, setAiState] = useState<'idle' | 'running' | 'failed'>('idle')

  const today = localDateIn(profile.timezone)
  const weekStart = weekStartFor(today, profile.shopping_day)

  useEffect(() => {
    let active = true
    fetchShoppingInput()
      .then(async (i) => {
        if (!active) return
        setInput(i)
        // Itens sem ingredientes: a IA separa, se a pessoa for VIP. Sem VIP, ficam as regras.
        const missing = itemsWithoutIngredients(i)
        if (!missing.length || !(await canUseAi())) return
        if (!active) return
        setAiState('running')
        try {
          await fillIngredientsWithAi(missing)
          const fresh = await fetchShoppingInput()
          if (active) {
            setInput(fresh)
            setAiState('idle')
          }
        } catch {
          if (active) setAiState('failed')
        }
      })
      .catch(() => active && setError('Não foi possível montar a lista agora. Confira a internet e tente de novo.'))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    let active = true
    fetchChecks(weekStart)
      .then((c) => active && setChecks(c))
      .catch(() => active && setChecks(new Set()))
    return () => {
      active = false
    }
  }, [loaded, weekStart])

  const list = useMemo(() => (input ? buildShoppingList(input) : null), [input])

  async function toggle(key: string) {
    if (!checks) return
    const next = new Set(checks)
    const on = !next.has(key)
    if (on) next.add(key)
    else next.delete(key)
    setChecks(next)
    try {
      await setChecked(weekStart, key, on)
    } catch {
      setError('Não foi possível salvar a marcação. Confira a internet.')
    }
  }

  async function restart() {
    if (!window.confirm('Desmarcar tudo e recomeçar a lista desta semana?')) return
    await clearChecks(weekStart)
    setChecks(new Set())
  }

  /** Ingredientes atuais de um item do plano (os guardados ou, sem eles, os das regras). */
  function currentIngredients(source: ItemSource): Ingredient[] {
    for (const person of input?.planPeople ?? []) {
      for (const meal of person.meals) {
        const item = meal.items.find((i) => itemKey(i.food, i.qty_text) === source.itemKey)
        if (item) return item.ingredients ?? ruleIngredients(item)
      }
    }
    return []
  }

  async function saveIngredients(source: ItemSource, ingredients: Ingredient[]) {
    await saveManualIngredients(source, ingredients)
    setInput(await fetchShoppingInput())
  }

  async function changeYield(line: ShoppingLine, value: number | null) {
    const key = foodKey(line.name)
    await saveYield(key, value)
    setInput((prev) => {
      if (!prev) return prev
      const yields = new Map(prev.yields)
      if (value === null) yields.delete(key)
      else yields.set(key, value)
      return { ...prev, yields }
    })
  }

  const empty = list && list.lines.length === 0 && list.unquantified.length === 0
  const total = list ? list.lines.length + list.unquantified.length : 0
  const done = list && checks ? [...list.lines.map((l) => l.key), ...list.unquantified.map((u) => `q|${u.key}`)].filter((k) => checks.has(k)).length : 0
  const sortChecked = <T extends { key: string }>(xs: T[], prefix = '') =>
    [...xs].sort((a, b) => Number(checks?.has(prefix + a.key) ?? false) - Number(checks?.has(prefix + b.key) ?? false))

  return (
    <div className="page shopping-page">
      <Link to="/" className="back-link">
        ← Voltar para Hoje
      </Link>
      <h1 className="page-title">Lista de compras</h1>
      <div className="shopping-week">
        <p>
          Semana de {shortDate(weekStart, { weekday: 'short', day: '2-digit', month: '2-digit' })} a{' '}
          {shortDate(addDays(weekStart, 6), { weekday: 'short', day: '2-digit', month: '2-digit' })}
        </p>
        <label className="shopping-day">
          <span>Dia de compras</span>
          <select value={profile.shopping_day} onChange={(e) => void saveProfile({ shopping_day: Number(e.target.value) })}>
            {SHOPPING_DAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="banner banner-error">{error}</p>}
      {!list || !checks ? (
        !error && <p className="muted">Montando a lista…</p>
      ) : empty ? (
        <section className="info-card form-card">
          <h2>Nada para comprar ainda</h2>
          <p className="muted">A lista vem do seu plano e da sua casa. Cadastre os dois para ela aparecer.</p>
          <Link to="/plano" className="btn btn-primary btn-link-as-button">
            Meu plano
          </Link>
          <Link to="/casa" className="btn btn-outline-neutral btn-link-as-button">
            Minha casa
          </Link>
        </section>
      ) : (
        <>
          {aiState === 'running' && (
            <p className="banner banner-info" aria-live="polite">
              Separando os itens do plano em ingredientes de mercado com IA… A lista se atualiza sozinha.
            </p>
          )}
          {aiState === 'failed' && (
            <p className="banner banner-attention">
              A IA não conseguiu separar os ingredientes agora; a lista usa as regras automáticas. Você pode ajustar
              cada item tocando nele.
            </p>
          )}
          <p className="shopping-progress">
            {done} de {total} {total === 1 ? 'item comprado' : 'itens comprados'}
          </p>

          <ul className="info-card shopping-list">
            {sortChecked(list.lines).map((line) => {
              const checked = checks.has(line.key)
              const isOpen = open === line.key
              return (
                <li key={line.key} className={`shopping-item${checked ? ' is-checked' : ''}`}>
                  <div className="shopping-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(line.key)}
                      aria-label={`Comprado: ${line.name}`}
                    />
                    <button type="button" className="shopping-name" onClick={() => setOpen(isOpen ? null : line.key)} aria-expanded={isOpen}>
                      <span>{line.name}</span>
                      <span className="shopping-amount">
                        {formatAmount(line.total, line.unit)}
                        {line.plusUnquantified.length > 0 && ' +'}
                      </span>
                    </button>
                  </div>
                  {isOpen && (
                    <LineDetails
                      line={line}
                      onYield={(v) => changeYield(line, v)}
                      ingredientsOf={currentIngredients}
                      onSaveIngredients={saveIngredients}
                    />
                  )}
                </li>
              )
            })}
          </ul>

          {list.unquantified.length > 0 && (
            <section className="shopping-unquantified">
              <h2>Sem quantidade no plano</h2>
              <p className="muted">Itens como "à vontade" ou "1 colher": decida quanto comprar.</p>
              <ul className="info-card shopping-list">
                {sortChecked(list.unquantified, 'q|').map((u) => {
                  const key = `q|${u.key}`
                  const checked = checks.has(key)
                  const isOpen = open === key
                  return (
                    <li key={key} className={`shopping-item${checked ? ' is-checked' : ''}`}>
                      <div className="shopping-row">
                        <input type="checkbox" checked={checked} onChange={() => toggle(key)} aria-label={`Comprado: ${u.name}`} />
                        <button type="button" className="shopping-name" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                          <span>{u.name}</span>
                          <span className="shopping-who">{u.who.join(', ')}</span>
                        </button>
                      </div>
                      {isOpen && (
                        <div className="shopping-details">
                          <Sources sources={u.sources} ingredientsOf={currentIngredients} onSave={saveIngredients} />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <p className="muted shopping-note">
            Estimativa para a compra, em alimento cru. Toque num item para ver quanto vem de cada pessoa, de quais itens
            do plano ele sai e ajustar os ingredientes. As trocas do plano não entram: a lista usa o alimento principal.
          </p>
          <button type="button" className="btn btn-outline-neutral" onClick={restart} disabled={done === 0}>
            Desmarcar tudo
          </button>
        </>
      )}
    </div>
  )
}

type IngredientProps = {
  ingredientsOf: (source: ItemSource) => Ingredient[]
  onSaveIngredients: (source: ItemSource, ingredients: Ingredient[]) => Promise<void>
}

function LineDetails({
  line,
  onYield,
  ingredientsOf,
  onSaveIngredients,
}: { line: ShoppingLine; onYield: (value: number | null) => Promise<void> } & IngredientProps) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(yieldLabel(line.yield))
  const [error, setError] = useState(false)
  const standard = defaultYield(line.name)

  async function save() {
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n > 10) return setError(true)
    setError(false)
    await onYield(n === standard ? null : n)
    setEditing(false)
  }

  return (
    <div className="shopping-details">
      <ul className="shopping-parts">
        {line.parts.map((p) => (
          <li key={p.label}>
            <span>{p.label}</span>
            <span>{formatAmount(p.amount, line.unit)}</span>
          </li>
        ))}
      </ul>
      {line.plusUnquantified.length > 0 && (
        <p className="muted shopping-plus">
          Mais o que vai sem quantidade definida, à vontade ({line.plusUnquantified.join(', ')}): decida quanto a mais
          comprar.
        </p>
      )}
      {line.sources.length > 0 && <Sources sources={line.sources} ingredientsOf={ingredientsOf} onSave={onSaveIngredients} />}
      {line.cooked && (
        <div className="shopping-yield">
          {editing ? (
            <>
              <label className="field">
                <span>Rendimento (pronto ÷ cru)</span>
                <input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
                <small className="muted">
                  1 = sem conversão. Carnes perdem peso (0,72); arroz (2,7) e feijão (2,3) ganham. Padrão deste item:{' '}
                  {yieldLabel(standard)}.
                </small>
              </label>
              {error && <p className="banner banner-error">Use um número entre 0,1 e 10.</p>}
              <div className="form-actions">
                <button type="button" className="btn btn-primary btn-small" onClick={save}>
                  Salvar
                </button>
                <button type="button" className="btn btn-outline-neutral btn-small" onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <p className="muted">
              {line.yield === 1
                ? 'Mesma quantidade do plano (sem conversão de pronto para cru).'
                : `Convertido de pronto para cru: rendimento ${yieldLabel(line.yield)}.`}{' '}
              <button type="button" className="btn-link" onClick={() => setEditing(true)}>
                Ajustar
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** "Vem de": os itens do plano que formam a linha, cada um com "Ajustar ingredientes". */
function Sources({
  sources,
  ingredientsOf,
  onSave,
}: {
  sources: ItemSource[]
  ingredientsOf: IngredientProps['ingredientsOf']
  onSave: IngredientProps['onSaveIngredients']
}) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="shopping-sources">
      <p className="shopping-sources-title">Vem de:</p>
      <ul>
        {sources.map((src) => (
          <li key={src.itemKey}>
            {editing === src.itemKey ? (
              <IngredientEditor
                source={src}
                initial={ingredientsOf(src)}
                onCancel={() => setEditing(null)}
                onSave={async (ings) => {
                  await onSave(src, ings)
                  setEditing(null)
                }}
              />
            ) : (
              <p>
                {src.food}
                {src.qty_text && <span className="muted"> · {src.qty_text}</span>}{' '}
                <button type="button" className="btn-link" onClick={() => setEditing(src.itemKey)}>
                  Ajustar ingredientes
                </button>
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

type Row = { name: string; qty: string; unit: Unit | '' }

/** Ajuste à mão dos ingredientes de uma porção de um item do plano (vale para todos com o mesmo item). */
function IngredientEditor({
  source,
  initial,
  onSave,
  onCancel,
}: {
  source: ItemSource
  initial: Ingredient[]
  onSave: (ingredients: Ingredient[]) => Promise<void>
  onCancel: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.length ? initial : [{ name: '', qty_value: null, qty_unit: null }]).map((i) => ({
      name: i.name,
      qty: i.qty_value === null ? '' : String(i.qty_value).replace('.', ','),
      unit: i.qty_unit ?? '',
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = (i: number, change: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)))

  async function save() {
    const ingredients: Ingredient[] = []
    for (const r of rows) {
      if (!r.name.trim()) continue
      const n = Number(r.qty.replace(',', '.'))
      const hasQty = r.qty.trim() !== '' && r.unit !== ''
      if (hasQty && (!Number.isFinite(n) || n <= 0)) return setError(`Quantidade inválida em "${r.name}".`)
      ingredients.push({ name: r.name.trim().slice(0, 60), qty_value: hasQty ? n : null, qty_unit: hasQty ? (r.unit as Unit) : null })
    }
    if (!ingredients.length) return setError('Informe pelo menos um ingrediente.')
    setSaving(true)
    try {
      await onSave(ingredients)
    } catch {
      setError('Não foi possível salvar agora.')
      setSaving(false)
    }
  }

  return (
    <div className="ingredient-editor">
      <p className="muted">
        Ingredientes para <strong>uma porção</strong> de "{source.food}"{source.qty_text ? ` (${source.qty_text})` : ''}, em cru,
        como se compra. Sem quantidade: deixe em branco.
      </p>
      {rows.map((r, i) => (
        <div key={i} className="ingredient-row">
          <input
            type="text"
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Ex.: Ovo"
            aria-label="Ingrediente"
            maxLength={60}
          />
          <input
            type="text"
            inputMode="decimal"
            value={r.qty}
            onChange={(e) => update(i, { qty: e.target.value })}
            placeholder="Qtd."
            aria-label="Quantidade"
          />
          <select value={r.unit} onChange={(e) => update(i, { unit: e.target.value as Row['unit'] })} aria-label="Unidade">
            <option value="">—</option>
            <option value="g">g</option>
            <option value="mL">mL</option>
            <option value="un">un</option>
          </select>
          <button type="button" className="btn-link" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Tirar">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn-link" onClick={() => setRows([...rows, { name: '', qty: '', unit: '' }])}>
        + Ingrediente
      </button>
      {error && <p className="banner banner-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn btn-outline-neutral btn-small" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
