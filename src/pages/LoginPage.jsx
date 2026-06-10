import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { USERS, ROLE_LABELS, ROLE_ROUTES } from '../data/authData'

const roleStyle = {
  sales:       { dot: '#60a5fa', label: '#3b82f6' },
  admin:       { dot: '#34d399', label: '#10b981' },
  super_admin: { dot: '#a78bfa', label: '#8b5cf6' },
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername]  = useState('')
  const [password, setPassword]  = useState('')
  const [showPass, setShowPass]  = useState(false)
  const [error, setError]        = useState('')
  const [loading, setLoading]    = useState(false)
  const [focused, setFocused]    = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) { setError('يرجى إدخال اسم المستخدم وكلمة المرور'); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 450))
    const result = login(username, password)
    setLoading(false)
    if (!result.success) { setError(result.error) }
    else { navigate(ROLE_ROUTES[result.user.role]?.[0] ?? '/dashboard', { replace: true }) }
  }

  const fieldStyle = (name) => ({
    width: '100%', padding: '11px 14px', fontSize: 14,
    fontFamily: 'Cairo, sans-serif', direction: 'ltr',
    border: `1.5px solid ${focused === name ? '#2563eb' : '#dde3ed'}`,
    borderRadius: 10, background: focused === name ? '#fff' : '#f7f9fc',
    color: '#0f172a', outline: 'none',
    boxShadow: focused === name ? '0 0 0 3px rgba(37,99,235,0.12)' : 'none',
    transition: 'all 0.15s',
  })

  return (
    <div style={{
      minHeight: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0d1b3e 0%, #1a2f6b 40%, #0d2352 70%, #091428 100%)',
      direction: 'rtl', position: 'relative', overflow: 'hidden',
    }}>
      {/* Abstract bg shapes */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position:'absolute', top:-120, right:-120, width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 70%)' }} />
        <div style={{ position:'absolute', bottom:-100, left:-80, width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)' }} />
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.04 }}>
          <defs><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="white"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#dots)"/>
        </svg>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 440, margin: '0 auto', padding: '0 16px',
        animation: 'fadeUp 0.4s ease-out both',
      }}>
        <div style={{
          background: '#fff', borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}>
          {/* Header strip */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)',
            padding: '28px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
            <div style={{ position:'absolute', bottom:-20, left:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
            <div style={{
              width:52, height:52, background:'rgba(255,255,255,0.15)', borderRadius:14,
              display:'flex', alignItems:'center', justifyContent:'center',
              margin:'0 auto 14px', backdropFilter:'blur(8px)',
              border:'1px solid rgba(255,255,255,0.2)',
            }}>
              <Lock size={24} color="#fff" />
            </div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:20, lineHeight:1.3 }}>SmartLock Pro</div>
            <div style={{ color:'rgba(255,255,255,0.6)', fontSize:13, marginTop:4 }}>
              Smart Home OS — نظام إدارة المبيعات
            </div>
          </div>

          {/* Form area */}
          <div style={{ padding: '28px 32px 24px' }}>
            <h2 style={{ fontSize:17, fontWeight:700, color:'#0f172a', marginBottom:6 }}>تسجيل الدخول</h2>
            <p style={{ fontSize:13, color:'#64748b', marginBottom:24 }}>أدخل بياناتك للوصول إلى حسابك</p>

            <form onSubmit={handleSubmit}>
              {/* Username */}
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>
                  اسم المستخدم
                </label>
                <div style={{ position:'relative' }}>
                  <User size={15} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color: focused==='user'?'#2563eb':'#94a3b8', transition:'color 0.15s' }} />
                  <input type="text" value={username} placeholder="username"
                    style={{ ...fieldStyle('user'), paddingRight:38 }}
                    onChange={e => { setUsername(e.target.value); setError('') }}
                    onFocus={() => setFocused('user')} onBlur={() => setFocused('')}
                    autoComplete="username" autoCapitalize="none" />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: error ? 16 : 20 }}>
                <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>
                  كلمة المرور
                </label>
                <div style={{ position:'relative' }}>
                  <Lock size={15} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color: focused==='pass'?'#2563eb':'#94a3b8', transition:'color 0.15s' }} />
                  <input type={showPass?'text':'password'} value={password} placeholder="••••••••"
                    style={{ ...fieldStyle('pass'), paddingRight:38, paddingLeft:38 }}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    onFocus={() => setFocused('pass')} onBlur={() => setFocused('')}
                    autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPass(v=>!v)}
                    style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0, display:'flex' }}>
                    {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:'#fef2f2', border:'1px solid #fecaca', marginBottom:16 }}>
                  <AlertCircle size={14} color="#ef4444" style={{ flexShrink:0 }} />
                  <span style={{ fontSize:13, color:'#dc2626' }}>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading} style={{
                width:'100%', padding:'12px', borderRadius:10, border:'none', cursor: loading?'not-allowed':'pointer',
                background: loading ? '#93c5fd' : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                color:'#fff', fontWeight:700, fontSize:14, fontFamily:'Cairo, sans-serif',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(37,99,235,0.4)',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                transition:'all 0.2s',
              }}
              onMouseEnter={e => { if(!loading) e.currentTarget.style.boxShadow='0 6px 20px rgba(37,99,235,0.5)' }}
              onMouseLeave={e => { if(!loading) e.currentTarget.style.boxShadow='0 4px 14px rgba(37,99,235,0.4)' }}>
                {loading ? <span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite' }} /> : <Lock size={14}/>}
                {loading ? 'جارٍ التحقق...' : 'تسجيل الدخول'}
              </button>
            </form>
          </div>

          {/* Demo accounts */}
          <div style={{ padding:'0 32px 28px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ flex:1, height:1, background:'#e8eef6' }} />
              <span style={{ fontSize:11, color:'#94a3b8', fontWeight:600, whiteSpace:'nowrap' }}>حسابات تجريبية</span>
              <div style={{ flex:1, height:1, background:'#e8eef6' }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {USERS.map(u => {
                const rs = roleStyle[u.role]
                return (
                  <button key={u.id} type="button" onClick={() => { setUsername(u.username); setPassword(u.password); setError('') }}
                    style={{
                      textAlign:'right', padding:'10px 12px', borderRadius:10, border:'1.5px solid #e8eef6',
                      background:'#f7f9fc', cursor:'pointer', transition:'all 0.15s', fontFamily:'Cairo, sans-serif',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor=rs.label; e.currentTarget.style.background='#fff' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='#e8eef6'; e.currentTarget.style.background='#f7f9fc' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <div style={{ width:6, height:6, borderRadius:'50%', background:rs.dot, flexShrink:0 }} />
                      <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>{u.name}</span>
                    </div>
                    <div style={{ fontSize:11, color:'#94a3b8', paddingRight:12 }}>{ROLE_LABELS[u.role]}</div>
                    <div style={{ fontSize:11, color:'#60a5fa', paddingRight:12, fontFamily:'monospace', marginTop:1 }}>{u.username}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.25)', marginTop:20 }}>
          DEMO VERSION — SmartLock Pro © 2024
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
