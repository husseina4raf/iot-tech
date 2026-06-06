import { TrendingUp, Package } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

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

  const repName = user?.repName
  const repOrders = repName ? orders.filter(o => o.salesRep === repName) : []

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
      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
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
                {['المنتج','الوحدات المباعة','سعر البيع','سعر التكلفة','صافي الربح','هامش %'].map((h, i) => (
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
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#1d4ed8', fontWeight:700 }} dir="ltr">{p.revenue.toLocaleString()} LE</td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#64748b', fontWeight:700 }} dir="ltr">
                      {p.hasCost ? `${p.totalCost.toLocaleString()} LE` : <span style={{color:'#cbd5e1'}}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', color:'#059669', fontWeight:700 }} dir="ltr">
                      {p.hasCost ? `${Math.round(profit).toLocaleString()} LE` : <span style={{color:'#cbd5e1'}}>—</span>}
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      {p.hasCost
                        ? <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontSize:11, fontWeight:700 }}>{margin}%</span>
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
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }} dir="ltr">
                  {totalRevenue.toLocaleString()} LE
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#64748b' }} dir="ltr">
                  {Math.round(totalCost).toLocaleString()} LE
                </td>
                <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:800, color:'#059669' }} dir="ltr">
                  {Math.round(totalProfit).toLocaleString()} LE
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
