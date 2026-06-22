import { useState } from 'react'
import { Send, RotateCcw } from 'lucide-react'
import OrderFormFields from './OrderFormFields'
import { useOrders } from '../../hooks/useOrders'
import { useToast } from '../ui/Toast'
import { useAuth } from '../../hooks/useAuth'

export default function OrderForm({ editOrder = null, onSaved }) {
  const { addOrder, updateOrder } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const isEdit = !!editOrder

  const emptyForm = () => ({
    company: '', clientName: '', mobile: '', whatsapp: '',
    governorate: '', city: '', district: '', street: '', buildingNo: '',
    address: '', locationLink: '',
    items: [{ id: Date.now().toString(), name: '', sku: '', model: '', price: 0, quantity: 1, total: 0 }],
    subtotal: 0, vatPercent: 0, vatAmount: 0, total: 0,
    invoiceType: 'بيان اسعار', invoiceName: '', taxNumber: '',
    notes: '', paymentMethod: '',
    dateRaw: new Date().toISOString().split('T')[0],
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    time: '',
    salesRep: user?.repName || '',
  })

  const [form, setForm] = useState(() => {
    if (editOrder) {
      return {
        ...editOrder,
        governorate: '', city: '', district: '',
        street: editOrder.address || '',
        buildingNo: '',
        dateRaw: editOrder.date ? editOrder.date.split('-').reverse().join('-') : new Date().toISOString().split('T')[0],
      }
    }
    return emptyForm()
  })

  const [errors, setErrors] = useState({})

  const handleSubmit = (e) => {
    e.preventDefault()
    const errs = {}
    const phoneRegex = /^01[0-9]{9}$/

    if (!form.company.trim())     errs.company    = 'اسم الشركة أو العميل مطلوب'
    if (!form.clientName.trim())  errs.clientName = 'اسم العميل مطلوب'
    if (!form.salesRep)           errs.salesRep   = 'يرجى اختيار مندوب المبيعات'

    if (!form.mobile.trim()) {
      errs.mobile = 'رقم الموبايل مطلوب'
    } else if (!phoneRegex.test(form.mobile.trim())) {
      errs.mobile = 'رقم غير صحيح — يجب أن يبدأ بـ 01 ويتكون من 11 رقم'
    }
    if (!form.whatsapp.trim()) {
      errs.whatsapp = 'رقم الواتساب مطلوب'
    } else if (!phoneRegex.test(form.whatsapp.trim())) {
      errs.whatsapp = 'رقم واتساب غير صحيح — 01XXXXXXXXX'
    }

    if (!form.street?.trim() && !form.city?.trim() && !form.governorate?.trim()) {
      errs.address = 'يرجى إدخال العنوان (المحافظة أو المدينة أو الشارع على الأقل)'
    }

    if (form.items.some(i => !i.name.trim()))  errs.items = 'يرجى إدخال أسماء جميع الأصناف'
    if (form.total <= 0)                        errs.items = errs.items || 'يرجى إدخال أصناف بأسعار صحيحة'
    if (form.invoiceType === 'فاتورة ضريبية' && !form.taxNumber?.trim()) errs.taxNumber = 'الرقم الضريبي مطلوب للفاتورة الضريبية'

    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setErrors({})
    const { dateRaw, governorate, city, district, street, buildingNo, ...rest } = form
    const addressParts = [governorate, city, district, street, buildingNo].filter(Boolean)
    const orderData = { ...rest, address: addressParts.join(' — ') }

    if (isEdit) {
      updateOrder(editOrder.id, orderData, user)
      toast('تم تحديث الطلب بنجاح ✓', 'success')
    } else {
      addOrder(orderData, user)
      toast('تم إرسال الطلب بنجاح ✓', 'success')
      setForm(emptyForm())
    }

    onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit} className="fade-in">
      <OrderFormFields form={form} setForm={setForm} errors={errors} setErrors={setErrors} />

      <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
        {!isEdit && (
          <button type="button" onClick={() => { setForm(emptyForm()); setErrors({}) }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 20px', border:'1.5px solid #e4eaf3', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, borderRadius:10, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
            <RotateCcw size={14} />
            مسح النموذج
          </button>
        )}
        <button type="submit"
          style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 24px', background:'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, borderRadius:10, border:'none', cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 4px 12px rgba(37,99,235,0.35)' }}>
          <Send size={14} />
          {isEdit ? 'حفظ التعديلات' : 'إرسال الطلب'}
        </button>
      </div>
    </form>
  )
}
