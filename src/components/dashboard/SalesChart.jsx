import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useOrders } from '../../hooks/useOrders'

const label = w => w===0?'هذا الأسبوع':w===1?'الأسبوع الماضي':`منذ ${w} أسابيع`

const Tip = ({ active, payload, label: l }) => {
  if (!active||!payload?.length) return null
  return (
    <div style={{ background:'#0f172a', borderRadius:10, padding:'10px 14px', boxShadow:'0 8px 20px rgba(0,0,0,0.25)' }}>
      <div style={{ color:'#94a3b8', fontSize:11, marginBottom:4 }}>{l}</div>
      <div style={{ color:'#60a5fa', fontSize:15, fontWeight:700 }}>{payload[0]?.value} طلب</div>
      <div style={{ color:'#475569', fontSize:11 }} dir="ltr">{payload[0]?.payload?.revenue?.toLocaleString()} LE</div>
    </div>
  )
}

export default function SalesChart() {
  const { orders } = useOrders()
  const now = new Date()
  const data = [3,2,1,0].map(w=>{
    const s=new Date(now-(w+1)*7*86400000), e=new Date(now-w*7*86400000)
    const wo=orders.filter(o=>{const d=new Date(o.createdAt);return d>=s&&d<e})
    return { week:label(w), orders:wo.length, revenue:wo.reduce((s,o)=>s+o.total,0) }
  })
  const max = Math.max(...data.map(d=>d.orders), 1)

  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', padding:24, height:'100%', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:2 }}>مبيعات آخر 4 أسابيع</h3>
          <p style={{ fontSize:12, color:'#94a3b8' }}>عدد الطلبات الأسبوعية</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:20, background:'#eff6ff', border:'1px solid #bfdbfe', fontSize:11, color:'#1d4ed8', fontWeight:600 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#2563eb' }} />
          الطلبات
        </div>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} barSize={34} margin={{ top:4, right:4, left:-24, bottom:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize:11, fill:'#94a3b8', fontFamily:'Cairo' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<Tip/>} cursor={{ fill:'#f8fafc', radius:6 }} />
          <Bar dataKey="orders" radius={[8,8,2,2]}>
            {data.map((d,i)=>(
              <Cell key={i} fill={d.orders===max ? '#2563eb' : '#bfdbfe'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
