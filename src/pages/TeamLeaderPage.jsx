import { useState } from 'react'
import { Clock, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, User, Package, Phone, MapPin, CreditCard, Calendar, Edit3, AlertTriangle, Trophy, TrendingUp } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/Toast'
import Badge from '../components/ui/Badge'
import OrderForm from '../components/sales/OrderForm'
import Leaderboard from '../components/sales/Leaderboard'
import SalesReports from '../components/admin/SalesReports'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const TABS = [
  { id:'pending',     label:'بانتظار الموافقة', icon: Clock },
  { id:'all',         label:'جميع الفواتير',    icon: FileText },
  { id:'inventory',   label:'المخزون',          icon: Package },
  { id:'leaderboard', label:'المتصدرون',        icon: Trophy },
  { id:'reports',     label:'تقارير الأرباح',   icon: TrendingUp },
]

const STATUS_NEXT = {
  'موافق عليه': { label:'تم الصرف',   bg:'#d97706', shadow:'rgba(217,119,6,0.35)' },
  'تم الصرف':   { label:'مكتمل',      bg:'#7c3aed', shadow:'rgba(124,58,237,0.35)' },
  'مكتمل':      { label:'تم التحصيل', bg:'#10b981', shadow:'rgba(16,185,129,0.35)' },
}

export default function TeamLeaderPage() {
  const [tab, setTab]                   = useState('pending')
  const [expanded, setExpanded]         = useState({})
  const [editingOrder, setEditingOrder] = useState(null)

  const { orders, approveOrder, rejectOrder, updateOrderStatus, inventory } = useOrders()
  const { user } = useAuth()
  const toast = useToast()

  const pendingOrders = [...orders].filter(o => o.status === 'بانتظار الموافقة')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const allOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const onApprove = (id, ref) => {
    approveOrder(id, user)
    toast(`تم اعتماد فاتورة: ${ref} ✓`, 'success')
  }
  const onReject = (id, ref) => {
    if (!window.confirm(`هل تريد رفض فاتورة: "${ref}"؟`)) return
    rejectOrder(id, user)
    toast('تم رفض الفاتورة', 'error')
  }
  const onAdvance = (order, next) => {
    updateOrderStatus(order.id, next, user)
    toast(`تم تحديث الحالة إلى ${next} ✓`, 'success')
  }

  const onCalendar = (order) => {
    const title   = encodeURIComponent(order.clientName)
    const items   = order.items.map(i => `• ${i.name} × ${i.quantity}`).join('\n')
    const details = encodeURIComponent(
      `رقم الطلب: #${order.serialNumber}\nالمندوب: ${order.salesRep}` +
      (order.mobile    ? `\nالموبايل: ${order.mobile}`   : '') +
      (order.whatsapp  ? `\nواتساب: ${order.whatsapp}`   : '') +
      (order.time      ? `\nوقت التركيب: ${order.time}`  : '') +
      (order.address   ? `\n\nالعنوان: ${order.address}` : '') +
      (order.locationLink ? `\nخريطة: ${order.locationLink}` : '') +
      `\n\nالأصناف:\n${items}` +
      `\n\nالإجمالي: ${order.total?.toLocaleString()} LE` +
      (order.paymentMethod ? `\nطريقة الدفع: ${order.paymentMethod}` : '') +
      (order.notes ? `\n\nملاحظات: ${order.notes}` : '')
    )
    const location = encodeURIComponent(order.locationLink || order.address || '')
    const parts    = (order.date || '').split('-')
    let datesParam = ''
    if (parts.length === 3) {
      const ymd = `${parts[2]}${parts[1]}${parts[0]}`
      if (order.time && order.time.includes(':')) {
        const [h, m] = order.time.split(':')
        const start  = `${ymd}T${h.padStart(2,'0')}${m.padStart(2,'0')}00`
        const endH   = String(parseInt(h, 10) + 2).padStart(2, '0')
        const end    = `${ymd}T${endH}${m.padStart(2,'0')}00`
        datesParam   = `&dates=${start}/${end}`
      } else {
        datesParam = `&dates=${ymd}/${ymd}`
      }
    }
    window.open(
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}${datesParam}`,
      '_blank'
    )
  }

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  // ── Edit order view ──────────────────────────────────────────────────────────
  if (editingOrder) return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      <button onClick={() => setEditingOrder(null)}
        style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'#64748b', background:'none', border:'none', cursor:'pointer', marginBottom:20, fontFamily:'Cairo,sans-serif' }}
        onMouseEnter={e => e.currentTarget.style.color='#2563eb'}
        onMouseLeave={e => e.currentTarget.style.color='#64748b'}>
        <ChevronRight size={15}/>العودة لقائمة الطلبات
      </button>
      <div style={{ padding:'12px 16px', borderRadius:10, background:'#fffbeb', border:'1px solid #fde68a', fontSize:13, fontWeight:600, color:'#92400e', marginBottom:16 }}>
        تعديل الطلب: {editingOrder.clientName} — {editingOrder.company}
      </div>
      <OrderForm editOrder={editingOrder} onSaved={() => setEditingOrder(null)} />
    </div>
  )

  const displayOrders = tab === 'pending' ? pendingOrders : allOrders

  return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      {/* Tabs */}
      <div className="m-tab-scroll" style={{ display:'inline-flex', gap:4, padding:5, borderRadius:12, background:'#fff', border:'1px solid #e4eaf3', marginBottom:20, boxShadow:'0 1px 4px rgba(15,23,42,0.05)', position:'relative' }}>
        {TABS.map(({ id, label, icon:Icon }) => {
          const badge = id === 'pending' ? pendingOrders.length : null
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 18px', borderRadius:9, border:'none', background: tab===id?'linear-gradient(135deg,#1d4ed8,#2563eb)':'transparent', color: tab===id?'#fff':'#64748b', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow: tab===id?'0 3px 10px rgba(37,99,235,0.35)':'none', transition:'all 0.15s', position:'relative' }}
              onMouseEnter={e => { if(tab!==id) e.currentTarget.style.background='#f0f4fa' }}
              onMouseLeave={e => { if(tab!==id) e.currentTarget.style.background='transparent' }}>
              <Icon size={14}/>{label}
              {badge > 0 && (
                <span style={{ position:'absolute', top:-5, left:-5, width:18, height:18, borderRadius:'50%', background:'#e11d48', color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff' }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Inventory tab ─────────────────────────────────────────────────────── */}
      {tab === 'inventory' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <Package size={16} color="#2563eb"/>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>المخزون</h3>
            <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#f5f3ff', color:'#7c3aed', border:'1px solid #ddd6fe', fontWeight:700 }}>{inventory.length} منتج</span>
            <span style={{ fontSize:11, color:'#94a3b8', marginRight:'auto' }}>للعرض فقط</span>
          </div>
          <div style={card}>
            {inventory.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 }}>لا توجد منتجات</div>
            ) : inventory.map((item, i) => {
              const isLow = item.stock < (item.minStock || 5)
              return (
                <div key={item.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 20px', borderBottom: i < inventory.length - 1 ? '1px solid #f8fafc' : 'none', background: isLow ? '#fffafa' : 'transparent' }}>
                  <div style={{ width:36, height:36, borderRadius:10, background: isLow ? '#ffe4e6' : '#eff6ff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Package size={15} color={isLow ? '#e11d48' : '#2563eb'} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{item.name}</div>
                    <div style={{ display:'flex', gap:6, marginTop:3, flexWrap:'wrap' }}>
                      {item.brand    && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, background:'#f5f3ff', color:'#7c3aed', border:'1px solid #ddd6fe' }}>{item.brand}</span>}
                      {item.category && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe' }}>{item.category}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'center', flexShrink:0 }}>
                    <div style={{ fontSize:20, fontWeight:800, color: isLow ? '#e11d48' : '#0f172a' }}>{item.stock}</div>
                    <div style={{ fontSize:10, color:'#94a3b8' }}>وحدة</div>
                  </div>
                  <div style={{ flexShrink:0 }}>
                    {isLow
                      ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'3px 8px', borderRadius:20, background:'#fff1f2', color:'#e11d48', border:'1px solid #fecdd3', fontWeight:600 }}><AlertTriangle size={10}/>منخفض</span>
                      : <span style={{ fontSize:11, padding:'3px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontWeight:600 }}>✓ متاح</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Leaderboard tab ──────────────────────────────────────────────────── */}
      {tab === 'leaderboard' && <Leaderboard />}

      {/* ── Reports tab ───────────────────────────────────────────────────────── */}
      {tab === 'reports' && <SalesReports />}

      {/* ── Orders tabs ───────────────────────────────────────────────────────── */}
      {tab !== 'inventory' && tab !== 'leaderboard' && tab !== 'reports' && (<>
        {/* Stats */}
        <div className="m-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'بانتظار الموافقة', value: pendingOrders.length, color:'#f97316' },
            { label:'إجمالي الفواتير',  value: allOrders.length,     color:'#2563eb' },
            { label:'إجمالي المبيعات',  value: `${allOrders.filter(o=>o.status!=='مرفوض').reduce((s,o)=>s+o.total,0).toLocaleString()} LE`, color:'#059669' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:10, height:40, borderRadius:6, background:s.color, flexShrink:0 }} />
              <div>
                <div style={{ fontSize:18, fontWeight:800, color:'#0f172a' }} dir="ltr">{s.value}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Orders list */}
        {displayOrders.length === 0 ? (
          <div style={{ ...card, padding:60, textAlign:'center' }}>
            <CheckCircle size={48} color="#a7f3d0" style={{ margin:'0 auto 12px' }} />
            <p style={{ fontSize:14, fontWeight:600, color:'#94a3b8' }}>
              {tab === 'pending' ? 'لا توجد فواتير بانتظار الموافقة 🎉' : 'لا توجد فواتير بعد'}
            </p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {displayOrders.map(order => {
              const next = STATUS_NEXT[order.status]
              return (
                <div key={order.id} style={{ ...card, overflow:'hidden' }} className="fade-in">
                  <div style={{ padding:'14px 20px' }}>
                    {/* Header */}
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                          <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{order.clientName}</span>
                          <span style={{ color:'#cbd5e1' }}>·</span>
                          <span style={{ fontSize:12, color:'#64748b' }}>{order.company}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:12, fontSize:11, color:'#94a3b8', flexWrap:'wrap' }}>
                          <span style={{ display:'flex', alignItems:'center', gap:3 }}><User size={10}/>{order.salesRep}</span>
                          <span>#{order.serialNumber}</span>
                          <span>{order.date}</span>
                          <span style={{ display:'flex', alignItems:'center', gap:3 }}><Package size={10}/>{order.items?.length} صنف</span>
                          {order.paymentMethod && <span style={{ display:'flex', alignItems:'center', gap:3 }}><CreditCard size={10}/>{order.paymentMethod}</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                        <div style={{ textAlign:'left' }}>
                          <div style={{ fontSize:18, fontWeight:800, color:'#0f172a' }} dir="ltr">
                            {order.total.toLocaleString()} <span style={{ fontSize:11, fontWeight:400, color:'#94a3b8' }}>LE</span>
                          </div>
                        </div>
                        <Badge status={order.status}>{order.status}</Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      {order.status === 'بانتظار الموافقة' && (<>
                        <button onClick={() => onApprove(order.id, order.clientName)}
                          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 2px 8px rgba(5,150,105,0.3)' }}>
                          <CheckCircle size={14}/>اعتماد
                        </button>
                        <button onClick={() => onReject(order.id, order.clientName)}
                          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 16px', borderRadius:8, border:'1.5px solid #fecdd3', background:'#fff1f2', color:'#e11d48', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                          <XCircle size={14}/>رفض
                        </button>
                      </>)}

                      {next && (
                        <button onClick={() => onAdvance(order, next.label)}
                          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'none', background:next.bg, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:`0 2px 8px ${next.shadow}` }}
                          onMouseEnter={e=>e.currentTarget.style.opacity='0.85'}
                          onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                          <CheckCircle size={13}/>{next.label}
                        </button>
                      )}

                      {['موافق عليه','تم الصرف','مكتمل','تم التحصيل'].includes(order.status) && (
                        <button onClick={() => onCalendar(order)}
                          style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'1.5px solid #a7f3d0', background:'#ecfdf5', color:'#059669', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#d1fae5'}
                          onMouseLeave={e=>e.currentTarget.style.background='#ecfdf5'}>
                          <Calendar size={13}/>جدولة التركيب
                        </button>
                      )}

                      <button onClick={() => setEditingOrder(order)}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'1.5px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#dbeafe'}
                        onMouseLeave={e=>e.currentTarget.style.background='#eff6ff'}>
                        <Edit3 size={13}/>تعديل
                      </button>

                      <button onClick={() => toggle(order.id)}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:'1.5px solid #e4eaf3', background: expanded[order.id]?'#f0f4fa':'#fff', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif', marginRight:'auto' }}>
                        <ChevronDown size={12} style={{ transform: expanded[order.id]?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
                        التفاصيل
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expanded[order.id] && (
                    <div style={{ borderTop:'1px solid #f0f4fa', background:'#f8fafc', padding:'14px 20px' }}>
                      <div className="m-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                        {[
                          { icon:Phone,    label:'موبايل / واتساب', val:`${order.mobile || '—'} / ${order.whatsapp || '—'}`, ltr:true },
                          order.address       && { icon:MapPin,     label:'العنوان',      val:order.address },
                          order.paymentMethod && { icon:CreditCard, label:'طريقة الدفع', val:order.paymentMethod },
                        ].filter(Boolean).map(row => (
                          <div key={row.label} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px', borderRadius:10, background:'#fff', border:'1px solid #f0f4fa' }}>
                            <row.icon size={14} color="#94a3b8" style={{ marginTop:2, flexShrink:0 }} />
                            <div>
                              <div style={{ fontSize:11, color:'#94a3b8', marginBottom:2 }}>{row.label}</div>
                              <div style={{ fontSize:13, color:'#0f172a' }} dir={row.ltr ? 'ltr' : 'rtl'}>{row.val}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #e4eaf3', marginBottom:14 }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                          <thead>
                            <tr style={{ background:'#0f172a' }}>
                              {['الصنف','الكمية','سعر البيع','الإجمالي'].map((h,i)=>(
                                <th key={h} style={{ padding:'8px 14px', color:'#e2e8f0', fontWeight:600, textAlign:i===0?'right':'center' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {order.items?.map((item,i)=>(
                              <tr key={item.id||i} style={{ background:i%2===0?'#fff':'#f8fafc', borderBottom:'1px solid #f0f4fa' }}>
                                <td style={{ padding:'8px 14px', fontWeight:600, color:'#0f172a' }}>{item.name}</td>
                                <td style={{ padding:'8px 14px', textAlign:'center' }}>{item.quantity}</td>
                                <td style={{ padding:'8px 14px', textAlign:'center', color:'#64748b' }} dir="ltr">{item.price?.toLocaleString()} LE</td>
                                <td style={{ padding:'8px 14px', textAlign:'center', fontWeight:700, color:'#1d4ed8' }} dir="ltr">{item.total?.toLocaleString()} LE</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background:'#eff6ff', borderTop:'2px solid #bfdbfe' }}>
                              <td colSpan={3} style={{ padding:'8px 14px', fontWeight:700, color:'#1d4ed8', fontSize:12 }}>
                                الإجمالي{order.vatPercent > 0 ? ` شامل ${order.vatPercent}% ضريبة` : ''}
                              </td>
                              <td style={{ padding:'8px 14px', textAlign:'center', fontWeight:800, color:'#1d4ed8', fontSize:13 }} dir="ltr">
                                {order.total?.toLocaleString()} LE
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {order.notes && (
                        <div style={{ padding:'10px 14px', borderRadius:8, background:'#eff6ff', border:'1px solid #bfdbfe', fontSize:12, color:'#1e293b' }}>
                          <span style={{ fontWeight:700, color:'#1d4ed8' }}>ملاحظات: </span>{order.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </>)}
    </div>
  )
}
