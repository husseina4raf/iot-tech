import { useState, useRef } from 'react'
import { Send, RotateCcw, RefreshCw } from 'lucide-react'
import OrderFormFields from './OrderFormFields'
import { useOrders } from '../../hooks/useOrders'
import { useToast } from '../ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { parseOrderQuantity, areOrderItemsLocked, newClientRequestId } from '../../lib/orderInventory'

export default function OrderForm({ editOrder = null, onSaved }) {
  const { addOrder, updateOrder, resubmitOrder, inventory } = useOrders()
  const { user } = useAuth()
  const toast = useToast()
  const isEdit = !!editOrder
  const [submitting, setSubmitting] = useState(false)
  // Items/SKUs/quantities are frozen while the order holds stock (the database enforces it too)
  const itemsLocked = isEdit && areOrderItemsLocked(editOrder)
  // One request id per submission INTENT: reused only for a retry of the identical payload
  // (e.g. after a lost response), replaced as soon as the user changes anything or succeeds.
  const requestRef = useRef({ id: null, fingerprint: null })

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
        governorate: editOrder.governorate || '',
        city:        editOrder.city        || '',
        district:    editOrder.district    || '',
        street:      editOrder.street      || editOrder.address || '',
        buildingNo:  editOrder.buildingNo  || '',
        dateRaw: editOrder.date ? editOrder.date.split('-').reverse().join('-') : new Date().toISOString().split('T')[0],
      }
    }
    return emptyForm()
  })

  const [errors, setErrors] = useState({})

  const validatePhone = (num) => {
    const s = (num || '').trim()
    if (!s) return null
    if (s.startsWith('+20')) {
      // Egyptian number: local part must be 01XXXXXXXXX
      return /^01[0-9]{9}$/.test(s.slice(3)) ? null : 'رقم غير صحيح — يجب أن يبدأ بـ 01 ويتكون من 11 رقم'
    }
    if (s.startsWith('+')) {
      // International: total digits (country code + local) must be 7–15
      const digits = s.replace(/\D/g, '')
      return (digits.length >= 7 && digits.length <= 15) ? null : 'رقم دولي غير صحيح — يجب أن يتكون من 7 إلى 15 رقم'
    }
    // Legacy format without +: treat as Egyptian
    return /^01[0-9]{9}$/.test(s) ? null : 'رقم غير صحيح — يجب أن يبدأ بـ 01 ويتكون من 11 رقم'
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = {}

    if (!form.company.trim())     errs.company    = 'اسم الشركة أو العميل مطلوب'
    if (!form.clientName.trim())  errs.clientName = 'اسم العميل مطلوب'
    if (!form.salesRep)           errs.salesRep   = 'يرجى اختيار مندوب المبيعات'

    if (!form.mobile.trim()) {
      errs.mobile = 'رقم الموبايل مطلوب'
    } else {
      const mErr = validatePhone(form.mobile)
      if (mErr) errs.mobile = mErr
    }
    if (!form.whatsapp.trim()) {
      errs.whatsapp = 'رقم الواتساب مطلوب'
    } else {
      const wErr = validatePhone(form.whatsapp)
      if (wErr) errs.whatsapp = wErr
    }

    if (!form.governorate?.trim()) errs.governorate = 'المحافظة مطلوبة'
    if (!form.city?.trim())        errs.city        = 'المدينة / المركز مطلوب'
    if (!form.street?.trim())      errs.street      = 'الشارع مطلوب'
    if (!form.time?.trim())        errs.time        = 'وقت التركيب مطلوب'

    if (form.items.some(i => !i.name.trim()))  errs.items = 'يرجى إدخال أسماء جميع الأصناف'

    // Immediate feedback only — the database re-validates every quantity
    // (create_order / resubmit_order) and is the authority.
    if (!errs.items) {
      const badQty = form.items.find(i => parseOrderQuantity(i.quantity) === null)
      if (badQty) errs.items = `الكمية غير صحيحة للصنف "${badQty.name}" — يجب أن تكون عدداً صحيحاً أكبر من صفر`
    }
    if (form.total <= 0)                        errs.items = errs.items || 'يرجى إدخال أصناف بأسعار صحيحة'

    if (!errs.items) {
      const outOfStock = form.items.filter(i => {
        if (!i.name.trim()) return false
        // SKU-first, like the server: name is not unique
        const sku = (i.sku || '').trim().toLowerCase()
        const inv = sku
          ? inventory.find(p => (p.sku || '').trim().toLowerCase() === sku)
          : inventory.find(p => p.name === i.name)
        return inv && inv.stock === 0
      })
      if (outOfStock.length > 0) {
        const names = outOfStock.map(i => i.name).join('، ')
        errs.items = `هذا المنتج غير متاح حالياً في المخزن ولا يمكن إنشاء الطلب: ${names}`
      }
    }
    if (!form.locationLink?.trim()) errs.locationLink  = 'رابط الموقع على الخريطة مطلوب'
    if (!form.invoiceName?.trim())  errs.invoiceName   = 'الفاتورة باسم مين مطلوب'
    if (!form.paymentMethod)        errs.paymentMethod = 'طريقة الدفع مطلوبة'
    if (form.invoiceType === 'فاتورة ضريبية' && !form.taxNumber?.trim()) errs.taxNumber = 'الرقم الضريبي مطلوب للفاتورة الضريبية'

    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setErrors({})
    const { dateRaw, ...rest } = form
    const addressParts = [form.governorate, form.city, form.district, form.street, form.buildingNo].filter(Boolean)
    const orderData = {
      ...rest,
      address: addressParts.join(' — '),
      // Send quantities as validated integers, never the raw input string
      items: form.items.map(i => ({ ...i, quantity: parseOrderQuantity(i.quantity) })),
    }

    if (isEdit) {
      const wasRejected = ['مرفوض', 'جديد'].includes(editOrder.status)
      if (wasRejected) {
        // Resubmitting after a return-to-Sales/rejection must re-deduct
        // inventory with the FINAL edited quantities, atomically and
        // idempotently — see resubmit_order() in order_creation.sql. Must
        // wait for confirmed success before reporting success, exactly
        // like a brand-new order below.
        setSubmitting(true)
        try {
          await resubmitOrder(editOrder.id, { ...orderData, expectedUpdatedAt: editOrder.updatedAt }, user)
          toast('تم إرسال الطلب للمراجعة مجدداً ✓', 'success')
          onSaved?.()
        } catch (err) {
          toast(err.message || 'تعذر إرسال الطلب — يرجى المحاولة مرة أخرى.', 'error')
        } finally {
          setSubmitting(false)
        }
        return
      }
      // Plain edit: wait for the database to confirm before reporting success. On failure
      // (stale form, reserved items, permission…) the form keeps what the user typed and the
      // order is re-read by the hook so the screen never shows unsaved values as saved.
      setSubmitting(true)
      try {
        await updateOrder(editOrder.id, { ...orderData, expectedUpdatedAt: editOrder.updatedAt }, user)
        toast('تم تحديث الطلب بنجاح ✓', 'success')
        onSaved?.()
      } catch (err) {
        toast(err.message || 'تعذر حفظ التعديلات — يرجى المحاولة مرة أخرى.', 'error')
      } finally {
        setSubmitting(false)
      }
      return
    }

    // New order: wait for confirmed database success before showing success
    // or clearing the form. Success is only ever reported once addOrder()
    // has actually resolved; on failure the form keeps everything the user
    // typed, so they can just retry instead of re-entering the whole order.
    const fingerprint = JSON.stringify(orderData)
    if (!requestRef.current.id || requestRef.current.fingerprint !== fingerprint) {
      requestRef.current = { id: newClientRequestId(), fingerprint }
    }
    setSubmitting(true)
    try {
      await addOrder({ ...orderData, clientRequestId: requestRef.current.id }, user)
      requestRef.current = { id: null, fingerprint: null }
      toast('تم إرسال الطلب بنجاح ✓', 'success')
      setForm(emptyForm())
      onSaved?.()
    } catch (err) {
      // The id stays for a retry of the same payload — if the first attempt actually
      // committed, the retry returns that order instead of creating a second one.
      if (/معرّف الطلب/.test(err.message || '')) requestRef.current = { id: null, fingerprint: null }
      toast(err.message || 'تعذر حفظ الطلب — يرجى المحاولة مرة أخرى.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="fade-in">
      <OrderFormFields form={form} setForm={setForm} errors={errors} setErrors={setErrors} itemsLocked={itemsLocked} />

      <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
        {!isEdit && (
          <button type="button" onClick={() => { setForm(emptyForm()); setErrors({}); requestRef.current = { id: null, fingerprint: null } }}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 20px', border:'1.5px solid #e4eaf3', background:'#fff', color:'#475569', fontSize:13, fontWeight:600, borderRadius:10, cursor:'pointer', fontFamily:'Cairo,sans-serif' }}>
            <RotateCcw size={14} />
            مسح النموذج
          </button>
        )}
        <button type="submit" disabled={submitting}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 24px', background: submitting ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color:'#fff', fontSize:13, fontWeight:700, borderRadius:10, border:'none', cursor: submitting ? 'wait' : 'pointer', fontFamily:'Cairo,sans-serif', boxShadow:'0 4px 12px rgba(37,99,235,0.35)' }}>
          {submitting ? <RefreshCw size={14} style={{ animation:'spin 0.7s linear infinite' }} /> : <Send size={14} />}
          {submitting ? 'جارٍ الإرسال...' : (isEdit ? 'حفظ التعديلات' : 'إرسال الطلب')}
        </button>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </form>
  )
}
