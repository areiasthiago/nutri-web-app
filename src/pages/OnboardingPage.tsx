import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import alface from '../assets/mascots/alface.webp'
import cenoura from '../assets/mascots/cenoura.webp'
import tomate from '../assets/mascots/tomate.webp'
import { fetchMembers } from '../lib/household'
import { SHOPPING_DAYS } from '../lib/shopping'
import { fetchActivePlan } from '../lib/plan'
import { useProfile } from '../lib/profile'
import type { OnboardingStep } from '../lib/profile'
import { currentSubscription, enablePush, pushSupport } from '../lib/push'
import { timezoneOptions } from '../lib/timezones'
import { fetchActiveWorkout, parseWeight } from '../lib/workouts'

// Primeiros passos: apresentação em sequência para conta nova, mostrando tudo o
// que dá para cadastrar além do plano. O passo fica salvo no perfil; sair para
// cadastrar o plano ou a casa e voltar continua de onde parou. Todo passo
// termina com a mesma linha "← Voltar | Continuar".

const STEPS: OnboardingStep[] = ['boas-vindas', 'nome', 'plano', 'treino', 'notificacoes', 'casa', 'compras', 'pronto']

type StepProps = {
  onBack: () => void
  onNext: () => void
}

/** Linha de navegação, igual em todos os passos. */
function StepNav({
  onBack,
  onNext,
  nextLabel = 'Continuar',
  busy = false,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  busy?: boolean
}) {
  return (
    <div className="step-nav">
      {onBack && (
        <button type="button" className="btn btn-outline-neutral" onClick={onBack}>
          ← Voltar
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={onNext} disabled={busy}>
        {nextLabel}
      </button>
    </div>
  )
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const { profile, loaded, saveProfile } = useProfile()
  const [step, setStep] = useState<OnboardingStep | null>(null)

  // Começa onde parou (ou do início, se já terminou e veio pelo menu).
  if (loaded && step === null) {
    setStep(profile.onboarding_done_at ? 'boas-vindas' : (profile.onboarding_step ?? 'boas-vindas'))
  }

  if (!step) return <div className="page" />
  const index = STEPS.indexOf(step)

  function go(target: OnboardingStep) {
    setStep(target)
    window.scrollTo({ top: 0 })
    void saveProfile({ onboarding_step: target })
  }
  const nav: StepProps = {
    onBack: () => go(STEPS[Math.max(index - 1, 0)]),
    onNext: () => go(STEPS[Math.min(index + 1, STEPS.length - 1)]),
  }

  /** Sai para outra tela guardando o passo, para voltar a ele depois. */
  async function leaveTo(path: string) {
    await saveProfile({ onboarding_step: step })
    navigate(path)
  }

  async function finish() {
    await saveProfile({ onboarding_step: 'pronto', onboarding_done_at: new Date().toISOString() })
    navigate('/', { replace: true })
  }

  return (
    <div className="page onboarding">
      <div className="onboarding-top">
        <ol className="onboarding-dots" aria-label={`Passo ${index + 1} de ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <li key={s} className={i < index ? 'is-done' : i === index ? 'is-current' : ''} />
          ))}
        </ol>
        {step !== 'pronto' && (
          <button type="button" className="btn-link" onClick={finish}>
            Pular apresentação
          </button>
        )}
      </div>

      {step === 'boas-vindas' && <Welcome onNext={nav.onNext} />}
      {step === 'nome' && <NameStep {...nav} />}
      {step === 'plano' && <PlanStep {...nav} onLeave={() => leaveTo('/plano/novo?de=comecar')} />}
      {step === 'treino' && <WorkoutStep {...nav} onLeave={() => leaveTo('/treino?de=comecar')} />}
      {step === 'notificacoes' && <NotificationsStep {...nav} />}
      {step === 'casa' && <HouseStep {...nav} onLeave={() => leaveTo('/casa?de=comecar')} />}
      {step === 'compras' && <ShoppingStep {...nav} onLeave={() => leaveTo('/compras?de=comecar')} />}
      {step === 'pronto' && <DoneStep onBack={nav.onBack} onNext={finish} />}
    </div>
  )
}

function Step({ children }: { children: ReactNode }) {
  return <section className="onboarding-step">{children}</section>
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Step>
      <div className="onboarding-mascots" aria-hidden="true">
        <img src={alface} alt="" />
        <img src={tomate} alt="" />
        <img src={cenoura} alt="" />
      </div>
      <h1>Boas-vindas ao Nutriê</h1>
      <p>
        O Nutriê ajuda você a seguir o plano do seu nutricionista no dia a dia: mostra as refeições na hora certa, lembra
        de comer e de beber água e acompanha a sua evolução.
      </p>
      <p className="muted">Em poucos passos fica tudo pronto. Leva uns 3 minutos.</p>
      <StepNav onNext={onNext} nextLabel="Começar" />
    </Step>
  )
}

function NameStep({ onBack, onNext }: StepProps) {
  const { profile, saveProfile } = useProfile()
  const [name, setName] = useState(profile.display_name ?? '')
  const [timezone, setTimezone] = useState(profile.timezone)
  const [weight, setWeight] = useState(profile.weight_kg === null ? '' : String(profile.weight_kg).replace('.', ','))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const weight_kg = parseWeight(weight)
    if (weight_kg === undefined) return setError('Peso entre 25 e 400 kg (ou deixe em branco).')
    setBusy(true)
    const r = await saveProfile({ display_name: name.trim() || null, timezone, weight_kg })
    setBusy(false)
    if (r.error) setError(r.error)
    else onNext()
  }

  return (
    <Step>
      <h1>Sobre você</h1>
      <p className="muted">Como quer ser chamado na tela Hoje, seu fuso e, se quiser, seu peso.</p>
      <label className="field">
        <span>Nome ou apelido</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="nickname" placeholder="Ex.: Thiago" />
      </label>
      <label className="field">
        <span>Fuso horário</span>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {timezoneOptions(profile.timezone).map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <small className="muted">Os horários das refeições e dos lembretes seguem este fuso.</small>
      </label>
      <label className="field">
        <span>Peso (kg), opcional</span>
        <input type="text" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Ex.: 82,5" />
        <small className="muted">Só para estimar o gasto do treino e das atividades. Dá para preencher depois em Minha conta.</small>
      </label>
      {error && <p className="banner banner-error">{error}</p>}
      <StepNav onBack={onBack} onNext={save} busy={busy} />
    </Step>
  )
}

function PlanStep({ onBack, onNext, onLeave }: StepProps & { onLeave: () => void }) {
  const [meals, setMeals] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    fetchActivePlan()
      .then((p) => active && setMeals(p ? p.meals.length : null))
      .catch(() => active && setMeals(null))
    return () => {
      active = false
    }
  }, [])

  return (
    <Step>
      <h1>Seu plano alimentar</h1>
      <p>É a base de tudo: as refeições do dia, a meta de água, os lembretes e as estatísticas vêm dele.</p>
      {meals === undefined ? (
        <p className="muted">Carregando…</p>
      ) : meals ? (
        <p className="onboarding-ok">
          Plano cadastrado: {meals} {meals === 1 ? 'refeição' : 'refeições'}.
        </p>
      ) : (
        <>
          <p className="muted">
            Envie o PDF do nutricionista: o app lê, você confere e só então salva. Se preferir, monte à mão. Também dá
            para fazer depois, em Meu plano.
          </p>
          <button type="button" className="btn btn-outline-neutral step-action" onClick={onLeave}>
            Cadastrar meu plano
          </button>
        </>
      )}
      <StepNav onBack={onBack} onNext={onNext} />
    </Step>
  )
}

function WorkoutStep({ onBack, onNext, onLeave }: StepProps & { onLeave: () => void }) {
  const [routines, setRoutines] = useState<number | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    fetchActiveWorkout()
      .then((w) => active && setRoutines(w ? w.workout_routines.length : null))
      .catch(() => active && setRoutines(null))
    return () => {
      active = false
    }
  }, [])

  return (
    <Step>
      <h1>Seu treino</h1>
      <p>
        Opcional. Com o treino do personal cadastrado, você registra na tela Hoje "Fiz o treino A" com a duração, e o
        gasto estimado sai do balanço do dia. Outras atividades (caminhada, futebol…) também entram.
      </p>
      {routines === undefined ? (
        <p className="muted">Carregando…</p>
      ) : routines ? (
        <p className="onboarding-ok">
          Treino cadastrado: {routines} {routines === 1 ? 'rotina' : 'rotinas'}.
        </p>
      ) : (
        <>
          <p className="muted">Envie o PDF do treino ou monte à mão. Não treina ou prefere depois? É só continuar: Meu treino fica no menu ☰.</p>
          <button type="button" className="btn btn-outline-neutral step-action" onClick={onLeave}>
            Cadastrar meu treino
          </button>
        </>
      )}
      <StepNav onBack={onBack} onNext={onNext} />
    </Step>
  )
}

function NotificationsStep({ onBack, onNext }: StepProps) {
  const support = pushSupport()
  const [state, setState] = useState<'checking' | 'off' | 'on' | 'denied'>(() =>
    !support.ok ? 'off' : Notification.permission === 'denied' ? 'denied' : 'checking',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (state !== 'checking') return
    let active = true
    currentSubscription()
      .then((sub) => active && setState(sub && Notification.permission === 'granted' ? 'on' : 'off'))
      .catch(() => active && setState('off'))
    return () => {
      active = false
    }
  }, [state])

  async function enable() {
    setBusy(true)
    setError(false)
    try {
      setState((await enablePush()) === 'denied' ? 'denied' : 'on')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Step>
      <h1>Lembretes no celular</h1>
      <p>
        Com as notificações ativas, o app avisa na hora de cada refeição e de beber água, mesmo fechado. Se a refeição
        não for registrada, lembra mais uma vez 30 minutos depois. À noite fica em silêncio.
      </p>
      <p className="muted">Dá para ativar depois e ajustar o que avisar e o horário de silêncio em Minha conta.</p>

      {!support.ok ? (
        <p className="banner banner-attention">
          {support.reason === 'ios-not-installed'
            ? 'No iPhone, as notificações só funcionam com o app na tela de início (Compartilhar → Adicionar à Tela de Início). Dá para ativar depois, em Minha conta.'
            : 'Este navegador não recebe notificações. No celular, use o Chrome (Android) ou o app instalado (iPhone).'}
        </p>
      ) : state === 'denied' ? (
        <p className="banner banner-attention">
          As notificações estão bloqueadas para o Nutriê. Libere nas configurações do celular (Notificações do app ou do
          site) e ative depois em Minha conta.
        </p>
      ) : state === 'on' ? (
        <p className="onboarding-ok">Notificações ativas neste aparelho.</p>
      ) : state === 'off' ? (
        <button type="button" className="btn btn-outline-neutral step-action" onClick={enable} disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
      ) : null}
      {error && <p className="banner banner-error">Não foi possível ativar agora. Tente de novo.</p>}

      <StepNav onBack={onBack} onNext={onNext} />
    </Step>
  )
}

function HouseStep({ onBack, onNext, onLeave }: StepProps & { onLeave: () => void }) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    fetchMembers()
      .then((m) => active && setCount(m.length))
      .catch(() => active && setCount(0))
    return () => {
      active = false
    }
  }, [])

  return (
    <Step>
      <h1>Quem mora com você?</h1>
      <p>
        Cadastre as pessoas da casa para a lista de compras da semana sair com a quantidade certa para todos. Quem tem
        plano de nutricionista pode ter o plano cadastrado também, por PDF ou à mão, se você quiser; quem não tem entra
        pela comida da casa.
      </p>
      <p className="muted">
        Ninguém além de você precisa de conta. Mora sozinho(a) ou prefere fazer depois? É só continuar: Minha casa fica no
        menu ☰.
      </p>
      {count === null ? (
        <p className="muted">Carregando…</p>
      ) : (
        <>
          {count > 0 && (
            <p className="onboarding-ok">
              {count} {count === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}.
            </p>
          )}
          <button type="button" className="btn btn-outline-neutral step-action" onClick={onLeave}>
            {count > 0 ? 'Ver minha casa' : 'Cadastrar minha casa'}
          </button>
        </>
      )}
      <StepNav onBack={onBack} onNext={onNext} />
    </Step>
  )
}

function ShoppingStep({ onBack, onNext, onLeave }: StepProps & { onLeave: () => void }) {
  const { profile, saveProfile } = useProfile()
  const [error, setError] = useState<string | null>(null)

  async function pick(day: number) {
    setError(null)
    const r = await saveProfile({ shopping_day: day })
    if (r.error) setError('Não foi possível salvar agora. Confira a internet e tente de novo.')
  }

  return (
    <Step>
      <h1>Suas compras</h1>
      <p>
        A Lista de compras soma o que você (e a casa) vai comer na semana, organizada pelas seções do mercado. A semana
        começa no dia em que você faz as compras.
      </p>
      <p className="field-label">Em que dia você costuma fazer as compras?</p>
      <div className="weekday-picker" role="radiogroup" aria-label="Dia de compras">
        {SHOPPING_DAYS.map((d, i) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={profile.shopping_day === i}
            aria-label={d}
            className={profile.shopping_day === i ? 'is-active' : ''}
            onClick={() => void pick(i)}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>
      <p className="muted">
        {SHOPPING_DAYS[profile.shopping_day]}. Dá para trocar depois, na própria lista (menu ☰).
      </p>
      {error && <p className="banner banner-error">{error}</p>}
      <button type="button" className="btn btn-outline-neutral step-action" onClick={onLeave}>
        Ver a lista de compras
      </button>
      <StepNav onBack={onBack} onNext={onNext} />
    </Step>
  )
}

function DoneStep({ onBack, onNext }: StepProps) {
  return (
    <Step>
      <img className="onboarding-hero" src={cenoura} alt="Cenoura fazendo joinha com as duas mãos" />
      <h1>Tudo pronto!</h1>
      <p>No dia a dia, é só isto:</p>
      <ul className="onboarding-list">
        <li>
          <strong>Registre cada refeição</strong> com um toque na tela Hoje, ou pelo botão da notificação. Trocou algum
          alimento? Use "Fazer trocas".
        </li>
        <li>
          <strong>Registre a água</strong> com os botões rápidos.
        </li>
        <li>
          <strong>Comeu fora de hora?</strong> Descreva na tela Hoje e as calorias entram no dia.
        </li>
        <li>
          <strong>Treinou?</strong> Registre na tela Hoje e o gasto estimado sai do balanço do dia.
        </li>
        <li>
          <strong>Acompanhe a evolução</strong> em Estatísticas, e compartilhe quando mandar bem.
        </li>
        <li>
          <strong>Faça as compras</strong> com a Lista de compras da semana, que soma o que a casa toda come.
        </li>
      </ul>
      <p className="muted">
        Meu plano, Meu treino, Minha casa, Lista de compras, Estatísticas e Minha conta ficam no menu ☰. Esta apresentação também, em "Primeiros
        passos".
      </p>
      <StepNav onBack={onBack} onNext={onNext} nextLabel="Ir para Hoje" />
    </Step>
  )
}
