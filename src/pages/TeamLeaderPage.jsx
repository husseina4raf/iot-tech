import { useState, useMemo, useEffect } from 'react'
import { Clock, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, User, Package, Phone, MapPin, CreditCard, Calendar, Edit3, AlertTriangle, Trophy, TrendingUp, Search, X, Link, FolderOpen } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/ui/Toast'
import Badge from '../components/ui/Badge'
import OrderForm from '../components/sales/OrderForm'
import Leaderboard from '../components/sales/Leaderboard'
import SalesReports from '../components/admin/SalesReports'
import TeamInvoices from '../components/sales/TeamInvoices'

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const getCostPrice = (itemName, inventory) => {
  const inv = inventory.find(i => i.name.toLowerCase() === itemName.toLowerCase() || i.nameAr === itemName)
  return inv?.costPrice || 0
}

const card = { background: '#fff', borderRadius: 14, border: '1px solid #e4eaf3', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }

const TABS = [
  { id: 'pending', label: 'بانتظار الموافقة', icon: Clock },
  { id: 'all', label: 'جميع الفواتير', icon: FileText },
  { id: 'team', label: 'فواتير الفريق', icon: FolderOpen },
  { id: 'inventory', label: 'المخزون', icon: Package },
  { id: 'leaderboard', label: 'المتصدرون', icon: Trophy },
  { id: 'reports', label: 'تقارير الأرباح', icon: TrendingUp },
]

const STATUS_NEXT = {
}

export default function TeamLeaderPage() {
  const [tab, setTab] = useState('pending')
  const [expanded, setExpanded] = useState({})
  const [editingOrder, setEditingOrder] = useState(null)
  const [search, setSearch] = useState('')
  const [filterDay, setFilterDay] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [invPage,    setInvPage]    = useState(0)
  const [invPerPage, setInvPerPage] = useState(10)
  const [allPage,    setAllPage]    = useState(0)
  const [allPerPage, setAllPerPage] = useState(10)

  const { orders, approveOrder, rejectOrder, updateOrderStatus, inventory } = useOrders()
  const { user } = useAuth()
  const toast = useToast()

  const pendingOrders = [...orders].filter(o => o.status === 'بانتظار الموافقة')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const allOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...orders]
      .filter(o => {
        if (q && !o.clientName?.toLowerCase().includes(q) && !o.mobile?.includes(q) && !o.whatsapp?.includes(q)) return false
        if (filterYear || filterMonth || filterDay) {
          // date stored as DD-MM-YYYY
          const parts = o.date?.split('-') || []
          const [d, m, y] = parts
          if (filterYear && y !== filterYear) return false
          if (filterMonth && m !== String(filterMonth).padStart(2, '0')) return false
          if (filterDay && d !== String(filterDay).padStart(2, '0')) return false
        }
        return true
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [orders, search, filterDay, filterMonth, filterYear])

  const availableYears = useMemo(() => {
    const ys = new Set(orders.map(o => o.date?.split('-')[2]).filter(Boolean))
    return [...ys].sort((a, b) => b.localeCompare(a))
  }, [orders])

  const totalProfit = useMemo(() =>
    allOrders.filter(o => o.status !== 'مرفوض').reduce((s, o) =>
      s + o.items.reduce((ss, item) => ss + (item.price - getCostPrice(item.name, inventory)) * item.quantity, 0)
      , 0)
    , [allOrders, inventory])

  const onApprove = (id, ref) => {
    approveOrder(id, user)
    toast(`تم اعتماد فاتورة: ${ref} ✓`, 'success')
  }
  const onReject = (id, ref) => {
    if (!window.confirm(`هل تريد رفض فاتورة: "${ref}"؟`)) return
    rejectOrder(id, user)
    toast('تم رفض الفاتورة', 'error')
  }
  const onAdvance = (order, next) => {
    updateOrderStatus(order.id, next, user)
    toast(`تم تحديث الحالة إلى ${next} ✓`, 'success')
  }

  const onCalendar = (order) => {
    const title = encodeURIComponent(order.clientName)
    const items = order.items.map(i => `• ${i.name} × ${i.quantity}`).join('\n')
    const details = encodeURIComponent(
      `رقم الطلب: #${order.serialNumber}\nمسؤل المبيعات: ${order.salesRep}` +
      (order.mobile ? `\nالموبايل: ${order.mobile}` : '') +
      (order.whatsapp ? `\nواتساب: ${order.whatsapp}` : '') +
      (order.time ? `\nوقت التركيب: ${order.time}` : '') +
      (order.address ? `\n\nالعنوان: ${order.address}` : '') +
      (order.locationLink ? `\nخريطة: ${order.locationLink}` : '') +
      `\n\nالأصناف:\n${items}` +
      `\n\nالإجمالي: ${order.total?.toLocaleString()} LE` +
      (order.invoiceType ? `\nنوع الفاتورة: ${order.invoiceType}` : '') +
      (order.invoiceName ? `\nالفاتورة باسم: ${order.invoiceName}` : '') +
      (order.paymentMethod ? `\nطريقة الدفع: ${order.paymentMethod}` : '') +
      (order.notes ? `\n\nملاحظات: ${order.notes}` : '')
    )
    const location = encodeURIComponent(order.locationLink || order.address || '')
    const parts = (order.date || '').split('-')
    let datesParam = ''
    if (parts.length === 3) {
      const ymd = `${parts[2]}${parts[1]}${parts[0]}`
      if (order.time && order.time.includes(':')) {
        const [h, m] = order.time.split(':')
        const start = `${ymd}T${h.padStart(2, '0')}${m.padStart(2, '0')}00`
        const endH = String(parseInt(h, 10) + 2).padStart(2, '0')
        const end = `${ymd}T${endH}${m.padStart(2, '0')}00`
        datesParam = `&dates=${start}/${end}`
      } else {
        datesParam = `&dates=${ymd}/${ymd}`
      }
    }
    window.open(
      `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}${datesParam}`,
      '_blank'
    )
  }

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  // ── Edit order view ──────────────────────────────────────────────────────────
  if (editingOrder) return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <button onClick={() => setEditingOrder(null)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, fontFamily: 'Cairo,sans-serif' }}
        onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
        onMouseLeave={e => e.currentTarget.style.color = '#64748b'}>
        <ChevronRight size={15} />العودة لقائمة الطلبات
      </button>
      <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 16 }}>
        تعديل الطلب: {editingOrder.clientName} — {editingOrder.company}
      </div>
      <OrderForm editOrder={editingOrder} onSaved={() => setEditingOrder(null)} />
    </div>
  )

  // Reset page when filters / tab change
  useEffect(() => { setAllPage(0) }, [search, filterDay, filterMonth, filterYear, tab])

  const allTotalPages = Math.ceil(allOrders.length / allPerPage)
  const displayOrders = tab === 'pending'
    ? pendingOrders
    : tab === 'all'
      ? allOrders.slice(allPage * allPerPage, allPage * allPerPage + allPerPage)
      : allOrders


  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Tabs */}
      <div className="m-tab-scroll" style={{ display: 'inline-flex', gap: 4, padding: 5, borderRadius: 12, background: '#fff', border: '1px solid #e4eaf3', marginBottom: 20, boxShadow: '0 1px 4px rgba(15,23,42,0.05)', position: 'relative' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const badge = id === 'pending' ? pendingOrders.length : null
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 9, border: 'none', background: tab === id ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : 'transparent', color: tab === id ? '#fff' : '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', boxShadow: tab === id ? '0 3px 10px rgba(37,99,235,0.35)' : 'none', transition: 'all 0.15s', position: 'relative' }}
              onMouseEnter={e => { if (tab !== id) e.currentTarget.style.background = '#f0f4fa' }}
              onMouseLeave={e => { if (tab !== id) e.currentTarget.style.background = 'transparent' }}>
              <Icon size={14} />{label}
              {badge > 0 && (
                <span style={{ position: 'absolute', top: -5, left: -5, width: 18, height: 18, borderRadius: '50%', background: '#e11d48', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Inventory tab ─────────────────────────────────────────────────────── */}
      {tab === 'inventory' && (() => {
        const totalPages  = Math.ceil(inventory.length / invPerPage)
        const pageItems   = inventory.slice(invPage * invPerPage, invPage * invPerPage + invPerPage)
        const btnStyle    = (active) => ({ padding: '5px 11px', borderRadius: 8, border: `1.5px solid ${active ? '#2563eb' : '#e4eaf3'}`, background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' })
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <Package size={16} color="#2563eb" />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>المخزون</h3>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', fontWeight: 700 }}>{inventory.length} منتج</span>
              <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 'auto' }}>للعرض فقط</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>عرض:</span>
                {[5, 10, 20].map(n => (
                  <button key={n} onClick={() => { setInvPerPage(n); setInvPage(0) }} style={btnStyle(invPerPage === n)}>{n}</button>
                ))}
              </div>
            </div>
            <div style={card}>
              {inventory.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>لا توجد منتجات</div>
              ) : pageItems.map((item, i) => {
                const isLow = item.stock < (item.minStock || 5)
                return (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: i < pageItems.length - 1 ? '1px solid #f8fafc' : 'none', background: isLow ? '#fffafa' : 'transparent' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: isLow ? '#ffe4e6' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Package size={15} color={isLow ? '#e11d48' : '#2563eb'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{item.name}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                        {item.brand && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>{item.brand}</span>}
                        {item.category && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>{item.category}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: isLow ? '#e11d48' : '#0f172a' }}>{item.stock}</div>
                      <div style={{ fontSize: 10, color: '#94a3b8' }}>وحدة</div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {isLow
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3', fontWeight: 600 }}><AlertTriangle size={10} />منخفض</span>
                        : <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', fontWeight: 600 }}>✓ متاح</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                <button onClick={() => setInvPage(p => Math.min(totalPages - 1, p + 1))} disabled={invPage === totalPages - 1}
                  style={{ ...btnStyle(false), opacity: invPage === totalPages - 1 ? 0.4 : 1, cursor: invPage === totalPages - 1 ? 'default' : 'pointer' }}>←</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 100, textAlign: 'center' }}>
                  صفحة {invPage + 1} من {totalPages}
                </span>
                <button onClick={() => setInvPage(p => Math.max(0, p - 1))} disabled={invPage === 0}
                  style={{ ...btnStyle(false), opacity: invPage === 0 ? 0.4 : 1, cursor: invPage === 0 ? 'default' : 'pointer' }}>→</button>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Leaderboard tab ──────────────────────────────────────────────────── */}
      {tab === 'leaderboard' && <Leaderboard />}

      {/* ── Reports tab ───────────────────────────────────────────────────────── */}
      {tab === 'reports' && <SalesReports />}

      {/* ── Team Invoices tab ─────────────────────────────────────────────────── */}
      {tab === 'team' && <TeamInvoices />}

      {/* ── Orders tabs ───────────────────────────────────────────────────────── */}
      {tab !== 'inventory' && tab !== 'leaderboard' && tab !== 'reports' && tab !== 'team' && (<>
        {/* Stats */}
        <div className="m-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'بانتظار الموافقة', value: pendingOrders.length, color: '#f97316' },
            { label: 'إجمالي الفواتير', value: allOrders.length, color: '#2563eb' },
            { label: 'إجمالي الأرباح', value: `${totalProfit.toLocaleString()} LE`, color: '#059669' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 10, height: 40, borderRadius: 6, background: s.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }} dir="ltr">{s.value}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Search + date filters — only on All Invoices tab */}
        {tab === 'all' && (
          <div style={{ ...card, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
              <Search size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث باسم العميل أو رقم الهاتف..."
                style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif' }}
              />
              {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}><X size={13} /></button>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select value={filterDay} onChange={e => setFilterDay(e.target.value)} dir="rtl"
                style={{ padding: '6px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
                <option value="">يوم</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={String(d).padStart(2, '0')}>{d}</option>)}
              </select>
              <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} dir="rtl"
                style={{ padding: '6px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
                <option value="">شهر</option>
                {MONTHS_AR.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
              </select>
              <select value={filterYear} onChange={e => setFilterYear(e.target.value)} dir="ltr"
                style={{ padding: '6px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
                <option value="">سنة</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {(filterDay || filterMonth || filterYear) && (
                <button onClick={() => { setFilterDay(''); setFilterMonth(''); setFilterYear('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 8, border: '1.5px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
                  <X size={11} />مسح
                </button>
              )}
            </div>
          </div>
        )}

        {/* Orders list */}
        {displayOrders.length === 0 ? (
          <div style={{ ...card, padding: 60, textAlign: 'center' }}>
            <CheckCircle size={48} color="#a7f3d0" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>
              {tab === 'pending' ? 'لا توجد فواتير بانتظار الموافقة 🎉' : 'لا توجد فواتير بعد'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayOrders.map(order => {
              const next = STATUS_NEXT[order.status]
              return (
                <div key={order.id} style={{ ...card, overflow: 'hidden' }} className="fade-in">
                  <div style={{ padding: '14px 20px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{order.clientName}</span>
                          <span style={{ color: '#cbd5e1' }}>·</span>
                          <span style={{ fontSize: 12, color: '#64748b' }}>{order.company}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={10} />{order.salesRep}</span>
                          <span>#{order.serialNumber}</span>
                          <span>{order.date}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Package size={10} />{order.items?.length} صنف</span>
                          {order.paymentMethod && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><CreditCard size={10} />{order.paymentMethod}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }} dir="ltr">
                            {order.total.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>LE</span>
                          </div>
                        </div>
                        <Badge status={order.status}>{order.status}</Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {order.status === 'بانتظار الموافقة' && (<>
                        <button onClick={() => onApprove(order.id, order.clientName)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}>
                          <CheckCircle size={14} />اعتماد
                        </button>
                        <button onClick={() => onReject(order.id, order.clientName)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', borderRadius: 8, border: '1.5px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
                          <XCircle size={14} />رفض
                        </button>
                      </>)}

                      {next && (
                        <button onClick={() => onAdvance(order, next.label)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: 'none', background: next.bg, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', boxShadow: `0 2px 8px ${next.shadow}` }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                          <CheckCircle size={13} />{next.label}
                        </button>
                      )}

                      {['موافق عليه', 'تم الصرف', 'مكتمل', 'تم التحصيل'].includes(order.status) && (
                        <button onClick={() => onCalendar(order)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #a7f3d0', background: '#ecfdf5', color: '#059669', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#d1fae5'}
                          onMouseLeave={e => e.currentTarget.style.background = '#ecfdf5'}>
                          <Calendar size={13} />جدولة التركيب
                        </button>
                      )}

                      <button onClick={() => setEditingOrder(order)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
                        onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}>
                        <Edit3 size={13} />تعديل
                      </button>

                      <button onClick={() => toggle(order.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e4eaf3', background: expanded[order.id] ? '#f0f4fa' : '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', marginRight: 'auto' }}>
                        <ChevronDown size={12} style={{ transform: expanded[order.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                        التفاصيل
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expanded[order.id] && (
                    <div style={{ borderTop: '1px solid #f0f4fa', background: '#f8fafc', padding: '14px 20px' }}>
                      <div className="m-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        {[
                          { icon: Phone, label: 'موبايل / واتساب', val: `${order.mobile || '—'} / ${order.whatsapp || '—'}`, ltr: true },
                          order.address && { icon: MapPin, label: 'العنوان', val: order.address },
                          order.paymentMethod && { icon: CreditCard, label: 'طريقة الدفع', val: order.paymentMethod },
                          (order.date || order.time) && { icon: Calendar, label: 'موعد التركيب', val: `${order.date || '—'}${order.time ? ' — ' + order.time : ''}`, ltr: true },
                          order.invoiceType && { icon: FileText, label: 'نوع الفاتورة', val: order.invoiceType },
                          order.invoiceName && { icon: User, label: 'الفاتورة باسم', val: order.invoiceName },
                          order.taxNumber && { icon: FileText, label: 'الرقم الضريبي', val: order.taxNumber, ltr: true },
                        ].filter(Boolean).map(row => (
                          <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#fff', border: '1px solid #f0f4fa' }}>
                            <row.icon size={14} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{row.label}</div>
                              <div style={{ fontSize: 13, color: '#0f172a' }} dir={row.ltr ? 'ltr' : 'rtl'}>{row.val}</div>
                            </div>
                          </div>
                        ))}
                        {order.locationLink && (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#fff', border: '1px solid #f0f4fa' }}>
                            <Link size={14} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>رابط الموقع</div>
                              <a href={order.locationLink} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 13, color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}>
                                عرض على الخريطة
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e4eaf3', marginBottom: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#0f172a' }}>
                              {['الصنف', 'الكمية', 'سعر البيع', 'الإجمالي'].map((h, i) => (
                                <th key={h} style={{ padding: '8px 14px', color: '#e2e8f0', fontWeight: 600, textAlign: i === 0 ? 'right' : 'center' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {order.items?.map((item, i) => (
                              <tr key={item.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f0f4fa' }}>
                                <td style={{ padding: '8px 14px', fontWeight: 600, color: '#0f172a' }}>{item.name}</td>
                                <td style={{ padding: '8px 14px', textAlign: 'center' }}>{item.quantity}</td>
                                <td style={{ padding: '8px 14px', textAlign: 'center', color: '#64748b' }} dir="ltr">{item.price?.toLocaleString()} LE</td>
                                <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 700, color: '#1d4ed8' }} dir="ltr">{item.total?.toLocaleString()} LE</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                              <td colSpan={3} style={{ padding: '8px 14px', fontWeight: 700, color: '#1d4ed8', fontSize: 12 }}>
                                الإجمالي{order.vatPercent > 0 ? ` شامل ${order.vatPercent}% ضريبة` : ''}
                              </td>
                              <td style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 800, color: '#1d4ed8', fontSize: 13 }} dir="ltr">
                                {order.total?.toLocaleString()} LE
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {order.notes && (
                        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e293b' }}>
                          <span style={{ fontWeight: 700, color: '#1d4ed8' }}>ملاحظات: </span>{order.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* All Invoices pagination */}
        {tab === 'all' && allTotalPages > 1 && (() => {
          const pagBtnStyle = (active) => ({ padding: '5px 11px', borderRadius: 8, border: `1.5px solid ${active ? '#2563eb' : '#e4eaf3'}`, background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' })
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>عرض:</span>
                {[10, 20, 50].map(n => (
                  <button key={n} onClick={() => { setAllPerPage(n); setAllPage(0) }} style={pagBtnStyle(allPerPage === n)}>{n}</button>
                ))}
              </div>
              <button onClick={() => setAllPage(p => Math.min(allTotalPages - 1, p + 1))} disabled={allPage === allTotalPages - 1}
                style={{ ...pagBtnStyle(false), opacity: allPage === allTotalPages - 1 ? 0.4 : 1, cursor: allPage === allTotalPages - 1 ? 'default' : 'pointer' }}>←</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', minWidth: 100, textAlign: 'center' }}>
                صفحة {allPage + 1} من {allTotalPages}
              </span>
              <button onClick={() => setAllPage(p => Math.max(0, p - 1))} disabled={allPage === 0}
                style={{ ...pagBtnStyle(false), opacity: allPage === 0 ? 0.4 : 1, cursor: allPage === 0 ? 'default' : 'pointer' }}>→</button>
            </div>
          )
        })()}
      </>)}
    </div>
  )
}
