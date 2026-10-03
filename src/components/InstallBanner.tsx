import { useEffect, useState } from 'react'
import { onInstallStateChange, shouldRemindInstall } from '../lib/install'

/**
 * Lembrete fixo no rodapé enquanto o app estiver aberto no navegador do
 * celular. Não dá para dispensar: some só quando o app é instalado.
 */
export function InstallBanner({ onInstall }: { onInstall: () => void }) {
  const [visible, setVisible] = useState(shouldRemindInstall)

  useEffect(() => onInstallStateChange(() => setVisible(shouldRemindInstall())), [])

  if (!visible) return null

  return (
    <div className="install-banner" role="region" aria-label="Instalar o app">
      <span>Use o Nutri Helper como app no seu celular.</span>
      <button type="button" className="btn btn-primary btn-small" onClick={onInstall}>
        Instalar
      </button>
    </div>
  )
}
