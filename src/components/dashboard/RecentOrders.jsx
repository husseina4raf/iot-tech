import { Link } from 'react-router-dom'
import Badge from '../ui/Badge'
import { useOrders } from '../../hooks/useOrders'

export default function RecentOrders() {
  const { orders } = useOrders()
  const recent = [...orders].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5)

  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid #f0f4fa' }}>
        <div>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>آخر الطلبات</h3>
          <p style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>أحدث 5 طلبات في النظام</p>
        </div>
        <Link to="/admin" style={{ fontSize:12, fontWeight:600, color:'#2563eb', textDecoration:'none', padding:'5px 12px', borderRadius:8, background:'#eff6ff', border:'1px solid #bfdbfe' }}
          onMouseEnter={e=>e.currentTarget.style.background='#dbeafe'} onMouseLeave={e=>e.currentTarget.style.background='#eff6ff'}>
          عرض الكل ←
        </Link>
      </div>
      <div className="m-table-scroll">
      <table style={{ width:'100%', borderCollapse:'collapse', minWidth:480 }}>
        <thead>
          <tr style={{ background:'#f8fafc' }}>
            {['العميل','المندوب','التاريخ','الإجمالي','الحالة'].map((h,i)=>(
              <th key={h} style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'#64748b', textAlign: i===0?'right':'center', borderBottom:'1px solid #f0f4fa' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recent.map((o,i)=>(
            <tr key={o.id} style={{ borderBottom: i<recent.length-1?'1px solid #f8fafc':'none', transition:'background 0.1s' }}
              onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <td style={{ padding:'12px 16px' }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{o.clientName}</div>
                <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{o.company}</div>
              </td>
              <td style={{ padding:'12px 16px', textAlign:'center' }}>
                <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                  <div style={{ width:24,height:24,borderRadius:'50%',background:'linear-gradient(135deg,#2563eb,#1d4ed8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:700 }}>{o.salesRep[0]}</div>
                  <span style={{ fontSize:12,color:'#475569' }}>{o.salesRep}</span>
                </div>
              </td>
              <td style={{ padding:'12px 16px', textAlign:'center', fontSize:12, color:'#94a3b8' }}>{o.date}</td>
              <td style={{ padding:'12px 16px', textAlign:'center', fontSize:13, fontWeight:700, color:'#0f172a' }} dir="ltr">
                {o.total.toLocaleString()} <span style={{fontSize:11,fontWeight:400,color:'#94a3b8'}}>LE</span>
              </td>
              <td style={{ padding:'12px 16px', textAlign:'center' }}><Badge status={o.status}>{o.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
