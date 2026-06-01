import { useState } from 'react'
import { Lock, Edit3, Calendar, ChevronRight, ClipboardX } from 'lucide-react'
import Badge from '../ui/Badge'
import OrderForm from './OrderForm'
import { SALES_REPS } from '../../data/mockData'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

export default function MyOrders() {
  const { orders } = useOrders()
  const { user } = useAuth()
  const [selectedRep, setSelectedRep] = useState(user?.repName || SALES_REPS[0])
  const [editingOrder, setEditingOrder] = useState(null)

  const myOrders = orders.filter(o=>o.salesRep===selectedRep).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))

  if (editingOrder) return (
    <div>
      <button onClick={()=>setEditingOrder(null)} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, fontWeight:600, color:'#64748b', background:'none', border:'none', cursor:'pointer', marginBottom:20, fontFamily:'Cairo,sans-serif' }}
        onMouseEnter={e=>e.currentTarget.style.color='#2563eb'} onMouseLeave={e=>e.currentTarget.style.color='#64748b'}>
        <ChevronRight size={15}/>العودة لطلباتي
      </button>
      <div style={{ padding:'12px 16px', borderRadius:10, background:'#fffbeb', border:'1px solid #fde68a', fontSize:13, fontWeight:600, color:'#92400e', marginBottom:16 }}>
        تعديل الطلب: {editingOrder.clientName} — {editingOrder.company}
      </div>
      <OrderForm editOrder={editingOrder} onSaved={()=>setEditingOrder(null)} />
    </div>
  )

  return (
    <div>
      {/* Rep selector */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', padding:'16px 20px', marginBottom:16, boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }}>
        <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:12 }}>اختر مندوب المبيعات</label>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {SALES_REPS.map(rep=>(
            <button key={rep} onClick={()=>setSelectedRep(rep)} style={{ padding:'7px 18px', borderRadius:8, border:'1.5px solid', borderColor:selectedRep===rep?'#2563eb':'#e4eaf3', background:selectedRep===rep?'#eff6ff':'#f8fafc', color:selectedRep===rep?'#1d4ed8':'#475569', fontSize:13, fontWeight:700, cursor:'pointer', transition:'all 0.15s', fontFamily:'Cairo,sans-serif', boxShadow:selectedRep===rep?'0 0 0 3px rgba(37,99,235,0.1)':'none' }}>
              {rep}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {myOrders.length===0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:60, borderRadius:14, background:'#fff', border:'1px solid #e4eaf3' }}>
            <ClipboardX size={36} color="#e4eaf3" style={{marginBottom:12}}/>
            <p style={{ fontSize:14, fontWeight:500, color:'#94a3b8' }}>لا توجد طلبات لـ {selectedRep}</p>
          </div>
        ) : myOrders.map(o=><OrderCard key={o.id} order={o} onEdit={()=>setEditingOrder(o)}/>)}
      </div>
    </div>
  )
}

function OrderCard({ order, onEdit }) {
  const isEditable = order.status==='جديد'
  return (
    <div className="fade-in" style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', padding:'16px 20px', boxShadow:'0 1px 4px rgba(15,23,42,0.06)', transition:'box-shadow 0.15s' }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(15,23,42,0.1)'} onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 4px rgba(15,23,42,0.06)'}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
            <span style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>{order.clientName}</span>
            <span style={{ color:'#cbd5e1' }}>·</span>
            <span style={{ fontSize:13, color:'#64748b' }}>{order.company}</span>
            {order.editHistory?.length>0 && (
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe' }}>
                معدّل {order.editHistory.length}×
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:14, fontSize:12, color:'#94a3b8', alignItems:'center' }}>
            <span style={{ display:'flex', alignItems:'center', gap:4 }}><Calendar size={11}/>{order.date}</span>
            <span dir="ltr" style={{ fontWeight:600, color:'#1d4ed8' }}>{order.total.toLocaleString()} LE</span>
            <span>#{order.serialNumber}</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <Badge status={order.status}>{order.status}</Badge>
          {isEditable ? (
            <button onClick={onEdit} style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'1.5px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif', transition:'all 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='#dbeafe'} onMouseLeave={e=>e.currentTarget.style.background='#eff6ff'}>
              <Edit3 size={11}/>تعديل
            </button>
          ) : (
            <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#94a3b8', padding:'5px 10px', borderRadius:8, background:'#f8fafc', border:'1px solid #e4eaf3' }}>
              <Lock size={10}/>مغلق
            </span>
          )}
        </div>
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:10, borderTop:'1px solid #f8fafc' }}>
        {order.items.slice(0,3).map(item=>(
          <span key={item.id} style={{ fontSize:11, padding:'3px 10px', borderRadius:6, background:'#f0f4fa', color:'#475569', border:'1px solid #e8eef6' }}>
            {item.name} ×{item.quantity}
          </span>
        ))}
        {order.items.length>3 && <span style={{ fontSize:11, color:'#94a3b8', padding:'3px 6px' }}>+{order.items.length-3}</span>}
      </div>
    </div>
  )
}
