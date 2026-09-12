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
    const { data } = await supabase.from('profiles').select('*').eq('active', true).order('created_at')
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
        await fetchUsers()
      }
      setLoading(false)
      // One-time bootstrap: creates the demo accounts on a brand-new database.
      // Independent of who (if anyone) is logged in yet, so it stays outside
      // the per-session fetch below; it re-fetches users itself afterward so
      // a first-ever run picks up the accounts it just created.
      seedIfEmpty().then(() => fetchUsers())
    })

    // Re-runs fetchUsers() on every genuine sign-in — covers a fresh login
    // (session becomes available without a page reload) and switching from
    // one logged-in user to another, not just the initial session restore.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id)
        setUser(profile)
        await fetchUsers()
      } else {
        // Logged out — clear user-specific state so it doesn't leak into
        // whatever session (or lack of one) comes next.
        setUser(null)
        setUsers([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Eligible salesperson = Sales OR Team Leader (Team Leaders sell too and must
  // be attributed profit/commission for orders they create). Admin/Super Admin
  // are intentionally excluded — they are not salespeople.
  // `&& u.repName` guards against a user (e.g. a seeded Team Leader) whose
  // repName is null/empty: such a user cannot be attributed to any order
  // (orders are matched by repName) and must be excluded from this derived
  // list rather than crashing every consumer that does `rep[0]` etc. This
  // does NOT remove them from the system or fabricate a name — it only
  // excludes an unusable value from a display/aggregation list.
  const salesReps = users
    .filter(u => (u.role === 'sales' || u.role === 'team_leader') && u.active && u.repName)
    .map(u => u.repName)

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

  // Creates a new user account without ever touching the CALLER's own
  // Supabase Auth session. The previous implementation called
  // `supabase.auth.signUp(...)` directly from the Admin's own browser
  // client — signUp() authenticates as the newly created account on the
  // calling client, which silently replaced the Admin's active session
  // and caused them to be redirected to Login immediately after creating
  // a user. All privileged work (auth.users creation, profiles insert,
  // and compensating cleanup on partial failure) now happens server-side
  // in the `create-user` Edge Function (supabase/functions/create-user),
  // which uses the service_role key internally and never exposes it here.
  const addUser = async ({ name, username, password, role, repName }) => {
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        name,
        username: username.toLowerCase().trim(),
        password,
        role,
        repName: repName || null,
      },
    })
    if (error) {
      // supabase-js exposes the Edge Function's raw Response (when it
      // returned a non-2xx status) on `error.context` — prefer that
      // response's own `{ error: "..." }` body (already a friendly
      // Arabic message from the function) over the generic SDK message.
      let message = error.message
      try {
        const body = await error.context?.json?.()
        if (body?.error) message = body.error
      } catch {
        // ignore — fall back to error.message below
      }
      throw new Error(message || 'فشل إضافة المستخدم — حاول مرة أخرى')
    }
    if (data?.error) throw new Error(data.error)
    await fetchUsers()
  }

  const deleteUser = async (userId) => {
    const { error } = await supabase.from('profiles').update({ active: false }).eq('id', userId)
    if (error) throw new Error(error.message)
    await fetchUsers()
  }

  // ── Role management ───────────────────────────────────────────────────────
  // Calls the SECURITY DEFINER RPC `change_user_role` which enforces all
  // permission rules server-side and writes an audit log entry.
  const changeUserRole = async (targetUserId, newRole) => {
    const { data, error } = await supabase.rpc('change_user_role', {
      target_user_id: targetUserId,
      new_role:       newRole,
    })
    if (error) throw new Error(error.message)
    await fetchUsers()
    return data   // { ok, previous_role, new_role, target_name }
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
      addUser, deleteUser, changeUserRole,
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
