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

      {/* Product breakdown table */}
      <div style={card}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #f0f4fa', display:'flex', alignItems:'center', gap:8 }}>
          <TrendingUp size={16} color="#2563eb" />
          <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>تقرير الربح بالمنتج</h3>
        </div>

        {products.length === 0 ? (
          <div style={{ padding:40, textAlign:'center' }}>
            <Package size={36} color="#e4eaf3" style={{ margin:'0 auto 12px' }} />
            <p style={{ fontSize:13, color:'#94a3b8' }}>لا توجد مبيعات بعد</p>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['المنتج','الوحدات','تكلفة الوحدة','إجمالي المبيعات','إجمالي التكلفة','صافي الربح','هامش %'].map((h, i) => (
                  <th key={h} style={{ padding:'11px 16px', fontSize:11, fontWeight:700, color:'#64748b', textAlign: i === 0 ? 'right' : 'center', borderBottom:'1px solid #f0f4fa' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const profit = p.revenue - p.totalCost
                const margin = p.revenue > 0 ? Math.round((profit / p.revenue) * 100) : 0
                return (
                  <tr key={p.name} style={{ borderBottom:'1px solid #f8fafc' }}
                    onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{p.name}</div>
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#0f172a', fontWeight:600 }}>{p.units}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#64748b', fontWeight:700 }} dir="ltr">
                      {p.hasCost ? `${p.unitCost.toLocaleString()} LE` : <span style={{color:'#cbd5e1'}}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#1d4ed8', fontWeight:700 }} dir="ltr">{p.revenue.toLocaleString()} LE</td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#64748b', fontWeight:700 }} dir="ltr">
                      {p.hasCost ? `${p.totalCost.toLocaleString()} LE` : <span style={{color:'#cbd5e1'}}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:700 }} dir="ltr">
                      {p.hasCost
                        ? <span style={{ color: profit >= 0 ? '#059669' : '#e11d48' }}>{Math.round(profit).toLocaleString()} LE</span>
                        : <span style={{color:'#cbd5e1'}}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      {p.hasCost
                        ? <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                            background: margin >= 0 ? '#ecfdf5' : '#fff1f2',
                            color:      margin >= 0 ? '#059669' : '#e11d48',
                            border:     `1px solid ${margin >= 0 ? '#a7f3d0' : '#fecdd3'}` }}>{margin}%</span>
                        : <span style={{color:'#cbd5e1', fontSize:11}}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#eff6ff', borderTop:'2px solid #bfdbfe' }}>
                <td style={{ padding:'12px 16px', fontWeight:800, color:'#1d4ed8' }}>الإجمالي</td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }}>
                  {products.reduce((s, p) => s + p.units, 0)}
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', color:'#94a3b8', fontSize:11 }}>—</td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }} dir="ltr">
                  {totalRevenue.toLocaleString()} LE
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#64748b' }} dir="ltr">
                  {Math.round(totalCost).toLocaleString()} LE
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800 }} dir="ltr">
                  <span style={{ color: totalProfit >= 0 ? '#059669' : '#e11d48' }}>
                    {Math.round(totalProfit).toLocaleString()} LE
                  </span>
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#7c3aed' }}>
                  {totalRevenue > 0 ? `${Math.round((totalProfit/totalRevenue)*100)}%` : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
