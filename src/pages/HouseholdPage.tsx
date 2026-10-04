import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  AGE_BANDS,
  ALL_HOME_MEALS,
  HOUSE_SLOTS,
  WEEKDAYS,
  addHouseFoods,
  defaultFactor,
  deleteExtra,
  deleteHouseFood,
  deleteMember,
  fetchExtras,
  fetchHouseFoods,
  fetchMembers,
  homeMealsSummary,
  mealCode,
  saveExtra,
  saveMember,
  suggestHouseFoods,
  toggleHomeMeal,
  updateHouseFood,
} from '../lib/household'
import type {
  AgeBand,
  ExtraUnit,
  HouseFood,
  HouseFoodDraft,
  HouseSlot,
  HouseholdExtra,
  HouseholdMember,
  MemberInput,
} from '../lib/household'
import { fetchActivePlan, formatNumber } from '../lib/plan'

// "Minha casa": quem mora junto, a comida da casa e os extras. Serve para a
// lista de compras da semana; ninguém aqui faz login nem recebe lembrete.

const factorLabel = (f: number) => f.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
const parseNum = (t: string) => {
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function HouseholdPage() {
  const [members, setMembers] = useState<HouseholdMember[] | null>(null)
  const [foods, setFoods] = useState<HouseFood[] | null>(null)
  const [extras, setExtras] = useState<HouseholdExtra[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () =>
    Promise.all([fetchMembers(), fetchHouseFoods(), fetchExtras()])
      .then(([m, f, x]) => {
        setMembers(m)
        setFoods(f)
        setExtras(x)
      })
      .catch(() => setError('Não foi possível carregar agora. Confira a internet e tente de novo.'))

  useEffect(() => {
    let active = true
    Promise.all([fetchMembers(), fetchHouseFoods(), fetchExtras()])
      .then(([m, f, x]) => {
        if (!active) return
        setMembers(m)
        setFoods(f)
        setExtras(x)
      })
      .catch(() => active && setError('Não foi possível carregar agora. Confira a internet e tente de novo.'))
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="page household-page">
      <Link to="/" className="back-link">
        ← Voltar para Hoje
      </Link>
      <h1 className="page-title">Minha casa</h1>
      <p className="page-lead muted">
        Quem mora com você e o que a casa come, para a lista de compras da semana. Ninguém aqui precisa de conta.
      </p>
      {error && <p className="banner banner-error">{error}</p>}
      {members === null || foods === null || extras === null ? (
        !error && <p className="muted">Carregando…</p>
      ) : (
        <>
          <MembersSection members={members} onChange={reload} />
          <HouseFoodsSection foods={foods} onChange={reload} />
          <ExtrasSection extras={extras} onChange={reload} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------

function MembersSection({ members, onChange }: { members: HouseholdMember[]; onChange: () => void }) {
  const [editing, setEditing] = useState<HouseholdMember | 'new' | null>(null)

  return (
    <section className="household-section" aria-labelledby="pessoas-titulo">
      <h2 id="pessoas-titulo">Pessoas</h2>
      {members.length === 0 && editing === null && (
        <p className="muted">Cadastre os adultos e as crianças que moram com você.</p>
      )}
      <ul className="member-list">
        {members.map((m) =>
          editing !== 'new' && editing?.id === m.id ? (
            <li key={m.id}>
              <MemberForm
                member={m}
                onDone={() => {
                  setEditing(null)
                  onChange()
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={m.id} className="info-card member-card">
              <div className="member-head">
                <div>
                  <h3>{m.nickname}</h3>
                  <p className="muted">
                    {m.kind === 'adult' ? 'Adulto' : `Criança · ${AGE_BANDS.find((b) => b.key === m.age_band)?.label}`}
                    {!m.has_plan && ` · fator ${factorLabel(m.factor)}`}
                  </p>
                </div>
                <button type="button" className="btn-link" onClick={() => setEditing(m)}>
                  Editar
                </button>
              </div>
              <p className="member-meals">{homeMealsSummary(m.home_meals)}</p>
              {m.has_plan ? (
                <p className="member-plan">
                  Plano próprio. <Link to={`/plano?pessoa=${m.id}`}>Ver ou editar o plano</Link>
                </p>
              ) : (
                <p className="member-plan muted">
                  Sem plano: entra pela comida da casa.{' '}
                  {m.kind === 'adult' && <Link to={`/plano/novo?pessoa=${m.id}`}>Cadastrar plano próprio</Link>}
                </p>
              )}
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <MemberForm
          onDone={() => {
            setEditing(null)
            onChange()
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn btn-outline-neutral" onClick={() => setEditing('new')}>
          Adicionar pessoa
        </button>
      )}
    </section>
  )
}

function MemberForm({ member, onDone, onCancel }: { member?: HouseholdMember; onDone: () => void; onCancel: () => void }) {
  const [nickname, setNickname] = useState(member?.nickname ?? '')
  const [kind, setKind] = useState<'adult' | 'child'>(member?.kind ?? 'adult')
  const [band, setBand] = useState<AgeBand | null>(member?.age_band ?? null)
  const [factorText, setFactorText] = useState(member ? factorLabel(member.factor) : '1,0')
  // Fator mexido à mão não é sobrescrito ao trocar tipo/faixa.
  const [factorTouched, setFactorTouched] = useState(!!member)
  const [homeMeals, setHomeMeals] = useState<string[]>(member?.home_meals ?? ALL_HOME_MEALS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pick(nextKind: 'adult' | 'child', nextBand: AgeBand | null) {
    setKind(nextKind)
    setBand(nextBand)
    if (!factorTouched) setFactorText(factorLabel(defaultFactor(nextKind, nextBand)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const factor = parseNum(factorText)
    if (!nickname.trim()) return setError('Dê um apelido.')
    if (kind === 'child' && !band) return setError('Escolha a faixa de idade.')
    if (!factor || factor > 2) return setError('O fator vai de 0,1 a 2.')
    setSaving(true)
    setError(null)
    const input: MemberInput = { nickname: nickname.trim(), kind, age_band: band, factor, home_meals: homeMeals }
    try {
      await saveMember(input, member?.id)
      onDone()
    } catch {
      setError('Não foi possível salvar agora. Tente de novo.')
      setSaving(false)
    }
  }

  async function remove() {
    if (!member) return
    const plan = member.has_plan ? ' O plano dela também será apagado.' : ''
    if (!window.confirm(`Remover ${member.nickname} da casa?${plan}`)) return
    try {
      await deleteMember(member.id)
      onDone()
    } catch {
      setError('Não foi possível remover agora.')
    }
  }

  return (
    <form className="info-card form-card member-form" onSubmit={submit}>
      <h3>{member ? `Editar ${member.nickname}` : 'Nova pessoa'}</h3>
      <label className="field">
        <span>Apelido</span>
        <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={30} placeholder="Ex.: Ana" />
      </label>

      <div className="segmented" role="radiogroup" aria-label="Tipo">
        {(['adult', 'child'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            className={kind === k ? 'is-active' : ''}
            onClick={() => pick(k, k === 'adult' ? null : band)}
          >
            {k === 'adult' ? 'Adulto' : 'Criança'}
          </button>
        ))}
      </div>

      {kind === 'child' && (
        <label className="field">
          <span>Faixa de idade</span>
          <select value={band ?? ''} onChange={(e) => pick('child', (e.target.value || null) as AgeBand | null)}>
            <option value="">Escolha</option>
            {AGE_BANDS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="field">
        <span>Fator de porção</span>
        <input
          type="text"
          inputMode="decimal"
          value={factorText}
          onChange={(e) => {
            setFactorText(e.target.value)
            setFactorTouched(true)
          }}
        />
        <small className="muted">
          Quanto come em relação a um adulto sem dieta (1,0). Usado só para quem não tem plano próprio. É uma
          estimativa para a compra: cada criança come de um jeito, ajuste depois da primeira semana.
        </small>
      </label>

      <fieldset className="home-meals">
        <legend>Refeições em casa</legend>
        <div className="home-grid" role="group">
          <span />
          {WEEKDAYS.map((d) => (
            <span key={d} className="home-grid-day">
              {d}
            </span>
          ))}
          {HOUSE_SLOTS.map((s) => (
            <HomeRow key={s.key} slot={s.key} label={s.short} codes={homeMeals} onToggle={(d) => setHomeMeals(toggleHomeMeal(homeMeals, d, s.key))} />
          ))}
        </div>
        <small className="muted">Desmarque o que a pessoa come fora (ex.: almoço na escola de segunda a sexta).</small>
      </fieldset>

      {error && <p className="banner banner-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="btn btn-outline-neutral" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {member && (
        <button type="button" className="btn-link danger-link" onClick={remove}>
          Remover da casa
        </button>
      )}
    </form>
  )
}

function HomeRow({ slot, label, codes, onToggle }: { slot: HouseSlot; label: string; codes: string[]; onToggle: (day: number) => void }) {
  return (
    <>
      <span className="home-grid-slot">{label}</span>
      {WEEKDAYS.map((d, i) => {
        const on = codes.includes(mealCode(i, slot))
        return (
          <button
            key={d}
            type="button"
            className={`home-cell${on ? ' is-on' : ''}`}
            aria-pressed={on}
            aria-label={`${label}, ${d}: ${on ? 'em casa' : 'fora'}`}
            onClick={() => onToggle(i)}
          >
            {on ? '✓' : ''}
          </button>
        )
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Comida da casa
// ---------------------------------------------------------------------------

const FOOD_UNITS: HouseFoodDraft['qty_unit'][] = ['g', 'mL', 'un']

function HouseFoodsSection({ foods, onChange }: { foods: HouseFood[]; onChange: () => void }) {
  const [editing, setEditing] = useState<HouseFood | 'new' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function suggest() {
    setMessage(null)
    try {
      const plan = await fetchActivePlan()
      if (!plan) return setMessage('Cadastre seu plano primeiro para ter uma sugestão.')
      const have = new Set(foods.map((f) => `${f.slot}:${f.name.toLowerCase()}`))
      const fresh = suggestHouseFoods(plan).filter((f) => !have.has(`${f.slot}:${f.name.toLowerCase()}`))
      if (!fresh.length) return setMessage('Nada novo para sugerir a partir do almoço e do jantar do seu plano.')
      await addHouseFoods(fresh)
      setMessage(`${fresh.length} ${fresh.length === 1 ? 'alimento sugerido' : 'alimentos sugeridos'}. Ajuste as porções para um adulto sem dieta.`)
      onChange()
    } catch {
      setMessage('Não foi possível sugerir agora.')
    }
  }

  return (
    <section className="household-section" aria-labelledby="comida-titulo">
      <h2 id="comida-titulo">Comida da casa</h2>
      <p className="muted">
        Os alimentos de base da casa (arroz, feijão, carne, legumes, fruta, pão, leite…), com a porção de um adulto sem
        dieta por refeição. Quem não tem plano entra na lista por aqui, multiplicado pelo fator.
      </p>
      {HOUSE_SLOTS.map((s) => {
        const list = foods.filter((f) => f.slot === s.key)
        if (!list.length) return null
        return (
          <div key={s.key} className="info-card food-group">
            <h3>{s.label}</h3>
            <ul className="row-list">
              {list.map((f) =>
                editing !== 'new' && editing?.id === f.id ? (
                  <li key={f.id}>
                    <FoodForm food={f} onDone={() => { setEditing(null); onChange() }} onCancel={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={f.id} className="row-item">
                    <span className="row-name">{f.name}</span>
                    <span className="row-qty">
                      {formatNumber(f.qty_value)} {f.qty_unit}
                    </span>
                    <button type="button" className="btn-link" onClick={() => setEditing(f)}>
                      Editar
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        )
      })}
      {editing === 'new' ? (
        <FoodForm onDone={() => { setEditing(null); onChange() }} onCancel={() => setEditing(null)} />
      ) : (
        <div className="section-actions">
          <button type="button" className="btn btn-outline-neutral" onClick={() => setEditing('new')}>
            Adicionar alimento
          </button>
          <button type="button" className="btn-link" onClick={suggest}>
            Sugerir a partir do meu plano
          </button>
        </div>
      )}
      {message && <p className="banner banner-info">{message}</p>}
    </section>
  )
}

function FoodForm({ food, onDone, onCancel }: { food?: HouseFood; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(food?.name ?? '')
  const [slot, setSlot] = useState<HouseSlot>(food?.slot ?? 'almoco')
  const [qty, setQty] = useState(food ? formatNumber(food.qty_value) : '')
  const [unit, setUnit] = useState<HouseFoodDraft['qty_unit']>(food?.qty_unit ?? 'g')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = parseNum(qty)
    if (!name.trim()) return setError('Dê um nome.')
    if (!value) return setError('Informe a porção.')
    const draft: HouseFoodDraft = { name: name.trim(), slot, qty_value: value, qty_unit: unit }
    try {
      if (food) await updateHouseFood(food.id, draft)
      else await addHouseFoods([draft])
      onDone()
    } catch {
      setError('Não foi possível salvar agora.')
    }
  }

  async function remove() {
    if (!food) return
    try {
      await deleteHouseFood(food.id)
      onDone()
    } catch {
      setError('Não foi possível apagar agora.')
    }
  }

  return (
    <form className="info-card form-card inline-form" onSubmit={submit}>
      <label className="field">
        <span>Alimento</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Arroz" />
      </label>
      <div className="inline-fields">
        <label className="field">
          <span>Refeição</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value as HouseSlot)}>
            {HOUSE_SLOTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Porção</span>
          <input type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="100" />
        </label>
        <label className="field">
          <span>Unidade</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as HouseFoodDraft['qty_unit'])}>
            {FOOD_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="banner banner-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Salvar
        </button>
        <button type="button" className="btn btn-outline-neutral" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {food && (
        <button type="button" className="btn-link danger-link" onClick={remove}>
          Apagar alimento
        </button>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Extras da casa
// ---------------------------------------------------------------------------

const EXTRA_UNITS: ExtraUnit[] = ['un', 'g', 'kg', 'mL', 'L']

function ExtrasSection({ extras, onChange }: { extras: HouseholdExtra[]; onChange: () => void }) {
  const [editing, setEditing] = useState<HouseholdExtra | 'new' | null>(null)
  return (
    <section className="household-section" aria-labelledby="extras-titulo">
      <h2 id="extras-titulo">Extras da casa</h2>
      <p className="muted">Itens de toda semana que não vêm de plano nenhum (leite integral, café, lanche da escola…).</p>
      {extras.length > 0 && (
        <ul className="info-card row-list">
          {extras.map((x) =>
            editing !== 'new' && editing?.id === x.id ? (
              <li key={x.id}>
                <ExtraForm extra={x} onDone={() => { setEditing(null); onChange() }} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={x.id} className="row-item">
                <span className="row-name">{x.name}</span>
                <span className="row-qty">
                  {formatNumber(x.qty_value)} {x.qty_unit}/semana
                </span>
                <button type="button" className="btn-link" onClick={() => setEditing(x)}>
                  Editar
                </button>
              </li>
            ),
          )}
        </ul>
      )}
      {editing === 'new' ? (
        <ExtraForm onDone={() => { setEditing(null); onChange() }} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn btn-outline-neutral" onClick={() => setEditing('new')}>
          Adicionar extra
        </button>
      )}
    </section>
  )
}

function ExtraForm({ extra, onDone, onCancel }: { extra?: HouseholdExtra; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(extra?.name ?? '')
  const [qty, setQty] = useState(extra ? formatNumber(extra.qty_value) : '')
  const [unit, setUnit] = useState<ExtraUnit>(extra?.qty_unit ?? 'un')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const value = parseNum(qty)
    if (!name.trim()) return setError('Dê um nome.')
    if (!value) return setError('Informe a quantidade por semana.')
    try {
      await saveExtra({ name: name.trim(), qty_value: value, qty_unit: unit }, extra?.id)
      onDone()
    } catch {
      setError('Não foi possível salvar agora.')
    }
  }

  async function remove() {
    if (!extra) return
    try {
      await deleteExtra(extra.id)
      onDone()
    } catch {
      setError('Não foi possível apagar agora.')
    }
  }

  return (
    <form className="info-card form-card inline-form" onSubmit={submit}>
      <label className="field">
        <span>Item</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Ex.: Leite integral" />
      </label>
      <div className="inline-fields">
        <label className="field">
          <span>Por semana</span>
          <input type="text" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="6" />
        </label>
        <label className="field">
          <span>Unidade</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value as ExtraUnit)}>
            {EXTRA_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="banner banner-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Salvar
        </button>
        <button type="button" className="btn btn-outline-neutral" onClick={onCancel}>
          Cancelar
        </button>
      </div>
      {extra && (
        <button type="button" className="btn-link danger-link" onClick={remove}>
          Apagar item
        </button>
      )}
    </form>
  )
}
