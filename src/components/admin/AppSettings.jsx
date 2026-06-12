import { useState } from 'react'
import { Settings, Trophy, Eye, EyeOff, Download, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import { supabase } from '../../lib/supabase'

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

const ROLE_MAP = { sales:'مندوب', team_leader:'قائد فريق', admin:'مدير', super_admin:'مدير عام' }

const TABLE_CONFIGS = {
  orders: {
    label: 'الطلبات',
    filename: 'طلبات',
    columns: [
      { label:'رقم الطلب',      key:'serial_number' },
      { label:'اسم العميل',     key:'client_name' },
      { label:'الشركة',         key:'company' },
      { label:'المندوب',        key:'sales_rep' },
      { label:'التاريخ',        key:'date' },
      { label:'الإجمالي',       key:'total' },
      { label:'الحالة',         key:'status' },
      { label:'طريقة الدفع',   key:'payment_method' },
      { label:'الموبايل',      key:'mobile' },
      { label:'العنوان',        key:'address' },
      { label:'نوع الفاتورة',  key:'invoice_type' },
    ],
  },
  inventory: {
    label: 'المخزون',
    filename: 'مخزون',
    columns: [
      { label:'الاسم',        key:'name' },
      { label:'الكود',        key:'sku' },
      { label:'الموديل',      key:'model' },
      { label:'الماركة',      key:'brand' },
      { label:'الفئة',        key:'category' },
      { label:'سعر البيع',   key:'price' },
      { label:'سعر التكلفة', key:'cost_price' },
      { label:'المخزون',     key:'stock' },
    ],
  },
  profiles: {
    label: 'المستخدمين',
    filename: 'مستخدمين',
    columns: [
      { label:'الاسم',         key:'name' },
      { label:'اسم المستخدم',  key:'username' },
      { label:'الدور',          get: r => ROLE_MAP[r.role] || r.role },
      { label:'نشط',            get: r => r.active ? 'نعم' : 'لا' },
    ],
  },
  audit_log: {
    label: 'سجل التعديلات',
    filename: 'سجل-تعديلات',
    columns: [
      { label:'التاريخ',         get: r => r.changed_at ? new Date(r.changed_at).toLocaleString('ar-EG') : '' },
      { label:'النوع',           key:'type' },
      { label:'رقم المرجع',     key:'order_ref' },
      { label:'الحقل',           key:'field' },
      { label:'القيمة القديمة', key:'old_value' },
      { label:'القيمة الجديدة', key:'new_value' },
      { label:'بواسطة',          key:'changed_by' },
    ],
  },
  tax_invoices: {
    label: 'الفواتير الضريبية',
    filename: 'فواتير-ضريبية',
    columns: [
      { label:'التاريخ',     key:'invoice_date' },
      { label:'اسم العميل', key:'client_name' },
      { label:'اسم الملف',  key:'filename' },
      { label:'المبلغ',      key:'amount' },
      { label:'معتمدة',      get: r => r.verified ? 'نعم' : 'لا' },
      { label:'رفع بواسطة', key:'uploaded_by' },
    ],
  },
}

function toCSV(rows, columns) {
  const BOM    = '\uFEFF'
  const header = columns.map(c => c.label).join(',')
  const body   = rows.map(row =>
    columns.map(c => {
      const val = typeof c.get === 'function' ? c.get(row) : (row[c.key] ?? '')
      return '"' + String(val).replace(/"/g, '""') + '"'
    }).join(',')
  ).join('\n')
  return BOM + header + '\n' + body
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function AppSettings() {
  const { settings, set } = useSettings()
  const [backupState, setBackupState] = useState('')
  const [errorMsg,    setErrorMsg]    = useState('')
  const [selected, setSelected] = useState({
    orders: true, inventory: true, profiles: true, audit_log: false, tax_invoices: false,
  })
  const [fromDate, setFromDate] = useState('')
  const [toDate,   setToDate]   = useState('')

  const toggleTable = (key) => setSelected(s => ({ ...s, [key]: !s[key] }))

  const handleBackup = async () => {
    const keys = Object.keys(selected).filter(k => selected[k])
    if (!keys.length) { setErrorMsg('اختر على الأقل نوع واحد من البيانات'); return }
    setErrorMsg('')
    setBackupState('loading')
    try {
      const date = new Date().toISOString().split('T')[0]
      for (const key of keys) {
        let query = supabase.from(key).select('*')
        if (key === 'orders') {
          if (fromDate) query = query.gte('created_at', fromDate)
          if (toDate)   query = query.lte('created_at', toDate + 'T23:59:59')
        }
        const { data, error } = await query
        if (error) throw new Error(error.message)
        const cfg = TABLE_CONFIGS[key]
        downloadCSV(toCSV(data || [], cfg.columns), `${cfg.filename}-${date}.csv`)
        await new Promise(r => setTimeout(r, 300))
      }
      setBackupState('done')
      setTimeout(() => setBackupState(''), 3500)
    } catch (e) {
      console.error(e)
      setErrorMsg(e.message || 'حدث خطأ أثناء التحميل')
      setBackupState('error')
      setTimeout(() => { setBackupState(''); setErrorMsg('') }, 4000)
    }
  }

  const anySelected   = Object.values(selected).some(Boolean)
  const selectedCount = Object.keys(selected).filter(k => selected[k]).length

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
          icon={Trophy} iconColor="#f59e0b"
          title="تاب المتصدرين"
          desc="إظهار أو إخفاء تاب المتصدرون في صفحة المندوبين"
          value={settings.leaderboardVisible}
          onChange={v => set('leaderboardVisible', v)}
        />
        <div style={{ padding:'16px 20px', borderRadius:'0 0 14px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:8, background: settings.leaderboardVisible ? '#ecfdf5' : '#fff7ed', border:`1px solid ${settings.leaderboardVisible ? '#a7f3d0' : '#fed7aa'}` }}>
            <span style={{ fontSize:13, color: settings.leaderboardVisible ? '#065f46' : '#92400e', fontWeight:600 }}>
              {settings.leaderboardVisible ? '✓ تاب المتصدرون ظاهر للمندوبين' : '⊘ تاب المتصدرون مخفي عن المندوبين'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ ...card, marginTop:16 }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #f0f4fa', background:'#f8fafc', borderRadius:'14px 14px 0 0', display:'flex', alignItems:'center', gap:8 }}>
          <FileSpreadsheet size={14} color="#059669"/>
          <span style={{ fontSize:12, fontWeight:700, color:'#64748b' }}>تصدير البيانات — Excel / CSV</span>
        </div>

        <div style={{ padding:'20px' }}>
          <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:10 }}>اختر البيانات التي تريد تحميلها</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {Object.entries(TABLE_CONFIGS).map(([key, cfg]) => (
                <label key={key} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                  borderRadius:10, border:`1.5px solid ${selected[key] ? '#2563eb' : '#e4eaf3'}`,
                  background: selected[key] ? '#eff6ff' : '#f8fafc',
                  cursor:'pointer', transition:'all 0.15s', userSelect:'none',
                }}>
                  <input type="checkbox" checked={selected[key]} onChange={() => toggleTable(key)}
                    style={{ width:16, height:16, accentColor:'#2563eb', cursor:'pointer', flexShrink:0 }} />
                  <span style={{ fontSize:13, fontWeight:600, color: selected[key] ? '#1d4ed8' : '#475569' }}>
                    {cfg.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {selected.orders && (
            <div style={{ marginBottom:18, padding:'14px 16px', borderRadius:10, background:'#f0f9ff', border:'1px solid #bae6fd' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#0369a1', marginBottom:10 }}>فلتر تاريخ الطلبات (اختياري)</div>
              <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:130 }}>
                  <label style={{ display:'block', fontSize:11, color:'#64748b', marginBottom:4, fontWeight:600 }}>من تاريخ</label>
                  <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #bae6fd', fontFamily:'Cairo,sans-serif', fontSize:13, color:'#0f172a', background:'#fff', outline:'none', boxSizing:'border-box' }} />
                </div>
                <div style={{ flex:1, minWidth:130 }}>
                  <label style={{ display:'block', fontSize:11, color:'#64748b', marginBottom:4, fontWeight:600 }}>إلى تاريخ</label>
                  <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                    style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid #bae6fd', fontFamily:'Cairo,sans-serif', fontSize:13, color:'#0f172a', background:'#fff', outline:'none', boxSizing:'border-box' }} />
                </div>
                {(fromDate || toDate) && (
                  <button onClick={() => { setFromDate(''); setToDate('') }}
                    style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #bae6fd', background:'#fff', color:'#0369a1', fontSize:12, cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:600 }}>
                    مسح الفلتر
                  </button>
                )}
              </div>
              <div style={{ fontSize:11, color:'#0284c7', marginTop:8 }}>
                {(!fromDate && !toDate) ? 'بدون تحديد تاريخ = تحميل كل الطلبات' : `من ${fromDate || '...'} إلى ${toDate || '...'}`}
              </div>
            </div>
          )}

          {errorMsg && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderRadius:8, background:'#fef2f2', border:'1px solid #fecaca', marginBottom:14 }}>
              <AlertCircle size={14} color="#ef4444" style={{ flexShrink:0 }}/>
              <span style={{ fontSize:12, color:'#dc2626' }}>{errorMsg}</span>
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div style={{ fontSize:12, color:'#64748b' }}>
              {anySelected ? `${selectedCount} ملف CSV — يفتح في Excel بالعربي` : 'اختر البيانات أولاً'}
            </div>
            <button onClick={handleBackup} disabled={backupState === 'loading' || !anySelected}
              style={{
                display:'flex', alignItems:'center', gap:8, padding:'11px 22px',
                borderRadius:10, border:'none',
                cursor: (backupState==='loading' || !anySelected) ? 'not-allowed' : 'pointer',
                fontFamily:'Cairo,sans-serif', fontSize:13, fontWeight:700,
                background: !anySelected ? '#e2e8f0' : backupState==='done' ? '#059669' : backupState==='error' ? '#e11d48' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                color: !anySelected ? '#94a3b8' : '#fff',
                boxShadow: anySelected && backupState==='' ? '0 4px 12px rgba(37,99,235,0.3)' : 'none',
                transition:'all 0.2s',
              }}>
              {backupState === 'loading' && <span style={{ width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite' }} />}
              {backupState === 'done'    && <CheckCircle size={14}/>}
              {backupState === 'error'   && <AlertCircle size={14}/>}
              {backupState === ''        && <Download size={14}/>}
              {backupState === 'loading' ? 'جارٍ التحميل...' : backupState === 'done' ? 'تم التحميل ✓' : backupState === 'error' ? 'حدث خطأ' : 'تحميل البيانات'}
            </button>
          </div>

          <div style={{ marginTop:14, padding:'10px 14px', borderRadius:8, background:'#f8fafc', border:'1px solid #e4eaf3', fontSize:11, color:'#64748b', lineHeight:1.7 }}>
            <strong>ملاحظة:</strong> كل نوع بيانات بيتنزل في ملف CSV منفصل — افتح الملف في Excel وستظهر البيانات بالعربي تلقائياً.
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
