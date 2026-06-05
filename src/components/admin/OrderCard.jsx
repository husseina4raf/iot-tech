import { useState } from 'react'
import { FileText, Package, Clock, ChevronDown, History, User, Phone, MapPin, CreditCard } from 'lucide-react'
import Badge from '../ui/Badge'
import { useOrders } from '../../hooks/useOrders'
import { useToast } from '../ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { generateDispatchPDF, generateInvoicePDF } from '../../utils/pdfTemplates'
import { ORDER_STATUSES } from '../../data/mockData'

const accent = { 'جديد':'#2563eb', 'موافق عليه':'#059669', 'تم الصرف':'#d97706', 'مكتمل':'#7c3aed' }

// Inject spin keyframe once
if (typeof document !== 'undefined' && !document.getElementById('sl-spin')) {
  const s = document.createElement('style')
  s.id = 'sl-spin'
  s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}'
  document.head.appendChild(s)
}

export default function OrderCard({ order }) {
  const { updateOrderStatus } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)

  const [pdfLoading, setPdfLoading] = useState('')

  const onStatus = s => { updateOrderStatus(order.id, s, user); toast(`تم تغيير الحالة إلى "${s}"`, 'success') }

  const onDispatch = async () => {
    setPdfLoading('dispatch')
    try { await generateDispatchPDF(order); toast('تم إنشاء إذن الصرف ✓', 'success') }
    catch(e) { console.error(e); toast('خطأ في إنشاء PDF', 'error') }
    finally { setPdfLoading('') }
  }

  const onInvoice = async () => {
    setPdfLoading('invoice')
    try { await generateInvoicePDF(order); toast('تم إنشاء الفاتورة ✓', 'success') }
    catch(e) { console.error(e); toast('خطأ في إنشاء PDF', 'error') }
    finally { setPdfLoading('') }
  }

  const col = accent[order.status]||'#475569'

  return (
    <div className="fade-in" style={{ background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', borderRight:`3px solid ${col}`, boxShadow:'0 1px 4px rgba(15,23,42,0.06)', overflow:'hidden' }}>
      <div style={{ padding:'16px 20px' }}>
        {/* Header row */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:14 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:6 }}>
              <span style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>{order.clientName}</span>
              <span style={{ color:'#cbd5e1' }}>·</span>
              <span style={{ fontSize:13, color:'#64748b' }}>{order.company}</span>
              {order.editHistory?.length>0 && (
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe', display:'inline-flex', alignItems:'center', gap:4 }}>
                  <History size={9}/> معدّل {order.editHistory.length}×
                </span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', fontSize:12, color:'#94a3b8' }}>
              <span style={{display:'flex',alignItems:'center',gap:4}}><User size={11}/>{order.salesRep}</span>
              <span>#{order.serialNumber}</span>
              <span>{order.date} — {order.time}</span>
              <span style={{display:'flex',alignItems:'center',gap:4}}><CreditCard size={11}/>{order.paymentMethod}</span>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <div style={{ textAlign:'left' }}>
              <div style={{ fontSize:18, fontWeight:800, color:'#0f172a' }} dir="ltr">
                {order.total.toLocaleString()} <span style={{fontSize:12,fontWeight:500,color:'#94a3b8'}}>LE</span>
              </div>
              <div style={{ fontSize:11, color:'#94a3b8', textAlign:'left' }}>إجمالي الطلب</div>
            </div>
            <Badge status={order.status}>{order.status}</Badge>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <select value={order.status} onChange={e=>onStatus(e.target.value)} dir="rtl"
              style={{ appearance:'none', padding:'7px 12px 7px 28px', fontSize:12, fontWeight:600, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', cursor:'pointer', outline:'none', fontFamily:'Cairo,sans-serif' }}
              onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e4eaf3'}>
              {ORDER_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', pointerEvents:'none' }} />
          </div>

          {[
            { label:'إذن صرف PDF', key:'dispatch', icon:Package,  fn:onDispatch, bg:'#1e293b', hover:'#0f172a' },
            { label:'فاتورة PDF',  key:'invoice',  icon:FileText, fn:onInvoice,  bg:'#2563eb', hover:'#1d4ed8', shadow:'0 2px 8px rgba(37,99,235,0.3)' },
          ].map(btn => {
            const busy = pdfLoading === btn.key
            return (
              <button key={btn.label} onClick={btn.fn} disabled={!!pdfLoading}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', cursor: busy?'wait':'pointer', fontSize:12, fontWeight:600, fontFamily:'Cairo,sans-serif', transition:'all 0.15s', background:btn.bg, color:'#fff', boxShadow:btn.shadow||'none', opacity: pdfLoading && !busy ? 0.6 : 1 }}
                onMouseEnter={e=>{ if(!pdfLoading) e.currentTarget.style.background=btn.hover }}
                onMouseLeave={e=>{ if(!pdfLoading) e.currentTarget.style.background=btn.bg }}>
                {busy
                  ? <span style={{ width:12,height:12,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',display:'inline-block' }} />
                  : <btn.icon size={13}/>}
                {busy ? 'جارٍ الإنشاء...' : btn.label}
              </button>
            )
          })}

          <button onClick={()=>setExpanded(v=>!v)} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:8, border:'1.5px solid #e4eaf3', background: expanded?'#f0f4fa':'#fff', color:'#475569', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:'Cairo,sans-serif', transition:'all 0.15s', marginRight:'auto' }}>
            <ChevronDown size={11} style={{ transition:'transform 0.2s', transform: expanded?'rotate(180deg)':'none' }} />
            التفاصيل
          </button>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop:'1px solid #f0f4fa', background:'#f8fafc', padding:'16px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            {[
              { icon:Phone,  label:'موبايل / واتساب', val:`${order.mobile} / ${order.whatsapp}`, ltr:true },
              order.address && { icon:MapPin, label:'العنوان', val:order.address },
            ].filter(Boolean).map(row=>(
              <div key={row.label} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 14px', borderRadius:10, background:'#fff', border:'1px solid #f0f4fa' }}>
                <row.icon size={14} color="#94a3b8" style={{ marginTop:2, flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:11, color:'#94a3b8', marginBottom:2 }}>{row.label}</div>
                  <div style={{ fontSize:13, color:'#0f172a' }} dir={row.ltr?'ltr':'rtl'}>{row.val}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Items table */}
          <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #e4eaf3', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#0f172a' }}>
                  {['الصنف','الموديل','الكمية','السعر','الإجمالي'].map((h,i)=>(
                    <th key={h} style={{ padding:'9px 14px', color:'#e2e8f0', fontWeight:600, textAlign:i===0?'right':'center' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item,i)=>(
                  <tr key={item.id} style={{ background:i%2===0?'#fff':'#f8fafc', borderBottom:'1px solid #f0f4fa' }}>
                    <td style={{ padding:'9px 14px', fontWeight:600, color:'#0f172a' }}>{item.name}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', color:'#64748b' }}>{item.model||'—'}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', color:'#0f172a' }}>{item.quantity}</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', color:'#64748b' }} dir="ltr">{item.price.toLocaleString()} LE</td>
                    <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:700, color:'#0f172a' }} dir="ltr">{item.total.toLocaleString()} LE</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background:'#f0f4fa', borderTop:'1.5px solid #e4eaf3' }}>
                  <td colSpan={4} style={{ padding:'9px 14px', fontWeight:700, color:'#0f172a', fontSize:13 }}>الإجمالي شامل {order.vatPercent}% ضريبة</td>
                  <td style={{ padding:'9px 14px', textAlign:'center', fontWeight:800, color:'#2563eb', fontSize:13 }} dir="ltr">{order.total.toLocaleString()} LE</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes + history */}
          {(order.notes || order.editHistory?.length>0) && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {order.notes && (
                <div style={{ padding:'12px 14px', borderRadius:10, background:'#eff6ff', border:'1px solid #bfdbfe' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', marginBottom:4 }}>ملاحظات</div>
                  <div style={{ fontSize:12, color:'#0f172a' }}>{order.notes}</div>
                </div>
              )}
              {order.editHistory?.length>0 && (
                <div style={{ padding:'12px 14px', borderRadius:10, background:'#fffbeb', border:'1px solid #fde68a' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#92400e', marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
                    <History size={10}/> سجل التعديلات
                  </div>
                  {order.editHistory.map((h,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#475569', marginBottom:4 }}>
                      <Clock size={9} color="#f59e0b" style={{flexShrink:0}}/>
                      <span style={{flex:1}}>{h.note}</span>
                      <span dir="ltr" style={{color:'#94a3b8'}}>{new Date(h.editedAt).toLocaleDateString('ar-EG')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
