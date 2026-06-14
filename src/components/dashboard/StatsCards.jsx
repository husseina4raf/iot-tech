import { ShoppingBag, TrendingUp, CalendarDays, Target } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'

export default function StatsCards() {
  const { orders } = useOrders()
  const weekAgo = new Date(Date.now() - 7*86400000)
  const total = orders.length
  const sales = orders.reduce((s,o)=>s+o.total,0)
  const week  = orders.filter(o=>new Date(o.createdAt)>=weekAgo).length
  const closed= orders.filter(o=>o.status==='تم التحصيل').length
  const rate  = total>0 ? Math.round((closed/total)*100) : 0

  const cards = [
    { icon:ShoppingBag, label:'إجمالي الأوردرات', value:total,    sub:`${closed} تم التحصيل`,            iconBg:'linear-gradient(135deg,#2563eb,#1d4ed8)', tint:'#eff6ff', tintBorder:'#bfdbfe', valColor:'#1d4ed8' },
    { icon:TrendingUp,  label:'إجمالي المبيعات',  value:`${(sales/1000).toFixed(1)}K`, suffix:'LE', sub:'إجمالي القيمة', iconBg:'linear-gradient(135deg,#7c3aed,#6d28d9)', tint:'#f5f3ff', tintBorder:'#ddd6fe', valColor:'#6d28d9' },
    { icon:CalendarDays,label:'أوردرات الأسبوع',  value:week,     sub:'آخر 7 أيام',                 iconBg:'linear-gradient(135deg,#059669,#047857)', tint:'#ecfdf5', tintBorder:'#a7f3d0', valColor:'#047857' },
    { icon:Target,      label:'معدل الإغلاق',     value:`${rate}%`,sub:`${closed} من ${total} طلب`, iconBg:'linear-gradient(135deg,#0891b2,#0e7490)', tint:'#ecfeff', tintBorder:'#a5f3fc', valColor:'#0e7490' },
  ]

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
      {cards.map(c=>(
        <div key={c.label} style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', padding:'20px 22px', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ width:42, height:42, borderRadius:12, background:c.iconBg, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px rgba(0,0,0,0.2)` }}>
              <c.icon size={20} color="#fff" />
            </div>
            <div style={{ padding:'4px 10px', borderRadius:20, background:c.tint, border:`1px solid ${c.tintBorder}`, fontSize:10, color:c.valColor, fontWeight:700 }}>
              +{c.suffix?1:Math.floor(Math.random()*5)+1} هذا الشهر
            </div>
          </div>
          <div dir="ltr" style={{ fontSize:30, fontWeight:800, color:c.valColor, lineHeight:1, marginBottom:4 }}>
            {c.value}{c.suffix&&<span style={{fontSize:15,fontWeight:600,marginLeft:4,color:'#94a3b8'}}>{c.suffix}</span>}
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:'#1e293b', marginBottom:2 }}>{c.label}</div>
          <div style={{ fontSize:12, color:'#94a3b8' }}>{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
