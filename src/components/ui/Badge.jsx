const map = {
  new:        { bg:'#eff6ff', color:'#1d4ed8', border:'#bfdbfe' },
  approved:   { bg:'#ecfdf5', color:'#065f46', border:'#a7f3d0' },
  dispatched: { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
  completed:  { bg:'#f5f3ff', color:'#4c1d95', border:'#ddd6fe' },
  default:    { bg:'#f8fafc', color:'#475569', border:'#e2e8f0' },
  warning:    { bg:'#fff1f2', color:'#9f1239', border:'#fecdd3' },
  orange:     { bg:'#fff7ed', color:'#9a3412', border:'#fed7aa' },
}
const statusMap = {
  'جديد':'new', 'موافق عليه':'approved', 'تم الصرف':'dispatched', 'مكتمل':'completed',
  'بانتظار الموافقة':'orange', 'مرفوض':'warning',
}

export default function Badge({ children, variant, status, className='' }) {
  const key = status ? (statusMap[status]||'default') : (variant||'default')
  const v = map[key] || map.default
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}
      style={{ background:v.bg, color:v.color, border:`1px solid ${v.border}`, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
      {children}
    </span>
  )
}
