import { RotateCcw, Trash2, Ban, Package } from 'lucide-react'
import { useOrders } from '../../hooks/useOrders'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/Toast'

const card = { background: '#fff', borderRadius: 14, border: '1px solid #e4eaf3', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }

const STATUS_COLORS = {
  'بانتظار الموافقة': '#f97316', 'جديد': '#2563eb', 'موافق عليه': '#059669',
  'تم الصرف': '#d97706', 'مكتمل': '#7c3aed', 'تم التحصيل': '#10b981', 'مرفوض': '#e11d48',
}

export default function CancelledOrders() {
  const { cancelledOrders, restoreOrder, deleteOrder } = useOrders()
  const { user } = useAuth()
  const toast = useToast()

  const onRestore = (order) => {
    if (!window.confirm(`هل تريد استعادة طلب "${order.clientName}"؟\nسيعود الطلب إلى حالته السابقة.`)) return
    restoreOrder(order.id, user)
    toast('تمت استعادة الطلب ✓', 'success')
  }

  const onDelete = (order) => {
    if (!window.confirm(`هل أنت متأكد من الحذف النهائي لطلب "${order.clientName}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) return
    deleteOrder(order.id, user)
    toast('تم الحذف النهائي للطلب', 'success')
  }

  if (cancelledOrders.length === 0) {
    return (
      <div style={{ ...card, padding: 60, textAlign: 'center' }}>
        <Ban size={40} color="#e4eaf3" style={{ margin: '0 auto 12px' }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8' }}>لا توجد طلبات ملغاة</p>
        <p style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>الطلبات الملغاة تظهر هنا ويمكن استعادتها</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Ban size={16} color="#c2410c" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>الطلبات الملغاة</span>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontWeight: 700 }}>
          {cancelledOrders.length} طلب
        </span>
        <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 'auto' }}>يمكن استعادة أي طلب إلى حالته السابقة</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cancelledOrders.map(order => {
          const cancelEntry = [...(order.editHistory || [])].reverse().find(h => h.type === 'cancellation')
          const prevStatus = cancelEntry?.previousStatus
          const cancelledBy = cancelEntry?.cancelledBy
          const cancelledAt = cancelEntry?.cancelledAt
            ? new Date(cancelEntry.cancelledAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' })
            : null

          return (
            <div key={order.id} style={{ ...card, borderRight: '3px solid #e4eaf3', overflow: 'hidden', opacity: 0.9 }}>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#475569', textDecoration: 'line-through' }}>{order.clientName}</span>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ fontSize: 13, color: '#94a3b8' }}>{order.company}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#94a3b8', flexWrap: 'wrap' }}>
                      <span>#{order.serialNumber}</span>
                      <span>{order.salesRep}</span>
                      <span>{order.date}</span>
                      <span><Package size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> {order.items?.length} صنف</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'left', flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#94a3b8', textDecoration: 'line-through' }} dir="ltr">
                      {order.total?.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 400 }}>LE</span>
                    </div>
                    {prevStatus && (
                      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: '#f8fafc', color: STATUS_COLORS[prevStatus] || '#64748b', border: `1px solid ${STATUS_COLORS[prevStatus] || '#e4eaf3'}22`, fontWeight: 700 }}>
                          كانت: {prevStatus}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {(cancelledBy || cancelledAt) && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, padding: '6px 10px', borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Ban size={10} color="#c2410c" />
                    <span>ألغي بواسطة <strong style={{ color: '#c2410c' }}>{cancelledBy}</strong>{cancelledAt ? ` — ${cancelledAt}` : ''}</span>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => onRestore(order)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                    <RotateCcw size={13} />استعادة الطلب
                  </button>

                  {user?.role === 'super_admin' && (
                    <button onClick={() => onDelete(order)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1.5px solid #fecdd3', background: '#fff1f2', color: '#e11d48', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#ffe4e6'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff1f2'}>
                      <Trash2 size={12} />حذف نهائي
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
