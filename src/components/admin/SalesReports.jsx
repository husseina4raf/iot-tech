import { useState } from 'react'
import { TrendingUp, Users, Package, BarChart2 } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { SALES_REPS } from '../../data/mockData'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const MARGIN_RATES = {
  'Smart Lock Lezn': 0.38, 'Smart Lock Denak': 0.42, 'Smart Lock PNDA': 0.39,
  'iFace 19': 0.37, 'Camera Bosch': 0.39, 'Smart Door Bell': 0.47,
}

export default function SalesReports() {
  const { orders, inventory } = useOrders()
  const [activeTab, setActiveTab] = useState('reps')
  const [repFilter, setRepFilter] = useState('')

  // ─── Per-rep stats ─────────────────────────────────────────────────────────
  const repStats = SALES_REPS.map(rep => {
    const ro = orders.filter(o => o.salesRep === rep)
    const revenue = ro.reduce((s, o) => s + o.total, 0)
    const profit  = ro.reduce((s, o) => {
      return s + o.items.reduce((ss, item) => {
        const rate = MARGIN_RATES[item.name] || 0.35
        return ss + item.total * rate
      }, 0)
    }, 0)
    const completed = ro.filter(o => ['تم الصرف','مكتمل'].includes(o.status)).length
    return { rep, count: ro.length, revenue, profit, completed, rate: ro.length > 0 ? Math.round((completed/ro.length)*100) : 0 }
  }).sort((a, b) => b.revenue - a.revenue)

  // ─── Per-product stats ─────────────────────────────────────────────────────
  const productMap = {}
  const filtered = repFilter ? orders.filter(o => o.salesRep === repFilter) : orders
  filtered.forEach(o => o.items.forEach(item => {
    if (!productMap[item.name]) productMap[item.name] = { name: item.name, units: 0, revenue: 0, orders: 0 }
    productMap[item.name].units   += item.quantity
    productMap[item.name].revenue += item.total
    productMap[item.name].orders  += 1
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
  const totalProfit  = orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.total * (MARGIN_RATES[i.name]||0.35), 0), 0)

  const tabs = [
    { id:'reps',     label:'حسب المندوب', icon:Users },
    { id:'products', label:'حسب المنتج',  icon:Package },
    { id:'monthly',  label:'الاتجاه الشهري', icon:BarChart2 },
  ]

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'إجمالي الإيرادات',    value:`${(totalRevenue/1000).toFixed(1)}K LE`, color:'#1d4ed8' },
          { label:'صافي الربح (تقديري)', value:`${(totalProfit/1000).toFixed(1)}K LE`,  color:'#059669' },
          { label:'متوسط هامش الربح',    value:`${Math.round((totalProfit/Math.max(totalRevenue,1))*100)}%`, color:'#7c3aed' },
          { label:'إجمالي الطلبات',      value: orders.length, color:'#0891b2' },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding:'16px 18px' }}>
            <div style={{ fontSize:22, fontWeight:800, color:k.color, marginBottom:3 }} dir="ltr">{k.value}</div>
            <div style={{ fontSize:12, color:'#64748b' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:1, padding:5, borderRadius:12, background:'#fff', border:'1px solid #e4eaf3', marginBottom:16, width:'fit-content' }}>
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
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['المندوب','عدد الطلبات','الإيرادات','الربح التقديري','هامش الربح','معدل الإغلاق'].map((h,i) => (
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
      )}

      {/* Products tab */}
      {activeTab === 'products' && (
        <div style={card}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f4fa', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Package size={15} color="#2563eb"/>
              <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>مبيعات المنتجات</h3>
            </div>
            <select value={repFilter} onChange={e => setRepFilter(e.target.value)}
              style={{ padding:'6px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', cursor:'pointer' }}>
              <option value="">كل المندوبين</option>
              {SALES_REPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['المنتج','الوحدات','عدد الطلبات','الإيرادات','هامش الربح','الربح التقديري'].map((h,i) => (
                  <th key={h} style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'#64748b', textAlign:i===0?'right':'center', borderBottom:'1px solid #f0f4fa' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const rate = MARGIN_RATES[p.name] || 0.35
                return (
                  <tr key={p.name} style={{ borderBottom:'1px solid #f8fafc' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'12px 16px', fontWeight:600, color:'#0f172a' }}>{p.name}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:700 }}>{p.units}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>{p.orders}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:700, color:'#1d4ed8' }} dir="ltr">{p.revenue.toLocaleString()} LE</td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontWeight:700 }}>{Math.round(rate*100)}%</span>
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:700, color:'#059669' }} dir="ltr">{Math.round(p.revenue*rate).toLocaleString()} LE</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {products.length === 0 && <div style={{ padding:30, textAlign:'center', color:'#94a3b8', fontSize:13 }}>لا توجد بيانات</div>}
        </div>
      )}

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
