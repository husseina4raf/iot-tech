import { Package, AlertTriangle } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'

export default function InventorySection() {
  const { inventory } = useOrders()
  const low = inventory.filter(i=>i.stock<5)

  return (
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom:'1px solid #f0f4fa' }}>
        <div>
          <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', display:'flex', alignItems:'center', gap:8 }}>
            <Package size={15} color="#2563eb" /> المخزون
          </h3>
          <p style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>حالة المنتجات المتاحة</p>
        </div>
        {low.length>0 && (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', borderRadius:20, background:'#fff1f2', border:'1px solid #fecdd3', fontSize:11, fontWeight:700, color:'#9f1239' }}>
            <AlertTriangle size={12} /> {low.length} منتج منخفض
          </div>
        )}
      </div>
      <div style={{ padding:'10px 16px 16px' }}>
        {inventory.map(item=>{
          const isLow = item.stock<5
          const pct = Math.min(100,(item.stock/15)*100)
          return (
            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 8px', borderRadius:10, marginBottom:4, background:isLow?'#fff1f2':'transparent', border:`1px solid ${isLow?'#fecdd3':'transparent'}` }}>
              <div style={{ width:34,height:34,borderRadius:10,background:isLow?'#ffe4e6':'#eff6ff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
                <Package size={15} color={isLow?'#e11d48':'#2563eb'} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{item.name}</span>
                  {isLow && <AlertTriangle size={11} color="#f43f5e" />}
                </div>
                <div style={{ height:4, borderRadius:4, background:'#e4eaf3', marginTop:5 }}>
                  <div style={{ height:'100%', borderRadius:4, background:isLow?'#f43f5e':'#2563eb', width:`${pct}%`, transition:'width 0.4s' }} />
                </div>
              </div>
              <div style={{ textAlign:'left', flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:isLow?'#e11d48':'#0f172a' }} dir="ltr">{item.stock} <span style={{fontSize:11,fontWeight:400,color:'#94a3b8'}}>وحدة</span></div>
                <div style={{ fontSize:11, color:'#94a3b8' }} dir="ltr">{item.price.toLocaleString()} LE</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
