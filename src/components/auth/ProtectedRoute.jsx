import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, canAccess, defaultRoute } = useAuth()
  const { pathname } = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!canAccess(pathname)) {
    return <Navigate to={defaultRoute} replace />
  }

  return children
}
