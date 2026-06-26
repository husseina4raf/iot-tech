import React, { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Edit3, Trash2, AlertTriangle, Package, X, Check, RotateCcw, ChevronDown, ChevronUp, Pencil, Upload, Download, FileSpreadsheet } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/Toast'
import { INVENTORY_CATEGORIES, INVENTORY_BRANDS } from '../../data/mockData'
import Pagination from '../ui/Pagination'

const PAGE_SIZE = 10

const card = { background:'#fff', borderRadius:14, border:'1px solid #e4eaf3', boxShadow:'0 1px 4px rgba(15,23,42,0.06)' }
const iStyle = { width:'100%', padding:'9px 12px', fontSize:13, border:'1.5px solid #e4eaf3', borderRadius:8, background:'#f8fafc', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }
const focusStyle = { borderColor:'#2563eb', background:'#fff', boxShadow:'0 0 0 3px rgba(37,99,235,0.1)' }

function FInput({ label, required, error, ...props }) {
  const [f, setF] = useState(false)
  const errStyle = error ? { borderColor:'#e11d48', background:'#fff7f7' } : {}
  return (
    <div>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5 }}>
        {label}{required && <span style={{ color:'#e11d48' }}> *</span>}
      </label>}
      <input {...props}
        style={{ ...iStyle, ...(f ? focusStyle : {}), ...errStyle }}
        onFocus={() => setF(true)} onBlur={() => setF(false)} />
      {error && <span style={{ display:'block', fontSize:11, color:'#e11d48', marginTop:3 }}>{error}</span>}
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

function FCombo({ label, options, ...props }) {
  const [f, setF] = useState(false)
  const id = `dl-${label?.replace(/\s+/g,'')}`
  return (
    <div>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5 }}>{label}</label>}
      <input list={id} {...props}
        style={{ ...iStyle, ...(f ? focusStyle : {}) }}
        onFocus={() => setF(true)} onBlur={() => setF(false)} />
      <datalist id={id}>
        {options.map(o => <option key={o} value={o}/>)}
      </datalist>
    </div>
  )
}

const emptyForm = () => ({
  sku: '', name: '', nameAr: '', brand: '', stock: '', minStock: '3', price: '', costPrice: '',
  category: INVENTORY_CATEGORIES[0], supplier: '', notes: ''
})

export default function InventoryManager() {
  const { inventory, addInventoryItem, addStockLot, updateStockLot, updateInventoryItem, deleteInventoryItem } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [adjustModal, setAdjustModal] = useState(null) // { id, name, currentStock }
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustCost, setAdjustCost] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [expandedLots, setExpandedLots] = useState({})
  const [editLot, setEditLot] = useState(null) // { itemId, lotId, qty, costPrice, note }
  const [filter, setFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [page, setPage] = useState(1)

  const [errors, setErrors] = useState({})
  const [importPreview, setImportPreview] = useState(null) // { rows, errors }
  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef(null)

  const upd = (f, v) => { setForm(p => ({ ...p, [f]: v })); setErrors(p => ({ ...p, [f]: '' })) }

  const COLUMN_MAP = {
    'اسم المنتج': 'name', 'name': 'name',
    'الاسم بالعربي': 'nameAr', 'namear': 'nameAr',
    'sku': 'sku', 'SKU': 'sku',
    'الماركة': 'brand', 'brand': 'brand',
    'الفئة': 'category', 'category': 'category',
    'سعر البيع': 'price', 'price': 'price',
    'سعر التكلفة': 'costPrice', 'costprice': 'costPrice', 'سعر التكلفه': 'costPrice',
    'الكمية': 'stock', 'stock': 'stock', 'الكميه': 'stock',
    'الحد الأدنى': 'minStock', 'minstock': 'minStock', 'الحد الادنى': 'minStock',
    'المورد': 'supplier', 'supplier': 'supplier',
    'ملاحظات': 'notes', 'notes': 'notes',
  }

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['اسم المنتج *', 'الاسم بالعربي', 'SKU', 'الماركة', 'الفئة', 'سعر البيع', 'سعر التكلفة *', 'الكمية', 'الحد الأدنى', 'المورد', 'ملاحظات'],
      ['Lezn IHand 02', 'ليزن اي هاند', 'SKU-001', 'Lezn', 'قفل ذكي', 8000, 5000, 10, 3, 'المورد ABC', ''],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'المنتجات')
    XLSX.writeFile(wb, 'نموذج_المنتجات.xlsx')
  }

  const handleFileImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!raw.length) return toast('الملف فاضي أو غير صحيح', 'error')

        const rows = []
        const errs = []
        raw.forEach((row, idx) => {
          const mapped = {}
          Object.entries(row).forEach(([k, v]) => {
            const norm = k.replace(/\s*\*\s*$/, '').trim()
            const key = COLUMN_MAP[norm] || COLUMN_MAP[norm.toLowerCase()]
            if (key) mapped[key] = String(v).trim()
          })
          if (!mapped.name) { errs.push(`سطر ${idx + 2}: اسم المنتج مطلوب`); return }
          if (!mapped.costPrice || isNaN(mapped.costPrice) || Number(mapped.costPrice) <= 0) {
            errs.push(`سطر ${idx + 2} (${mapped.name}): سعر التكلفة مطلوب`)
            return
          }
          rows.push({
            name: mapped.name,
            nameAr: mapped.nameAr || '',
            sku: mapped.sku || '',
            brand: mapped.brand || '',
            category: mapped.category || INVENTORY_CATEGORIES[0],
            price: Number(mapped.price) || 0,
            costPrice: Number(mapped.costPrice),
            stock: Number(mapped.stock) || 0,
            minStock: Number(mapped.minStock) || 3,
            supplier: mapped.supplier || '',
            notes: mapped.notes || '',
          })
        })
        setImportPreview({ rows, errs })
      } catch { toast('فشل قراءة الملف — تأكد أنه Excel صحيح', 'error') }
    }
    reader.readAsBinaryString(file)
  }

  const handleConfirmImport = async () => {
    if (!importPreview?.rows?.length) return
    setImportLoading(true)
    let added = 0, lotAdded = 0, skipped = 0
    for (const row of importPreview.rows) {
      const existing = inventory.find(i => i.name.toLowerCase() === row.name.toLowerCase())
      if (existing) {
        if (existing.costPrice === Number(row.costPrice)) {
          skipped++
        } else {
          await addStockLot(existing.id, { qty: Number(row.stock) || 0, costPrice: Number(row.costPrice), note: `استيراد Excel — سعر ${row.costPrice} LE` }, user)
          lotAdded++
        }
      } else {
        await addInventoryItem(row, user)
        added++
      }
    }
    setImportLoading(false)
    const parts = []
    if (added)    parts.push(`${added} منتج جديد`)
    if (lotAdded) parts.push(`${lotAdded} دفعة جديدة لمنتجات موجودة`)
    if (skipped)  parts.push(`${skipped} مكرر تم تجاهله`)
    toast(parts.join(' · ') + ' ✓', 'success')
    setImportPreview(null)
  }

  const openAdd = () => { setForm(emptyForm()); setEditId(null); setErrors({}); setShowForm(true) }
  const openEdit = (item) => {
    setForm({ sku: item.sku || '', name: item.name, nameAr: item.nameAr, brand: item.brand || '', stock: item.stock, minStock: item.minStock, price: item.price, costPrice: item.costPrice || '', category: item.category || INVENTORY_CATEGORIES[0], supplier: item.supplier || '', notes: item.notes || '' })
    setEditId(item.id)
    setErrors({})
    setShowForm(true)
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())                       e.name      = 'اسم المنتج مطلوب'
    if (!form.costPrice || Number(form.costPrice) <= 0) e.costPrice = 'سعر التكلفة مطلوب'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
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
    if (!adjustQty || isNaN(adjustQty) || Number(adjustQty) <= 0) return toast('يرجى إدخال كمية صحيحة', 'error')
    if (!adjustCost || isNaN(adjustCost) || Number(adjustCost) <= 0) return toast('يرجى إدخال سعر التكلفة', 'error')
    addStockLot(adjustModal.id, { qty: Number(adjustQty), costPrice: Number(adjustCost), note: adjustNote }, user)
    toast('تم إضافة الدفعة ✓', 'success')
    setAdjustModal(null); setAdjustQty(''); setAdjustCost(''); setAdjustNote('')
  }

  const toggleLots = (id) => setExpandedLots(p => ({ ...p, [id]: !p[id] }))

  const handleSaveLot = () => {
    if (!editLot) return
    if (!editLot.qty || Number(editLot.qty) <= 0) return toast('الكمية يجب أن تكون أكبر من 0', 'error')
    if (!editLot.costPrice || Number(editLot.costPrice) <= 0) return toast('سعر التكلفة يجب أن يكون أكبر من 0', 'error')
    updateStockLot(editLot.itemId, editLot.lotId, { qty: editLot.qty, costPrice: editLot.costPrice, note: editLot.note }, user)
    toast('تم تعديل الدفعة ✓', 'success')
    setEditLot(null)
  }

  const filtered = inventory.filter(i => {
    const q = filter.toLowerCase()
    return (
      (!q || i.name.toLowerCase().includes(q) || (i.nameAr||'').includes(filter) || (i.sku||'').includes(q) || (i.brand||'').toLowerCase().includes(q)) &&
      (!brandFilter || i.brand === brandFilter) &&
      (!catFilter   || i.category === catFilter)
    )
  })

  useEffect(() => setPage(1), [filter, brandFilter, catFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
          <button onClick={handleDownloadTemplate}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:10, border:'1.5px solid #a7f3d0', background:'#ecfdf5', color:'#059669', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
            <Download size={13}/>نموذج Excel
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:10, border:'1.5px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
            <Upload size={13}/>استيراد Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:'none' }} onChange={handleFileImport} />
          <button onClick={openAdd}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 3px 10px rgba(37,99,235,0.3)' }}>
            <Plus size={14}/>إضافة منتج
          </button>
        </div>
      </div>

      {/* Import preview modal */}
      {importPreview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setImportPreview(null) }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'min(640px,95vw)', maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <FileSpreadsheet size={20} color="#059669"/>
                <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>معاينة الاستيراد</h3>
              </div>
              <button onClick={() => setImportPreview(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18}/></button>
            </div>

            {/* Summary */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              <div style={{ padding:'12px 16px', borderRadius:10, background:'#ecfdf5', border:'1px solid #a7f3d0', textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:800, color:'#059669' }}>{importPreview.rows.length}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>منتج جاهز للاستيراد</div>
              </div>
              <div style={{ padding:'12px 16px', borderRadius:10, background: importPreview.errs.length ? '#fff1f2' : '#f8fafc', border:`1px solid ${importPreview.errs.length ? '#fecdd3' : '#e4eaf3'}`, textAlign:'center' }}>
                <div style={{ fontSize:24, fontWeight:800, color: importPreview.errs.length ? '#e11d48' : '#94a3b8' }}>{importPreview.errs.length}</div>
                <div style={{ fontSize:12, color:'#64748b' }}>سطر تم تجاهله</div>
              </div>
            </div>

            {/* Errors */}
            {importPreview.errs.length > 0 && (
              <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, background:'#fff1f2', border:'1px solid #fecdd3' }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#e11d48', marginBottom:6 }}>أسطر بها مشكلة (تم تجاهلها):</div>
                {importPreview.errs.map((e, i) => <div key={i} style={{ fontSize:11, color:'#9f1239', marginBottom:2 }}>• {e}</div>)}
              </div>
            )}

            {/* Preview table */}
            {importPreview.rows.length > 0 && (
              <div style={{ borderRadius:10, overflow:'hidden', border:'1px solid #e4eaf3', marginBottom:16 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:'#f8fafc' }}>
                      {['اسم المنتج','SKU','الماركة','سعر التكلفة','الكمية'].map(h => (
                        <th key={h} style={{ padding:'8px 12px', fontWeight:700, color:'#64748b', textAlign:'right', borderBottom:'1px solid #e4eaf3' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.slice(0, 8).map((r, i) => (
                      <tr key={i} style={{ borderBottom:'1px solid #f0f4fa' }}>
                        <td style={{ padding:'7px 12px', fontWeight:600, color:'#0f172a' }}>{r.name}</td>
                        <td style={{ padding:'7px 12px', color:'#64748b', fontFamily:'monospace' }}>{r.sku || '—'}</td>
                        <td style={{ padding:'7px 12px', color:'#64748b' }}>{r.brand || '—'}</td>
                        <td style={{ padding:'7px 12px', color:'#059669', fontWeight:600 }} dir="ltr">{r.costPrice.toLocaleString()} LE</td>
                        <td style={{ padding:'7px 12px', textAlign:'center' }}>{r.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importPreview.rows.length > 8 && (
                  <div style={{ padding:'8px 12px', background:'#f8fafc', fontSize:11, color:'#94a3b8', textAlign:'center' }}>
                    + {importPreview.rows.length - 8} منتج أخرى
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setImportPreview(null)}
                style={{ padding:'9px 20px', borderRadius:9, border:'1.5px solid #e4eaf3', background:'#fff', color:'#64748b', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                إلغاء
              </button>
              {importPreview.rows.length > 0 && (
                <button onClick={handleConfirmImport} disabled={importLoading}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 22px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:13, fontWeight:700, cursor: importLoading?'wait':'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 3px 10px rgba(5,150,105,0.35)', opacity: importLoading?0.7:1 }}>
                  {importLoading ? <><span style={{ width:12,height:12,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',display:'inline-block' }}/>جارٍ الاستيراد...</> : <><Check size={14}/>تأكيد استيراد {importPreview.rows.length} منتج</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowForm(false); setEditId(null); setErrors({}) } }}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:'min(600px,95vw)', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a' }}>{editId ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h3>
              <button onClick={() => { setShowForm(false); setEditId(null); setErrors({}) }} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}>
                <X size={18}/>
              </button>
            </div>
            <div className="m-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              <FInput label="SKU" value={form.sku} onChange={e => upd('sku', e.target.value)} placeholder="2396" dir="ltr"/>
              <FInput label="اسم الموديل" required error={errors.name} value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Smart Lock XYZ" />
              <FCombo label="الماركة / البراند" options={INVENTORY_BRANDS} value={form.brand} onChange={e => upd('brand', e.target.value)} placeholder="اختر أو اكتب ماركة جديدة" />
              <FCombo label="التصنيف" options={INVENTORY_CATEGORIES} value={form.category} onChange={e => upd('category', e.target.value)} placeholder="اختر أو اكتب تصنيف جديد" />
              <FInput label="سعر التكلفة (LE)" required error={errors.costPrice} type="number" value={form.costPrice} onChange={e => upd('costPrice', e.target.value)} placeholder="0" dir="ltr"/>

              <FInput label="الكمية المتاحة" type="number" value={form.stock} onChange={e => upd('stock', e.target.value)} placeholder="0" dir="ltr"/>
              <FInput label="الحد الأدنى للتنبيه" type="number" value={form.minStock} onChange={e => upd('minStock', e.target.value)} placeholder="3" dir="ltr"/>
              <FInput label="ملاحظات" style={{gridColumn:'1/-1'}} value={form.notes} onChange={e => upd('notes', e.target.value)} placeholder="أي ملاحظات..." />
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditId(null); setErrors({}) }}
                style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #e4eaf3', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                إلغاء
              </button>
              <button onClick={handleSave}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                <Check size={14}/>{editId ? 'حفظ التعديلات' : 'إضافة المنتج'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add lot modal */}
      {adjustModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ ...card, padding:24, width:420, direction:'rtl' }}>
            <h3 style={{ fontSize:15, fontWeight:700, color:'#0f172a', marginBottom:2, display:'flex', alignItems:'center', gap:8 }}>
              <Plus size={16} color="#2563eb"/>إضافة دفعة شراء
            </h3>
            <p style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>{adjustModal.name}</p>

            {/* Existing lots summary */}
            {adjustModal.lots?.length > 0 && (
              <div style={{ marginBottom:16, borderRadius:8, border:'1px solid #f0f4fa', overflow:'hidden' }}>
                <div style={{ padding:'6px 12px', background:'#f8fafc', fontSize:11, fontWeight:700, color:'#64748b' }}>الدفعات الحالية</div>
                {adjustModal.lots.map((l, i) => (
                  <div key={l.id} style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', fontSize:12, borderTop:'1px solid #f8fafc', background: i%2===0?'#fff':'#f8fafc' }}>
                    <span style={{ color:'#475569' }}>{l.date} {l.note ? `— ${l.note}` : ''}</span>
                    <span style={{ fontWeight:700, color:'#0f172a' }} dir="ltr">{l.qty} وحدة × {l.costPrice.toLocaleString()} LE</span>
                  </div>
                ))}
                <div style={{ padding:'7px 12px', background:'#eff6ff', display:'flex', justifyContent:'space-between', fontSize:12, borderTop:'1px solid #bfdbfe' }}>
                  <span style={{ color:'#1d4ed8', fontWeight:700 }}>الإجمالي الحالي</span>
                  <span style={{ fontWeight:800, color:'#1d4ed8' }} dir="ltr">{adjustModal.currentStock} وحدة</span>
                </div>
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <FInput label="الكمية المضافة *" type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="0" dir="ltr"/>
                <FInput label="سعر التكلفة للوحدة *" type="number" value={adjustCost} onChange={e => setAdjustCost(e.target.value)} placeholder="0" dir="ltr"/>
              </div>
              <FInput label="ملاحظة (اختياري)" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="مثال: شحنة يونيو 2025" />
            </div>

            {adjustQty && adjustCost && !isNaN(adjustQty) && !isNaN(adjustCost) && (
              <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8, background:'#ecfdf5', border:'1px solid #a7f3d0', fontSize:12, color:'#065f46' }}>
                ✓ ستُضاف <strong>{adjustQty} وحدة</strong> بتكلفة <strong>{Number(adjustCost).toLocaleString()} LE</strong> للوحدة
              </div>
            )}

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => { setAdjustModal(null); setAdjustQty(''); setAdjustCost(''); setAdjustNote('') }}
                style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #e4eaf3', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>إلغاء</button>
              <button onClick={handleAdjust}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 2px 8px rgba(37,99,235,0.3)' }}>
                <Plus size={13}/>إضافة الدفعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div style={card}>
        <div className="m-table-scroll">
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:680 }}>
          <thead>
            <tr style={{ background:'#f8fafc' }}>
              {['SKU','المنتج / الموديل','الماركة','التصنيف','تكلفة الدفعة الحالية','المخزون','الحالة','إجراءات'].map((h, i) => (
                <th key={h} style={{ padding:'10px 12px', fontSize:11, fontWeight:700, color:'#64748b', textAlign: i===1?'right':'center', borderBottom:'1px solid #f0f4fa', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(item => {
              const isLow = item.stock < (item.minStock || 5)
              const lotsOpen = !!expandedLots[item.id]
              const lotCount = (item.lots || []).length
              return (
                <React.Fragment key={item.id}>
                <tr style={{ borderBottom: lotsOpen ? 'none' : '1px solid #f8fafc' }}
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
                      {lotCount > 0 && (
                        <button onClick={() => toggleLots(item.id)}
                          style={{ display:'flex', alignItems:'center', gap:2, padding:'2px 7px', borderRadius:5, border:`1px solid ${lotsOpen ? '#93c5fd' : '#bfdbfe'}`, background: lotsOpen ? '#eff6ff' : '#fff', color:'#1d4ed8', fontSize:10, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif', marginTop:2 }}>
                          {lotsOpen ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
                          {lotCount} دفعة
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'center' }}>
                    {isLow
                      ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'3px 8px', borderRadius:20, background:'#fff1f2', color:'#e11d48', border:'1px solid #fecdd3', fontWeight:600 }}><AlertTriangle size={10}/>منخفض</span>
                      : <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'3px 8px', borderRadius:20, background:'#ecfdf5', color:'#059669', border:'1px solid #a7f3d0', fontWeight:600 }}>✓ متاح</span>}
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                      <button onClick={() => { setAdjustModal({ id: item.id, name: item.name, currentStock: item.stock, lots: item.lots || [] }); setAdjustQty(''); setAdjustCost(''); setAdjustNote('') }}
                        style={{ display:'flex', alignItems:'center', gap:3, padding:'5px 9px', borderRadius:7, border:'1.5px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                        <Plus size={10}/>دفعة
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
                {lotsOpen && lotCount > 0 && (
                  <tr style={{ background:'#f0f7ff' }}>
                    <td colSpan={8} style={{ padding:'0 16px 12px 16px' }}>
                      <div style={{ borderRadius:8, border:'1px solid #bfdbfe', overflow:'hidden', marginTop:2 }}>
                        <div style={{ padding:'6px 14px', background:'#eff6ff', display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:'#1d4ed8' }}>دفعات الشراء — {item.name}</span>
                          <span style={{ fontSize:11, color:'#60a5fa' }}>({lotCount} دفعة)</span>
                        </div>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                          <thead>
                            <tr style={{ background:'#dbeafe' }}>
                              {['التاريخ','الكمية','سعر التكلفة للوحدة','ملاحظة',''].map(h => (
                                <th key={h} style={{ padding:'6px 14px', fontSize:11, fontWeight:700, color:'#1e40af', textAlign:'center', borderBottom:'1px solid #bfdbfe' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {item.lots.map((lot, idx) => {
                              const isEditing = editLot?.itemId === item.id && editLot?.lotId === lot.id
                              const bg = idx%2===0 ? '#fff' : '#f8fafc'
                              const inStyle = { width:'100%', padding:'4px 8px', fontSize:12, border:'1.5px solid #93c5fd', borderRadius:6, background:'#fff', color:'#0f172a', outline:'none', fontFamily:'Cairo,sans-serif' }
                              return (
                                <tr key={lot.id} style={{ background: isEditing ? '#fffbeb' : bg, borderBottom:'1px solid #e0f0ff' }}>
                                  <td style={{ padding:'7px 14px', textAlign:'center', color:'#475569' }}>{lot.date}</td>
                                  {isEditing ? (
                                    <>
                                      <td style={{ padding:'5px 10px' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                          <input type="number" value={editLot.qty} onChange={e => setEditLot(p => ({ ...p, qty: e.target.value }))} style={{ ...inStyle, width:70 }} dir="ltr"/>
                                          <span style={{ fontSize:11, color:'#64748b' }}>وحدة</span>
                                        </div>
                                      </td>
                                      <td style={{ padding:'5px 10px' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                          <input type="number" value={editLot.costPrice} onChange={e => setEditLot(p => ({ ...p, costPrice: e.target.value }))} style={{ ...inStyle, width:80 }} dir="ltr"/>
                                          <span style={{ fontSize:11, color:'#64748b' }}>LE</span>
                                        </div>
                                      </td>
                                      <td style={{ padding:'5px 10px' }}>
                                        <input value={editLot.note} onChange={e => setEditLot(p => ({ ...p, note: e.target.value }))} style={inStyle} placeholder="ملاحظة..."/>
                                      </td>
                                      <td style={{ padding:'5px 10px', textAlign:'center' }}>
                                        <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                                          <button onClick={handleSaveLot}
                                            style={{ display:'flex', alignItems:'center', gap:3, padding:'4px 10px', borderRadius:6, border:'none', background:'#059669', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                                            <Check size={11}/>حفظ
                                          </button>
                                          <button onClick={() => setEditLot(null)}
                                            style={{ display:'flex', alignItems:'center', gap:3, padding:'4px 8px', borderRadius:6, border:'1px solid #e4eaf3', background:'#fff', color:'#64748b', fontSize:11, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                                            <X size={11}/>
                                          </button>
                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td style={{ padding:'7px 14px', textAlign:'center', fontWeight:700, color:'#0f172a' }}>{lot.qty.toLocaleString()} وحدة</td>
                                      <td style={{ padding:'7px 14px', textAlign:'center', fontWeight:700, color:'#059669' }} dir="ltr">{lot.costPrice.toLocaleString()} LE</td>
                                      <td style={{ padding:'7px 14px', textAlign:'center', color:'#64748b', fontSize:11 }}>{lot.note || '—'}</td>
                                      <td style={{ padding:'7px 14px', textAlign:'center' }}>
                                        <button onClick={() => setEditLot({ itemId: item.id, lotId: lot.id, qty: lot.qty, costPrice: lot.costPrice, note: lot.note || '' })}
                                          style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'3px 9px', borderRadius:6, border:'1.5px solid #bfdbfe', background:'#eff6ff', color:'#1d4ed8', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
                                          <Pencil size={10}/>تعديل
                                        </button>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ background:'#eff6ff', borderTop:'2px solid #bfdbfe' }}>
                              <td colSpan={2} style={{ padding:'7px 14px', textAlign:'center', fontWeight:700, color:'#1d4ed8', fontSize:12 }}>
                                الإجمالي: {item.stock.toLocaleString()} وحدة متاحة
                              </td>
                              <td style={{ padding:'7px 14px', textAlign:'center', fontWeight:700, color:'#059669', fontSize:12 }} dir="ltr">
                                تكلفة الدفعة الحالية: {(item.lots?.[0]?.costPrice ?? item.costPrice ?? 0).toLocaleString()} LE
                              </td>
                              <td colSpan={2}/>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding:40, textAlign:'center' }}>
            <Package size={32} color="#e4eaf3" style={{ margin:'0 auto 10px' }} />
            <p style={{ fontSize:13, color:'#94a3b8' }}>لا توجد منتجات تطابق البحث</p>
          </div>
        )}
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage}/>
      </div>
    </div>
  )
}
