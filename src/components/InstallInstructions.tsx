import { useEffect, useState } from 'react'
import {
  canPromptInstall,
  isIOS,
  isInAppBrowser,
  onInstallStateChange,
  promptInstall,
} from '../lib/install'

function ShareIcon() {
  return (
    <svg
      className="inline-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-label="Compartilhar"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  )
}

/** Como instalar: botão nativo (Android/Chrome) ou passo a passo do navegador. */
export function InstallInstructions() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  const [installed, setInstalled] = useState(false)

  useEffect(() => onInstallStateChange(() => setCanPrompt(canPromptInstall())), [])

  async function handleInstall() {
    if (await promptInstall()) setInstalled(true)
  }

  return (
    <>
      {installed ? (
        <p className="banner banner-info">
          Pronto! Agora abra o <strong>Nutriê</strong> pelo ícone na tela inicial do
          celular.
        </p>
      ) : canPrompt ? (
        <button type="button" className="btn btn-primary" onClick={handleInstall}>
          Instalar app
        </button>
      ) : isIOS ? (
        <ol className="install-steps">
          <li>
            Toque em <strong>Compartilhar</strong> <ShareIcon /> na barra do navegador.
          </li>
          <li>
            Role e toque em <strong>Adicionar à Tela de Início</strong>.
          </li>
          <li>
            Abra o <strong>Nutriê</strong> pelo ícone que apareceu na tela inicial.
          </li>
        </ol>
      ) : (
        <ol className="install-steps">
          <li>
            Toque no menu <strong>⋮</strong> do navegador.
          </li>
          <li>
            Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
          </li>
          <li>
            Abra o <strong>Nutriê</strong> pelo ícone que apareceu na tela inicial.
          </li>
        </ol>
      )}

      {isInAppBrowser ? (
        <p className="banner banner-error">
          Esta página abriu dentro de outro app. Abra o link no {isIOS ? 'Safari' : 'Chrome'} para
          conseguir instalar.
        </p>
      ) : (
        <p className="login-note">
          Recebeu o link por WhatsApp ou Instagram? Se não aparecer a opção de instalar, abra a
          página no {isIOS ? 'Safari' : 'Chrome'}.
        </p>
      )}
    </>
  )
}
