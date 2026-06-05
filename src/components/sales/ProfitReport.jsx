import { TrendingUp, Info, Package, AlertCircle } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

// Placeholder margin rates per product — will be updated when formula is provided
const MARGIN_RATES = {
  'Smart Lock Lezn':  0.38,
  'Smart Lock Denak': 0.42,
  'Smart Lock PNDA':  0.39,
  'iFace 19':         0.37,
  'Camera Bosch':     0.39,
  'Smart Door Bell':  0.47,
}
const DEFAULT_MARGIN = 0.35

export default function ProfitReport() {
  const { orders, inventory } = useOrders()
  const { user } = useAuth()

  const repName = user?.repName
  const repOrders = repName ? orders.filter(o => o.salesRep === repName) : []

  // Aggregate per product
  const productMap = {}
  repOrders.forEach(order => {
    order.items.forEach(item => {
      if (!productMap[item.name]) {
        const inv = inventory.find(i => i.name.toLowerCase() === item.name.toLowerCase() || i.nameAr === item.name)
        productMap[item.name] = {
          name: item.name,
          units: 0,
          revenue: 0,
          costPrice: inv?.costPrice || null,
          marginRate: MARGIN_RATES[item.name] || DEFAULT_MARGIN,
        }
      }
      productMap[item.name].units   += item.quantity
      productMap[item.name].revenue += item.total
    })
  })

  const products = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const estimatedProfit = products.reduce((s, p) => s + p.revenue * p.marginRate, 0)

  return (
    <div>
      {/* Notice banner */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderRadius:12, background:'#fffbeb', border:'1px solid #fde68a', marginBottom:20 }}>
        <Info size={16} color="#d97706" style={{ flexShrink:0, marginTop:1 }} />
        <div style={{ fontSize:12, color:'#92400e', lineHeight:1.6 }}>
          <strong>ملاحظة:</strong> أرقام الربح المعروضة مبنية على نسب تقديرية مؤقتة. سيتم تحديث معادلة حساب الربح الفعلية عند توفيرها من الإدارة.
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
        {[
          { label:'إجمالي الإيرادات',    value:`${totalRevenue.toLocaleString()} LE`,  color:'#1d4ed8', bg:'#eff6ff' },
          { label:'صافي الربح (تقديري)', value:`${Math.round(estimatedProfit).toLocaleString()} LE`, color:'#059669', bg:'#ecfdf5' },
          { label:'متوسط هامش الربح',    value:`${totalRevenue > 0 ? Math.round((estimatedProfit/totalRevenue)*100) : 0}%`, color:'#7c3aed', bg:'#f5f3ff' },
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
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#fffbeb', color:'#d97706', border:'1px solid #fde68a', fontWeight:600 }}>تقديري</span>
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
                {['المنتج','الوحدات المباعة','الإيرادات','هامش الربح %','الربح التقديري','من الإجمالي'].map((h, i) => (
                  <th key={h} style={{ padding:'11px 16px', fontSize:11, fontWeight:700, color:'#64748b', textAlign: i === 0 ? 'right' : 'center', borderBottom:'1px solid #f0f4fa' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const profit = p.revenue * p.marginRate
                const share  = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0
                return (
                  <tr key={p.name} style={{ borderBottom:'1px solid #f8fafc' }}
                    onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{p.name}</div>
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#0f172a', fontWeight:600 }}>{p.units}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#0f172a', fontWeight:700 }} dir="ltr">{p.revenue.toLocaleString()} LE</td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontSize:11, fontWeight:700 }}>
                        {Math.round(p.marginRate * 100)}%
                      </span>
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#059669', fontWeight:700 }} dir="ltr">{Math.round(profit).toLocaleString()} LE</td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
                        <div style={{ width:60, height:5, borderRadius:4, background:'#e4eaf3', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${share}%`, background:'#2563eb', borderRadius:4 }} />
                        </div>
                        <span style={{ fontSize:11, color:'#64748b' }}>{Math.round(share)}%</span>
                      </div>
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
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }} dir="ltr">
                  {totalRevenue.toLocaleString()} LE
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }}>
                  {totalRevenue > 0 ? `${Math.round((estimatedProfit/totalRevenue)*100)}%` : '—'}
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#059669' }} dir="ltr">
                  {Math.round(estimatedProfit).toLocaleString()} LE
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }}>100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:'#f8fafc', border:'1px solid #e4eaf3', marginTop:12 }}>
        <AlertCircle size={13} color="#94a3b8" />
        <span style={{ fontSize:11, color:'#94a3b8' }}>أرقام الربح تقديرية وستتغير عند تحديث معادلة الحساب من قِبل الإدارة</span>
      </div>
    </div>
  )
}
