import { Settings, Trophy, Eye, EyeOff } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

function ToggleRow({ icon: Icon, iconColor, title, desc, value, onChange }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid #f0f4fa' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:`${iconColor}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={17} color={iconColor} />
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{title}</div>
          <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>{desc}</div>
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        style={{
          position:'relative', width:46, height:26, borderRadius:13,
          background: value ? 'linear-gradient(135deg,#1d4ed8,#2563eb)' : '#e2e8f0',
          border:'none', cursor:'pointer', transition:'background 0.2s', flexShrink:0,
          boxShadow: value ? '0 2px 8px rgba(37,99,235,0.35)' : 'none',
        }}>
        <span style={{
          position:'absolute', top:3, right: value ? 3 : 'auto', left: value ? 'auto' : 3,
          width:20, height:20, borderRadius:'50%', background:'#fff',
          boxShadow:'0 1px 4px rgba(0,0,0,0.15)', transition:'all 0.2s',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {value ? <Eye size={10} color="#2563eb"/> : <EyeOff size={10} color="#94a3b8"/>}
        </span>
      </button>
    </div>
  )
}

export default function AppSettings() {
  const { settings, set } = useSettings()

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <Settings size={18} color="#2563eb"/>
        <h2 style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>إعدادات التطبيق</h2>
        <span style={{ fontSize:11, color:'#94a3b8' }}>مدير عام فقط</span>
      </div>

      <div style={card}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #f0f4fa', background:'#f8fafc', borderRadius:'14px 14px 0 0' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#64748b' }}>صفحة المندوبين</span>
        </div>

        <ToggleRow
          icon={Trophy}
          iconColor="#f59e0b"
          title="تاب المتصدرين"
          desc="إظهار أو إخفاء تاب المتصدرون في صفحة المندوبين"
          value={settings.leaderboardVisible}
          onChange={v => set('leaderboardVisible', v)}
        />

        <div style={{ padding:'16px 20px', borderRadius:'0 0 14px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:8, background: settings.leaderboardVisible ? '#ecfdf5' : '#fff7ed', border:`1px solid ${settings.leaderboardVisible ? '#a7f3d0' : '#fed7aa'}` }}>
            <span style={{ fontSize:13, color: settings.leaderboardVisible ? '#065f46' : '#92400e', fontWeight:600 }}>
              {settings.leaderboardVisible
                ? '✓ تاب المتصدرون ظاهر للمندوبين'
                : '⊘ تاب المتصدرون مخفي عن المندوبين'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
