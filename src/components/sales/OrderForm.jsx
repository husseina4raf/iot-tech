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
    address: '', locationLink: '',
    items: [{ id: Date.now().toString(), name: '', sku: '', model: '', price: 0, quantity: 1, total: 0 }],
    subtotal: 0, vatPercent: 14, vatAmount: 0, total: 0,
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
        dateRaw: editOrder.date ? editOrder.date.split('-').reverse().join('-') : new Date().toISOString().split('T')[0],
      }
    }
    return emptyForm()
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.company.trim()) return toast('يرجى إدخال اسم الشركة أو العميل', 'error')
    if (!form.clientName.trim()) return toast('يرجى إدخال اسم العميل', 'error')
    if (!form.salesRep) return toast('يرجى اختيار مندوب المبيعات', 'error')
    if (form.items.some(i => !i.name.trim())) return toast('يرجى إدخال أسماء جميع الأصناف', 'error')
    if (form.total <= 0) return toast('يرجى إدخال أصناف بقيمة صحيحة', 'error')

    const { dateRaw, ...orderData } = form

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
      <OrderFormFields form={form} setForm={setForm} />

      <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
        {!isEdit && (
          <button type="button" onClick={() => setForm(emptyForm())}
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
