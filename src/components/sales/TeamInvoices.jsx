import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Calendar, FileText, Phone, MapPin, CreditCard, User, Search, X, ClipboardX, TrendingUp, Link } from 'lucide-react'
import Badge from '../ui/Badge'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const card = { background: '#fff', borderRadius: 14, border: '1px solid #e4eaf3', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }

export default function TeamInvoices() {
  const { orders } = useOrders()
  const { salesReps } = useAuth()

  const [selectedRep, setSelectedRep] = useState('')
  const [search, setSearch] = useState('')
  const [filterDay, setFilterDay] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [openMonths, setOpenMonths] = useState({})
  const [expanded, setExpanded] = useState({})

  const toggleMonth = (key) => setOpenMonths(p => ({ ...p, [key]: !p[key] }))
  const toggleOrder = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const availableYears = useMemo(() => {
    const ys = new Set(orders.map(o => o.date?.split('-')[2]).filter(Boolean))
    return [...ys].sort((a, b) => b.localeCompare(a))
  }, [orders])

  // filtered flat list
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(o => {
      if (selectedRep && o.salesRep !== selectedRep) return false
      if (q && !o.clientName?.toLowerCase().includes(q) && !o.mobile?.includes(q) && !o.whatsapp?.includes(q)) return false
      if (filterYear || filterMonth || filterDay) {
        const parts = o.date?.split('-') || []
        const [d, m, y] = parts
        if (filterYear && y !== filterYear) return false
        if (filterMonth && m !== String(filterMonth).padStart(2, '0')) return false
        if (filterDay && d !== String(filterDay).padStart(2, '0')) return false
      }
      return true
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [orders, selectedRep, search, filterDay, filterMonth, filterYear])

  // group by month
  const groups = useMemo(() => {
    const map = {}
    filtered.forEach(o => {
      const parts = o.date?.split('-')
      if (!parts || parts.length < 3) return
      const key = `${parts[2]}-${parts[1]}`
      const label = new Date(parts[2], parts[1] - 1, 1)
        .toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })
      if (!map[key]) map[key] = { key, label, orders: [] }
      map[key].orders.push(o)
    })
    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key))
  }, [filtered])

  const totalOrders = filtered.length
  const totalRevenue = filtered.reduce((s, o) => s + o.total, 0)
  const hasFilter = search || filterDay || filterMonth || filterYear || selectedRep

  const clearAll = () => {
    setSearch(''); setFilterDay(''); setFilterMonth(''); setFilterYear(''); setSelectedRep('')
  }

  return (
    <div>
      {/* Filters bar */}
      <div style={{ ...card, padding: '14px 18px', marginBottom: 16 }}>
        {/* Rep selector */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6 }}>مسؤل المبيعات</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setSelectedRep('')}
              style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${!selectedRep ? '#2563eb' : '#e4eaf3'}`, background: !selectedRep ? '#eff6ff' : '#fff', color: !selectedRep ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', transition: 'all 0.15s' }}>
              الكل
            </button>
            {salesReps.map(rep => (
              <button key={rep} onClick={() => setSelectedRep(rep)}
                style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${selectedRep === rep ? '#2563eb' : '#e4eaf3'}`, background: selectedRep === rep ? '#eff6ff' : '#fff', color: selectedRep === rep ? '#1d4ed8' : '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', transition: 'all 0.15s' }}>
                {rep}
              </button>
            ))}
          </div>
        </div>

        {/* Search + date filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180, padding: '7px 12px', borderRadius: 9, background: '#f8fafc', border: '1.5px solid #e4eaf3' }}>
            <Search size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث باسم العميل أو رقم الهاتف..."
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif' }}
            />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0, padding: 0 }}><X size={13} /></button>}
          </div>

          <select value={filterDay} onChange={e => setFilterDay(e.target.value)} dir="rtl"
            style={{ padding: '7px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 9, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
            <option value="">يوم</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d =>
              <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
            )}
          </select>

          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} dir="rtl"
            style={{ padding: '7px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 9, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
            <option value="">شهر</option>
            {MONTHS_AR.map((m, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>

          <select value={filterYear} onChange={e => setFilterYear(e.target.value)} dir="ltr"
            style={{ padding: '7px 10px', fontSize: 12, border: '1.5px solid #e4eaf3', borderRadius: 9, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', cursor: 'pointer' }}>
            <option value="">سنة</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {hasFilter && (
            <button onClick={clearAll}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 9, border: '1.5px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
              <X size={11} />مسح الكل
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }} className="m-grid-3">
        {[
          { label: 'إجمالي الفواتير', value: totalOrders, color: '#2563eb', bg: '#eff6ff' },
          { label: 'إجمالي المبيعات', value: `${totalRevenue.toLocaleString()} LE`, color: '#059669', bg: '#ecfdf5' },
          { label: 'عدد الأشهر', value: groups.length, color: '#7c3aed', bg: '#f5f3ff' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TrendingUp size={20} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }} dir="ltr">{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Orders grouped by month */}
      {groups.length === 0 ? (
        <div style={{ ...card, padding: 60, textAlign: 'center' }}>
          <ClipboardX size={40} color="#e4eaf3" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 500, color: '#94a3b8' }}>لا توجد فواتير تطابق هذا البحث</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((group, gi) => {
            const isOpen = group.key in openMonths ? openMonths[group.key] : gi === 0
            const monthTotal = group.orders.reduce((s, o) => s + o.total, 0)

            return (
              <div key={group.key} style={card}>
                {/* Month header */}
                <button onClick={() => toggleMonth(group.key)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Calendar size={17} color="#fff" />
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{group.label}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{group.orders.length} فاتورة</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }} dir="ltr">{monthTotal.toLocaleString()} LE</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>إجمالي الشهر</div>
                    </div>
                    <ChevronDown size={16} color="#94a3b8" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #f0f4fa' }}>
                    {group.orders.map((order, idx) => (
                      <div key={order.id} style={{ borderBottom: idx < group.orders.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                        {/* Order row */}
                        <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 70, fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>#{order.serialNumber}</div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{order.clientName}</div>
                            <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {order.company}
                              {order.salesRep && <span style={{ color: '#94a3b8' }}> · {order.salesRep}</span>}
                            </div>
                          </div>

                          <div style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0, minWidth: 80 }}>{order.date}</div>

                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', flexShrink: 0, minWidth: 100, textAlign: 'left' }} dir="ltr">
                            {order.total.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>LE</span>
                          </div>

                          <div style={{ flexShrink: 0 }}>
                            <Badge status={order.status}>{order.status}</Badge>
                          </div>

                          <button onClick={() => toggleOrder(order.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 10px', borderRadius: 7, border: '1.5px solid #e4eaf3', background: expanded[order.id] ? '#f0f4fa' : '#fff', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', flexShrink: 0 }}>
                            <ChevronDown size={11} style={{ transform: expanded[order.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                            تفاصيل
                          </button>
                        </div>

                        {/* Expanded details */}
                        {expanded[order.id] && (
                          <div style={{ background: '#f8fafc', borderTop: '1px solid #f0f4fa', padding: '12px 20px' }}>
                            {/* Info grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }} className="m-grid-2">
                              {[
                                { icon: Phone, label: 'موبايل / واتساب', val: `${order.mobile || '—'} / ${order.whatsapp || '—'}`, ltr: true },
                                { icon: User, label: 'مسؤل المبيعات', val: order.salesRep || '—' },
                                order.address && { icon: MapPin, label: 'العنوان', val: order.address },
                                order.paymentMethod && { icon: CreditCard, label: 'طريقة الدفع', val: order.paymentMethod },
                                (order.date || order.time) && { icon: Calendar, label: 'موعد التركيب', val: `${order.date || '—'}${order.time ? ' — ' + order.time : ''}`, ltr: true },
                                order.invoiceType && { icon: FileText, label: 'نوع الفاتورة', val: order.invoiceType },
                                order.invoiceName && { icon: User, label: 'الفاتورة باسم', val: order.invoiceName },
                                order.taxNumber && { icon: FileText, label: 'الرقم الضريبي', val: order.taxNumber, ltr: true },
                              ].filter(Boolean).map(row => (
                                <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#fff', border: '1px solid #f0f4fa' }}>
                                  <row.icon size={13} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
                                  <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{row.label}</div>
                                    <div style={{ fontSize: 12, color: '#0f172a' }} dir={row.ltr ? 'ltr' : 'rtl'}>{row.val}</div>
                                  </div>
                                </div>
                              ))}
                              {order.locationLink && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#fff', border: '1px solid #f0f4fa' }}>
                                  <Link size={13} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
                                  <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>رابط الموقع</div>
                                    <a href={order.locationLink} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: 12, color: '#2563eb', textDecoration: 'underline', wordBreak: 'break-all' }}>
                                      عرض على الخريطة
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Items table */}
                            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e4eaf3', marginBottom: order.notes ? 10 : 0 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                  <tr style={{ background: '#0f172a' }}>
                                    {['الصنف', 'الكمية', 'السعر', 'الإجمالي'].map((h, i) => (
                                      <th key={h} style={{ padding: '7px 12px', color: '#e2e8f0', fontWeight: 600, textAlign: i === 0 ? 'right' : 'center' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items?.map((item, i) => (
                                    <tr key={item.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f0f4fa' }}>
                                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#0f172a' }}>{item.name}</td>
                                      <td style={{ padding: '7px 12px', textAlign: 'center' }}>{item.quantity}</td>
                                      <td style={{ padding: '7px 12px', textAlign: 'center', color: '#64748b' }} dir="ltr">{item.price?.toLocaleString()} LE</td>
                                      <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 700, color: '#1d4ed8' }} dir="ltr">{item.total?.toLocaleString()} LE</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr style={{ background: '#eff6ff', borderTop: '2px solid #bfdbfe' }}>
                                    <td colSpan={3} style={{ padding: '7px 12px', fontWeight: 700, color: '#1d4ed8', fontSize: 11 }}>
                                      الإجمالي{order.vatPercent > 0 ? ` شامل ${order.vatPercent}% ضريبة` : ''}
                                    </td>
                                    <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 800, color: '#1d4ed8' }} dir="ltr">
                                      {order.total?.toLocaleString()} LE
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>

                            {order.notes && (
                              <div style={{ padding: '8px 12px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 11, color: '#1e293b' }}>
                                <span style={{ fontWeight: 700, color: '#1d4ed8' }}>ملاحظات: </span>{order.notes}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Month footer */}
                    <div style={{ padding: '10px 20px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>إجمالي {group.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1d4ed8' }} dir="ltr">{monthTotal.toLocaleString()} LE</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
