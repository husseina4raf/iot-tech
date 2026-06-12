import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Check, Trash2, Eye, AlertCircle, Search, X } from 'lucide-react'
import Pagination from '../ui/Pagination'

const PAGE_SIZE = 10
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/Toast'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

export default function TaxInvoices() {
  const { taxInvoices, addTaxInvoice, verifyTaxInvoice, deleteTaxInvoice, orders } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const fileRef = useRef()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ orderId:'', clientName:'', taxNumber:'', amount:'', notes:'' })
  const [selectedFile, setSelectedFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const taxOrders = orders.filter(o => o.invoiceType === 'فاتورة ضريبية')

  const handleOrderSelect = (orderId) => {
    const o = orders.find(x => x.id === orderId)
    if (o) setForm(p => ({ ...p, orderId, clientName: o.invoiceName || o.clientName, taxNumber: o.taxNumber || '', amount: o.total }))
    else setForm(p => ({ ...p, orderId }))
  }

  const handleFile = (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast('حجم الملف يتجاوز 5 ميجابايت', 'error'); return }
    setSelectedFile(file)
    if (!form.clientName) upd('clientName', file.name.replace(/\.[^.]+$/, ''))
  }

  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }

  const selectedOrder = orders.find(o => o.id === form.orderId)

  const handleSave = () => {
    // Order link is now required
    if (!form.orderId) return toast('يرجى ربط الفاتورة بطلب موجود في النظام', 'error')
    if (!selectedFile) return toast('يرجى رفع ملف الفاتورة الضريبية', 'error')
    const order = orders.find(o => o.id === form.orderId)
    const invoice = {
      filename: selectedFile.name,
      orderId: form.orderId,
      orderSerial: order?.serialNumber || '—',
      clientName: order?.invoiceName || order?.clientName || form.clientName || '—',
      taxNumber: order?.taxNumber || form.taxNumber || '',
      amount: order?.total || Number(form.amount) || 0,
      notes: form.notes,
      fileData: null,
    }
    addTaxInvoice(invoice, user)
    toast('تم رفع الفاتورة الضريبية ✓', 'success')
    setShowForm(false); setSelectedFile(null); setForm({ orderId:'', clientName:'', taxNumber:'', amount:'', notes:'' })
  }

  const handleVerify = (id) => { verifyTaxInvoice(id, user); toast('تم اعتماد الفاتورة ✓', 'success') }
  const handleDelete = (inv) => {
    if (!window.confirm(`حذف فاتورة "${inv.filename}"؟`)) return
    deleteTaxInvoice(inv.id, user); toast('تم حذف الفاتورة', 'success')
  }

  const filtered = taxInvoices.filter(i =>
    !search || i.clientName?.includes(search) || i.filename?.includes(search) || i.orderSerial?.includes(search)
  )
  const pending  = taxInvoices.filter(i => !i.verified).length
  const verified = taxInvoices.filter(i => i.verified).length

  useEffect(() => setPage(1), [search])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      {/* Stats + Upload */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:12 }}>
        <div style={{ display:'flex', gap:10 }}>
          {[
            { label:'إجمالي الفواتير', value: taxInvoices.length, color:'#1d4ed8', bg:'#eff6ff' },
            { label:'معتمدة', value: verified, color:'#059669', bg:'#ecfdf5' },
            { label:'بانتظار المراجعة', value: pending, color:'#d97706', bg:'#fffbeb' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding:'12px 18px', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:11, color:'#64748b' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 3px 10px rgba(37,99,235,0.3)' }}>
          <Upload size={14}/>رفع فاتورة ضريبية
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div style={{ ...card, padding:20, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>رفع فاتورة ضريبية جديدة</h3>
            <button onClick={() => { setShowForm(false); setSelectedFile(null) }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18}/></button>
          </div>

          {/* File drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{ border:`2px dashed ${dragOver ? '#2563eb' : selectedFile ? '#059669' : '#e4eaf3'}`, borderRadius:12, padding:'24px 20px', textAlign:'center', cursor:'pointer', marginBottom:16, background: dragOver ? '#eff6ff' : selectedFile ? '#ecfdf5' : '#f8fafc', transition:'all 0.15s' }}>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => handleFile(e.target.files[0])} style={{ display:'none' }} />
            {selectedFile ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                <FileText size={20} color="#059669"/>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#059669' }}>{selectedFile.name}</div>
                  <div style={{ fontSize:11, color:'#94a3b8' }}>{(selectedFile.size/1024).toFixed(1)} KB</div>
                </div>
                <button onClick={e => { e.stopPropagation(); setSelectedFile(null) }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={14}/></button>
              </div>
            ) : (
              <>
                <Upload size={24} color="#94a3b8" style={{ margin:'0 auto 8px' }} />
                <div style={{ fontSize:13, fontWeight:600, color:'#475569', marginBottom:2 }}>اسحب الملف هنا أو اضغط للاختيار</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>PDF, JPG, PNG — حتى 5MB</div>
              </>
            )}
          </div>

          {/* Order link — REQUIRED */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, color:'#1d4ed8', marginBottom:8 }}>
              <FileText size={14}/>
              الربط بالفاتورة في النظام
              <span style={{ color:'#e11d48' }}>*</span>
              <span style={{ fontSize:11, fontWeight:400, color:'#64748b', marginRight:4 }}>(مطلوب — يجب ربط الفاتورة الضريبية بطلب مسجّل)</span>
            </label>
            <select value={form.orderId} onChange={e => handleOrderSelect(e.target.value)} dir="rtl"
              style={{ width:'100%', padding:'11px 14px', fontSize:13, border:`2px solid ${form.orderId ? '#2563eb' : '#fde68a'}`, borderRadius:10, background: form.orderId ? '#eff6ff' : '#fffbeb', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', cursor:'pointer', fontWeight:600 }}>
              <option value="">— اختر الفاتورة المرتبطة من النظام —</option>
              {taxOrders.map(o => (
                <option key={o.id} value={o.id}>
                  #{o.serialNumber} — {o.invoiceName || o.clientName} — {o.total.toLocaleString()} LE — {o.date}
                </option>
              ))}
            </select>

            {/* Preview of selected order */}
            {selectedOrder && (
              <div style={{ marginTop:10, padding:'12px 16px', borderRadius:10, background:'#f0f7ff', border:'1.5px solid #bfdbfe', display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12 }}>
                <div>
                  <div style={{ fontSize:10, color:'#64748b', marginBottom:2 }}>رقم الطلب</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1d4ed8' }}>#{selectedOrder.serialNumber}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#64748b', marginBottom:2 }}>العميل / الشركة</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>{selectedOrder.invoiceName || selectedOrder.clientName}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#64748b', marginBottom:2 }}>الرقم الضريبي</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }} dir="ltr">{selectedOrder.taxNumber || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:'#64748b', marginBottom:2 }}>المبلغ الإجمالي</div>
                  <div style={{ fontSize:13, fontWeight:800, color:'#059669' }} dir="ltr">{selectedOrder.total.toLocaleString()} LE</div>
                </div>
              </div>
            )}
          </div>

          {/* Notes only — other fields auto-filled from order */}
          <div style={{ marginBottom:12 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5 }}>ملاحظات (اختياري)</label>
            <input value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="أي ملاحظات إضافية..."
              style={{ width:'100%', padding:'9px 12px', fontSize:13, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }}
              onFocus={e => { e.target.style.borderColor='#2563eb'; e.target.style.background='#fff' }}
              onBlur={e => { e.target.style.borderColor='#e4eaf3'; e.target.style.background='#f8fafc' }} />
          </div>

          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={() => { setShowForm(false); setSelectedFile(null) }}
              style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #e4eaf3', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>إلغاء</button>
            <button onClick={handleSave}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
              <Upload size={13}/>رفع الفاتورة
            </button>
          </div>
        </div>
      )}

      {/* Pending notice */}
      {pending > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:10, background:'#fffbeb', border:'1px solid #fde68a', marginBottom:12, fontSize:12, color:'#92400e' }}>
          <AlertCircle size={14} color="#d97706"/>
          <span><strong>{pending} فاتورة</strong> بانتظار المراجعة والاعتماد</span>
        </div>
      )}

      {/* Search */}
      <div style={{ ...card, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
        <Search size={14} color="#94a3b8"/>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو رقم الطلب..."
          style={{ flex:1, border:'none', background:'transparent', fontSize:13, color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }} />
        {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={13}/></button>}
      </div>

      {/* Invoices list */}
      <div style={card}>
        {filtered.length === 0 ? (
          <div style={{ padding:50, textAlign:'center' }}>
            <FileText size={36} color="#e4eaf3" style={{ margin:'0 auto 12px' }} />
            <p style={{ fontSize:13, color:'#94a3b8' }}>لا توجد فواتير ضريبية</p>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#f8fafc' }}>
                {['الفاتورة الضريبية','الفاتورة المرتبطة في النظام','المبلغ','تاريخ الرفع','بواسطة','الحالة','إجراءات'].map((h,i) => (
                  <th key={h} style={{ padding:'10px 16px', fontSize:11, fontWeight:700, color:'#64748b', textAlign: i<2?'right':'center', borderBottom:'1px solid #f0f4fa', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((inv, i) => {
                const linkedOrder = orders.find(o => o.id === inv.orderId)
                return (
                  <tr key={inv.id} style={{ borderBottom: i<paged.length-1?'1px solid #f8fafc':'none' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>

                    {/* Tax invoice file */}
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background: inv.verified?'#ecfdf5':'#fffbeb', border:`1px solid ${inv.verified?'#a7f3d0':'#fde68a'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <FileText size={14} color={inv.verified?'#059669':'#d97706'} />
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, color:'#0f172a', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={inv.filename}>{inv.filename}</div>
                          {inv.taxNumber && <div style={{ fontSize:10, color:'#94a3b8' }} dir="ltr">رقم ضريبي: {inv.taxNumber}</div>}
                        </div>
                      </div>
                    </td>

                    {/* Linked order */}
                    <td style={{ padding:'12px 16px' }}>
                      {linkedOrder ? (
                        <div style={{ padding:'8px 12px', borderRadius:8, background:'#f0f7ff', border:'1px solid #bfdbfe' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                            <span style={{ fontSize:11, fontWeight:800, color:'#1d4ed8' }}>#{linkedOrder.serialNumber}</span>
                            <span style={{ fontSize:11, color:'#64748b' }}>—</span>
                            <span style={{ fontSize:12, fontWeight:600, color:'#0f172a' }}>{linkedOrder.invoiceName || linkedOrder.clientName}</span>
                          </div>
                          <div style={{ fontSize:10, color:'#64748b' }}>{linkedOrder.company} · {linkedOrder.date}</div>
                        </div>
                      ) : (
                        <span style={{ fontSize:11, color:'#94a3b8', fontStyle:'italic' }}>غير مرتبطة</span>
                      )}
                    </td>

                    <td style={{ padding:'12px 16px', textAlign:'center', fontWeight:700, color:'#0f172a' }} dir="ltr">{inv.amount ? `${inv.amount.toLocaleString()} LE` : '—'}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center', fontSize:11, color:'#94a3b8' }}>
                      {new Date(inv.uploadedAt).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' })}
                    </td>
                    <td style={{ padding:'12px 16px', textAlign:'center', fontSize:11, color:'#64748b' }}>{inv.uploadedBy}</td>
                    <td style={{ padding:'12px 16px', textAlign:'center' }}>
                      {inv.verified
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:11, padding:'3px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontWeight:700 }}><Check size={10}/>معتمدة</span>
                        : <span style={{ fontSize:11, padding:'3px 8px', borderRadius:20, background:'#fffbeb', color:'#d97706', border:'1px solid #fde68a', fontWeight:600 }}>بانتظار المراجعة</span>}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                        {!inv.verified && (
                          <button onClick={() => handleVerify(inv.id)}
                            style={{ display:'flex', alignItems:'center', gap:3, padding:'5px 9px', borderRadius:7, border:'1.5px solid #a7f3d0', background:'#ecfdf5', color:'#059669', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                            <Check size={10}/>اعتماد
                          </button>
                        )}
                        <button onClick={() => handleDelete(inv)}
                          style={{ display:'flex', alignItems:'center', gap:3, padding:'5px 9px', borderRadius:7, border:'1.5px solid #fecdd3', background:'#fff1f2', color:'#e11d48', fontSize:11, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                          <Trash2 size={10}/>حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage}/>
      </div>
    </div>
  )
}
