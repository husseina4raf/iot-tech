import { createContext, useContext, useState, useCallback } from 'react'
import { USERS, ROLE_ROUTES } from '../data/authData'

const AuthContext = createContext(null)

function loadSession() {
  try {
    const raw = localStorage.getItem('sl_session')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadSession)

  const login = useCallback((email, password) => {
    const found = USERS.find(
      u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password
    )
    if (!found) return { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }
    const { password: _, ...safeUser } = found
    setUser(safeUser)
    localStorage.setItem('sl_session', JSON.stringify(safeUser))
    return { success: true, user: safeUser }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('sl_session')
  }, [])

  const canAccess = useCallback((path) => {
    if (!user) return false
    return ROLE_ROUTES[user.role]?.some(r => path.startsWith(r)) ?? false
  }, [user])

  const defaultRoute = user ? (ROLE_ROUTES[user.role]?.[0] ?? '/login') : '/login'

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, canAccess, defaultRoute }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
