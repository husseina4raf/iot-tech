import { useState } from 'react'
import { PlusCircle, ClipboardList } from 'lucide-react'
import OrderForm from '../components/sales/OrderForm'
import MyOrders from '../components/sales/MyOrders'

export default function SalesPage() {
  const [tab, setTab] = useState('new')
  const tabs = [{ id:'new', label:'طلب جديد', icon:PlusCircle }, { id:'mine', label:'طلباتي', icon:ClipboardList }]

  return (
    <div style={{ maxWidth:860, margin:'0 auto' }}>
      <div style={{ display:'inline-flex', gap:4, padding:5, borderRadius:12, background:'#fff', border:'1px solid #e4eaf3', marginBottom:20, boxShadow:'0 1px 4px rgba(15,23,42,0.05)' }}>
        {tabs.map(({ id, label, icon:Icon })=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            display:'flex', alignItems:'center', gap:7, padding:'8px 20px', borderRadius:9, border:'none',
            background: tab===id ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : 'transparent',
            color: tab===id ? '#fff' : '#64748b',
            fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif',
            boxShadow: tab===id ? '0 3px 10px rgba(37,99,235,0.35)' : 'none',
            transition:'all 0.15s',
          }}
          onMouseEnter={e=>{ if(tab!==id) e.currentTarget.style.background='#f0f4fa' }}
          onMouseLeave={e=>{ if(tab!==id) e.currentTarget.style.background='transparent' }}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>
      {tab==='new' ? <OrderForm/> : <MyOrders/>}
    </div>
  )
}
