import { useState } from 'react'
import { Plus, Edit3, Trash2, AlertTriangle, Package, X, Check, RotateCcw } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/Toast'
import { INVENTORY_CATEGORIES, INVENTORY_BRANDS } from '../../data/mockData'

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }
const iStyle = { width:'100%', padding:'9px 12px', fontSize:13, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }
const focusStyle = { borderColor:'#2563eb', background:'#fff', boxShadow:'0 0 0 3px rgba(37,99,235,0.1)' }

function FInput({ label, ...props }) {
  const [f, setF] = useState(false)
  return (
    <div>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5 }}>{label}</label>}
      <input {...props} style={{ ...iStyle, ...(f ? focusStyle : {}) }} onFocus={() => setF(true)} onBlur={() => setF(false)} />
    </div>
  )
}

function FSelect({ label, children, ...props }) {
  return (
    <div>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5 }}>{label}</label>}
      <select {...props} style={{ ...iStyle, cursor:'pointer' }}>{children}</select>
    </div>
  )
}

const emptyForm = () => ({
  sku: '', name: '', nameAr: '', brand: '', stock: '', minStock: '3', price: '', costPrice: '',
  category: INVENTORY_CATEGORIES[0], supplier: '', notes: ''
})

export default function InventoryManager() {
  const { inventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [adjustModal, setAdjustModal] = useState(null) // { id, name, currentStock }
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [filter, setFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')

  const upd = (f, v) => setForm(p => ({ ...p, [f]: v }))

  const openAdd = () => { setForm(emptyForm()); setEditId(null); setShowForm(true) }
  const openEdit = (item) => {
    setForm({ sku: item.sku || '', name: item.name, nameAr: item.nameAr, brand: item.brand || '', stock: item.stock, minStock: item.minStock, price: item.price, costPrice: item.costPrice || '', category: item.category || INVENTORY_CATEGORIES[0], supplier: item.supplier || '', notes: item.notes || '' })
    setEditId(item.id)
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.name.trim()) return toast('يرجى إدخال اسم المنتج', 'error')
    const data = { ...form, stock: Number(form.stock) || 0, minStock: Number(form.minStock) || 3, price: Number(form.price) || 0, costPrice: Number(form.costPrice) || 0 }
    if (editId) {
      updateInventoryItem(editId, data, user)
      toast('تم تحديث المنتج ✓', 'success')
    } else {
      addInventoryItem(data, user)
      toast('تم إضافة المنتج ✓', 'success')
    }
    setShowForm(false); setEditId(null); setForm(emptyForm())
  }

  const handleDelete = (item) => {
    if (!window.confirm(`هل أنت متأكد من حذف "${item.name}"؟`)) return
    deleteInventoryItem(item.id, user)
    toast('تم حذف المنتج', 'success')
  }

  const handleAdjust = () => {
    if (!adjustQty || isNaN(adjustQty)) return toast('يرجى إدخال الكمية', 'error')
    updateInventoryItem(adjustModal.id, { stock: Math.max(0, Number(adjustQty)), adjustNote }, user)
    toast('تم تحديث المخزون ✓', 'success')
    setAdjustModal(null); setAdjustQty(''); setAdjustNote('')
  }

  const filtered = inventory.filter(i => {
    const q = filter.toLowerCase()
    return (
      (!q || i.name.toLowerCase().includes(q) || (i.nameAr||'').includes(filter) || (i.sku||'').includes(q) || (i.brand||'').toLowerCase().includes(q)) &&
      (!brandFilter || i.brand === brandFilter) &&
      (!catFilter   || i.category === catFilter)
    )
  })

  const lowStock = inventory.filter(i => i.stock < (i.minStock || 5))

  return (
    <div>
      {/* Header + Add button */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          {lowStock.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:20, background:'#fff1f2', border:'1px solid #fecdd3', fontSize:12, fontWeight:600, color:'#9f1239' }}>
              <AlertTriangle size={13}/>{lowStock.length} منتج تحت الحد الأدنى
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="بحث بالاسم أو SKU..."
            style={{ ...iStyle, width:180 }} />
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} dir="rtl"
            style={{ ...iStyle, width:130, cursor:'pointer' }}>
            <option value="">كل الماركات</option>
            {INVENTORY_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} dir="rtl"
            style={{ ...iStyle, width:130, cursor:'pointer' }}>
            <option value="">كل الأصناف</option>
            {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(filter || brandFilter || catFilter) && (
            <button onClick={() => { setFilter(''); setBrandFilter(''); setCatFilter('') }}
              style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #fecdd3', background:'#fff1f2', color:'#e11d48', fontSize:12, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
              مسح
            </button>
          )}
          <button onClick={openAdd}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 3px 10px rgba(37,99,235,0.3)' }}>
            <Plus size={14}/>إضافة منتج
          </button>
        </div>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div style={{ ...card, padding:20, marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ fontSize:14, fontWeight:700, color:'#0f172a' }}>{editId ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
            <button onClick={() => { setShowForm(false); setEditId(null) }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}>
              <X size={18}/>
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <FInput label="SKU" value={form.sku} onChange={e => upd('sku', e.target.value)} placeholder="2396" dir="ltr"/>
            <FInput label="اسم الموديل (EN) *" value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Smart Lock XYZ" />
            <FInput label="اسم الموديل (AR)" value={form.nameAr} onChange={e => upd('nameAr', e.target.value)} placeholder="قفل ذكي XYZ" />
            <FSelect label="الماركة / البراند" value={form.brand} onChange={e => upd('brand', e.target.value)}>
              <option value="">اختر الماركة</option>
              {INVENTORY_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </FSelect>
            <FSelect label="التصنيف" value={form.category} onChange={e => upd('category', e.target.value)}>
              {INVENTORY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </FSelect>
            <FInput label="المورد" value={form.supplier} onChange={e => upd('supplier', e.target.value)} placeholder="اسم المورد" />
            <FInput label="الكمية المتاحة" type="number" value={form.stock} onChange={e => upd('stock', e.target.value)} placeholder="0" dir="ltr"/>
            <FInput label="الحد الأدنى للتنبيه" type="number" value={form.minStock} onChange={e => upd('minStock', e.target.value)} placeholder="3" dir="ltr"/>
            <FInput label="سعر التكلفة (LE)" type="number" value={form.costPrice} onChange={e => upd('costPrice', e.target.value)} placeholder="0" dir="ltr"/>
            <FInput label="ملاحظات" style={{gridColumn:'1/-1'}} value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="أي ملاحظات..." />
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button onClick={() => { setShowForm(false); setEditId(null) }}
              style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #e4eaf3', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
              إلغاء
            </button>
            <button onClick={handleSave}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
              <Check size={14}/>{editId ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </button>
          </div>
        </div>
      )}

      {/* Adjust stock modal */}
      {adjustModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ ...card, padding:24, width:380, direction:'rtl' }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:4 }}>تسوية المخزون</h3>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:16 }}>{adjustModal.name} — المخزون الحالي: {adjustModal.currentStock} وحدة</p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <FInput label="الكمية الجديدة *" type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="0" dir="ltr"/>
              <FInput label="سبب التعديل" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="جرد / استلام شحنة / ..." />
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => { setAdjustModal(null); setAdjustQty(''); setAdjustNote('') }}
                style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #e4eaf3', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>إلغاء</button>
              <button onClick={handleAdjust}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:'#1d4ed8', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                <RotateCcw size={13}/>تحديث المخزون
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div style={card}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#f8fafc' }}>
              {['SKU','المنتج / الموديل','الماركة','التصنيف','سعر التكلفة','المخزون','الحالة','إجراءات'].map((h, i) => (
                <th key={h} style={{ padding:'10px 12px', fontSize:11, fontWeight:700, color:'#64748b', textAlign: i===1?'right':'center', borderBottom:'1px solid #f0f4fa', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const isLow = item.stock < (item.minStock || 5)
              return (
                <tr key={item.id} style={{ borderBottom:'1px solid #f8fafc' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  {/* SKU */}
                  <td style={{ padding:'10px 12px', textAlign:'center' }}>
                    {item.sku ? (
                      <span style={{ fontSize:11, padding:'2px 7px', borderRadius:6, background:'#f0f4fa', color:'#475569', border:'1px solid #e4eaf3', fontWeight:600, fontFamily:'monospace' }}>{item.sku}</span>
                    ) : <span style={{ color:'#cbd5e1' }}>—</span>}
                  </td>
                  {/* Product name */}
                  <td style={{ padding:'10px 12px' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#0f172a' }}>{item.name}</div>
                    {item.nameAr && <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{item.nameAr}</div>}
                  </td>
                  {/* Brand */}
                  <td style={{ padding:'10px 12px', textAlign:'center' }}>
                    {item.brand
                      ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#f5f3ff', color:'#7c3aed', border:'1px solid #ddd6fe', fontWeight:600 }}>{item.brand}</span>
                      : <span style={{ color:'#cbd5e1' }}>—</span>}
                  </td>
                  {/* Category */}
                  <td style={{ padding:'10px 12px', textAlign:'center' }}>
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'#eff6ff', color:'#1d4ed8', border:'1px solid #bfdbfe' }}>{item.category || '—'}</span>
                  </td>
                  {/* Cost Price */}
                  <td style={{ padding:'10px 12px', textAlign:'center' }}>
                    {item.costPrice > 0
                      ? <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }} dir="ltr">{item.costPrice.toLocaleString()} LE</span>
                      : <span style={{ color:'#cbd5e1', fontSize:12 }}>—</span>}
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <span style={{ fontSize:16, fontWeight:800, color: isLow ? '#e11d48' : '#0f172a' }}>{item.stock}</span>
                      <span style={{ fontSize:10, color:'#94a3b8' }}>وحدة</span>
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>
                    {isLow
                      ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'3px 8px', borderRadius:20, background:'#fff1f2', color:'#e11d48', border:'1px solid #fecdd3', fontWeight:600 }}><AlertTriangle size={10}/>منخفض</span>
                      : <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'3px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontWeight:600 }}>✓ متاح</span>}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                      <button onClick={() => { setAdjustModal({ id: item.id, name: item.name, currentStock: item.stock }); setAdjustQty(String(item.stock)) }}
                        style={{ display:'flex', alignItems:'center', gap:3, padding:'5px 9px', borderRadius:7, border:'1.5px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                        <RotateCcw size={10}/>تسوية
                      </button>
                      <button onClick={() => openEdit(item)}
                        style={{ display:'flex', alignItems:'center', gap:3, padding:'5px 9px', borderRadius:7, border:'1.5px solid #e4eaf3', background:'#f8fafc', color:'#475569', fontSize:11, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                        <Edit3 size={10}/>تعديل
                      </button>
                      <button onClick={() => handleDelete(item)}
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
        {filtered.length === 0 && (
          <div style={{ padding:40, textAlign:'center' }}>
            <Package size={32} color="#e4eaf3" style={{ margin:'0 auto 10px' }} />
            <p style={{ fontSize:13, color:'#94a3b8' }}>لا توجد منتجات تطابق البحث</p>
          </div>
        )}
      </div>
    </div>
  )
}
