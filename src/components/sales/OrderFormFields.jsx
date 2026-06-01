import { useState } from 'react'
import { Plus, Trash2, Calculator } from 'lucide-react'
import { SALES_REPS, PAYMENT_METHODS, INVOICE_TYPES } from '../../data/mockData'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', padding:24, boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }

function SectionTitle({ n, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
      <div style={{ width:26,height:26,borderRadius:8,background:'linear-gradient(135deg,#2563eb,#1d4ed8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:700,flexShrink:0 }}>{n}</div>
      <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{children}</h3>
    </div>
  )
}

function FInput({ label, required, style={}, ...props }) {
  const [f, setF] = useState(false)
  return (
    <div style={style}>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:6 }}>
        {label}{required&&<span style={{color:'#e11d48'}}> *</span>}
      </label>
      <input {...props} style={{ width:'100%', padding:'10px 12px', fontSize:13, border:`1.5px solid ${f?'#2563eb':'#e4eaf3'}`, borderRadius:8, background:f?'#fff':'#f8fafc', color:'#0f172a', outline:'none', boxShadow:f?'0 0 0 3px rgba(37,99,235,0.1)':'none', transition:'all 0.15s', fontFamily:'Cairo,sans-serif' }}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)} />
    </div>
  )
}

function FSelect({ label, required, children, style={}, ...props }) {
  const [f,setF]=useState(false)
  return (
    <div style={style}>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:6 }}>
        {label}{required&&<span style={{color:'#e11d48'}}> *</span>}
      </label>
      <select {...props} style={{ width:'100%', padding:'10px 12px', fontSize:13, border:`1.5px solid ${f?'#2563eb':'#e4eaf3'}`, borderRadius:8, background:f?'#fff':'#f8fafc', color:'#0f172a', outline:'none', boxShadow:f?'0 0 0 3px rgba(37,99,235,0.1)':'none', cursor:'pointer', transition:'all 0.15s', fontFamily:'Cairo,sans-serif' }}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)}>
        {children}
      </select>
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

export default function OrderFormFields({ form, setForm }) {
  const upd = (f,v) => setForm(p=>({...p,[f]:v}))

  const addItem = () => setForm(p=>({...p, items:[...p.items,{id:Date.now().toString(),name:'',model:'',price:0,quantity:1,total:0}]}))
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
    const vat=Math.round(sub*(p.vatPercent/100))
    return {...p,items,subtotal:sub,vatAmount:vat,total:sub+vat}
  })
  const upVat = v => setForm(p=>{
    const vat=Math.round(p.subtotal*(v/100))
    return {...p,vatPercent:Number(v),vatAmount:vat,total:p.subtotal+vat}
  })

  const iStyle = { width:'100%', padding:'9px 10px', fontSize:12, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* 1. Client */}
      <div style={card}>
        <SectionTitle n="١">بيانات العميل</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <FInput label="الشركة / العميل" required style={{gridColumn:'1/-1'}} placeholder="اسم الشركة أو العميل" value={form.company} onChange={e=>upd('company',e.target.value)} />
          <FInput label="اسم العميل" required placeholder="الاسم الكامل" value={form.clientName} onChange={e=>upd('clientName',e.target.value)} />
          <FSelect label="مندوب المبيعات" required value={form.salesRep} onChange={e=>upd('salesRep',e.target.value)}>
            <option value="">اختر المندوب</option>
            {SALES_REPS.map(r=><option key={r} value={r}>{r}</option>)}
          </FSelect>
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

        <div style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 80px 70px 90px 36px', gap:8, paddingBottom:8, marginBottom:4, borderBottom:'1px solid #f0f4fa', fontSize:11, fontWeight:700, color:'#94a3b8' }}>
          <span>اسم الصنف</span><span>الموديل</span><span>السعر</span><span>الكمية</span><span>الإجمالي</span><span/>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {form.items.map(item=>(
            <div key={item.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.2fr 80px 70px 90px 36px', gap:8, alignItems:'center' }}>
              {['name','model'].map(f=>(
                <input key={f} value={item[f]} placeholder={f==='name'?'اسم الصنف':'الموديل'} onChange={e=>upItem(item.id,f,e.target.value)}
                  style={iStyle} onFocus={e=>{e.target.style.borderColor='#2563eb';e.target.style.background='#fff'}} onBlur={e=>{e.target.style.borderColor='#e4eaf3';e.target.style.background='#f8fafc'}} />
              ))}
              {['price','quantity'].map(f=>(
                <input key={f} type="number" placeholder={f==='price'?'0':'1'} value={item[f]||''} onChange={e=>upItem(item.id,f,e.target.value)} dir="ltr"
                  style={iStyle} onFocus={e=>{e.target.style.borderColor='#2563eb';e.target.style.background='#fff'}} onBlur={e=>{e.target.style.borderColor='#e4eaf3';e.target.style.background='#f8fafc'}} />
              ))}
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
          ))}
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
              <span>ضريبة القيمة المضافة</span>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <input type="number" min={0} max={30} value={form.vatPercent} onChange={e=>upVat(e.target.value)}
                  style={{ width:50, padding:'4px 6px', textAlign:'center', fontSize:12, fontWeight:700, border:'1.5px solid #e4eaf3', borderRadius:6, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }}
                  onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e4eaf3'} />
                <span style={{fontSize:11,color:'#94a3b8'}}>%</span>
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
        <SectionTitle n="٣">بيانات الفاتورة والدفع</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <FSelect label="نوع الفاتورة" required value={form.invoiceType} onChange={e=>upd('invoiceType',e.target.value)}>
            {INVOICE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
          </FSelect>
          <FSelect label="طريقة الدفع" required value={form.paymentMethod} onChange={e=>upd('paymentMethod',e.target.value)}>
            {PAYMENT_METHODS.map(m=><option key={m} value={m}>{m}</option>)}
          </FSelect>
          {form.invoiceType==='فاتورة ضريبية'&&<>
            <FInput label="الاسم على الفاتورة" placeholder="اسم الشركة" value={form.invoiceName} onChange={e=>upd('invoiceName',e.target.value)}/>
            <FInput label="الرقم الضريبي" placeholder="123456789" value={form.taxNumber} onChange={e=>upd('taxNumber',e.target.value)} dir="ltr"/>
          </>}
          <FInput label="التاريخ" required type="date" value={form.dateRaw} dir="ltr"
            onChange={e=>{const d=e.target.value;setForm(p=>({...p,dateRaw:d,date:d?d.split('-').reverse().join('-'):''}))}}/>
          <FInput label="الوقت" required type="time" value={form.time} dir="ltr" onChange={e=>upd('time',e.target.value)}/>
          <FTextarea label="ملاحظات" style={{gridColumn:'1/-1'}} placeholder="أي ملاحظات إضافية..." rows={3} value={form.notes} onChange={e=>upd('notes',e.target.value)}/>
        </div>
      </div>
    </div>
  )
}
