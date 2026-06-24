import { useState } from 'react'
import { TrendingUp, Users, Package, BarChart2 } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const getCostPrice = (itemName, inventory) => {
  const inv = inventory.find(i =>
    i.name.toLowerCase() === itemName.toLowerCase() || i.nameAr === itemName
  )
  return inv?.costPrice || 0
}

export default function SalesReports() {
  const { orders, inventory } = useOrders()
  const { salesReps: SALES_REPS } = useAuth()
  const [activeTab, setActiveTab] = useState('reps')
  const [repFilter, setRepFilter] = useState('')

  // ─── Per-rep stats ─────────────────────────────────────────────────────────
  const repStats = SALES_REPS.map(rep => {
    const ro = orders.filter(o => o.salesRep === rep)
    const revenue = ro.reduce((s, o) => s + o.total, 0)
    const profit  = ro.reduce((s, o) =>
      s + o.items.reduce((ss, item) => {
        const cost = getCostPrice(item.name, inventory)
        return ss + (item.price - cost) * item.quantity
      }, 0)
    , 0)
    const completed = ro.filter(o => ['تم الصرف','مكتمل'].includes(o.status)).length
    return { rep, count: ro.length, revenue, profit, completed, rate: ro.length > 0 ? Math.round((completed/ro.length)*100) : 0 }
  }).sort((a, b) => b.revenue - a.revenue)

  // ─── Per-product stats (مكتمل orders only) ────────────────────────────────
  const productMap = {}
  const filtered = (repFilter ? orders.filter(o => o.salesRep === repFilter) : orders)
    .filter(o => o.status === 'مكتمل')
  filtered.forEach(o => o.items.forEach(item => {
    if (!productMap[item.name]) {
      const costPrice = getCostPrice(item.name, inventory)
      productMap[item.name] = { name: item.name, units: 0, revenue: 0, totalCost: 0, orders: 0, hasCost: costPrice > 0 }
    }
    const costPrice = getCostPrice(item.name, inventory)
    productMap[item.name].units     += Number(item.quantity) || 0
    productMap[item.name].revenue   += item.total
    productMap[item.name].totalCost += costPrice * item.quantity
    productMap[item.name].orders    += 1
  }))
  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)

  // ─── Monthly trend ─────────────────────────────────────────────────────────
  const monthlyMap = {}
  orders.forEach(o => {
    const parts = o.date?.split('-')
    if (!parts || parts.length < 3) return
    const key   = `${parts[2]}-${parts[1]}`
    const label = new Date(parts[2], parts[1]-1, 1).toLocaleDateString('ar-EG', { month:'short', year:'numeric' })
    if (!monthlyMap[key]) monthlyMap[key] = { key, label, revenue:0, count:0 }
    monthlyMap[key].revenue += o.total
    monthlyMap[key].count   += 1
  })
  const months = Object.values(monthlyMap).sort((a, b) => a.key.localeCompare(b.key))
  const maxRev = Math.max(...months.map(m => m.revenue), 1)

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const totalProfit  = orders.reduce((s, o) =>
    s + o.items.reduce((ss, i) => {
      const cost = getCostPrice(i.name, inventory)
      return ss + (i.price - cost) * i.quantity
    }, 0)
  , 0)

  const tabs = [
    { id:'reps',     label:'حسب المندوب', icon:Users },
    { id:'products', label:'حسب المنتج',  icon:Package },
    { id:'monthly',  label:'الاتجاه الشهري', icon:BarChart2 },
  ]

  return (
    <div>
      {/* KPIs */}
      <div className="m-grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'إجمالي الإيرادات', value:`${(totalRevenue/1000).toFixed(1)}K LE`, color:'#1d4ed8' },
          { label:'صافي الربح',       value:`${(totalProfit/1000).toFixed(1)}K LE`,  color:'#059669' },
          { label:'هامش الربح',       value:`${Math.round((totalProfit/Math.max(totalRevenue,1))*100)}%`, color:'#7c3aed' },
          { label:'إجمالي الطلبات',      value: orders.length, color:'#0891b2' },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding:'16px 18px' }}>
            <div style={{ fontSize:22, fontWeight:800, color:k.color, marginBottom:3 }} dir="ltr">{k.value}</div>
            <div style={{ fontSize:12, color:'#64748b' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="m-tab-scroll" style={{ display:'flex', gap:1, padding:5, borderRadius:12, background:'#fff', border:'1px solid #e4eaf3', marginBottom:16, width:'fit-content' }}>
        {tabs.map(({ id, label, icon:Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:9, border:'none', background: activeTab===id?'linear-gradient(135deg,#1d4ed8,#2563eb)':'transparent', color: activeTab===id?'#fff':'#64748b', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow: activeTab===id?'0 3px 10px rgba(37,99,235,0.3)':'none', transition:'all 0.15s' }}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>

      {/* Reps tab */}
      {activeTab === 'reps' && (
        <div style={card}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f4fa', display:'flex', alignItems:'center', gap:8 }}>
            <Users size={15} color="#2563eb"/>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>أداء المندوبين</h3>
          </div>
          <div className="m-table-scroll">
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:560 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['المندوب','عدد الطلبات','الإيرادات','صافي الربح','هامش الربح','معدل الإغلاق'].map((h,i) => (
                  <th key={h} style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'#64748b', textAlign:i===0?'right':'center', borderBottom:'1px solid #f0f4fa' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repStats.map((r, i) => (
                <tr key={r.rep} style={{ borderBottom:'1px solid #f8fafc' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28,height:28,borderRadius:'50%',background:['linear-gradient(135deg,#2563eb,#1d4ed8)','linear-gradient(135deg,#7c3aed,#6d28d9)','linear-gradient(135deg,#059669,#047857)','linear-gradient(135deg,#0891b2,#0e7490)'][i],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700 }}>
                        {r.rep[0]}
                      </div>
                      <span style={{ fontWeight:600, color:'#0f172a' }}>{r.rep}</span>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:600 }}>{r.count}</td>
                  <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:700, color:'#1d4ed8' }} dir="ltr">{r.revenue.toLocaleString()} LE</td>
                  <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:700, color:'#059669' }} dir="ltr">{Math.round(r.profit).toLocaleString()} LE</td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontWeight:700 }}>
                      {r.revenue > 0 ? `${Math.round((r.profit/r.revenue)*100)}%` : '—'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                      <div style={{ width:50,height:4,borderRadius:4,background:'#e4eaf3',overflow:'hidden' }}>
                        <div style={{ height:'100%',width:`${r.rate}%`,background:'#2563eb',borderRadius:4 }}/>
                      </div>
                      <span style={{ fontSize:12, fontWeight:600, color:'#0f172a' }}>{r.rate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Products tab */}
      {activeTab === 'products' && (() => {
        const totRev    = products.reduce((s,p) => s + p.revenue, 0)
        const totCost   = products.reduce((s,p) => s + p.totalCost, 0)
        const totProfit = totRev - totCost
        const totUnits  = products.reduce((s,p) => s + p.units, 0)
        return (
          <div>
            {/* Header + filter */}
            <div style={{ ...card, padding:'14px 20px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Package size={15} color="#2563eb"/>
                <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>الربح بالمنتج</span>
                <span style={{ fontSize:11, color:'#94a3b8', padding:'2px 8px', borderRadius:20, background:'#f0f4fa', border:'1px solid #e4eaf3' }}>الطلبات المكتملة فقط</span>
              </div>
              <select value={repFilter} onChange={e => setRepFilter(e.target.value)}
                style={{ padding:'6px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', cursor:'pointer' }}>
                <option value="">كل المندوبين</option>
                {SALES_REPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Summary strip */}
            <div className="m-grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
              {[
                { label:'إجمالي الإيرادات', val:`${(totRev/1000).toFixed(1)}K LE`,    color:'#1d4ed8', bg:'#eff6ff', border:'#bfdbfe' },
                { label:'إجمالي التكلفة',   val:`${(totCost/1000).toFixed(1)}K LE`,   color:'#64748b', bg:'#f8fafc', border:'#e4eaf3' },
                { label:'صافي الربح',        val:`${(totProfit/1000).toFixed(1)}K LE`, color: totProfit>=0?'#059669':'#e11d48', bg: totProfit>=0?'#ecfdf5':'#fff1f2', border: totProfit>=0?'#a7f3d0':'#fecdd3' },
              ].map(s => (
                <div key={s.label} style={{ padding:'12px 16px', borderRadius:12, background:s.bg, border:`1px solid ${s.border}` }}>
                  <div style={{ fontSize:18, fontWeight:800, color:s.color }} dir="ltr">{s.val}</div>
                  <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Cards grid */}
            {products.length === 0 ? (
              <div style={{ ...card, padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
                لا توجد طلبات مكتملة بعد
              </div>
            ) : (
              <div className="m-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {products.map((p, i) => {
                  const profit   = p.revenue - p.totalCost
                  const margin   = p.revenue > 0 ? Math.round((profit / p.revenue) * 100) : 0
                  const isPos    = profit >= 0
                  const barWidth = Math.min(Math.abs(margin), 100)
                  const rankColors = ['linear-gradient(135deg,#f59e0b,#d97706)','linear-gradient(135deg,#94a3b8,#64748b)','linear-gradient(135deg,#b45309,#92400e)']
                  const rankBg = rankColors[i] || 'linear-gradient(135deg,#1d4ed8,#2563eb)'
                  return (
                    <div key={p.name} style={{ ...card, padding:20 }}>
                      {/* Rank + Name */}
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                        <div style={{ width:30, height:30, borderRadius:9, background:rankBg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:800, flexShrink:0 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{p.units} وحدة · {p.orders} طلب</div>
                        </div>
                      </div>

                      {/* Margin bar */}
                      <div style={{ marginBottom:14 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:5 }}>
                          <span style={{ color:'#64748b' }}>هامش الربح</span>
                          <span style={{ fontWeight:800, color: p.hasCost ? (isPos?'#059669':'#e11d48') : '#94a3b8' }}>
                            {p.hasCost ? `${margin}%` : 'لا يوجد سعر تكلفة'}
                          </span>
                        </div>
                        <div style={{ height:8, borderRadius:20, background:'#f0f4fa', overflow:'hidden' }}>
                          {p.hasCost && (
                            <div style={{ height:'100%', width:`${barWidth}%`, background: isPos ? 'linear-gradient(90deg,#059669,#34d399)' : 'linear-gradient(90deg,#e11d48,#fb7185)', borderRadius:20, transition:'width 0.5s' }} />
                          )}
                        </div>
                      </div>

                      {/* Revenue + Profit boxes */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                        <div style={{ padding:'8px 12px', borderRadius:10, background:'#eff6ff', border:'1px solid #bfdbfe' }}>
                          <div style={{ fontSize:10, color:'#3b82f6', fontWeight:600, marginBottom:3 }}>إجمالي المبيعات</div>
                          <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }} dir="ltr">
                            {p.revenue >= 1000 ? `${(p.revenue/1000).toFixed(1)}K` : p.revenue.toLocaleString()}
                          </div>
                        </div>
                        <div style={{ padding:'8px 12px', borderRadius:10, background: !p.hasCost ? '#f8fafc' : isPos ? '#ecfdf5' : '#fff1f2', border:`1px solid ${!p.hasCost ? '#e4eaf3' : isPos ? '#a7f3d0' : '#fecdd3'}` }}>
                          <div style={{ fontSize:10, color: !p.hasCost ? '#94a3b8' : isPos ? '#059669' : '#e11d48', fontWeight:600, marginBottom:3 }}>صافي الربح</div>
                          <div style={{ fontSize:15, fontWeight:800, color: !p.hasCost ? '#cbd5e1' : isPos ? '#059669' : '#e11d48' }} dir="ltr">
                            {p.hasCost
                              ? (Math.abs(profit) >= 1000 ? `${(profit/1000).toFixed(1)}K` : Math.round(profit).toLocaleString())
                              : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Monthly tab */}
      {activeTab === 'monthly' && (
        <div style={card}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f4fa', display:'flex', alignItems:'center', gap:8 }}>
            <BarChart2 size={15} color="#2563eb"/>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>الاتجاه الشهري</h3>
          </div>
          <div style={{ padding:'20px 24px' }}>
            {months.length === 0 ? (
              <div style={{ textAlign:'center', padding:30, color:'#94a3b8', fontSize:13 }}>لا توجد بيانات</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {months.map(m => (
                  <div key={m.key} style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:80, fontSize:12, fontWeight:600, color:'#64748b', textAlign:'right', flexShrink:0 }}>{m.label}</div>
                    <div style={{ flex:1, height:28, background:'#f0f4fa', borderRadius:8, overflow:'hidden', position:'relative' }}>
                      <div style={{ height:'100%', width:`${(m.revenue/maxRev)*100}%`, background:'linear-gradient(135deg,#2563eb,#60a5fa)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:8, minWidth:60, transition:'width 0.4s' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'#fff', direction:'ltr', whiteSpace:'nowrap' }}>
                          {(m.revenue/1000).toFixed(1)}K
                        </span>
                      </div>
                    </div>
                    <div style={{ width:50, fontSize:12, color:'#94a3b8', textAlign:'center', flexShrink:0 }}>{m.count} طلب</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
