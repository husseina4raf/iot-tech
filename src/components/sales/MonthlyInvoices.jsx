import { useState } from 'react'
import { ChevronDown, ChevronRight, Lock, Edit3, TrendingUp, Calendar, ClipboardX, FileText, Filter } from 'lucide-react'
import Badge from '../ui/Badge'
import OrderForm from './OrderForm'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
]

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

export default function MonthlyInvoices() {
  const { user } = useAuth()
  const { getOrdersByRepGrouped } = useOrders()
  const [editingOrder, setEditingOrder] = useState(null)
  const [openMonths, setOpenMonths] = useState({})

  // Month filter state (null = show all)
  const now = new Date()
  const [filterYear,  setFilterYear]  = useState(null)
  const [filterMonth, setFilterMonth] = useState(null)

  const repName = user?.repName
  if (!repName) return (
    <div style={{ ...card, padding:40, textAlign:'center' }}>
      <p style={{ color:'#94a3b8' }}>لا يمكن تحديد المندوب المسؤول</p>
    </div>
  )

  const allGroups = getOrdersByRepGrouped(repName)

  // Apply filter
  const groups = (filterYear !== null && filterMonth !== null)
    ? allGroups.filter(g => g.key === `${filterYear}-${String(filterMonth + 1).padStart(2, '0')}`)
    : allGroups

  const totalOrders = allGroups.reduce((s, g) => s + g.orders.length, 0)
  const totalRevenue = allGroups.reduce((s, g) => s + g.orders.reduce((ss, o) => ss + o.total, 0), 0)

  // Years available
  const availableYears = [...new Set(allGroups.map(g => g.key.split('-')[0]))].sort((a,b)=>b-a)

  const toggleMonth = (key) => setOpenMonths(prev => ({ ...prev, [key]: !prev[key] }))

  if (editingOrder) return (
    <div>
      <button onClick={() => setEditingOrder(null)}
        style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'#64748b', background:'none', border:'none', cursor:'pointer', marginBottom:20, fontFamily:'Cairo,sans-serif' }}
        onMouseEnter={e => e.currentTarget.style.color='#2563eb'} onMouseLeave={e => e.currentTarget.style.color='#64748b'}>
        <ChevronRight size={15}/>العودة لفواتيري
      </button>
      <div style={{ padding:'12px 16px', borderRadius:10, background:'#fffbeb', border:'1px solid #fde68a', fontSize:13, fontWeight:600, color:'#92400e', marginBottom:16 }}>
        تعديل الطلب: {editingOrder.clientName} — {editingOrder.company}
      </div>
      <OrderForm editOrder={editingOrder} onSaved={() => setEditingOrder(null)} />
    </div>
  )

  if (groups.length === 0) return (
    <div style={{ ...card, padding:60, textAlign:'center' }}>
      <ClipboardX size={40} color="#e4eaf3" style={{ margin:'0 auto 12px' }} />
      <p style={{ fontSize:14, fontWeight:500, color:'#94a3b8' }}>لا توجد فواتير بعد</p>
    </div>
  )

  return (
    <div>
      {/* Month filter */}
      <div style={{ ...card, padding:'12px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <Filter size={14} color="#2563eb"/>
        <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>فلتر الشهر:</span>
        <select
          value={filterYear !== null ? filterYear : ''}
          onChange={e => {
            const y = e.target.value ? Number(e.target.value) : null
            setFilterYear(y)
            if (y === null) setFilterMonth(null)
            else if (filterMonth === null) setFilterMonth(now.getMonth())
          }}
          dir="ltr"
          style={{ padding:'5px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', cursor:'pointer' }}>
          <option value="">كل السنوات</option>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {filterYear !== null && (
          <select
            value={filterMonth !== null ? filterMonth : ''}
            onChange={e => setFilterMonth(e.target.value !== '' ? Number(e.target.value) : null)}
            dir="rtl"
            style={{ padding:'5px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', cursor:'pointer' }}>
            <option value="">كل الأشهر</option>
            {MONTHS_AR.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        )}
        {(filterYear !== null || filterMonth !== null) && (
          <button onClick={() => { setFilterYear(null); setFilterMonth(null) }}
            style={{ fontSize:11, padding:'4px 10px', borderRadius:8, border:'1px solid #fecdd3', background:'#fff1f2', color:'#e11d48', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:600 }}>
            مسح الفلتر ✕
          </button>
        )}
        {filterYear !== null && filterMonth !== null && (
          <span style={{ fontSize:12, color:'#2563eb', fontWeight:700, marginRight:'auto' }}>
            {MONTHS_AR[filterMonth]} {filterYear}
          </span>
        )}
      </div>

      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        {[
          { label:'إجمالي الفواتير',    value: totalOrders,                              icon: FileText,  color:'#2563eb', bg:'#eff6ff' },
          { label:'إجمالي المبيعات',    value: `${totalRevenue.toLocaleString()} LE`,    icon: TrendingUp, color:'#059669', bg:'#ecfdf5' },
          { label:'عدد الأشهر النشطة', value: groups.length,                            icon: Calendar,  color:'#7c3aed', bg:'#f5f3ff' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <s.icon size={20} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize:20, fontWeight:800, color:'#0f172a' }} dir="ltr">{s.value}</div>
              <div style={{ fontSize:12, color:'#64748b', marginTop:1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Monthly groups */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {groups.map(group => {
          const isOpen = openMonths[group.key] !== false // default open for first, closed for rest
          const monthTotal = group.orders.reduce((s, o) => s + o.total, 0)
          const open = group.key in openMonths ? openMonths[group.key] : groups.indexOf(group) === 0

          return (
            <div key={group.key} style={card}>
              {/* Month header */}
              <button onClick={() => toggleMonth(group.key)}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:'none', border:'none', cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#2563eb,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Calendar size={17} color="#fff" />
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{group.label}</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:1 }}>{group.orders.length} فاتورة</div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ textAlign:'left' }}>
                    <div style={{ fontSize:16, fontWeight:800, color:'#1d4ed8' }} dir="ltr">{monthTotal.toLocaleString()} LE</div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>إجمالي الشهر</div>
                  </div>
                  <ChevronDown size={16} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }} />
                </div>
              </button>

              {/* Orders in this month */}
              {open && (
                <div style={{ borderTop:'1px solid #f0f4fa' }}>
                  {group.orders.map((order, idx) => (
                    <div key={order.id}
                      style={{ padding:'12px 20px', borderBottom: idx < group.orders.length - 1 ? '1px solid #f8fafc' : 'none', display:'flex', alignItems:'center', gap:12 }}>
                      {/* Serial */}
                      <div style={{ width:70, fontSize:11, color:'#94a3b8', flexShrink:0 }}>#{order.serialNumber}</div>

                      {/* Client */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#0f172a', marginBottom:2 }}>{order.clientName}</div>
                        <div style={{ fontSize:11, color:'#64748b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{order.company}</div>
                      </div>

                      {/* Date */}
                      <div style={{ fontSize:12, color:'#94a3b8', flexShrink:0, minWidth:80 }}>{order.date}</div>

                      {/* Amount */}
                      <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', flexShrink:0, minWidth:100, textAlign:'left' }} dir="ltr">
                        {order.total.toLocaleString()} <span style={{ fontSize:10, fontWeight:400, color:'#94a3b8' }}>LE</span>
                      </div>

                      {/* Status */}
                      <div style={{ flexShrink:0 }}>
                        <Badge status={order.status}>{order.status}</Badge>
                      </div>

                      {/* Actions */}
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        {order.status === 'جديد' ? (
                          <button onClick={() => setEditingOrder(order)}
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 10px', borderRadius:7, border:'1.5px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                            <Edit3 size={11}/>تعديل
                          </button>
                        ) : (
                          <span style={{ display:'flex', alignItems:'center', gap:3, fontSize:11, color:'#94a3b8', padding:'4px 8px', borderRadius:7, background:'#f8fafc', border:'1px solid #e4eaf3' }}>
                            <Lock size={10}/>مغلق
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Month total footer */}
                  <div style={{ padding:'10px 20px', background:'#f8fafc', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'#64748b' }}>إجمالي {group.label}</span>
                    <span style={{ fontSize:14, fontWeight:800, color:'#1d4ed8' }} dir="ltr">{monthTotal.toLocaleString()} LE</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
