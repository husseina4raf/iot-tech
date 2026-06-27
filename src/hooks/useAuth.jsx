import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE_ROUTES, ROLE_LABELS } from '../data/authData'

const AuthContext = createContext(null)

const INITIAL_USERS = [
  { username: 'israa',      password: 'sales123', name: 'إسراء عبداللطيف', role: 'sales',       repName: 'إسراء' },
  { username: 'mohamed',    password: 'sales123', name: 'محمد أحمد',        role: 'sales',       repName: 'محمد'  },
  { username: 'teamlead',   password: 'lead123',  name: 'قائد الفريق',      role: 'team_leader', repName: null    },
  { username: 'admin',      password: 'admin123', name: 'مدير العمليات',    role: 'admin',       repName: null    },
  { username: 'superadmin', password: 'super123', name: 'المدير العام',     role: 'super_admin', repName: null    },
]

function mapProfile(row) {
  return {
    id:      row.id,
    name:    row.name,
    username: row.username,
    role:    row.role,
    repName: row.rep_name,
    active:  row.active,
  }
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    return data ? mapProfile(data) : null
  }

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    if (data) setUsers(data.map(mapProfile))
  }, [])

  // Seed initial users once (first run only)
  const seedIfEmpty = async () => {
    if (localStorage.getItem('app_seeded_v1')) return
    setSeeding(true)
    for (const u of INITIAL_USERS) {
      const email = `${u.username}@iottech.app`
      const { data: authData, error } = await supabase.auth.signUp({ email, password: u.password })
      if (!error && authData?.user) {
        await supabase.from('profiles').insert({
          id:       authData.user.id,
          name:     u.name,
          username: u.username,
          role:     u.role,
          rep_name: u.repName || null,
          active:   true,
        })
      }
    }
    localStorage.setItem('app_seeded_v1', '1')
    setSeeding(false)
    await fetchUsers()
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id)
        if (profile) setUser(profile)
      }
      setLoading(false)
      // Background: seed & fetch users without blocking UI
      seedIfEmpty().then(() => fetchUsers())
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id)
        setUser(profile)
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const salesReps = users.filter(u => u.role === 'sales' && u.active).map(u => u.repName)

  const login = async (username, password) => {
    const email = `${username.toLowerCase().trim()}@iottech.app`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }
    const profile = await fetchProfile(data.user.id)
    if (profile) setUser(profile)
    return { success: true, user: profile }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const canAccess = useCallback((path) => {
    if (!user) return false
    return ROLE_ROUTES[user.role]?.some(r => path.startsWith(r)) ?? false
  }, [user])

  const addUser = async ({ name, username, password, role, repName }) => {
    const email = `${username.toLowerCase().trim()}@iottech.app`
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) throw new Error(authError.message)
    const { error: profileError } = await supabase.from('profiles').insert({
      id:       authData.user.id,
      name,
      username: username.toLowerCase().trim(),
      role,
      rep_name: repName || null,
      active:   true,
    })
    if (profileError) throw new Error(profileError.message)
    await fetchUsers()
  }

  const deleteUser = async (userId) => {
    await supabase.from('profiles').update({ active: false }).eq('id', userId)
    await fetchUsers()
  }

  const defaultRoute = user ? (ROLE_ROUTES[user.role]?.[0] ?? '/login') : '/login'

  if (loading || seeding) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Cairo,sans-serif', color:'#475569', gap:12 }}>
        <div style={{ width:32, height:32, border:'3px solid #e4eaf3', borderTopColor:'#2563eb', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <span style={{ fontSize:14 }}>{seeding ? 'جارٍ إعداد النظام لأول مرة...' : 'جارٍ التحميل...'}</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

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
