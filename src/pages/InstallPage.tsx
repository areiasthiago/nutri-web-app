import logoMark from '../assets/logo-mark.png'
import { InstallInstructions } from '../components/InstallInstructions'
import { skipInstallForSession } from '../lib/install'

export function InstallPage({ onContinue }: { onContinue: () => void }) {
  function handleContinue() {
    skipInstallForSession()
    onContinue()
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logoMark} alt="" className="login-logo" width={72} height={72} />
        <h1>Nutri Helper</h1>
        <p className="login-subtitle">
          Instale o app no seu celular para ver seu plano alimentar, meta de água, lista de compra
          e muito mais.
        </p>

        <InstallInstructions />

        <button type="button" className="btn-link" onClick={handleContinue}>
          Continuar no navegador
        </button>
      </div>
    </div>
  )
}
