import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { INITIAL_ORDERS, INITIAL_INVENTORY, INITIAL_AUDIT_LOG, INITIAL_TAX_INVOICES } from '../data/mockData'

const OrdersContext = createContext(null)

// ── v3 keys: reset inventory to pick up cost prices ───────────────────────
const KEYS = {
  orders:    'sl_orders_v2',
  inventory: 'sl_inventory_v3',
  audit:     'sl_audit_v2',
  tax:       'sl_tax_v2',
  version:   'sl_data_version',
}
const DATA_VERSION = '3'

function clearOldData() {
  ['sl_orders','sl_inventory','sl_audit','sl_tax','sl_inventory_v2'].forEach(k => localStorage.removeItem(k))
}

function load(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback }
  catch { return fallback }
}

export function OrdersProvider({ children }) {
  // On first mount: clear old v1 data if coming from a previous version
  useEffect(() => {
    if (localStorage.getItem(KEYS.version) !== DATA_VERSION) {
      clearOldData()
      localStorage.setItem(KEYS.version, DATA_VERSION)
    }
  }, [])

  const [orders,      setOrders]      = useState(() => load(KEYS.orders,    INITIAL_ORDERS))
  const [inventory,   setInventory]   = useState(() => load(KEYS.inventory, INITIAL_INVENTORY))
  const [auditLog,    setAuditLog]    = useState(() => load(KEYS.audit,     INITIAL_AUDIT_LOG))
  const [taxInvoices, setTaxInvoices] = useState(() => load(KEYS.tax,       INITIAL_TAX_INVOICES))

  useEffect(() => { localStorage.setItem(KEYS.orders,    JSON.stringify(orders))      }, [orders])
  useEffect(() => { localStorage.setItem(KEYS.inventory, JSON.stringify(inventory))   }, [inventory])
  useEffect(() => { localStorage.setItem(KEYS.audit,     JSON.stringify(auditLog))    }, [auditLog])
  useEffect(() => { localStorage.setItem(KEYS.tax,       JSON.stringify(taxInvoices)) }, [taxInvoices])

  // ── Audit helper ──────────────────────────────────────────────────────────
  const pushAudit = useCallback((entry) => {
    setAuditLog(prev => [{
      id: `al-${Date.now()}`,
      changedAt: new Date().toISOString(),
      ...entry,
    }, ...prev])
  }, [])

  // ── Orders ────────────────────────────────────────────────────────────────
  const getNextSerial = () => {
    const nums = orders.map(o => parseInt(o.serialNumber, 10)).filter(Boolean)
    return String(nums.length ? Math.max(...nums) + 1 : 20240009)
  }

  const addOrder = (orderData, user) => {
    const serial = getNextSerial()
    // Sales reps need team leader approval; admin/super_admin bypass directly to جديد
    const initialStatus = user?.role === 'sales' ? 'بانتظار الموافقة' : 'جديد'
    const newOrder = {
      ...orderData,
      id: `ORD-${serial}`,
      serialNumber: serial,
      status: initialStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editHistory: [],
    }
    setOrders(prev => [newOrder, ...prev])
    pushAudit({
      type: 'order_create',
      orderId: newOrder.id,
      orderRef: `${orderData.clientName} — ${orderData.company}`,
      field: 'إنشاء طلب',
      oldValue: '—',
      newValue: `${orderData.total?.toLocaleString()} LE`,
      changedBy: user?.name || orderData.salesRep || 'مجهول',
      note: '',
    })
    return newOrder
  }

  const updateOrder = (id, orderData, user) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o
      const updated = {
        ...o,
        ...orderData,
        updatedAt: new Date().toISOString(),
        editHistory: [...(o.editHistory || []), {
          editedAt: new Date().toISOString(),
          editedBy: user?.name || 'مجهول',
          note: 'تم التعديل',
        }],
      }
      return updated
    }))
    const order = orders.find(o => o.id === id)
    pushAudit({
      type: 'order_edit',
      orderId: id,
      orderRef: `${order?.clientName} — ${order?.company}`,
      field: 'تعديل الطلب',
      oldValue: `${order?.total?.toLocaleString()} LE`,
      newValue: `${orderData.total?.toLocaleString()} LE`,
      changedBy: user?.name || 'مجهول',
      note: '',
    })
  }

  const updateOrderStatus = (id, status, user) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o
      const updated = { ...o, status, updatedAt: new Date().toISOString() }
      if (status === 'تم الصرف') {
        setInventory(inv => inv.map(item => {
          const match = o.items.find(i =>
            i.name.toLowerCase().includes(item.name.toLowerCase()) ||
            item.name.toLowerCase().includes(i.name.toLowerCase())
          )
          return match ? { ...item, stock: Math.max(0, item.stock - match.quantity) } : item
        }))
      }
      return updated
    }))
    const order = orders.find(o => o.id === id)
    pushAudit({
      type: 'status_change',
      orderId: id,
      orderRef: `${order?.clientName} — ${order?.company}`,
      field: 'الحالة',
      oldValue: order?.status || '—',
      newValue: status,
      changedBy: user?.name || 'مجهول',
      note: '',
    })
  }

  const approveOrder = (id, user) => updateOrderStatus(id, 'جديد', user)
  const rejectOrder  = (id, user) => updateOrderStatus(id, 'مرفوض', user)

  const getOrdersByRep = (rep) => orders.filter(o => o.salesRep === rep)

  // Orders grouped by month for a given rep
  const getOrdersByRepGrouped = (rep) => {
    const repOrders = orders
      .filter(o => o.salesRep === rep)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const grouped = {}
    repOrders.forEach(o => {
      const parts = o.date?.split('-') // DD-MM-YYYY
      if (!parts || parts.length < 3) return
      const key  = `${parts[2]}-${parts[1]}`  // YYYY-MM
      const label = new Date(parts[2], parts[1] - 1, 1)
        .toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })
      if (!grouped[key]) grouped[key] = { label, key, orders: [] }
      grouped[key].orders.push(o)
    })
    // Return sorted desc by key
    return Object.values(grouped).sort((a, b) => b.key.localeCompare(a.key))
  }

  // ── Inventory CRUD ────────────────────────────────────────────────────────
  const addInventoryItem = (item, user) => {
    const newItem = { ...item, id: `inv-${Date.now()}` }
    setInventory(prev => [...prev, newItem])
    pushAudit({ type: 'inventory', orderId: null, orderRef: item.name, field: 'إضافة صنف', oldValue: '—', newValue: `${item.stock} وحدة`, changedBy: user?.name || 'مجهول', note: '' })
    return newItem
  }

  const updateInventoryItem = (id, data, user) => {
    const old = inventory.find(i => i.id === id)
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...data } : i))
    if (old && data.stock !== undefined && data.stock !== old.stock) {
      pushAudit({ type: 'inventory', orderId: null, orderRef: old.name, field: 'تعديل المخزون', oldValue: `${old.stock} وحدة`, newValue: `${data.stock} وحدة`, changedBy: user?.name || 'مجهول', note: data.adjustNote || '' })
    }
  }

  const deleteInventoryItem = (id, user) => {
    const item = inventory.find(i => i.id === id)
    setInventory(prev => prev.filter(i => i.id !== id))
    pushAudit({ type: 'inventory', orderId: null, orderRef: item?.name || id, field: 'حذف صنف', oldValue: `${item?.stock} وحدة`, newValue: '—', changedBy: user?.name || 'مجهول', note: '' })
  }

  // ── Tax Invoices ──────────────────────────────────────────────────────────
  const addTaxInvoice = (invoice, user) => {
    const newInv = { ...invoice, id: `ti-${Date.now()}`, uploadedAt: new Date().toISOString(), uploadedBy: user?.name || 'مجهول', verified: false }
    setTaxInvoices(prev => [newInv, ...prev])
    pushAudit({ type: 'tax_invoice', orderId: invoice.orderId, orderRef: invoice.clientName, field: 'رفع فاتورة ضريبية', oldValue: '—', newValue: invoice.filename, changedBy: user?.name || 'مجهول', note: '' })
    return newInv
  }

  const verifyTaxInvoice = (id, user) => {
    setTaxInvoices(prev => prev.map(i => i.id === id ? { ...i, verified: true } : i))
    const inv = taxInvoices.find(i => i.id === id)
    pushAudit({ type: 'tax_invoice', orderId: null, orderRef: inv?.clientName || id, field: 'اعتماد فاتورة', oldValue: 'غير معتمدة', newValue: 'معتمدة', changedBy: user?.name || 'مجهول', note: '' })
  }

  const deleteTaxInvoice = (id, user) => {
    const inv = taxInvoices.find(i => i.id === id)
    setTaxInvoices(prev => prev.filter(i => i.id !== id))
    pushAudit({ type: 'tax_invoice', orderId: null, orderRef: inv?.clientName || id, field: 'حذف فاتورة ضريبية', oldValue: inv?.filename || '—', newValue: '—', changedBy: user?.name || 'مجهول', note: '' })
  }

  return (
    <OrdersContext.Provider value={{
      orders, inventory, auditLog, taxInvoices,
      addOrder, updateOrder, updateOrderStatus, approveOrder, rejectOrder,
      getOrdersByRep, getOrdersByRepGrouped,
      addInventoryItem, updateInventoryItem, deleteInventoryItem,
      addTaxInvoice, verifyTaxInvoice, deleteTaxInvoice,
    }}>
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider')
  return ctx
}
