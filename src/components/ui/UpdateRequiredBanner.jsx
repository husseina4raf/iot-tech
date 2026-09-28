import { RefreshCw } from 'lucide-react'
import { useUpdateRequired } from '../../hooks/useUpdateRequired'

export default function UpdateRequiredBanner() {
  const required = useUpdateRequired()
  if (!required) return null

  return (
    <div role="alert" dir="rtl"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100000, background: '#1d4ed8', color: '#fff',
               padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
               fontFamily: 'Cairo,sans-serif', fontSize: 13, fontWeight: 600, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
      <span>تم إصدار نسخة جديدة من النظام — يرجى التحديث الآن حتى تعمل جميع العمليات بشكل صحيح.</span>
      <button onClick={() => window.location.reload()}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none',
                 background: '#fff', color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
        <RefreshCw size={13} /> تحديث الصفحة
      </button>
    </div>
  )
}
