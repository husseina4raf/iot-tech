import { Trophy } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const avatarBg = [
  'linear-gradient(135deg,#2563eb,#1d4ed8)',
  'linear-gradient(135deg,#7c3aed,#6d28d9)',
  'linear-gradient(135deg,#059669,#047857)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
  'linear-gradient(135deg,#d97706,#b45309)',
]
const medals     = ['🥇', '🥈', '🥉']
const rankColor  = ['#1d4ed8', '#6d28d9', '#047857', '#0e7490', '#b45309']

const CLOSED_STATUSES = ['موافق عليه', 'تم الصرف', 'مكتمل', 'تم التحصيل']

export default function TopSalesPerson() {
  const { orders }   = useOrders()
  const { salesReps } = useAuth()

  const board = salesReps.map((rep, i) => {
    const repOrders = orders.filter(o => o.salesRep === rep && CLOSED_STATUSES.includes(o.status))
    return {
      name:  rep,
      count: repOrders.length,
      total: repOrders.reduce((s, o) => s + o.total, 0),
      bg:    avatarBg[i % avatarBg.length],
      color: rankColor[i % rankColor.length],
    }
  }).sort((a, b) => b.total - a.total)

  const max = board[0]?.total || 1

  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', padding:24, height:'100%', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
        <Trophy size={16} color="#f59e0b" />
        <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>لوحة المتصدرين</h3>
      </div>
      <p style={{ fontSize:12, color:'#94a3b8', marginBottom:18 }}>ترتيب مندوبي المبيعات (الطلبات المعتمدة)</p>

      {board.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#94a3b8', fontSize:13 }}>لا توجد بيانات بعد</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {board.map((rep, i) => (
            <div key={rep.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, background: i === 0 ? '#eff6ff' : '#f8fafc', border:`1px solid ${i === 0 ? '#bfdbfe' : '#f0f4fa'}` }}>
              <div style={{ width:24, textAlign:'center', fontSize:15, flexShrink:0 }}>
                {i < 3 ? medals[i] : <span style={{ fontSize:12, fontWeight:700, color:'#94a3b8' }}>{i + 1}</span>}
              </div>
              <div style={{ width:32, height:32, borderRadius:'50%', background:rep.bg, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:13, flexShrink:0 }}>
                {rep.name[0]}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{rep.name}</div>
                <div style={{ height:4, borderRadius:4, background:'#e4eaf3', marginTop:5, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:4, background: i === 0 ? '#2563eb' : '#bfdbfe', width:`${(rep.total / max) * 100}%`, transition:'width 0.5s' }} />
                </div>
              </div>
              <div style={{ textAlign:'left', flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:rep.color }} dir="ltr">{(rep.total / 1000).toFixed(1)}K</div>
                <div style={{ fontSize:10, color:'#94a3b8' }}>{rep.count} طلب</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
