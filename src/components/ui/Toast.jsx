import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

const ToastContext = createContext(null)

const cfg = {
  success:{ Icon:CheckCircle, bg:'#ecfdf5', border:'#a7f3d0', color:'#065f46', ic:'#10b981' },
  error:  { Icon:XCircle,     bg:'#fff1f2', border:'#fecdd3', color:'#9f1239', ic:'#f43f5e' },
  warning:{ Icon:AlertCircle, bg:'#fffbeb', border:'#fde68a', color:'#92400e', ic:'#f59e0b' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const add = useCallback((message, type='success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, message, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }, [])
  const remove = useCallback((id) => setToasts(p => p.filter(t => t.id !== id)), [])

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div style={{ position:'fixed', top:20, left:20, zIndex:9999, display:'flex', flexDirection:'column', gap:8, direction:'rtl' }}>
        {toasts.map(t => {
          const c = cfg[t.type]||cfg.success
          return (
            <div key={t.id} className="toast-enter" style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:12, minWidth:280, maxWidth:360, background:c.bg, border:`1px solid ${c.border}`, boxShadow:'0 8px 24px rgba(0,0,0,0.1)' }}>
              <c.Icon size={16} color={c.ic} style={{ flexShrink:0 }} />
              <span style={{ fontSize:13, fontWeight:600, flex:1, color:'#0f172a' }}>{t.message}</span>
              <button onClick={()=>remove(t.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0, display:'flex' }}>
                <X size={13}/>
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
