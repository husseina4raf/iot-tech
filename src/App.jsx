import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { OrdersProvider } from './hooks/useOrders'
import { AuthProvider } from './hooks/useAuth'
import { SettingsProvider } from './hooks/useSettings'
import { ToastProvider } from './components/ui/Toast'
import ProtectedRoute from './components/auth/ProtectedRoute'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'

const SalesPage       = lazy(() => import('./pages/SalesPage'))
const AdminPage       = lazy(() => import('./pages/AdminPage'))
const DashboardPage   = lazy(() => import('./pages/DashboardPage'))
const TeamLeaderPage  = lazy(() => import('./pages/TeamLeaderPage'))

function PageLoader() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:36, height:36, border:'3px solid #e4eaf3', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <ToastProvider>
            <OrdersProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={<Navigate to="/login" replace />} />
                  <Route path="/sales" element={<ProtectedRoute><Layout><SalesPage /></Layout></ProtectedRoute>} />
                  <Route path="/admin" element={<ProtectedRoute><Layout><AdminPage /></Layout></ProtectedRoute>} />
                  <Route path="/dashboard" element={<ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>} />
                  <Route path="/team-leader" element={<ProtectedRoute><Layout><TeamLeaderPage /></Layout></ProtectedRoute>} />
                  <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
              </Suspense>
            </OrdersProvider>
          </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
