import { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Calculator, Lock, Search, Package, AlertTriangle } from 'lucide-react'
import { INVOICE_TYPES } from '../../data/mockData'
import { useAuth } from '../../hooks/useAuth'
import { useOrders } from '../../hooks/useOrders'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', padding:24, boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

function SectionTitle({ n, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
      <div style={{ width:26,height:26,borderRadius:8,background:'linear-gradient(135deg,#2563eb,#1d4ed8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,flexShrink:0 }}>{n}</div>
      <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{children}</h3>
    </div>
  )
}

function FInput({ label, required, error, style={}, ...props }) {
  const [f, setF] = useState(false)
  const errStyle = error ? { borderColor:'#e11d48', background:'#fff7f7' } : {}
  return (
    <div style={style}>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:6 }}>
        {label}{required&&<span style={{color:'#e11d48'}}> *</span>}
      </label>
      <input {...props} style={{ width:'100%', padding:'10px 12px', fontSize:13, border:`1.5px solid ${f?'#2563eb': error?'#e11d48':'#e4eaf3'}`, borderRadius:8, background:f?'#fff': error?'#fff7f7':'#f8fafc', color:'#0f172a', outline:'none', boxShadow:f?'0 0 0 3px rgba(37,99,235,0.1)':'none', transition:'all 0.15s', fontFamily:'Cairo,sans-serif', ...errStyle }}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)} />
      {error && <span style={{ display:'block', fontSize:11, color:'#e11d48', marginTop:3 }}>{error}</span>}
    </div>
  )
}

function FSelect({ label, required, error, children, style={}, ...props }) {
  const [f,setF]=useState(false)
  return (
    <div style={style}>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:6 }}>
        {label}{required&&<span style={{color:'#e11d48'}}> *</span>}
      </label>
      <select {...props} style={{ width:'100%', padding:'10px 12px', fontSize:13, border:`1.5px solid ${f?'#2563eb': error?'#e11d48':'#e4eaf3'}`, borderRadius:8, background:f?'#fff': error?'#fff7f7':'#f8fafc', color:'#0f172a', outline:'none', boxShadow:f?'0 0 0 3px rgba(37,99,235,0.1)':'none', cursor:'pointer', transition:'all 0.15s', fontFamily:'Cairo,sans-serif' }}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)}>
        {children}
      </select>
      {error && <span style={{ display:'block', fontSize:11, color:'#e11d48', marginTop:3 }}>{error}</span>}
    </div>
  )
}

function FTextarea({ label, style={}, ...props }) {
  const [f,setF]=useState(false)
  return (
    <div style={style}>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:6 }}>{label}</label>
      <textarea {...props} style={{ width:'100%', padding:'10px 12px', fontSize:13, border:`1.5px solid ${f?'#2563eb':'#e4eaf3'}`, borderRadius:8, background:f?'#fff':'#f8fafc', color:'#0f172a', outline:'none', boxShadow:f?'0 0 0 3px rgba(37,99,235,0.1)':'none', resize:'none', transition:'all 0.15s', fontFamily:'Cairo,sans-serif' }}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)} />
    </div>
  )
}

function ProductSearch({ value, inventory, onSelect, hideStock = false }) {
  const [query, setQuery]   = useState(value || '')
  const [open, setOpen]     = useState(false)
  const ref                 = useRef(null)

  // Keep display in sync when parent resets the form
  useEffect(() => { setQuery(value || '') }, [value])

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.trim()
    ? inventory.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        (i.nameAr || '').includes(query) ||
        (i.sku || '').toLowerCase().includes(query.toLowerCase()) ||
        (i.brand || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : inventory.slice(0, 8)

  const iStyle = { width:'100%', padding:'9px 10px 9px 32px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif', boxSizing:'border-box' }

  return (
    <div ref={ref} style={{ position:'relative' }}>
      <Search size={13} color="#94a3b8" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', zIndex:1 }} />
      <input
        value={query}
        placeholder="ابحث عن منتج..."
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={e => { setOpen(true); e.target.style.borderColor='#2563eb'; e.target.style.background='#fff' }}
        onBlur={e => { e.target.style.borderColor='#e4eaf3'; e.target.style.background='#f8fafc' }}
        style={iStyle}
      />
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:'1.5px solid #e4eaf3', borderRadius:10, boxShadow:'0 8px 24px rgba(15,23,42,0.12)', zIndex:999, maxHeight:240, overflowY:'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding:'12px 14px', fontSize:12, color:'#94a3b8', display:'flex', alignItems:'center', gap:6 }}>
              <Package size={13}/> لا توجد منتجات مطابقة
            </div>
          ) : filtered.map(inv => (
            <div key={inv.id}
              onMouseDown={e => { e.preventDefault(); onSelect(inv); setQuery(inv.name); setOpen(false) }}
              style={{ padding:'9px 14px', cursor:'pointer', borderBottom:'1px solid #f8fafc', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}
              onMouseEnter={e => e.currentTarget.style.background='#f0f6ff'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'#0f172a' }}>{inv.name}</div>
                {inv.nameAr && <div style={{ fontSize:11, color:'#94a3b8' }}>{inv.nameAr}</div>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                {inv.sku && <span style={{ fontSize:10, padding:'1px 6px', borderRadius:5, background:'#f0f4fa', color:'#475569', border:'1px solid #e4eaf3', fontFamily:'monospace' }}>{inv.sku}</span>}
                {!hideStock && (
                  <span style={{ fontSize:10, padding:'1px 6px', borderRadius:5, fontWeight:600,
                    background: inv.stock > 0 ? '#ecfdf5' : '#fff1f2',
                    color:      inv.stock > 0 ? '#059669' : '#e11d48',
                    border:     `1px solid ${inv.stock > 0 ? '#a7f3d0' : '#fecdd3'}` }}>
                    {inv.stock > 0 ? `${inv.stock} متاح` : 'نفد'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OrderFormFields({ form, setForm, errors = {}, setErrors = () => {} }) {
  const { user, salesReps } = useAuth()
  const { inventory } = useOrders()
  const isSalesRep = user?.role === 'sales'
  const upd = (f,v) => { setForm(p=>({...p,[f]:v})); setErrors(p=>({...p,[f]:''})) }

  // Look up cost price from inventory by product name
  const getCostPrice = (name) => {
    if (!name) return null
    const match = inventory.find(i =>
      i.name.toLowerCase() === name.toLowerCase() ||
      (i.nameAr && i.nameAr === name)
    )
    return match?.costPrice || null
  }

  const addItem = () => setForm(p=>({...p, items:[...p.items,{id:Date.now().toString(),name:'',sku:'',model:'',price:0,quantity:1,total:0}]}))

  const selectProduct = (itemId, inv) => setForm(p => {
    const items = p.items.map(item => {
      if (item.id !== itemId) return item
      return { ...item, name: inv.name, sku: inv.sku || '', model: inv.sku || '', costPrice: inv.costPrice || 0 }
    })
    return { ...p, items }
  })
  const rmItem  = id  => setForm(p=>({...p, items:p.items.filter(i=>i.id!==id)}))
  const upItem  = (id,field,raw) => setForm(p=>{
    const items=p.items.map(item=>{
      if(item.id!==id) return item
      const u={...item,[field]:raw}
      const pr=field==='price'?Number(raw)||0:Number(item.price)||0
      const qt=field==='quantity'?Number(raw)||0:Number(item.quantity)||0
      u.total=pr*qt; return u
    })
    const sub=items.reduce((s,i)=>s+(i.total||0),0)
    const VAT_FIXED = 14
    const vat=Math.round(sub*(VAT_FIXED/100))
    return {...p,items,subtotal:sub,vatPercent:VAT_FIXED,vatAmount:vat,total:sub+vat}
  })

  const iStyle = { width:'100%', padding:'9px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* 1. Client */}
      <div style={card}>
        <SectionTitle n="١">بيانات العميل</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <FInput label="الشركة / العميل" required error={errors.company} style={{gridColumn:'1/-1'}} placeholder="اسم الشركة أو العميل" value={form.company} onChange={e=>upd('company',e.target.value)} />
          <FInput label="اسم العميل" required error={errors.clientName} placeholder="الاسم الكامل" value={form.clientName} onChange={e=>upd('clientName',e.target.value)} />

          {/* Sales rep: locked for sales role, dropdown for admin */}
          {isSalesRep ? (
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:6 }}>
                مندوب المبيعات
              </label>
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:8, background:'#f0f4fa', border:'1.5px solid #e4eaf3' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:12, fontWeight:700, flexShrink:0 }}>
                  {user?.name?.[0]}
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:'#0f172a', flex:1 }}>{user?.name}</span>
                <Lock size={13} color="#94a3b8" />
              </div>
            </div>
          ) : (
            <FSelect label="مندوب المبيعات" required error={errors.salesRep} value={form.salesRep} onChange={e=>upd('salesRep',e.target.value)}>
              <option value="">اختر المندوب</option>
              {salesReps.map(r=><option key={r} value={r}>{r}</option>)}
            </FSelect>
          )}
          <FInput label="موبايل" placeholder="01XXXXXXXXX" value={form.mobile} onChange={e=>upd('mobile',e.target.value)} dir="ltr"/>
          <FInput label="واتساب" placeholder="01XXXXXXXXX" value={form.whatsapp} onChange={e=>upd('whatsapp',e.target.value)} dir="ltr"/>
          <FTextarea label="العنوان" style={{gridColumn:'1/-1'}} placeholder="العنوان بالتفصيل" rows={2} value={form.address} onChange={e=>upd('address',e.target.value)} />
          <FInput label="رابط الموقع" style={{gridColumn:'1/-1'}} placeholder="https://maps.google.com/..." value={form.locationLink} onChange={e=>upd('locationLink',e.target.value)} dir="ltr"/>
        </div>
      </div>

      {/* 2. Items */}
      <div style={card}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <SectionTitle n="٢">الأصناف</SectionTitle>
          <button type="button" onClick={addItem} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#2563eb,#1d4ed8)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 2px 8px rgba(37,99,235,0.35)' }}>
            <Plus size={13}/>إضافة صنف
          </button>
        </div>

        {errors.items && <div style={{ marginBottom:8, padding:'6px 12px', borderRadius:8, background:'#fff1f2', border:'1px solid #fecdd3', fontSize:12, color:'#e11d48', display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={12}/>{errors.items}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'2.5fr 90px 90px 70px 90px 36px', gap:8, paddingBottom:8, marginBottom:4, borderBottom:'1px solid #f0f4fa', fontSize:11, fontWeight:700, color:'#94a3b8' }}>
          <span>اسم الصنف</span><span>SKU</span><span>سعر البيع</span><span>الكمية</span><span>الإجمالي</span><span/>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {form.items.map(item=>{
            const costP = item.costPrice || getCostPrice(item.name)
            const isBelowCost = isSalesRep && costP && Number(item.price) > 0 && Number(item.price) < costP
            return (
              <div key={item.id}>
                <div style={{ display:'grid', gridTemplateColumns:'2.5fr 90px 90px 70px 90px 36px', gap:8, alignItems:'center' }}>
                  <ProductSearch
                    value={item.name}
                    inventory={inventory}
                    onSelect={inv => selectProduct(item.id, inv)}
                    hideStock={isSalesRep}
                  />
                  <input value={item.sku||''} placeholder="SKU" readOnly dir="ltr"
                    style={{ ...iStyle, background:'#f0f4fa', color:'#64748b', cursor:'default', fontFamily:'monospace', fontSize:11 }} />
                  <input type="number" placeholder="0" value={item.price||''} onChange={e=>upItem(item.id,'price',e.target.value)} dir="ltr"
                    style={{ ...iStyle, border:`1.5px solid ${isBelowCost ? '#f97316' : '#e4eaf3'}`, background: isBelowCost ? '#fff7ed' : '#f8fafc' }}
                    onFocus={e=>{e.target.style.borderColor=isBelowCost?'#ea580c':'#2563eb';e.target.style.background='#fff'}}
                    onBlur={e=>{e.target.style.borderColor=isBelowCost?'#f97316':'#e4eaf3';e.target.style.background=isBelowCost?'#fff7ed':'#f8fafc'}} />
                  <input type="number" placeholder="1" value={item.quantity||''} onChange={e=>upItem(item.id,'quantity',e.target.value)} dir="ltr"
                    style={iStyle} onFocus={e=>{e.target.style.borderColor='#2563eb';e.target.style.background='#fff'}} onBlur={e=>{e.target.style.borderColor='#e4eaf3';e.target.style.background='#f8fafc'}} />
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:40, borderRadius:8, background:'#f0f4fa', border:'1px solid #e4eaf3', fontSize:13, fontWeight:700, color:'#0f172a' }} dir="ltr">
                    {(item.total||0).toLocaleString()}
                  </div>
                  <button type="button" onClick={()=>rmItem(item.id)} disabled={form.items.length===1}
                    style={{ width:36, height:40, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, border:'none', background:'transparent', cursor:form.items.length===1?'not-allowed':'pointer', color:'#94a3b8', opacity:form.items.length===1?0.3:1 }}
                    onMouseEnter={e=>{if(form.items.length>1){e.currentTarget.style.background='#fff1f2';e.currentTarget.style.color='#e11d48'}}}
                    onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#94a3b8'}}>
                    <Trash2 size={14}/>
                  </button>
                </div>
                {isBelowCost && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, padding:'5px 10px', borderRadius:7, background:'#fff7ed', border:'1px solid #fed7aa', fontSize:11, color:'#9a3412' }}>
                    <AlertTriangle size={12} color="#f97316"/>
                    تحذير: سعر البيع أقل من سعر التكلفة ({costP?.toLocaleString()} LE)
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Totals */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16, paddingTop:16, borderTop:'1px solid #f0f4fa' }}>
          <div style={{ width:260 }}>
            {[['المجموع الجزئي', `${form.subtotal.toLocaleString()} LE`]].map(([l,v])=>(
              <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'#64748b', marginBottom:8 }}>
                <span>{l}</span><span style={{ fontWeight:600, color:'#0f172a' }} dir="ltr">{v}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13, color:'#64748b', marginBottom:12 }}>
              <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                ضريبة القيمة المضافة
                <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:'#f0f4fa', color:'#94a3b8', border:'1px solid #e4eaf3', fontWeight:600 }}>ثابت</span>
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:12, fontWeight:800, color:'#0f172a', padding:'4px 8px', borderRadius:6, background:'#f0f4fa', border:'1px solid #e4eaf3' }}>14%</span>
                <span style={{fontSize:12,fontWeight:600,color:'#64748b'}} dir="ltr">({form.vatAmount.toLocaleString()} LE)</span>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:10, borderTop:'2px solid #e4eaf3' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6, fontWeight:700, fontSize:14, color:'#0f172a' }}>
                <Calculator size={15} color="#2563eb"/>الإجمالي
              </span>
              <span style={{ fontSize:20, fontWeight:800, color:'#1d4ed8' }} dir="ltr">{form.total.toLocaleString()} LE</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Invoice */}
      <div style={card}>
        <SectionTitle n="٣">بيانات الفاتورة</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <FSelect label="نوع الفاتورة" required value={form.invoiceType} onChange={e=>upd('invoiceType',e.target.value)}>
            {INVOICE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </FSelect>
          <FInput label="التاريخ" required type="date" value={form.dateRaw} dir="ltr"
            onChange={e=>{const d=e.target.value;setForm(p=>({...p,dateRaw:d,date:d?d.split('-').reverse().join('-'):''}))}}/>
          {form.invoiceType==='فاتورة ضريبية'&&<>
            <FInput label="الاسم على الفاتورة" placeholder="اسم الشركة" value={form.invoiceName} onChange={e=>upd('invoiceName',e.target.value)}/>
            <FInput label="الرقم الضريبي" placeholder="123456789" value={form.taxNumber} onChange={e=>upd('taxNumber',e.target.value)} dir="ltr"/>
          </>}
          <FTextarea label="ملاحظات" style={{gridColumn:'1/-1'}} placeholder="أي ملاحظات إضافية..." rows={3} value={form.notes} onChange={e=>upd('notes',e.target.value)}/>
        </div>
      </div>
    </div>
  )
}
