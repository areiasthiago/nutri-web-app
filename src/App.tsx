import { useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Footer } from './components/Footer'
import { InstallBanner } from './components/InstallBanner'
import { shouldShowInstallInvite } from './lib/install'
import { supabaseConfigError } from './lib/supabaseClient'
import { InstallPage } from './pages/InstallPage'
import { LoginPage } from './pages/LoginPage'
import { TodayPage } from './pages/TodayPage'

function App() {
  const [showInstall, setShowInstall] = useState(shouldShowInstallInvite)

  if (showInstall) {
    return (
      <div className="app-shell">
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
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <TodayPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <InstallBanner onInstall={() => setShowInstall(true)} />
          <Footer />
        </div>
      </HashRouter>
    </AuthProvider>
  )
}

export default App
