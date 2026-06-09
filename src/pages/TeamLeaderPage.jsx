import { useState } from 'react'
import { Clock, CheckCircle, XCircle, FileText, ChevronDown, User, Package } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/Toast'
import Badge from '../components/ui/Badge'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const tabs = [
  { id:'pending', label:'بانتظار الموافقة', icon: Clock },
  { id:'all',     label:'جميع الفواتير',    icon: FileText },
]

export default function TeamLeaderPage() {
  const [tab, setTab]       = useState('pending')
  const [expanded, setExpanded] = useState({})
  const { orders, approveOrder, rejectOrder } = useOrders()
  const { user } = useAuth()
  const toast = useToast()

  const pendingOrders = orders.filter(o => o.status === 'بانتظار الموافقة')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const allOrders = orders
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

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const displayOrders = tab === 'pending' ? pendingOrders : allOrders

  return (
    <div style={{ maxWidth:900, margin:'0 auto' }}>
      {/* Tabs */}
      <div style={{ display:'inline-flex', gap:4, padding:5, borderRadius:12, background:'#fff', border:'1px solid #e4eaf3', marginBottom:20, boxShadow:'0 1px 4px rgba(15,23,42,0.05)', position:'relative' }}>
        {tabs.map(({ id, label, icon:Icon }) => {
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

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'بانتظار الموافقة', value: pendingOrders.length, color:'#f97316', bg:'#fff7ed' },
          { label:'إجمالي الفواتير',  value: allOrders.length,     color:'#2563eb', bg:'#eff6ff' },
          { label:'إجمالي المبيعات',  value: `${allOrders.filter(o=>o.status!=='مرفوض').reduce((s,o)=>s+o.total,0).toLocaleString()} LE`, color:'#059669', bg:'#ecfdf5' },
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
          {displayOrders.map(order => (
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
                  {order.status === 'بانتظار الموافقة' && (
                    <>
                      <button onClick={() => onApprove(order.id, order.clientName)}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 2px 8px rgba(5,150,105,0.3)' }}
                        onMouseEnter={e=>e.currentTarget.style.background='linear-gradient(135deg,#047857,#065f46)'}
                        onMouseLeave={e=>e.currentTarget.style.background='linear-gradient(135deg,#059669,#047857)'}>
                        <CheckCircle size={14}/>اعتماد
                      </button>
                      <button onClick={() => onReject(order.id, order.clientName)}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 16px', borderRadius:8, border:'1.5px solid #fecdd3', background:'#fff1f2', color:'#e11d48', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}
                        onMouseEnter={e=>e.currentTarget.style.background='#ffe4e6'}
                        onMouseLeave={e=>e.currentTarget.style.background='#fff1f2'}>
                        <XCircle size={14}/>رفض
                      </button>
                    </>
                  )}
                  <button onClick={() => toggle(order.id)}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:8, border:'1.5px solid #e4eaf3', background: expanded[order.id]?'#f0f4fa':'#fff', color:'#475569', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif', marginRight:'auto' }}>
                    <ChevronDown size={12} style={{ transform: expanded[order.id]?'rotate(180deg)':'none', transition:'transform 0.2s' }}/>
                    التفاصيل
                  </button>
                </div>
              </div>

              {/* Expanded items */}
              {expanded[order.id] && (
                <div style={{ borderTop:'1px solid #f0f4fa', background:'#f8fafc', padding:'14px 20px' }}>
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
                  </table>
                  {order.notes && (
                    <div style={{ marginTop:10, padding:'10px 14px', borderRadius:8, background:'#eff6ff', border:'1px solid #bfdbfe', fontSize:12, color:'#1e293b' }}>
                      <span style={{ fontWeight:700, color:'#1d4ed8' }}>ملاحظات: </span>{order.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
