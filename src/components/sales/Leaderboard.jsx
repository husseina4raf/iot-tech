import { useState } from 'react'
import { Trophy, TrendingUp, FileText, Medal } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
]

const medalColors = [
  { bg:'#fffbeb', border:'#fde68a', color:'#92400e', shadow:'rgba(245,158,11,0.25)', icon:'🥇' },
  { bg:'#f8fafc', border:'#e2e8f0', color:'#334155', shadow:'rgba(100,116,139,0.2)',  icon:'🥈' },
  { bg:'#fff7ed', border:'#fed7aa', color:'#9a3412', shadow:'rgba(234,88,12,0.2)',    icon:'🥉' },
]

export default function Leaderboard() {
  const { orders } = useOrders()
  const { salesReps, users, user: currentUser } = useAuth()

  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())  // 0-based
  const [period, setPeriod] = useState('month') // 'month' | 'all'

  // Build stats per rep
  const stats = salesReps.map(rep => {
    const repUser = users.find(u => u.repName === rep)
    const repOrders = orders.filter(o => {
      if (o.salesRep !== rep) return false
      if (o.status === 'مرفوض' || o.status === 'بانتظار الموافقة') return false
      if (period === 'month') {
        // Order date format: DD-MM-YYYY
        const parts = o.date?.split('-')
        if (!parts || parts.length < 3) return false
        const oYear  = parseInt(parts[2], 10)
        const oMonth = parseInt(parts[1], 10) - 1  // 0-based
        return oYear === year && oMonth === month
      }
      return true
    })
    return {
      rep,
      name: repUser?.name || rep,
      avatar: repUser?.avatar || rep[0],
      total:  repOrders.reduce((s, o) => s + (o.total || 0), 0),
      count:  repOrders.length,
      isMe:   rep === currentUser?.repName,
    }
  }).sort((a, b) => b.total - a.total)

  const topTotal = stats[0]?.total || 1

  // Years range
  const years = []
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) years.push(y)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Period controls */}
      <div style={{ ...card, padding:'14px 20px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:6 }}>
          {[
            { val:'month', label:'هذا الشهر' },
            { val:'all',   label:'كل الوقت'  },
          ].map(opt => (
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
          {period === 'month' ? `${MONTHS_AR[month]} ${year}` : 'جميع الفواتير المعتمدة'}
        </span>
      </div>

      {/* Top 3 podium */}
      {stats.length > 0 && stats[0].total > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {stats.slice(0, 3).map((s, i) => {
            const m = medalColors[i] || medalColors[2]
            return (
              <div key={s.rep} style={{ ...card, padding:'20px 16px', textAlign:'center', background:m.bg, border:`1.5px solid ${m.border}`, boxShadow:`0 4px 16px ${m.shadow}`, position:'relative', overflow:'hidden' }}>
                {s.isMe && (
                  <div style={{ position:'absolute', top:8, left:8, fontSize:10, padding:'2px 7px', borderRadius:20, background:'#2563eb', color:'#fff', fontWeight:700 }}>أنت</div>
                )}
                <div style={{ fontSize:32, marginBottom:4 }}>{m.icon}</div>
                <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18, fontWeight:800, margin:'0 auto 10px' }}>
                  {s.avatar}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:'#0f172a', marginBottom:4 }}>{s.name}</div>
                <div style={{ fontSize:18, fontWeight:800, color:m.color }} dir="ltr">{s.total.toLocaleString()} LE</div>
                <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{s.count} فاتورة</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Full ranking table */}
      <div style={card}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #f0f4fa', display:'flex', alignItems:'center', gap:8 }}>
          <Trophy size={16} color="#f59e0b"/>
          <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>الترتيب الكامل</h3>
        </div>

        {stats.every(s => s.total === 0) ? (
          <div style={{ padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
            لا توجد مبيعات في هذه الفترة
          </div>
        ) : (
          <div>
            {stats.map((s, i) => {
              const pct = topTotal > 0 ? (s.total / topTotal) * 100 : 0
              const rankColor = i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7c2f' : '#e4eaf3'
              return (
                <div key={s.rep}
                  style={{ padding:'14px 20px', borderBottom:'1px solid #f8fafc', background: s.isMe ? '#f0f6ff' : 'transparent' }}
                  onMouseEnter={e => { if(!s.isMe) e.currentTarget.style.background='#f8fafc' }}
                  onMouseLeave={e => { e.currentTarget.style.background = s.isMe ? '#f0f6ff' : 'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    {/* Rank */}
                    <div style={{ width:32, height:32, borderRadius:10, background: i < 3 ? rankColor : '#f0f4fa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color: i < 3 ? '#fff' : '#94a3b8', flexShrink:0, boxShadow: i < 3 ? `0 2px 8px ${rankColor}55` : 'none' }}>
                      {i + 1}
                    </div>

                    {/* Avatar */}
                    <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:15, fontWeight:700, flexShrink:0 }}>
                      {s.avatar}
                    </div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{s.name}</span>
                        {s.isMe && <span style={{ fontSize:10, padding:'1px 8px', borderRadius:20, background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe', fontWeight:700 }}>أنت</span>}
                        <span style={{ fontSize:11, color:'#94a3b8', display:'flex', alignItems:'center', gap:3 }}>
                          <FileText size={10}/>{s.count} فاتورة
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div style={{ height:6, borderRadius:4, background:'#f0f4fa', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: i === 0 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius:4, transition:'width 0.4s ease' }} />
                      </div>
                    </div>

                    {/* Total */}
                    <div style={{ textAlign:'left', flexShrink:0 }}>
                      <div style={{ fontSize:15, fontWeight:800, color: i === 0 ? '#f59e0b' : '#0f172a' }} dir="ltr">
                        {s.total.toLocaleString()} <span style={{ fontSize:10, color:'#94a3b8', fontWeight:400 }}>LE</span>
                      </div>
                    </div>
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
