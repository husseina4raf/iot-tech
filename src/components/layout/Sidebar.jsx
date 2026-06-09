import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Settings, Lock, LogOut, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { ROLE_LABELS, ROLE_ROUTES } from '../../data/authData'

const ALL_NAV = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'لوحة التحكم',  labelEn: 'Dashboard',   roles: ['super_admin'] },
  { to: '/sales',        icon: ShoppingCart,    label: 'المبيعات',      labelEn: 'Sales',        roles: ['sales'] },
  { to: '/team-leader',  icon: Users,           label: 'مراجعة الطلبات', labelEn: 'Team Leader', roles: ['team_leader'] },
  { to: '/admin',        icon: Settings,        label: 'الإدارة',       labelEn: 'Admin',        roles: ['admin', 'super_admin'] },
]

const roleInfo = {
  sales:       { bg:'rgba(59,130,246,0.15)',  color:'#93c5fd', label:'مندوب مبيعات', avatar:'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
  team_leader: { bg:'rgba(6,182,212,0.15)',   color:'#67e8f9', label:'قائد فريق',     avatar:'linear-gradient(135deg,#0891b2,#0e7490)' },
  admin:       { bg:'rgba(52,211,153,0.15)',  color:'#6ee7b7', label:'مدير',           avatar:'linear-gradient(135deg,#10b981,#047857)' },
  super_admin: { bg:'rgba(167,139,250,0.15)', color:'#c4b5fd', label:'مدير عام',       avatar:'linear-gradient(135deg,#8b5cf6,#6d28d9)' },
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const navItems = ALL_NAV.filter(i => i.roles.includes(user?.role))
  const info = roleInfo[user?.role] || roleInfo.sales

  return (
    <aside dir="rtl" style={{
      width: 258, background: '#0d1b3e', display:'flex', flexDirection:'column',
      flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* Logo */}
      <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            width:38, height:38, borderRadius:10, flexShrink:0,
            background:'linear-gradient(135deg,#1d4ed8,#2563eb)',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 4px 12px rgba(37,99,235,0.4)',
          }}>
            <Lock size={17} color="#fff" />
          </div>
          <div>
            <div style={{ color:'#f1f5f9', fontWeight:700, fontSize:15, lineHeight:1.3 }}>SmartLock Pro</div>
            <div style={{ color:'#475569', fontSize:11, marginTop:1 }}>إدارة المبيعات</div>
          </div>
        </div>
      </div>

      {/* Section label */}
      <div style={{ padding:'20px 20px 8px' }}>
        <span style={{ fontSize:10, fontWeight:700, color:'#334155', letterSpacing:'0.1em', textTransform:'uppercase' }}>
          التنقل
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'0 12px' }}>
        {navItems.map(({ to, icon: Icon, label, labelEn }) => (
          <NavLink key={to} to={to} style={{ display:'block', marginBottom:2, textDecoration:'none' }}>
            {({ isActive }) => (
              <div style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10,
                background: isActive ? 'rgba(37,99,235,0.18)' : 'transparent',
                borderRight: isActive ? '3px solid #2563eb' : '3px solid transparent',
                cursor:'pointer', transition:'all 0.15s',
              }}
              onMouseEnter={e => { if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { if(!isActive) e.currentTarget.style.background='transparent' }}>
                <Icon size={17} color={isActive ? '#60a5fa' : '#475569'} style={{ flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color: isActive ? '#bfdbfe' : '#94a3b8', lineHeight:1.3 }}>{label}</div>
                  <div style={{ fontSize:10, color: isActive ? 'rgba(147,197,253,0.5)' : '#334155' }}>{labelEn}</div>
                </div>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div style={{ margin:'0 12px', borderTop:'1px solid rgba(255,255,255,0.06)' }} />

      {/* User + logout */}
      <div style={{ padding:'12px 12px 16px' }}>
        {/* User card */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background:'rgba(255,255,255,0.04)', marginBottom:4 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:info.avatar, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:14, flexShrink:0 }}>
            {user?.name?.[0] || '؟'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#e2e8f0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.name}</div>
            <span style={{ fontSize:10, padding:'1px 8px', borderRadius:20, background:info.bg, color:info.color, fontWeight:600, display:'inline-block', marginTop:2 }}>
              {info.label}
            </span>
          </div>
        </div>

        {/* Logout */}
        <button onClick={() => { logout(); navigate('/login', { replace:true }) }}
          style={{
            width:'100%', display:'flex', alignItems:'center', gap:8, padding:'9px 12px',
            borderRadius:10, border:'none', background:'transparent', cursor:'pointer',
            color:'#475569', fontSize:13, fontFamily:'Cairo, sans-serif', fontWeight:500,
            transition:'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.1)'; e.currentTarget.style.color='#f87171' }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#475569' }}>
          <LogOut size={15} />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
