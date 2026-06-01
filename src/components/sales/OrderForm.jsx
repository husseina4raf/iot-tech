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
    items: [{ id: Date.now().toString(), name: '', model: '', price: 0, quantity: 1, total: 0 }],
    subtotal: 0, vatPercent: 1, vatAmount: 0, total: 0,
    invoiceType: 'بيان اسعار', invoiceName: '', taxNumber: '',
    notes: '', paymentMethod: 'كاش',
    dateRaw: new Date().toISOString().split('T')[0],
    date: new Date().toLocaleDateString('en-GB').replace(/\//g, '-'),
    time: new Date().toTimeString().slice(0, 5),
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
      updateOrder(editOrder.id, orderData)
      toast('تم تحديث الطلب بنجاح ✓', 'success')
    } else {
      addOrder(orderData)
      toast('تم إرسال الطلب بنجاح ✓', 'success')
      setForm(emptyForm())
    }

    onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit} className="fade-in">
      <OrderFormFields form={form} setForm={setForm} />

      <div className="flex gap-3 mt-6 justify-end">
        {!isEdit && (
          <button type="button" onClick={() => setForm(emptyForm())}
            className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors">
            <RotateCcw size={15} />
            مسح النموذج
          </button>
        )}
        <button type="submit"
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/25">
          <Send size={15} />
          {isEdit ? 'حفظ التعديلات' : 'إرسال الطلب'}
        </button>
      </div>
    </form>
  )
}
