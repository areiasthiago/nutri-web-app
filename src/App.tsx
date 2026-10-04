import { useState } from 'react'
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppHeader } from './components/AppHeader'
import { BottomNav } from './components/BottomNav'
import { Footer } from './components/Footer'
import { InstallBanner } from './components/InstallBanner'
import { ThemeToggle } from './components/ThemeToggle'
import { shouldShowInstallInvite } from './lib/install'
import { ProfileProvider } from './lib/profile'
import { supabaseConfigError } from './lib/supabaseClient'
import { AccountPage } from './pages/AccountPage'
import { HouseholdPage } from './pages/HouseholdPage'
import { InstallPage } from './pages/InstallPage'
import { LoginPage } from './pages/LoginPage'
import { MyPlanPage } from './pages/MyPlanPage'
import { NewPlanPage } from './pages/NewPlanPage'
import { StatsPage } from './pages/StatsPage'
import { TodayPage } from './pages/TodayPage'

/** Telas logadas: cabeçalho com marca, tema e menu da conta. */
function SignedInLayout() {
  return (
    <ProtectedRoute>
      <ProfileProvider>
        <AppHeader />
        <Outlet />
        <BottomNav />
      </ProfileProvider>
    </ProtectedRoute>
  )
}

/** Telas sem login: só o botão de tema, flutuando no canto. */
function SignedOutLayout() {
  return (
    <>
      <ThemeToggle floating />
      <Outlet />
    </>
  )
}

function App() {
  const [showInstall, setShowInstall] = useState(shouldShowInstallInvite)

  if (showInstall) {
    return (
      <div className="app-shell">
        <ThemeToggle floating />
        <main className="app-main">
          <InstallPage onContinue={() => setShowInstall(false)} />
        </main>
        <Footer />
      </div>
    )
  }

  if (supabaseConfigError) {
    return (
      <div className="app-shell">
        <ThemeToggle floating />
        <main className="app-main">
          <p className="centered-message banner banner-error">{supabaseConfigError}</p>
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <AuthProvider>
      <HashRouter>
        <div className="app-shell">
          <main className="app-main">
            <Routes>
              <Route element={<SignedOutLayout />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>
              <Route element={<SignedInLayout />}>
                <Route path="/" element={<TodayPage />} />
                <Route path="/conta" element={<AccountPage />} />
                <Route path="/plano" element={<MyPlanPage />} />
                <Route path="/plano/novo" element={<NewPlanPage />} />
                <Route path="/estatisticas" element={<StatsPage />} />
                <Route path="/casa" element={<HouseholdPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Footer />
          <InstallBanner />
        </div>
      </HashRouter>
    </AuthProvider>
  )
}

export default App
