import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { USERS, ROLE_ROUTES, ROLE_LABELS } from '../data/authData'

const AuthContext = createContext(null)
const USERS_KEY = 'sl_users_v1'

function loadSession() {
  try { return JSON.parse(localStorage.getItem('sl_session')) ?? null }
  catch { return null }
}

function loadUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? JSON.parse(raw) : USERS
  } catch { return USERS }
}

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(loadSession)
  const [users, setUsers] = useState(loadUsers)

  // Persist users list whenever it changes
  useEffect(() => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  }, [users])

  // Dynamic sales reps list (single source of truth)
  const salesReps = users.filter(u => u.role === 'sales').map(u => u.repName)

  const login = useCallback((email, password) => {
    const list  = loadUsers()   // always read latest from storage
    const found = list.find(
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

  const addUser = useCallback((data) => {
    // data: { name, nameEn, email, password, repName, role? }
    const newUser = {
      id:     `u-${Date.now()}`,
      role:   data.role || 'sales',
      avatar: data.name?.[0] ?? '؟',
      ...data,
    }
    setUsers(prev => [...prev, newUser])
    return newUser
  }, [])

  const deleteUser = useCallback((userId) => {
    setUsers(prev => prev.filter(u => u.id !== userId))
  }, [])

  const defaultRoute = user ? (ROLE_ROUTES[user.role]?.[0] ?? '/login') : '/login'

  return (
    <AuthContext.Provider value={{
      user, users, salesReps,
      login, logout,
      addUser, deleteUser,
      isAuthenticated: !!user, canAccess, defaultRoute,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
