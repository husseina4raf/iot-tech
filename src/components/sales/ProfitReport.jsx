import { useState } from 'react'
import { TrendingUp, Package } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
]

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const getCostPrice = (itemName, inventory) => {
  const inv = inventory.find(i =>
    i.name.toLowerCase() === itemName.toLowerCase() || i.nameAr === itemName
  )
  return inv?.costPrice || 0
}

export default function ProfitReport() {
  const { orders, inventory } = useOrders()
  const { user } = useAuth()

  const now = new Date()
  const [year,   setYear]   = useState(now.getFullYear())
  const [month,  setMonth]  = useState(now.getMonth())
  const [period, setPeriod] = useState('month')
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  const repName = user?.repName
  const repOrders = repName ? orders.filter(o => {
    if (o.salesRep !== repName) return false
    if (o.status !== 'مكتمل') return false
    if (period === 'month') {
      const parts = o.date?.split('-')
      if (!parts || parts.length < 3) return false
      return parseInt(parts[2], 10) === year && parseInt(parts[1], 10) - 1 === month
    }
    return true
  }) : []

  // Aggregate per product
  const productMap = {}
  repOrders.forEach(order => {
    order.items.forEach(item => {
      const costPrice = getCostPrice(item.name, inventory)
      if (!productMap[item.name]) {
        productMap[item.name] = {
          name: item.name,
          units: 0,
          revenue: 0,
          totalCost: 0,
          unitCost: costPrice,
          hasCost: costPrice > 0,
        }
      }
      productMap[item.name].units     += Number(item.quantity) || 0
      productMap[item.name].revenue   += item.total
      productMap[item.name].totalCost += costPrice * (Number(item.quantity) || 0)
    })
  })

  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalCost    = products.reduce((s, p) => s + p.totalCost, 0)
  const totalProfit  = totalRevenue - totalCost

  return (
    <div>
      {/* Period filter */}
      <div style={{ ...card, padding:'14px 20px', marginBottom:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6 }}>
          {[{ val:'month', label:'هذا الشهر' }, { val:'all', label:'كل الوقت' }].map(opt => (
            <button key={opt.val} onClick={() => setPeriod(opt.val)}
              style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${period===opt.val?'#2563eb':'#e4eaf3'}`, background: period===opt.val?'#eff6ff':'#fff', color: period===opt.val?'#1d4ed8':'#64748b', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', transition:'all 0.15s' }}>
              {opt.label}
            </button>
          ))}
        </div>
        {period === 'month' && (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} dir="rtl"
              style={{ padding:'6px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', cursor:'pointer' }}>
              {MONTHS_AR.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} dir="ltr"
              style={{ padding:'6px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', cursor:'pointer' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        <span style={{ fontSize:12, color:'#94a3b8', marginRight:'auto' }}>
          {period === 'month' ? `${MONTHS_AR[month]} ${year}` : 'جميع الفواتير'}
        </span>
      </div>

      {/* Summary cards */}
      <div className="m-grid-3" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        {[
          { label:'إجمالي الإيرادات', value:`${totalRevenue.toLocaleString()} LE`,         color:'#1d4ed8', bg:'#eff6ff' },
          { label:'إجمالي التكلفة',   value:`${Math.round(totalCost).toLocaleString()} LE`, color:'#64748b', bg:'#f8fafc' },
          { label:'صافي الربح',       value:`${Math.round(totalProfit).toLocaleString()} LE`, color:'#059669', bg:'#ecfdf5' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding:'16px 20px' }}>
            <div style={{ fontSize:24, fontWeight:800, color:s.color, marginBottom:4 }} dir="ltr">{s.value}</div>
            <div style={{ fontSize:12, color:'#64748b' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Product breakdown — cards */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <TrendingUp size={15} color="#2563eb" />
        <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>تقرير الربح بالمنتج</span>
        <span style={{ fontSize:11, color:'#94a3b8', padding:'2px 8px', borderRadius:20, background:'#f0f4fa', border:'1px solid #e4eaf3' }}>الطلبات المكتملة فقط</span>
      </div>

      {products.length === 0 ? (
        <div style={{ ...card, padding:40, textAlign:'center' }}>
          <Package size={36} color="#e4eaf3" style={{ margin:'0 auto 12px' }} />
          <p style={{ fontSize:13, color:'#94a3b8' }}>لا توجد طلبات مكتملة بعد</p>
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
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                  <div style={{ width:30, height:30, borderRadius:9, background:rankBg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:800, flexShrink:0 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{p.units} وحدة</div>
                  </div>
                </div>

                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:5 }}>
                    <span style={{ color:'#64748b' }}>هامش الربح</span>
                    <span style={{ fontWeight:800, color: p.hasCost ? (isPos?'#059669':'#e11d48') : '#94a3b8' }}>
                      {p.hasCost ? `${margin}%` : 'لا يوجد سعر تكلفة'}
                    </span>
                  </div>
                  <div style={{ height:8, borderRadius:20, background:'#f0f4fa', overflow:'hidden' }}>
                    {p.hasCost && (
                      <div style={{ height:'100%', width:`${barWidth}%`, background: isPos ? 'linear-gradient(90deg,#059669,#34d399)' : 'linear-gradient(90deg,#e11d48,#fb7185)', borderRadius:20 }} />
                    )}
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div style={{ padding:'8px 12px', borderRadius:10, background:'#eff6ff', border:'1px solid #bfdbfe' }}>
                    <div style={{ fontSize:10, color:'#3b82f6', fontWeight:600, marginBottom:3 }}>إجمالي المبيعات</div>
                    <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }} dir="ltr">
                      {p.revenue >= 1000 ? `${(p.revenue/1000).toFixed(1)}K` : p.revenue.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ padding:'8px 12px', borderRadius:10, background: !p.hasCost?'#f8fafc':isPos?'#ecfdf5':'#fff1f2', border:`1px solid ${!p.hasCost?'#e4eaf3':isPos?'#a7f3d0':'#fecdd3'}` }}>
                    <div style={{ fontSize:10, color: !p.hasCost?'#94a3b8':isPos?'#059669':'#e11d48', fontWeight:600, marginBottom:3 }}>صافي الربح</div>
                    <div style={{ fontSize:15, fontWeight:800, color: !p.hasCost?'#cbd5e1':isPos?'#059669':'#e11d48' }} dir="ltr">
                      {p.hasCost ? (Math.abs(profit)>=1000 ? `${(profit/1000).toFixed(1)}K` : Math.round(profit).toLocaleString()) : '—'}
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
}
