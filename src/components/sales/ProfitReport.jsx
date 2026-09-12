import { useState, useEffect } from 'react'
import { TrendingUp, Package, ChevronDown, RefreshCw, AlertTriangle } from 'lucide-react'
import Pagination from '../ui/Pagination'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'
import { useProfitSummary } from '../../hooks/useProfitSummary'

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
]

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

// Historical, order-line cost — the snapshot stored on the order itself at
// creation time. NEVER falls back to the live inventory cost: a product's
// current cost must not retroactively change a past order's profit.
// Missing/undefined/null/zero is treated explicitly as 0 (no cost known).
const getItemCost = (item) => Number(item.costPrice) || 0

export default function ProfitReport() {
  const { orders } = useOrders()
  const { user } = useAuth()

  const now = new Date()
  const [year,   setYear]   = useState(now.getFullYear())
  const [month,  setMonth]  = useState(now.getMonth())
  const [period, setPeriod] = useState('month')
  const [expanded, setExpanded] = useState({})
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 10
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))
  useEffect(() => setPage(1), [year, month, period])

  const repName = user?.repName

  // The order list below is still built from the paginated `orders` array —
  // it renders actual order/item rows (client name, per-item breakdown),
  // which can only come from real loaded order records. Its own per-order
  // figures now use the stored item.costPrice (never live inventory), so
  // each row shown is individually correct; only the top summary cards
  // (below) are guaranteed complete regardless of pagination.
  const repOrders = repName ? orders.filter(o => {
    if (o.salesRep !== repName) return false
    if (o.status !== 'تم التحصيل') return false
    if (period === 'month') {
      const parts = o.date?.split('-')
      if (!parts || parts.length < 3) return false
      return parseInt(parts[2], 10) === year && parseInt(parts[1], 10) - 1 === month
    }
    return true
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : []

  // ── Canonical, pagination-independent totals ────────────────────────────
  // Sourced from get_profit_summary (src/lib/profit_aggregation.sql), which
  // aggregates the COMPLETE `orders` table server-side — not the frontend's
  // paginated `orders` state. Status = تم التحصيل only, revenue basis =
  // order.subtotal (VAT-exclusive), cost = stored item.costPrice.
  const { rows: profitRows, loading: profitLoading, error: profitError } = useProfitSummary({
    repName,
    year:  period === 'month' ? String(year) : null,
    month: period === 'month' ? String(month + 1).padStart(2, '0') : null,
  })
  const summary = profitRows[0]
  const totalRevenue = Number(summary?.total_subtotal) || 0
  const totalCost    = Number(summary?.total_cost) || 0
  const totalProfit  = Number(summary?.total_profit) || 0

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

      {/* Summary cards — canonical, complete-dataset totals (get_profit_summary) */}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {profitError ? (
        <div style={{ ...card, padding:'16px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:10, color:'#e11d48', border:'1px solid #fecdd3', background:'#fff1f2' }}>
          <AlertTriangle size={16} />
          <span style={{ fontSize:13, fontWeight:600 }}>تعذّر حساب الأرباح — {profitError}</span>
        </div>
      ) : (
        <div className="m-grid-3" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
          {[
            { label:'إجمالي الإيرادات', value:`${totalRevenue.toLocaleString()} LE`,           color:'#1d4ed8', bg:'#eff6ff' },
            { label:'إجمالي التكلفة',   value:`${Math.round(totalCost).toLocaleString()} LE`,   color:'#64748b', bg:'#f8fafc' },
            { label:'صافي الربح',       value:`${Math.round(totalProfit).toLocaleString()} LE`, color: totalProfit>=0?'#059669':'#e11d48', bg: totalProfit>=0?'#ecfdf5':'#fff1f2' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding:'16px 20px' }}>
              {profitLoading ? (
                <RefreshCw size={18} color="#94a3b8" style={{ animation:'spin 0.7s linear infinite', marginBottom:8 }} />
              ) : (
                <div style={{ fontSize:24, fontWeight:800, color:s.color, marginBottom:4 }} dir="ltr">{s.value}</div>
              )}
              <div style={{ fontSize:12, color:'#64748b' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orders list */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <TrendingUp size={15} color="#2563eb" />
        <span style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>الطلبات المحصّلة</span>
        <span style={{ fontSize:11, color:'#94a3b8', padding:'2px 8px', borderRadius:20, background:'#f0f4fa', border:'1px solid #e4eaf3' }}>تم التحصيل فقط</span>
      </div>

      {repOrders.length === 0 ? (
        <div style={{ ...card, padding:40, textAlign:'center' }}>
          <Package size={36} color="#e4eaf3" style={{ margin:'0 auto 12px' }} />
          <p style={{ fontSize:13, color:'#94a3b8' }}>لا توجد طلبات تم تحصيلها بعد</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {repOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((order, idx) => {
            const orderCost   = order.items.reduce((s, item) => s + getItemCost(item) * (Number(item.quantity) || 0), 0)
            const orderBase   = order.subtotal || order.total
            const orderProfit = orderBase - orderCost
            const margin      = orderBase > 0 ? Math.round((orderProfit / orderBase) * 100) : 0
            const isPos       = orderProfit >= 0
            const isOpen      = expanded[order.id] !== false && (expanded[order.id] === true || idx === 0)

            return (
              <div key={order.id} style={card}>
                {/* Order header — clickable */}
                <button onClick={() => toggle(order.id)}
                  style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'14px 20px', background:'none', border:'none', cursor:'pointer', fontFamily:'Cairo,sans-serif', textAlign:'right' }}>

                  {/* Serial */}
                  <div style={{ fontSize:11, color:'#94a3b8', flexShrink:0, minWidth:72 }}>#{order.serialNumber}</div>

                  {/* Client */}
                  <div style={{ flex:1, minWidth:0, textAlign:'right' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{order.clientName}</div>
                    <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{order.company}</div>
                  </div>

                  {/* Date */}
                  <div style={{ fontSize:11, color:'#94a3b8', flexShrink:0 }}>{order.date}</div>

                  {/* Profit pill */}
                  <div style={{ padding:'4px 10px', borderRadius:20, background: isPos?'#ecfdf5':'#fff1f2', border:`1px solid ${isPos?'#a7f3d0':'#fecdd3'}`, fontSize:11, fontWeight:800, color: isPos?'#059669':'#e11d48', flexShrink:0 }} dir="ltr">
                    {isPos?'+':''}{Math.round(orderProfit).toLocaleString()} LE
                  </div>

                  {/* Revenue (subtotal without VAT) */}
                  <div style={{ fontSize:13, fontWeight:700, color:'#1d4ed8', flexShrink:0, minWidth:90 }} dir="ltr">
                    {orderBase.toLocaleString()} LE
                  </div>

                  <ChevronDown size={14} color="#94a3b8" style={{ flexShrink:0, transform: isOpen?'rotate(180deg)':'none', transition:'transform 0.2s' }} />
                </button>

                {/* Expanded items */}
                {isOpen && (
                  <div style={{ borderTop:'1px solid #f0f4fa' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'#f8fafc' }}>
                          {['الصنف','الكمية','سعر البيع','التكلفة','الربح'].map((h, i) => (
                            <th key={h} style={{ padding:'8px 16px', fontWeight:700, color:'#64748b', fontSize:11, textAlign: i===0?'right':'center', borderBottom:'1px solid #f0f4fa' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item, i) => {
                          const cost   = getItemCost(item)
                          const hasCost = cost > 0
                          const itemProfit = hasCost ? item.total - cost * (Number(item.quantity) || 0) : null
                          const itemPos    = itemProfit !== null && itemProfit >= 0
                          return (
                            <tr key={item.id || i} style={{ borderBottom:'1px solid #f8fafc' }}>
                              <td style={{ padding:'9px 16px', fontWeight:600, color:'#0f172a' }}>{item.name}</td>
                              <td style={{ padding:'9px 16px', textAlign:'center', color:'#475569' }}>{item.quantity}</td>
                              <td style={{ padding:'9px 16px', textAlign:'center', color:'#1d4ed8', fontWeight:600 }} dir="ltr">{item.total.toLocaleString()} LE</td>
                              <td style={{ padding:'9px 16px', textAlign:'center', color:'#64748b' }} dir="ltr">
                                {hasCost ? `${(cost * (Number(item.quantity)||0)).toLocaleString()} LE` : <span style={{color:'#cbd5e1'}}>—</span>}
                              </td>
                              <td style={{ padding:'9px 16px', textAlign:'center', fontWeight:700, color: itemProfit===null?'#cbd5e1':itemPos?'#059669':'#e11d48' }} dir="ltr">
                                {itemProfit !== null ? `${Math.round(itemProfit).toLocaleString()} LE` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background:'#f8fafc', borderTop:'2px solid #e4eaf3' }}>
                          <td colSpan={2} style={{ padding:'9px 16px', fontWeight:700, color:'#0f172a', fontSize:11 }}>إجمالي الطلب</td>
                          <td style={{ padding:'9px 16px', textAlign:'center', fontWeight:800, color:'#1d4ed8' }} dir="ltr">{orderBase.toLocaleString()} LE</td>
                          <td style={{ padding:'9px 16px', textAlign:'center', fontWeight:700, color:'#64748b' }} dir="ltr">{Math.round(orderCost).toLocaleString()} LE</td>
                          <td style={{ padding:'9px 16px', textAlign:'center', fontWeight:800, color: isPos?'#059669':'#e11d48' }} dir="ltr">
                            {Math.round(orderProfit).toLocaleString()} LE
                            {orderCost > 0 && <span style={{ fontSize:10, color:'#94a3b8', marginRight:4 }}>({margin}%)</span>}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {repOrders.length > PAGE_SIZE && (
        <div style={{ marginTop: 16 }}>
          <Pagination page={page} total={repOrders.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}
    </div>
  )
}
