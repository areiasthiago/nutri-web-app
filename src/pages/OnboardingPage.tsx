import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import alface from '../assets/mascots/alface.webp'
import cenoura from '../assets/mascots/cenoura.webp'
import tomate from '../assets/mascots/tomate.webp'
import { fetchMembers } from '../lib/household'
import { fetchActivePlan } from '../lib/plan'
import { useProfile } from '../lib/profile'
import type { OnboardingStep } from '../lib/profile'
import { currentSubscription, enablePush, pushSupport } from '../lib/push'
import { timezoneOptions } from '../lib/timezones'

// Primeiros passos: apresentação em sequência para conta nova, mostrando tudo o
// que dá para cadastrar além do plano. O passo fica salvo no perfil; sair para
// cadastrar o plano ou a casa e voltar continua de onde parou.

const STEPS: OnboardingStep[] = ['boas-vindas', 'nome', 'plano', 'notificacoes', 'casa', 'pronto']

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

  function go(next: OnboardingStep) {
    setStep(next)
    window.scrollTo({ top: 0 })
    void saveProfile({ onboarding_step: next })
  }
  const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)])

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

      {step === 'boas-vindas' && <Welcome onNext={next} />}
      {step === 'nome' && <NameStep onNext={next} />}
      {step === 'plano' && <PlanStep onNext={next} onLeave={() => leaveTo('/plano/novo')} />}
      {step === 'notificacoes' && <NotificationsStep onNext={next} />}
      {step === 'casa' && <HouseStep onNext={next} onLeave={() => leaveTo('/casa?de=comecar')} />}
      {step === 'pronto' && <DoneStep onFinish={finish} />}

      {index > 0 && step !== 'pronto' && (
        <button type="button" className="btn-link onboarding-back" onClick={() => go(STEPS[index - 1])}>
          ← Voltar
        </button>
      )}
    </div>
  )
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <section className="onboarding-step">
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
      <button type="button" className="btn btn-primary" onClick={onNext}>
        Começar
      </button>
    </section>
  )
}

function NameStep({ onNext }: { onNext: () => void }) {
  const { profile, saveProfile } = useProfile()
  const [name, setName] = useState(profile.display_name ?? '')
  const [timezone, setTimezone] = useState(profile.timezone)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const r = await saveProfile({ display_name: name.trim() || null, timezone })
    if (r.error) setError(r.error)
    else onNext()
  }

  return (
    <section className="onboarding-step">
      <h1>Como quer ser chamado?</h1>
      <p className="muted">Para a saudação da tela Hoje.</p>
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
      {error && <p className="banner banner-error">{error}</p>}
      <button type="button" className="btn btn-primary" onClick={save}>
        Continuar
      </button>
    </section>
  )
}

function PlanStep({ onNext, onLeave }: { onNext: () => void; onLeave: () => void }) {
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
    <section className="onboarding-step">
      <h1>Seu plano alimentar</h1>
      <p>
        É a base de tudo: as refeições do dia, a meta de água, os lembretes e as estatísticas vêm dele.
      </p>
      {meals === undefined ? (
        <p className="muted">Carregando…</p>
      ) : meals ? (
        <>
          <p className="onboarding-ok">
            Plano cadastrado: {meals} {meals === 1 ? 'refeição' : 'refeições'}.
          </p>
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Continuar
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Envie o PDF do nutricionista: o app lê, você confere e só então salva. Se preferir, monte à mão.
          </p>
          <button type="button" className="btn btn-primary" onClick={onLeave}>
            Cadastrar meu plano
          </button>
          <button type="button" className="btn btn-outline-neutral" onClick={onNext}>
            Fazer depois
          </button>
        </>
      )}
    </section>
  )
}

function NotificationsStep({ onNext }: { onNext: () => void }) {
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
    <section className="onboarding-step">
      <h1>Lembretes no celular</h1>
      <p>
        Com as notificações ativas, o app avisa na hora de cada refeição e de beber água, mesmo fechado. Se a refeição
        não for registrada, lembra mais uma vez 30 minutos depois. À noite fica em silêncio.
      </p>
      <p className="muted">Dá para ajustar o que avisar e o horário de silêncio em Minha conta.</p>

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
        <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
      ) : null}
      {error && <p className="banner banner-error">Não foi possível ativar agora. Tente de novo.</p>}

      <button type="button" className={state === 'on' ? 'btn btn-primary' : 'btn btn-outline-neutral'} onClick={onNext}>
        {state === 'on' ? 'Continuar' : 'Agora não'}
      </button>
    </section>
  )
}

function HouseStep({ onNext, onLeave }: { onNext: () => void; onLeave: () => void }) {
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
    <section className="onboarding-step">
      <h1>Quem mora com você?</h1>
      <p>
        Cadastre as pessoas da casa para a lista de compras da semana sair com a quantidade certa para todos. Quem tem
        plano de nutricionista pode ter o plano cadastrado também, por PDF ou à mão, se você quiser; quem não tem entra
        pela comida da casa.
      </p>
      <p className="muted">Ninguém além de você precisa de conta. Dá para fazer depois em Minha casa, no menu ☰.</p>
      {count === null ? (
        <p className="muted">Carregando…</p>
      ) : count > 0 ? (
        <>
          <p className="onboarding-ok">
            {count} {count === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}.
          </p>
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Continuar
          </button>
          <button type="button" className="btn btn-outline-neutral" onClick={onLeave}>
            Ver minha casa
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-primary" onClick={onLeave}>
            Cadastrar minha casa
          </button>
          <button type="button" className="btn btn-outline-neutral" onClick={onNext}>
            Moro sozinho(a)
          </button>
          <button type="button" className="btn-link" onClick={onNext}>
            Fazer depois
          </button>
        </>
      )}
    </section>
  )
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <section className="onboarding-step">
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
          <strong>Acompanhe a evolução</strong> em Estatísticas, e compartilhe quando mandar bem.
        </li>
      </ul>
      <p className="muted">
        Meu plano, Minha casa, Estatísticas e Minha conta ficam no menu ☰. Esta apresentação também, em "Primeiros
        passos".
      </p>
      <button type="button" className="btn btn-primary" onClick={onFinish}>
        Ir para Hoje
      </button>
    </section>
  )
}
