import { useState } from 'react'
import { History, Search, Filter, ArrowLeftRight, Edit3, Package, FileText, PlusCircle } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const typeConfig = {
  status_change: { label:'تغيير حالة',    icon: ArrowLeftRight, bg:'#eff6ff', color:'#1d4ed8', border:'#bfdbfe' },
  order_edit:    { label:'تعديل طلب',     icon: Edit3,          bg:'#fffbeb', color:'#d97706', border:'#fde68a' },
  order_create:  { label:'إنشاء طلب',    icon: PlusCircle,     bg:'#ecfdf5', color:'#059669', border:'#a7f3d0' },
  inventory:     { label:'مخزون',         icon: Package,        bg:'#f5f3ff', color:'#7c3aed', border:'#ddd6fe' },
  tax_invoice:   { label:'فاتورة ضريبية', icon: FileText,       bg:'#fff1f2', color:'#e11d48', border:'#fecdd3' },
}

export default function AuditLog() {
  const { auditLog } = useOrders()
  const [search, setSearch]     = useState('')
  const [typeFilter, setType]   = useState('')
  const [repFilter, setRep]     = useState('')

  const allReps = [...new Set(auditLog.map(e => e.changedBy).filter(Boolean))]

  const filtered = auditLog.filter(e => {
    const q = search.toLowerCase()
    return (
      (!q || e.orderRef?.toLowerCase().includes(q) || e.changedBy?.toLowerCase().includes(q) || e.field?.toLowerCase().includes(q) || e.note?.toLowerCase().includes(q)) &&
      (!typeFilter || e.type === typeFilter) &&
      (!repFilter   || e.changedBy === repFilter)
    )
  })

  return (
    <div>
      {/* Summary strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
        {Object.entries(typeConfig).map(([key, cfg]) => {
          const count = auditLog.filter(e => e.type === key).length
          const active = typeFilter === key
          return (
            <button key={key} onClick={() => setType(active ? '' : key)}
              style={{ ...card, padding:'12px 14px', textAlign:'center', border:`1.5px solid ${active ? cfg.color : '#e4eaf3'}`, background: active ? cfg.bg : '#fff', cursor:'pointer', boxShadow: active ? `0 0 0 2px ${cfg.color}20` : '0 1px 3px rgba(15,23,42,0.05)', fontFamily:'Cairo,sans-serif' }}>
              <div style={{ fontSize:20, fontWeight:800, color:cfg.color, marginBottom:2 }}>{count}</div>
              <div style={{ fontSize:11, color:'#64748b' }}>{cfg.label}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div style={{ ...card, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
        <Filter size={15} color="#94a3b8" style={{ flexShrink:0 }} />
        <div style={{ position:'relative', flex:1 }}>
          <Search size={13} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في السجل..."
            style={{ width:'100%', padding:'8px 32px 8px 10px', border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', fontSize:13, color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }}
            onFocus={e => { e.target.style.borderColor='#2563eb'; e.target.style.background='#fff' }}
            onBlur={e => { e.target.style.borderColor='#e4eaf3'; e.target.style.background='#f8fafc' }} />
        </div>
        <select value={repFilter} onChange={e => setRep(e.target.value)} dir="rtl"
          style={{ padding:'8px 12px', fontSize:13, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#fff', color:'#0f172a', outline:'none', cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
          <option value="">كل المستخدمين</option>
          {allReps.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize:13, fontWeight:600, color:'#64748b', flexShrink:0 }}>{filtered.length} سجل</span>
      </div>

      {/* Log entries */}
      <div style={card}>
        {filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center' }}>
            <History size={36} color="#e4eaf3" style={{ margin:'0 auto 12px' }} />
            <p style={{ fontSize:13, color:'#94a3b8' }}>لا توجد سجلات تطابق البحث</p>
          </div>
        ) : (
          <div>
            {filtered.map((entry, i) => {
              const cfg = typeConfig[entry.type] || typeConfig.order_edit
              const Icon = cfg.icon
              return (
                <div key={entry.id}
                  style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f8fafc' : 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>

                  {/* Type icon */}
                  <div style={{ width:34, height:34, borderRadius:10, background:cfg.bg, border:`1px solid ${cfg.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
                    <Icon size={15} color={cfg.color} />
                  </div>

                  {/* Content */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:4 }}>
                      <div>
                        <span style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{entry.orderRef || '—'}</span>
                        <span style={{ fontSize:11, padding:'1px 7px', borderRadius:20, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}`, fontWeight:600, marginRight:8 }}>{cfg.label}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#94a3b8', flexShrink:0, direction:'ltr' }}>
                        {new Date(entry.changedAt).toLocaleString('ar-EG', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </div>

                    {/* Change detail */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom: entry.note ? 6 : 0 }}>
                      <span style={{ fontSize:12, color:'#64748b' }}>{entry.field}:</span>
                      {entry.oldValue && entry.oldValue !== '—' && (
                        <>
                          <span style={{ fontSize:12, padding:'1px 8px', borderRadius:6, background:'#fff1f2', color:'#e11d48', border:'1px solid #fecdd3', textDecoration:'line-through' }}>{entry.oldValue}</span>
                          <span style={{ fontSize:11, color:'#94a3b8' }}>←</span>
                        </>
                      )}
                      <span style={{ fontSize:12, padding:'1px 8px', borderRadius:6, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontWeight:600 }}>{entry.newValue}</span>
                    </div>

                    {entry.note && (
                      <div style={{ fontSize:11, color:'#64748b', padding:'4px 8px', borderRadius:6, background:'#f8fafc', display:'inline-block', marginTop:2 }}>
                        {entry.note}
                      </div>
                    )}
                  </div>

                  {/* User */}
                  <div style={{ textAlign:'left', flexShrink:0 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:13, fontWeight:700, margin:'0 auto 3px' }}>
                      {entry.changedBy?.[0] || '؟'}
                    </div>
                    <div style={{ fontSize:10, color:'#94a3b8', textAlign:'center', maxWidth:60, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entry.changedBy}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
