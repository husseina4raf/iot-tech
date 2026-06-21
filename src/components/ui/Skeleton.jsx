const pulse = {
  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-pulse 1.4s ease infinite',
  borderRadius: 8,
}

export function SkeletonLine({ width = '100%', height = 16, style = {} }) {
  return <div style={{ ...pulse, width, height, ...style }} />
}

export function SkeletonCard() {
  return (
    <div style={{ background:'#fff', border:'1px solid #e4eaf3', borderRadius:14, padding:'16px 20px', display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <SkeletonLine width={160} height={18} />
        <SkeletonLine width={80} height={24} style={{ borderRadius:20 }} />
      </div>
      <SkeletonLine width="70%" height={14} />
      <SkeletonLine width="50%" height={14} />
      <div style={{ display:'flex', gap:8, marginTop:4 }}>
        <SkeletonLine width={90} height={32} style={{ borderRadius:8 }} />
        <SkeletonLine width={90} height={32} style={{ borderRadius:8 }} />
      </div>
      <style>{`@keyframes skeleton-pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  )
}

export function SkeletonList({ count = 5 }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
      <style>{`@keyframes skeleton-pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  )
}
