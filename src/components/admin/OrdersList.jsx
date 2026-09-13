import { useState, useMemo, useEffect } from 'react'
import { Search, X, SlidersHorizontal, AlertTriangle } from 'lucide-react'
import OrderCard from './OrderCard'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'
import { ORDER_STATUSES } from '../../data/mockData'
import Pagination from '../ui/Pagination'
import { SkeletonList } from '../ui/Skeleton'
import { supabase } from '../../lib/supabase'
import { mapOrder } from '../../lib/mappers'

const PAGE_SIZE = 10

const pill = {
  'بانتظار الموافقة': ['#fff7ed', '#fed7aa', '#c2410c'],
  'جديد': ['#eff6ff', '#bfdbfe', '#1d4ed8'],
  'موافق عليه': ['#ecfdf5', '#a7f3d0', '#065f46'],
  'تم الصرف': ['#fffbeb', '#fde68a', '#92400e'],
  'مكتمل': ['#f5f3ff', '#ddd6fe', '#4c1d95'],
  'تم التحصيل': ['#ecfdf5', '#a7f3d0', '#065f46'],
  'مرفوض': ['#fff1f2', '#fecdd3', '#9f1239'],
}

export default function OrdersList() {
  const { orders, loading, hasMoreOrders, loadMoreOrders } = useOrders()
  const { salesReps } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [rep, setRep] = useState('')
  const [sku, setSku] = useState('')
  const [dateFilter, setDateFilter] = useState('')   // 'YYYY-MM-DD' from <input type="date">, or ''
  const [focused, setFocused] = useState(false)
  const [page, setPage] = useState(1)

  // ── Server-side search (SKU / date) ─────────────────────────────────────────
  // `orders` above is the shared, paginated state (PAGE_SIZE=100 per page,
  // grown only via "تحميل المزيد"). Filtering SKU/date against it would
  // silently miss matches on pages that haven't been loaded yet. Whenever
  // either of these two filters is in use, this queries Supabase directly —
  // independent of that paginated state — so results are always complete,
  // regardless of how many order pages happen to be loaded elsewhere.
  // Existing search/status/rep filters are unaffected: with neither SKU nor
  // date set, everything below falls back to the exact previous behavior.
  const [serverOrders,  setServerOrders]  = useState(null)   // null = not in server-search mode
  const [serverLoading, setServerLoading] = useState(false)
  const [serverError,   setServerError]   = useState(null)
  const usingServerSearch = Boolean(sku.trim() || dateFilter)

  useEffect(() => {
    if (!usingServerSearch) {
      // Reset via a resolved-promise callback rather than directly in the
      // effect body — same tick, same behavior, just not a top-level
      // setState call the effect itself makes (same pattern used
      // elsewhere in this project, e.g. useProfitSummary.js).
      Promise.resolve().then(() => {
        setServerOrders(null)
        setServerError(null)
      })
      return
    }
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      setServerLoading(true)
      setServerError(null)
    })
    // Small debounce — mainly for the SKU text input, so a query isn't
    // fired on every keystroke.
    const timer = setTimeout(async () => {
      let query = supabase.from('orders').select('*').order('created_at', { ascending: false })
      if (dateFilter) {
        // Full local calendar day, converted to proper UTC ISO boundaries
        // for the TIMESTAMPTZ `created_at` column — safe regardless of the
        // database server's own timezone setting, since a TIMESTAMPTZ
        // comparison is always resolved in UTC internally.
        const dayStart = new Date(`${dateFilter}T00:00:00`)
        const dayEnd   = new Date(`${dateFilter}T23:59:59.999`)
        query = query.gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString())
      }
      const { data, error } = await query
      if (cancelled) return
      if (error) {
        console.error('OrdersList server search:', error)
        setServerError('تعذر البحث — يرجى المحاولة مرة أخرى')
        setServerOrders([])
      } else {
        setServerOrders((data || []).map(mapOrder))
      }
      setServerLoading(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [sku, dateFilter, usingServerSearch])

  const filtered = useMemo(() => {
    // Search universe: the complete server-search result when SKU/date is
    // in use, otherwise the existing paginated `orders` array — unchanged.
    const base = usingServerSearch ? (serverOrders || []) : orders
    return base
      .filter(o => {
        const q = search.toLowerCase()
        const matchesSearch = !q || o.clientName.toLowerCase().includes(q) || o.company.toLowerCase().includes(q) || o.serialNumber.includes(q)
        const matchesStatus = !status || o.status === status
        const matchesRep    = !rep || o.salesRep === rep
        const skuQuery       = sku.trim().toLowerCase()
        const matchesSku     = !skuQuery || (o.items || []).some(i => i.sku?.toLowerCase().includes(skuQuery))
        return matchesSearch && matchesStatus && matchesRep && matchesSku
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [usingServerSearch, serverOrders, orders, search, status, rep, sku])

  useEffect(() => setPage(1), [search, status, rep, sku, dateFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const clear = () => { setSearch(''); setStatus(''); setRep(''); setSku(''); setDateFilter('') }
  const hasFilter = search || status || rep || sku || dateFilter

  const sel = { padding: '8px 12px', fontSize: 13, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#fff', color: '#0f172a', outline: 'none', cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }

  return (
    <div>
      {/* Status pills */}
      <div className="m-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
        {ORDER_STATUSES.map(s => {
          const [bg, border, color] = pill[s]
          const active = status === s
          return (
            <button key={s} onClick={() => setStatus(active ? '' : s)} style={{ borderRadius: 12, padding: '14px 16px', textAlign: 'center', border: `1.5px solid ${active ? color : border}`, background: active ? bg : '#fff', cursor: 'pointer', transition: 'all 0.15s', boxShadow: active ? `0 0 0 3px ${color}22` : '0 1px 3px rgba(15,23,42,0.05)', fontFamily: 'Cairo,sans-serif' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, marginBottom: 2 }}>{orders.filter(o => o.status === s).length}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{s}</div>
            </button>
          )
        })}
      </div>

      {/* Search + filters bar */}
      <div className="m-wrap" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: '#fff', border: '1px solid #e4eaf3', marginBottom: 16, boxShadow: '0 1px 4px rgba(15,23,42,0.05)' }}>
        <SlidersHorizontal size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: focused ? '#2563eb' : '#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم العميل أو الشركة أو رقم الطلب..." onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            style={{ width: '100%', padding: '8px 34px 8px 12px', border: `1.5px solid ${focused ? '#2563eb' : '#e4eaf3'}`, borderRadius: 8, background: focused ? '#fff' : '#f8fafc', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', boxShadow: focused ? '0 0 0 3px rgba(37,99,235,0.1)' : 'none', transition: 'all 0.15s' }} />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} dir="rtl" style={sel} onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#e4eaf3'}>
          <option value="">كل الحالات</option>
          {ORDER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={rep} onChange={e => setRep(e.target.value)} dir="rtl" style={sel} onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#e4eaf3'}>
          <option value="">كل مسؤل المبيعاتين</option>
          {salesReps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div style={{ position: 'relative', minWidth: 140 }}>
          <input value={sku} onChange={e => setSku(e.target.value)} placeholder="بحث برقم SKU..." dir="ltr"
            style={{ ...sel, width: '100%', paddingLeft: sku ? 26 : 12, boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#e4eaf3'} />
          {sku && (
            <button onClick={() => setSku('')} title="مسح SKU"
              style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} dir="ltr"
            style={{ ...sel, paddingLeft: dateFilter ? 26 : 12 }}
            onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#e4eaf3'} />
          {dateFilter && (
            <button onClick={() => setDateFilter('')} title="مسح التاريخ"
              style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex' }}>
              <X size={12} />
            </button>
          )}
        </div>
        {hasFilter && (
          <button onClick={clear} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: '1px solid #fecdd3', background: '#fff1f2', color: '#9f1239', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', flexShrink: 0 }}>
            <X size={12} /> مسح
          </button>
        )}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b', flexShrink: 0 }}>{filtered.length} طلب</span>
      </div>

      {usingServerSearch && serverError && (
        <div style={{ padding: '10px 16px', borderRadius: 10, background: '#fff1f2', border: '1px solid #fecdd3', color: '#e11d48', fontSize: 12, fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} />{serverError}
        </div>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(usingServerSearch ? serverLoading : loading) ? <SkeletonList count={6} /> : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, borderRadius: 14, background: '#fff', border: '1px solid #e4eaf3' }}>
            <Search size={36} color="#e4eaf3" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8', marginBottom: 8 }}>لا توجد طلبات تطابق البحث</p>
            <button onClick={clear} style={{ fontSize: 13, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Cairo,sans-serif', fontWeight: 600 }}>مسح الفلتر</button>
          </div>
        ) : paged.map(o => <OrderCard key={o.id} order={o} />)}
      </div>
      <div style={{ marginTop: 8, background: '#fff', borderRadius: 12, border: '1px solid #e4eaf3' }}>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
      {hasMoreOrders && !hasFilter && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={loadMoreOrders} style={{ padding: '10px 28px', borderRadius: 8, border: '1.5px solid #2563eb', background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
            تحميل المزيد من الطلبات
          </button>
        </div>
      )}
    </div>
  )
}
