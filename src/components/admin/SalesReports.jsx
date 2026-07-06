import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Users, Package, BarChart2, Target, Edit3, Check, X } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const GRADIENTS = [
  'linear-gradient(135deg,#2563eb,#1d4ed8)',
  'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'linear-gradient(135deg,#059669,#047857)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#d97706,#b45309)',
]

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const getCostPrice = (itemName, inventory) => {
  const inv = inventory.find(i => i.name.toLowerCase() === itemName.toLowerCase() || i.nameAr === itemName)
  return inv?.costPrice || 0
}

const today     = new Date()
const thisYear  = String(today.getFullYear())
const thisMonth = String(today.getMonth() + 1).padStart(2, '0')

export default function SalesReports() {
  const { orders, inventory, salesTargets, upsertTarget } = useOrders()
  const { salesReps: SALES_REPS, user } = useAuth()
  const canEdit = ['admin', 'super_admin'].includes(user?.role)

  const [tab,      setTab]      = useState('monthly')
  const [selYear,  setSelYear]  = useState(thisYear)
  const [selMonth, setSelMonth] = useState(thisMonth)
  const [editing,  setEditing]  = useState(false)
  const [drafts,   setDrafts]   = useState({})
  const [perfYear,  setPerfYear]  = useState('')
  const [perfMonth, setPerfMonth] = useState('')
  const [trendRep, setTrendRep] = useState('')
  const [prodRep,  setProdRep]  = useState('')

  const monthKey = `${selYear}-${selMonth}`

  const prevMonthKey = useMemo(() => {
    const m = Number(selMonth) - 1
    if (m === 0) return `${Number(selYear) - 1}-12`
    return `${selYear}-${String(m).padStart(2, '0')}`
  }, [selYear, selMonth])

  const availableYears = useMemo(() => {
    const ys = new Set(orders.map(o => o.date?.split('-')[2]).filter(Boolean))
    ys.add(thisYear)
    return [...ys].sort((a, b) => b.localeCompare(a))
  }, [orders])

  // ── Monthly tab data ─────────────────────────────────────────────────────────
  const monthOrders = useMemo(() =>
    orders.filter(o => { const p = o.date?.split('-'); return p?.length >= 3 && `${p[2]}-${p[1].padStart(2,'0')}` === monthKey })
  , [orders, monthKey])

  const prevOrders = useMemo(() =>
    orders.filter(o => { const p = o.date?.split('-'); return p?.length >= 3 && `${p[2]}-${p[1].padStart(2,'0')}` === prevMonthKey })
  , [orders, prevMonthKey])

  const monthStats = useMemo(() =>
    SALES_REPS.map(rep => {
      const mo = monthOrders.filter(o => o.salesRep === rep)
      const po = prevOrders.filter(o => o.salesRep === rep)
      const revenue     = mo.reduce((s, o) => s + o.total, 0)
      const prevRevenue = po.reduce((s, o) => s + o.total, 0)
      const target      = salesTargets?.find(t => t.repName === rep && t.month === monthKey)?.target || 0
      const trend       = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null
      const achievement = target > 0 ? Math.round((revenue / target) * 100) : null
      return { rep, revenue, prevRevenue, count: mo.length, target, trend, achievement }
    })
  , [SALES_REPS, monthOrders, prevOrders, salesTargets, monthKey])

  const monthTotal  = monthStats.reduce((s, r) => s + r.revenue, 0)
  const maxMonthRev = Math.max(...monthStats.map(r => r.revenue), 1)

  const startEdit = () => {
    const d = {}
    SALES_REPS.forEach(rep => {
      const t = salesTargets?.find(t => t.repName === rep && t.month === monthKey)
      d[rep] = t ? String(t.target) : ''
    })
    setDrafts(d)
    setEditing(true)
  }

  const saveTargets = async () => {
    for (const [rep, val] of Object.entries(drafts)) {
      if (val !== '' && !isNaN(Number(val)) && Number(val) > 0) {
        await upsertTarget(rep, monthKey, Number(val), user)
      }
    }
    setEditing(false)
    setDrafts({})
  }

  // ── Rep performance tab data ──────────────────────────────────────────────────
  const perfStats = useMemo(() => {
    let src = orders
    if (perfYear)  src = src.filter(o => o.date?.split('-')[2] === perfYear)
    if (perfMonth) src = src.filter(o => o.date?.split('-')[1]?.padStart(2,'0') === perfMonth)
    return SALES_REPS.map(rep => {
      const ro = src.filter(o => o.salesRep === rep)
      const revenue   = ro.reduce((s, o) => s + o.total, 0)
      const profit    = ro.reduce((s, o) => s + o.items.reduce((ss, i) => ss + (i.price - getCostPrice(i.name, inventory)) * i.quantity, 0), 0)
      const completed = ro.filter(o => ['تم الصرف', 'مكتمل', 'تم التحصيل'].includes(o.status)).length
      // count distinct active months for this rep
      const activeMonths = new Set(ro.map(o => { const p = o.date?.split('-'); return p?.length >= 3 ? `${p[2]}-${p[1]?.padStart(2,'0')}` : null }).filter(Boolean)).size
      const perMonth = activeMonths > 0 ? Math.round(ro.length / activeMonths) : 0
      return { rep, count: ro.length, revenue, profit, completed, activeMonths, perMonth,
        rate: ro.length > 0 ? Math.round((completed / ro.length) * 100) : 0 }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [SALES_REPS, orders, inventory, perfYear, perfMonth])

  // ── Monthly trend tab data ────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const src = trendRep ? orders.filter(o => o.salesRep === trendRep) : orders
    const map = {}
    src.forEach(o => {
      const p = o.date?.split('-')
      if (!p || p.length < 3) return
      const key   = `${p[2]}-${p[1]}`
      const label = new Date(p[2], p[1] - 1, 1).toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' })
      if (!map[key]) map[key] = { key, label, revenue: 0, count: 0 }
      map[key].revenue += o.total
      map[key].count   += 1
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [orders, trendRep])
  const maxTrendRev = Math.max(...trendData.map(m => m.revenue), 1)

  // ── Products tab data ─────────────────────────────────────────────────────────
  const productData = useMemo(() => {
    const src = (prodRep ? orders.filter(o => o.salesRep === prodRep) : orders).filter(o => o.status === 'مكتمل')
    const map = {}
    src.forEach(o => o.items.forEach(item => {
      if (!map[item.name]) {
        const cp = getCostPrice(item.name, inventory)
        map[item.name] = { name: item.name, units: 0, revenue: 0, totalCost: 0, orders: 0, hasCost: cp > 0 }
      }
      const cp = getCostPrice(item.name, inventory)
      map[item.name].units     += Number(item.quantity) || 0
      map[item.name].revenue   += item.total
      map[item.name].totalCost += cp * item.quantity
      map[item.name].orders    += 1
    }))
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [orders, inventory, prodRep])

  // ── Global KPIs — only orders from known sales reps ──────────────────────────
  const repMonthOrders = monthOrders.filter(o => SALES_REPS.includes(o.salesRep))
  const totalRevenue = repMonthOrders.reduce((s, o) => s + o.total, 0)
  const totalProfit  = repMonthOrders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + (i.price - getCostPrice(i.name, inventory)) * i.quantity, 0), 0)

  const TABS = [
    { id: 'monthly',  label: 'الملخص الشهري',  icon: Target },
    { id: 'reps',     label: 'أداء المندوبين', icon: Users },
    { id: 'trend',    label: 'الاتجاه الشهري', icon: BarChart2 },
    { id: 'products', label: 'أداء المنتجات',  icon: Package },
  ]

  return (
    <div>
      {/* Global month/year picker */}
      <div style={{ ...card, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>الفترة:</label>
        <select value={selMonth} onChange={e => setSelMonth(e.target.value)} dir="rtl"
          style={{ padding: '6px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
          {MONTHS_AR.map((m, i) => (
            <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
          ))}
        </select>
        <select value={selYear} onChange={e => setSelYear(e.target.value)} dir="ltr"
          style={{ padding: '6px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          {MONTHS_AR[Number(selMonth) - 1]} {selYear} · {monthOrders.length} طلب · {monthTotal.toLocaleString()} LE
        </span>
      </div>

      {/* Global KPIs */}
      <div className="m-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'إجمالي الإيرادات', value: `${(totalRevenue / 1000).toFixed(1)}K LE`, color: '#1d4ed8' },
          { label: 'صافي الربح',       value: `${(totalProfit  / 1000).toFixed(1)}K LE`,  color: '#059669' },
          { label: 'هامش الربح',       value: `${Math.round((totalProfit / Math.max(totalRevenue, 1)) * 100)}%`, color: '#7c3aed' },
          { label: 'إجمالي الطلبات',   value: repMonthOrders.length, color: '#0891b2' },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '16px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, marginBottom: 3 }} dir="ltr">{k.value}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tab bar */}
      <div className="m-tab-scroll" style={{ display: 'flex', gap: 1, padding: 5, borderRadius: 12, background: '#fff', border: '1px solid #e4eaf3', marginBottom: 16, width: 'fit-content', overflowX: 'auto' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9, border: 'none', background: tab === id ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : 'transparent', color: tab === id ? '#fff' : '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', boxShadow: tab === id ? '0 3px 10px rgba(37,99,235,0.3)' : 'none', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ─── Monthly Summary ─────────────────────────────────────────────────── */}
      {tab === 'monthly' && (
        <div>
          {/* Controls bar — targets edit only */}
          {canEdit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              {!editing && (
                <button onClick={startEdit}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
                  <Edit3 size={12} />تعديل الأهداف
                </button>
              )}
              {editing && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={saveTargets}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
                    <Check size={12} />حفظ
                  </button>
                  <button onClick={() => { setEditing(false); setDrafts({}) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e4eaf3', background: '#fff', color: '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
                    <X size={12} />إلغاء
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mini comparison bars */}
          <div style={{ ...card, padding: '14px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>مقارنة الأداء — {MONTHS_AR[Number(selMonth) - 1]} {selYear}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {monthStats.map((r, i) => (
                <div key={r.rep} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 64, fontSize: 12, fontWeight: 600, color: '#475569', textAlign: 'right', flexShrink: 0 }}>{r.rep}</div>
                  <div style={{ flex: 1, height: 18, background: '#f0f4fa', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(r.revenue / maxMonthRev) * 100}%`, background: GRADIENTS[i % GRADIENTS.length], borderRadius: 6, minWidth: r.revenue > 0 ? 4 : 0, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ width: 96, fontSize: 12, fontWeight: 700, color: '#0f172a', textAlign: 'left', flexShrink: 0 }} dir="ltr">{r.revenue.toLocaleString()} LE</div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-rep detail cards */}
          <div className="m-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {monthStats.map((r, i) => {
              const achPct   = r.target > 0 ? Math.min(Math.round((r.revenue / r.target) * 100), 999) : null
              const barColor = !achPct ? '#2563eb' : achPct >= 100 ? '#059669' : achPct >= 70 ? '#d97706' : '#e11d48'
              return (
                <div key={r.rep} style={{ ...card, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: GRADIENTS[i % GRADIENTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                        {r.rep[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{r.rep}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.count} طلب</div>
                      </div>
                    </div>
                    {r.trend !== null && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 700, color: r.trend >= 0 ? '#059669' : '#e11d48', padding: '3px 8px', borderRadius: 20, background: r.trend >= 0 ? '#ecfdf5' : '#fff1f2', border: `1px solid ${r.trend >= 0 ? '#a7f3d0' : '#fecdd3'}` }}>
                        {r.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(r.trend)}%
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }} dir="ltr">
                    {r.revenue.toLocaleString()} <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>LE</span>
                  </div>

                  {editing ? (
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>الهدف الشهري (LE)</label>
                      <input type="number" min="0" value={drafts[r.rep] ?? ''} onChange={e => setDrafts(p => ({ ...p, [r.rep]: e.target.value }))}
                        placeholder="أدخل الهدف..."
                        style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1.5px solid #bfdbfe', borderRadius: 8, background: '#eff6ff', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', boxSizing: 'border-box' }} />
                    </div>
                  ) : r.target > 0 ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                        <span style={{ color: '#64748b' }}>الهدف: {r.target.toLocaleString()} LE</span>
                        <span style={{ fontWeight: 800, color: barColor }}>{achPct !== null ? `${achPct}%` : '—'}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 20, background: '#f0f4fa', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(achPct || 0, 100)}%`, background: barColor, borderRadius: 20, transition: 'width 0.5s' }} />
                      </div>
                      {achPct >= 100 && <div style={{ fontSize: 11, color: '#059669', fontWeight: 700, marginTop: 4 }}>✓ تجاوز الهدف</div>}
                    </div>
                  ) : canEdit ? (
                    <button onClick={startEdit} style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', background: 'none', border: '1px dashed #e4eaf3', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'Cairo,sans-serif', width: '100%' }}>
                      + تحديد هدف
                    </button>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8' }}>لا يوجد هدف محدد</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Rep Performance ─────────────────────────────────────────────────── */}
      {tab === 'reps' && (
        <div>
          <div style={{ ...card, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>السنة:</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setPerfYear('')}
                  style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${!perfYear ? '#2563eb' : '#e4eaf3'}`, background: !perfYear ? '#eff6ff' : '#fff', color: !perfYear ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>الكل</button>
                {availableYears.map(y => (
                  <button key={y} onClick={() => setPerfYear(y)}
                    style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${perfYear === y ? '#2563eb' : '#e4eaf3'}`, background: perfYear === y ? '#eff6ff' : '#fff', color: perfYear === y ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>{y}</button>
                ))}
              </div>
            </div>
            <div style={{ width: 1, height: 24, background: '#e4eaf3', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>الشهر:</span>
              <select value={perfMonth} onChange={e => setPerfMonth(e.target.value)} dir="rtl"
                style={{ padding: '6px 10px', fontSize: 12, border: `1.5px solid ${perfMonth ? '#2563eb' : '#e4eaf3'}`, borderRadius: 8, background: perfMonth ? '#eff6ff' : '#f8fafc', color: perfMonth ? '#1d4ed8' : '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer', fontWeight: perfMonth ? 700 : 400 }}>
                <option value="">كل الشهور</option>
                {MONTHS_AR.map((m, i) => (
                  <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                أداء المندوبين
                {perfMonth ? ` — ${MONTHS_AR[Number(perfMonth)-1]}` : ''}
                {perfYear  ? ` ${perfYear}` : !perfMonth ? ' (كل الوقت)' : ''}
              </h3>
            </div>
            <div className="m-table-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['المندوب', 'الطلبات', !perfMonth ? 'طلبات/شهر' : 'الشهر', 'الإيرادات', 'صافي الربح', 'هامش الربح', 'معدل الإغلاق'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: i === 0 ? 'right' : 'center', borderBottom: '1px solid #f0f4fa' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perfStats.map((r, i) => (
                    <tr key={r.rep} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: GRADIENTS[i % GRADIENTS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>{r.rep[0]}</div>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.rep}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600 }}>{r.count}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {perfMonth ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{MONTHS_AR[Number(perfMonth)-1]}</span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                            {r.perMonth}
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400, marginRight: 3 }}>/ شهر</span>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#1d4ed8' }} dir="ltr">{r.revenue.toLocaleString()} LE</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: '#059669' }} dir="ltr">{Math.round(r.profit).toLocaleString()} LE</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontWeight: 700 }}>
                          {r.revenue > 0 ? `${Math.round((r.profit / r.revenue) * 100)}%` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          <div style={{ width: 50, height: 4, borderRadius: 4, background: '#e4eaf3', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${r.rate}%`, background: '#2563eb', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{r.rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Monthly Trend ───────────────────────────────────────────────────── */}
      {tab === 'trend' && (
        <div>
          <div style={{ ...card, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>عرض:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setTrendRep('')}
                style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${!trendRep ? '#2563eb' : '#e4eaf3'}`, background: !trendRep ? '#eff6ff' : '#fff', color: !trendRep ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>الكل</button>
              {SALES_REPS.map(rep => (
                <button key={rep} onClick={() => setTrendRep(rep)}
                  style={{ padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${trendRep === rep ? '#2563eb' : '#e4eaf3'}`, background: trendRep === rep ? '#eff6ff' : '#fff', color: trendRep === rep ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>{rep}</button>
              ))}
            </div>
          </div>
          <div style={card}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={15} color="#2563eb" />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>الاتجاه الشهري {trendRep ? `— ${trendRep}` : '(الكل)'}</h3>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {trendData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>لا توجد بيانات</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {trendData.map(m => (
                    <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 80, fontSize: 12, fontWeight: 600, color: '#64748b', textAlign: 'right', flexShrink: 0 }}>{m.label}</div>
                      <div style={{ flex: 1, height: 28, background: '#f0f4fa', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(m.revenue / maxTrendRev) * 100}%`, background: 'linear-gradient(135deg,#2563eb,#60a5fa)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, minWidth: 60, transition: 'width 0.4s' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', direction: 'ltr', whiteSpace: 'nowrap' }}>{(m.revenue / 1000).toFixed(1)}K</span>
                        </div>
                      </div>
                      <div style={{ width: 50, fontSize: 12, color: '#94a3b8', textAlign: 'center', flexShrink: 0 }}>{m.count} طلب</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Products ─────────────────────────────────────────────────────────── */}
      {tab === 'products' && (() => {
        const totRev    = productData.reduce((s, p) => s + p.revenue, 0)
        const totCost   = productData.reduce((s, p) => s + p.totalCost, 0)
        const totProfit = totRev - totCost
        return (
          <div>
            <div style={{ ...card, padding: '14px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={15} color="#2563eb" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>الربح بالمنتج</span>
                <span style={{ fontSize: 11, color: '#94a3b8', padding: '2px 8px', borderRadius: 20, background: '#f0f4fa', border: '1px solid #e4eaf3' }}>الطلبات المكتملة فقط</span>
              </div>
              <select value={prodRep} onChange={e => setProdRep(e.target.value)}
                style={{ padding: '6px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
                <option value="">كل المندوبين</option>
                {SALES_REPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="m-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'إجمالي الإيرادات', val: `${(totRev    / 1000).toFixed(1)}K LE`, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
                { label: 'إجمالي التكلفة',   val: `${(totCost   / 1000).toFixed(1)}K LE`, color: '#64748b', bg: '#f8fafc', border: '#e4eaf3' },
                { label: 'صافي الربح',        val: `${(totProfit / 1000).toFixed(1)}K LE`, color: totProfit >= 0 ? '#059669' : '#e11d48', bg: totProfit >= 0 ? '#ecfdf5' : '#fff1f2', border: totProfit >= 0 ? '#a7f3d0' : '#fecdd3' },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 16px', borderRadius: 12, background: s.bg, border: `1px solid ${s.border}` }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color }} dir="ltr">{s.val}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {productData.length === 0 ? (
              <div style={{ ...card, padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>لا توجد طلبات مكتملة بعد</div>
            ) : (
              <div className="m-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {productData.map((p, i) => {
                  const profit   = p.revenue - p.totalCost
                  const margin   = p.revenue > 0 ? Math.round((profit / p.revenue) * 100) : 0
                  const isPos    = profit >= 0
                  const rankBg   = (['linear-gradient(135deg,#f59e0b,#d97706)', 'linear-gradient(135deg,#94a3b8,#64748b)', 'linear-gradient(135deg,#b45309,#92400e)'][i]) || 'linear-gradient(135deg,#1d4ed8,#2563eb)'
                  return (
                    <div key={p.name} style={{ ...card, padding: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 9, background: rankBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{p.units} وحدة · {p.orders} طلب</div>
                        </div>
                      </div>
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
                          <span style={{ color: '#64748b' }}>هامش الربح</span>
                          <span style={{ fontWeight: 800, color: p.hasCost ? (isPos ? '#059669' : '#e11d48') : '#94a3b8' }}>
                            {p.hasCost ? `${margin}%` : 'لا يوجد سعر تكلفة'}
                          </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 20, background: '#f0f4fa', overflow: 'hidden' }}>
                          {p.hasCost && <div style={{ height: '100%', width: `${Math.min(Math.abs(margin), 100)}%`, background: isPos ? 'linear-gradient(90deg,#059669,#34d399)' : 'linear-gradient(90deg,#e11d48,#fb7185)', borderRadius: 20 }} />}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div style={{ padding: '8px 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                          <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600, marginBottom: 3 }}>إجمالي المبيعات</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#1d4ed8' }} dir="ltr">{p.revenue >= 1000 ? `${(p.revenue / 1000).toFixed(1)}K` : p.revenue.toLocaleString()}</div>
                        </div>
                        <div style={{ padding: '8px 12px', borderRadius: 10, background: !p.hasCost ? '#f8fafc' : isPos ? '#ecfdf5' : '#fff1f2', border: `1px solid ${!p.hasCost ? '#e4eaf3' : isPos ? '#a7f3d0' : '#fecdd3'}` }}>
                          <div style={{ fontSize: 10, color: !p.hasCost ? '#94a3b8' : isPos ? '#059669' : '#e11d48', fontWeight: 600, marginBottom: 3 }}>صافي الربح</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: !p.hasCost ? '#cbd5e1' : isPos ? '#059669' : '#e11d48' }} dir="ltr">
                            {p.hasCost ? (Math.abs(profit) >= 1000 ? `${(profit / 1000).toFixed(1)}K` : Math.round(profit).toLocaleString()) : '—'}
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
    </div>
  )
}
