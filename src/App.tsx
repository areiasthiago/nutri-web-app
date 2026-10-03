import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Footer } from './components/Footer'
import { supabaseConfigError } from './lib/supabaseClient'
import { LoginPage } from './pages/LoginPage'
import { TodayPage } from './pages/TodayPage'

function App() {
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
          <Footer />
        </div>
      </HashRouter>
    </AuthProvider>
  )
}

export default App
