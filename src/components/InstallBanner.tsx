import { useEffect, useState } from 'react'
import { canPromptInstall, onInstallStateChange, promptInstall, shouldRemindInstall } from '../lib/install'
import { InstallInstructions } from './InstallInstructions'

/**
 * Lembrete fixo no rodapé enquanto o app estiver aberto no navegador do
 * celular. Não dá para dispensar: some só quando o app é instalado.
 * "Instalar" abre o instalador nativo quando existe (Android/Chrome); senão,
 * mostra o passo a passo numa janela por cima da tela atual.
 */
export function InstallBanner() {
  const [visible, setVisible] = useState(shouldRemindInstall)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => onInstallStateChange(() => setVisible(shouldRemindInstall())), [])

  if (!visible) return null

  async function handleInstall() {
    if (canPromptInstall()) {
      await promptInstall()
    } else {
      setSheetOpen(true)
    }
  }

  return (
    <>
      <div className="install-banner" role="region" aria-label="Instalar o app">
        <span>Instale o app no seu celular.</span>
        <button type="button" className="btn btn-primary btn-small" onClick={handleInstall}>
          Instalar
        </button>
      </div>

      {sheetOpen && (
        <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-sheet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="install-sheet-title">Instalar o Nutriê</h2>
            <InstallInstructions />
            <button type="button" className="btn-link" onClick={() => setSheetOpen(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
