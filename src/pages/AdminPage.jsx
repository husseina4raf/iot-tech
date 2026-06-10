import { useState } from 'react'
import { ClipboardList, Package, BarChart2, History, FileText, Users, Settings } from 'lucide-react'
import OrdersList from '../components/admin/OrdersList'
import InventoryManager from '../components/admin/InventoryManager'
import SalesReports from '../components/admin/SalesReports'
import AuditLog from '../components/admin/AuditLog'
import TaxInvoices from '../components/admin/TaxInvoices'
import UserManager from '../components/admin/UserManager'
import AppSettings from '../components/admin/AppSettings'
import { useOrders } from '../hooks/useOrders'
import { useAuth } from '../hooks/useAuth'

const ALL_TABS = [
  { id:'orders',    label:'الطلبات',          icon:ClipboardList, roles:['admin','super_admin'] },
  { id:'inventory', label:'إدارة المخزون',    icon:Package,       roles:['admin','super_admin'] },
  { id:'reports',   label:'تقارير المبيعات',  icon:BarChart2,     roles:['admin','super_admin'] },
  { id:'users',     label:'المستخدمون',        icon:Users,         roles:['admin','super_admin'] },
  { id:'audit',     label:'سجل التعديلات',    icon:History,       roles:['admin','super_admin'] },
  { id:'tax',       label:'الفواتير الضريبية', icon:FileText,     roles:['admin','super_admin'] },
  { id:'settings',  label:'الإعدادات',         icon:Settings,     roles:['super_admin'] },
]

export default function AdminPage() {
  const [tab, setTab] = useState('orders')
  const { auditLog, taxInvoices } = useOrders()
  const { user } = useAuth()

  const tabs = ALL_TABS.filter(t => t.roles.includes(user?.role))
  const pendingTax = taxInvoices.filter(i => !i.verified).length

  return (
    <div style={{ maxWidth:1100, margin:'0 auto' }}>
      {/* Tab bar */}
      <div style={{ display:'flex', gap:2, padding:5, borderRadius:14, background:'#fff', border:'1px solid #e4eaf3', marginBottom:20, boxShadow:'0 1px 4px rgba(15,23,42,0.05)', overflowX:'auto' }}>
        {tabs.map(({ id, label, icon:Icon }) => {
          const badge = id === 'audit' ? auditLog.length : id === 'tax' ? pendingTax : null
          const active = tab === id
          const isSettings = id === 'settings'
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 16px', borderRadius:10, border:'none', background: active ? (isSettings ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'linear-gradient(135deg,#1d4ed8,#2563eb)') : 'transparent', color: active?'#fff':'#64748b', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Cairo,sans-serif', boxShadow: active ? (isSettings ? '0 3px 10px rgba(124,58,237,0.3)' : '0 3px 10px rgba(37,99,235,0.3)') : 'none', transition:'all 0.15s', whiteSpace:'nowrap', position:'relative', marginRight: isSettings ? 'auto' : 0 }}
              onMouseEnter={e => { if(!active) e.currentTarget.style.background='#f0f4fa' }}
              onMouseLeave={e => { if(!active) e.currentTarget.style.background='transparent' }}>
              <Icon size={14}/>{label}
              {badge > 0 && (
                <span style={{ position:'absolute', top:-4, left:-4, width:16, height:16, borderRadius:'50%', background: active?'#fff':'#e11d48', color: active?'#1d4ed8':'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:`2px solid ${active?'#2563eb':'#fff'}` }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'orders'    && <OrdersList />}
      {tab === 'inventory' && <InventoryManager />}
      {tab === 'reports'   && <SalesReports />}
      {tab === 'users'     && <UserManager />}
      {tab === 'audit'     && <AuditLog />}
      {tab === 'tax'       && <TaxInvoices />}
      {tab === 'settings'  && <AppSettings />}
    </div>
  )
}
