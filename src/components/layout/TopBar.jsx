import { useState, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Bell, Package, Clock, CheckCircle, XCircle, Menu } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'

const pages = {
  '/dashboard': { ar:'لوحة التحكم',  en:'Super Admin Dashboard' },
  '/sales':     { ar:'المبيعات',      en:'Sales Management' },
  '/admin':     { ar:'الإدارة',       en:'Orders Administration' },
  '/team-leader': { ar:'مراجعة الطلبات', en:'Team Leader' },
}

const STATUS_CONFIG = {
  'بانتظار الموافقة': { color:'#f59e0b', bg:'#fffbeb', icon: Clock },
  'جديد':             { color:'#2563eb', bg:'#eff6ff', icon: Package },
  'موافق عليه':       { color:'#059669', bg:'#ecfdf5', icon: CheckCircle },
  'مرفوض':            { color:'#e11d48', bg:'#fff1f2', icon: XCircle },
}

export default function TopBar({ isMobile, onMenuOpen }) {
  const { pathname } = useLocation()
  const { orders }   = useOrders()
  const page         = pages[pathname] || pages['/dashboard']

  const [open, setOpen] = useState(false)
  const ref             = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const notifs = orders
    .filter(o => o.status === 'بانتظار الموافقة' || o.status === 'جديد')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 10)

  const count = notifs.length

  return (
    <header dir="rtl" style={{
      height:60, background:'#fff', borderBottom:'1px solid #e4eaf3',
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding: isMobile ? '0 14px' : '0 24px', flexShrink:0,
      boxShadow:'0 1px 3px rgba(15,23,42,0.06)',
    }}>
      {/* Title + hamburger */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {isMobile && (
          <button onClick={onMenuOpen}
            style={{ width:36, height:36, borderRadius:9, background:'#f7f9fc', border:'1px solid #e4eaf3', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0 }}
            onMouseEnter={e => e.currentTarget.style.background='#eff6ff'}
            onMouseLeave={e => e.currentTarget.style.background='#f7f9fc'}>
            <Menu size={18} color="#475569" />
          </button>
        )}
        <div>
          <h1 style={{ fontSize: isMobile ? 14 : 17, fontWeight:700, color:'#0f172a', lineHeight:1.3 }}>{page.ar}</h1>
          {!isMobile && <p style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{page.en}</p>}
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap: isMobile ? 6 : 12 }}>
        {/* Bell */}
        <div ref={ref} style={{ position:'relative' }}>
          <button
            onClick={() => setOpen(v => !v)}
            style={{
              width:34, height:34, borderRadius:8,
              background: open ? '#eff6ff' : '#f7f9fc',
              border: open ? '1px solid #bfdbfe' : '1px solid #e4eaf3',
              display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', transition:'all 0.15s',
            }}>
            <Bell size={15} color={open ? '#2563eb' : '#64748b'} />
          </button>

          {count > 0 && (
            <span style={{
              position:'absolute', top:-5, right:-5, minWidth:18, height:18,
              borderRadius:9, background:'#e11d48', color:'#fff',
              fontSize:10, fontWeight:700, padding:'0 4px',
              display:'flex', alignItems:'center', justifyContent:'center',
              border:'2px solid #fff', pointerEvents:'none',
            }}>
              {count > 9 ? '9+' : count}
            </span>
          )}

          {open && (
            <div style={{
              position:'absolute', top:42, left: isMobile ? 'auto' : 0, right: isMobile ? 0 : 'auto',
              width: isMobile ? 'calc(100vw - 28px)' : 320, maxWidth:320, zIndex:1000,
              background:'#fff', borderRadius:14, border:'1px solid #e4eaf3',
              boxShadow:'0 8px 32px rgba(15,23,42,0.15)', overflow:'hidden',
              animation:'fadeDown 0.15s ease-out',
            }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid #f0f4fa', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>الإشعارات</span>
                {count > 0 && (
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#eff6ff', color:'#2563eb' }}>
                    {count} طلب يحتاج متابعة
                  </span>
                )}
              </div>

              <div style={{ maxHeight:340, overflowY:'auto' }}>
                {notifs.length === 0 ? (
                  <div style={{ padding:'32px 16px', textAlign:'center' }}>
                    <Bell size={28} color="#cbd5e1" style={{ marginBottom:8 }} />
                    <div style={{ fontSize:13, color:'#94a3b8', fontWeight:600 }}>لا توجد إشعارات جديدة</div>
                  </div>
                ) : (
                  notifs.map(order => {
                    const cfg  = STATUS_CONFIG[order.status] || STATUS_CONFIG['جديد']
                    const Icon = cfg.icon
                    return (
                      <div key={order.id} style={{
                        display:'flex', alignItems:'flex-start', gap:12,
                        padding:'12px 16px', borderBottom:'1px solid #f8fafc',
                        transition:'background 0.1s', cursor:'default',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                        <div style={{ width:34, height:34, borderRadius:9, background:cfg.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <Icon size={15} color={cfg.color}/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {order.clientName || '—'}
                            {order.company ? ` — ${order.company}` : ''}
                          </div>
                          <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>
                            {order.salesRep && `المندوب: ${order.salesRep} · `}
                            {order.serialNumber && `#${order.serialNumber}`}
                          </div>
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:cfg.bg, color:cfg.color }}>
                            {order.status}
                          </span>
                        </div>
                        <div style={{ fontSize:10, color:'#cbd5e1', whiteSpace:'nowrap', flexShrink:0 }}>
                          {order.date || ''}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {count === 0 && (
                <div style={{ padding:'10px 16px', borderTop:'1px solid #f0f4fa', textAlign:'center', fontSize:11, color:'#94a3b8' }}>
                  كل الطلبات تمت معالجتها ✓
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date — hidden on mobile */}
        {!isMobile && (
          <div style={{ fontSize:12, color:'#64748b', padding:'5px 10px', borderRadius:8, background:'#f7f9fc', border:'1px solid #e4eaf3' }}>
            {new Date().toLocaleDateString('ar-EG', { weekday:'short', year:'numeric', month:'short', day:'numeric' })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeDown {
          from { opacity:0; transform:translateY(-6px) }
          to   { opacity:1; transform:translateY(0) }
        }
      `}</style>
    </header>
  )
}
