import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { Footer } from './components/Footer'
import { LoginPage } from './pages/LoginPage'
import { TodayPage } from './pages/TodayPage'

function App() {
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
