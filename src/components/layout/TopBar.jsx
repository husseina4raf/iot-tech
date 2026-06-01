import { useLocation } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'

const pages = {
  '/dashboard': { ar:'لوحة التحكم',  en:'Super Admin Dashboard' },
  '/sales':     { ar:'المبيعات',      en:'Sales Management' },
  '/admin':     { ar:'الإدارة',       en:'Orders Administration' },
}

export default function TopBar() {
  const { pathname } = useLocation()
  const { orders } = useOrders()
  const page = pages[pathname] || pages['/dashboard']
  const newCount = orders.filter(o => o.status === 'جديد').length

  return (
    <header dir="rtl" style={{
      height:60, background:'#fff', borderBottom:'1px solid #e4eaf3',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 24px', flexShrink:0,
      boxShadow:'0 1px 3px rgba(15,23,42,0.06)',
    }}>
      <div>
        <h1 style={{ fontSize:17, fontWeight:700, color:'#0f172a', lineHeight:1.3 }}>{page.ar}</h1>
        <p style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{page.en}</p>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, background:'#eff6ff', color:'#2563eb', border:'1px solid #bfdbfe', letterSpacing:'0.04em' }}>
          DEMO
        </span>

        <div style={{ position:'relative' }}>
          <button style={{
            width:34, height:34, borderRadius:8, background:'#f7f9fc', border:'1px solid #e4eaf3',
            display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background='#eef2f9'}
          onMouseLeave={e => e.currentTarget.style.background='#f7f9fc'}>
            <Bell size={15} color="#64748b" />
          </button>
          {newCount > 0 && (
            <span style={{
              position:'absolute', top:-4, right:-4, width:17, height:17, borderRadius:'50%',
              background:'#2563eb', color:'#fff', fontSize:9, fontWeight:700,
              display:'flex', alignItems:'center', justifyContent:'center',
              border:'2px solid #fff',
            }}>
              {newCount > 9 ? '9+' : newCount}
            </span>
          )}
        </div>

        <div style={{ fontSize:12, color:'#64748b', padding:'5px 10px', borderRadius:8, background:'#f7f9fc', border:'1px solid #e4eaf3' }}>
          {new Date().toLocaleDateString('ar-EG', { weekday:'short', year:'numeric', month:'short', day:'numeric' })}
        </div>
      </div>
    </header>
  )
}
