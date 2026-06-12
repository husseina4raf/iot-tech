const base = (active, disabled) => ({
  minWidth: 34, height: 32, padding: '0 10px', borderRadius: 7,
  border: `1.5px solid ${active ? '#2563eb' : disabled ? '#f0f4fa' : '#e4eaf3'}`,
  background: active ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : '#fff',
  color: active ? '#fff' : disabled ? '#cbd5e1' : '#475569',
  fontSize: 13, fontWeight: active ? 800 : 600,
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: 'Cairo,sans-serif',
  boxShadow: active ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'border-color 0.1s',
})

function buildPages(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const set = new Set([1, totalPages, page, page - 1, page + 1].filter(p => p >= 1 && p <= totalPages))
  const sorted = [...set].sort((a, b) => a - b)
  const result = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…')
    result.push(sorted[i])
  }
  return result
}

export default function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, total)
  const pages = buildPages(page, totalPages)

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', borderTop:'1px solid #f0f4fa', direction:'rtl' }}>
      <span style={{ fontSize:12, color:'#94a3b8' }}>
        عرض {from}–{to} من {total}
      </span>
      <div style={{ display:'flex', gap:4, alignItems:'center' }}>
        <button onClick={() => onChange(page - 1)} disabled={page === 1} style={base(false, page === 1)}>
          السابق
        </button>
        {pages.map((p, i) => (
          <button key={i}
            onClick={() => typeof p === 'number' && onChange(p)}
            style={base(p === page, typeof p !== 'number')}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page === totalPages} style={base(false, page === totalPages)}>
          التالي
        </button>
      </div>
    </div>
  )
}
