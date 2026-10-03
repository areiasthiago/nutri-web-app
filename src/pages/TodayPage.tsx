import { useAuth } from '../auth/AuthProvider'

export function TodayPage() {
  const { session, signOut } = useAuth()

  return (
    <div className="page">
      <header className="page-header">
        <h1>Hoje</h1>
        <button type="button" className="btn-link" onClick={() => signOut()}>
          Sair
        </button>
      </header>

      <p className="centered-message">
        Login funcionando! Logado como <strong>{session?.user.email}</strong>.
      </p>
      <p className="centered-message muted">
        O plano do dia, as refeições e a água chegam na próxima fatia.
      </p>
    </div>
  )
}
