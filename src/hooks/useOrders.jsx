import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const OrdersContext = createContext(null)

// ── DB row → app object (snake_case → camelCase) ──────────────────────────────
const mapOrder = r => ({
  id: r.id, serialNumber: r.serial_number,
  clientName: r.client_name, company: r.company,
  mobile: r.mobile, whatsapp: r.whatsapp,
  address: r.address, locationLink: r.location_link,
  salesRep: r.sales_rep, items: r.items || [],
  subtotal: r.subtotal, vatPercent: r.vat_percent,
  vatAmount: r.vat_amount, total: r.total,
  invoiceType: r.invoice_type, invoiceName: r.invoice_name,
  taxNumber: r.tax_number, notes: r.notes,
  paymentMethod: r.payment_method, date: r.date, time: r.time,
  status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
  editHistory: r.edit_history || [],
})

const mapItem = r => ({
  id: r.id, name: r.name, sku: r.sku, model: r.model,
  brand: r.brand, category: r.category,
  price: r.price, costPrice: r.cost_price,
  stock: r.stock, lots: r.lots || [],
  description: r.description, warranty: r.warranty,
})

const mapAudit = r => ({
  id: r.id, type: r.type, orderId: r.order_id,
  orderRef: r.order_ref, field: r.field,
  oldValue: r.old_value, newValue: r.new_value,
  changedBy: r.changed_by, note: r.note, changedAt: r.changed_at,
})

const mapTax = r => ({
  id: r.id, orderId: r.order_id, clientName: r.client_name,
  filename: r.filename, amount: r.amount, invoiceDate: r.invoice_date,
  uploadedAt: r.uploaded_at, uploadedBy: r.uploaded_by, verified: r.verified,
})

export function OrdersProvider({ children }) {
  const [orders,      setOrders]      = useState([])
  const [inventory,   setInventory]   = useState([])
  const [auditLog,    setAuditLog]    = useState([])
  const [taxInvoices, setTaxInvoices] = useState([])

  // ── Initial fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('inventory').select('*').order('created_at'),
      supabase.from('audit_log').select('*').order('changed_at', { ascending: false }),
      supabase.from('tax_invoices').select('*').order('uploaded_at', { ascending: false }),
    ]).then(([o, inv, al, ti]) => {
      setOrders((o.data || []).map(mapOrder))
      setInventory((inv.data || []).map(mapItem))
      setAuditLog((al.data || []).map(mapAudit))
      setTaxInvoices((ti.data || []).map(mapTax))
    })

    // ── Real-time subscriptions ───────────────────────────────────────────────
    const ch = supabase.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, p => {
        // Skip INSERT if already added optimistically
        if (p.eventType === 'INSERT') setOrders(prev => prev.some(o => o.id === p.new.id) ? prev : [mapOrder(p.new), ...prev])
        if (p.eventType === 'UPDATE') setOrders(prev => prev.map(o => o.id === p.new.id ? mapOrder(p.new) : o))
        if (p.eventType === 'DELETE') setOrders(prev => prev.filter(o => o.id !== p.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, p => {
        if (p.eventType === 'INSERT') setInventory(prev => prev.some(i => i.id === p.new.id) ? prev : [...prev, mapItem(p.new)])
        if (p.eventType === 'UPDATE') setInventory(prev => prev.map(i => i.id === p.new.id ? mapItem(p.new) : i))
        if (p.eventType === 'DELETE') setInventory(prev => prev.filter(i => i.id !== p.old.id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, p => {
        setAuditLog(prev => prev.some(a => a.id === p.new.id) ? prev : [mapAudit(p.new), ...prev])
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tax_invoices' }, p => {
        if (p.eventType === 'INSERT') setTaxInvoices(prev => prev.some(i => i.id === p.new.id) ? prev : [mapTax(p.new), ...prev])
        if (p.eventType === 'UPDATE') setTaxInvoices(prev => prev.map(i => i.id === p.new.id ? mapTax(p.new) : i))
        if (p.eventType === 'DELETE') setTaxInvoices(prev => prev.filter(i => i.id !== p.old.id))
      })
      .subscribe()

    // ── Refetch when user returns to the tab (handles dropped real-time) ────────
    const refetch = () => {
      supabase.from('orders').select('*').order('created_at', { ascending: false })
        .then(({ data }) => data && setOrders(data.map(mapOrder)))
      supabase.from('inventory').select('*').order('created_at')
        .then(({ data }) => data && setInventory(data.map(mapItem)))
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refetch() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // ── Audit helper ──────────────────────────────────────────────────────────────
  const pushAudit = useCallback(async (entry) => {
    await supabase.from('audit_log').insert({
      id:         `al-${Date.now()}`,
      changed_at: new Date().toISOString(),
      type:       entry.type,
      order_id:   entry.orderId   || null,
      order_ref:  entry.orderRef  || null,
      field:      entry.field     || null,
      old_value:  entry.oldValue  || null,
      new_value:  entry.newValue  || null,
      changed_by: entry.changedBy || null,
      note:       entry.note      || null,
    })
  }, [])

  // ── Orders ────────────────────────────────────────────────────────────────────
  const getNextSerial = () => {
    const nums = orders.map(o => parseInt(o.serialNumber, 10)).filter(Boolean)
    return String(nums.length ? Math.max(...nums) + 1 : 20240001)
  }

  const addOrder = async (orderData, user) => {
    const serial = getNextSerial()
    const row = {
      id: `ORD-${serial}`, serial_number: serial,
      client_name: orderData.clientName, company: orderData.company,
      mobile: orderData.mobile, whatsapp: orderData.whatsapp,
      address: orderData.address, location_link: orderData.locationLink,
      sales_rep: orderData.salesRep, items: orderData.items,
      subtotal: orderData.subtotal, vat_percent: orderData.vatPercent,
      vat_amount: orderData.vatAmount, total: orderData.total,
      invoice_type: orderData.invoiceType, invoice_name: orderData.invoiceName,
      tax_number: orderData.taxNumber, notes: orderData.notes,
      payment_method: orderData.paymentMethod,
      date: orderData.date, time: orderData.time,
      status: 'بانتظار الموافقة',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      edit_history: [],
    }
    // Optimistic update — add to local state immediately
    setOrders(prev => [mapOrder(row), ...prev])
    await supabase.from('orders').insert(row)
    await pushAudit({
      type: 'order_create', orderId: row.id,
      orderRef: `${orderData.clientName} — ${orderData.company}`,
      field: 'إنشاء طلب', oldValue: '—',
      newValue: `${orderData.total?.toLocaleString()} LE`,
      changedBy: user?.name || orderData.salesRep || 'مجهول',
    })
    return mapOrder(row)
  }

  const updateOrder = async (id, orderData, user) => {
    const order = orders.find(o => o.id === id)
    const editHistory = [...(order?.editHistory || []), {
      editedAt: new Date().toISOString(),
      editedBy: user?.name || 'مجهول',
      note: 'تم التعديل',
    }]
    const updatedRow = {
      client_name: orderData.clientName, company: orderData.company,
      mobile: orderData.mobile, whatsapp: orderData.whatsapp,
      address: orderData.address, location_link: orderData.locationLink,
      sales_rep: orderData.salesRep, items: orderData.items,
      subtotal: orderData.subtotal, vat_percent: orderData.vatPercent,
      vat_amount: orderData.vatAmount, total: orderData.total,
      invoice_type: orderData.invoiceType, invoice_name: orderData.invoiceName,
      tax_number: orderData.taxNumber, notes: orderData.notes,
      payment_method: orderData.paymentMethod,
      date: orderData.date, time: orderData.time,
      updated_at: new Date().toISOString(),
      edit_history: editHistory,
    }
    // Optimistic update — reflect edit immediately
    setOrders(prev => prev.map(o => o.id === id ? {
      ...o,
      clientName: orderData.clientName, company: orderData.company,
      mobile: orderData.mobile, whatsapp: orderData.whatsapp,
      address: orderData.address, locationLink: orderData.locationLink,
      salesRep: orderData.salesRep, items: orderData.items,
      subtotal: orderData.subtotal, vatPercent: orderData.vatPercent,
      vatAmount: orderData.vatAmount, total: orderData.total,
      invoiceType: orderData.invoiceType, invoiceName: orderData.invoiceName,
      taxNumber: orderData.taxNumber, notes: orderData.notes,
      paymentMethod: orderData.paymentMethod, date: orderData.date, time: orderData.time,
      updatedAt: new Date().toISOString(), editHistory: editHistory,
    } : o))
    await supabase.from('orders').update(updatedRow).eq('id', id)
    await pushAudit({
      type: 'order_edit', orderId: id,
      orderRef: `${order?.clientName} — ${order?.company}`,
      field: 'تعديل الطلب',
      oldValue: `${order?.total?.toLocaleString()} LE`,
      newValue: `${orderData.total?.toLocaleString()} LE`,
      changedBy: user?.name || 'مجهول',
    })
  }

  const updateOrderStatus = async (id, status, user) => {
    const order = orders.find(o => o.id === id)
    // Optimistic update — change status immediately in local state
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)

    if (status === 'تم الصرف' && order) {
      for (const item of order.items) {
        const invItem = inventory.find(i =>
          i.name.toLowerCase().includes(item.name.toLowerCase()) ||
          item.name.toLowerCase().includes(i.name.toLowerCase())
        )
        if (!invItem) continue
        const soldQty = Number(item.quantity) || 0
        let remaining = soldQty
        const newLots = (invItem.lots || []).map(lot => {
          if (remaining <= 0) return lot
          const consume = Math.min(remaining, lot.qty)
          remaining -= consume
          return { ...lot, qty: lot.qty - consume }
        }).filter(lot => lot.qty > 0)
        const newStock = Math.max(0, invItem.stock - soldQty)
        const fifoCost = newLots.length > 0 ? newLots[0].costPrice : (invItem.costPrice || 0)
        await supabase.from('inventory').update({ stock: newStock, lots: newLots, cost_price: fifoCost }).eq('id', invItem.id)
      }
    }

    await pushAudit({
      type: 'status_change', orderId: id,
      orderRef: `${order?.clientName} — ${order?.company}`,
      field: 'الحالة', oldValue: order?.status || '—', newValue: status,
      changedBy: user?.name || 'مجهول',
    })
  }

  const approveOrder = (id, user) => updateOrderStatus(id, 'موافق عليه', user)
  const rejectOrder  = (id, user) => updateOrderStatus(id, 'مرفوض', user)

  const getOrdersByRep = (rep) => orders.filter(o => o.salesRep === rep)

  const getOrdersByRepGrouped = (rep) => {
    const repOrders = orders.filter(o => o.salesRep === rep)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const grouped = {}
    repOrders.forEach(o => {
      const parts = o.date?.split('-')
      if (!parts || parts.length < 3) return
      const key   = `${parts[2]}-${parts[1]}`
      const label = new Date(parts[2], parts[1] - 1, 1).toLocaleDateString('ar-EG', { year:'numeric', month:'long' })
      if (!grouped[key]) grouped[key] = { label, key, orders: [] }
      grouped[key].orders.push(o)
    })
    return Object.values(grouped).sort((a, b) => b.key.localeCompare(a.key))
  }

  // ── Inventory ─────────────────────────────────────────────────────────────────
  const addInventoryItem = async (item, user) => {
    const qty  = Number(item.stock) || 0
    const lots = qty > 0 ? [{ id:`lot-${Date.now()}`, qty, costPrice:Number(item.costPrice)||0, date:new Date().toISOString().split('T')[0], note:'دفعة أولى' }] : []
    const row  = {
      id:`inv-${Date.now()}`, name:item.name, sku:item.sku||null,
      model:item.model||null, brand:item.brand||null, category:item.category||null,
      price:Number(item.price)||0, cost_price:Number(item.costPrice)||0,
      stock:qty, lots, description:item.description||null, warranty:item.warranty||null,
    }
    await supabase.from('inventory').insert(row)
    await pushAudit({ type:'inventory', orderRef:item.name, field:'إضافة صنف', oldValue:'—', newValue:`${qty} وحدة`, changedBy:user?.name||'مجهول' })
  }

  const addStockLot = async (itemId, { qty, costPrice, note }, user) => {
    // Always fetch fresh data from Supabase to avoid stale local state
    const { data: fresh } = await supabase.from('inventory').select('*').eq('id', itemId).single()
    const item = fresh ? mapItem(fresh) : inventory.find(i => i.id === itemId)
    if (!item) return
    const newLot      = { id:`lot-${Date.now()}`, qty:Number(qty), costPrice:Number(costPrice), date:new Date().toISOString().split('T')[0], note:note||'' }
    const updatedLots = [...(item.lots||[]), newLot]
    const newStock    = updatedLots.reduce((s,l)=>s+(Number(l.qty)||0), 0)
    const fifoCost    = updatedLots[0]?.costPrice ?? Number(costPrice)
    setInventory(prev => prev.map(i => i.id === itemId ? { ...i, lots:updatedLots, stock:newStock, costPrice:fifoCost } : i))
    await supabase.from('inventory').update({ lots:updatedLots, stock:newStock, cost_price:fifoCost }).eq('id', itemId)
    await pushAudit({ type:'inventory', orderRef:item.name, field:'إضافة دفعة', oldValue:`${item.stock} وحدة`, newValue:`+${qty} وحدة × ${costPrice} LE`, changedBy:user?.name||'مجهول', note:note||'' })
  }

  const updateStockLot = async (itemId, lotId, { qty, costPrice, note }, user) => {
    const item    = inventory.find(i => i.id === itemId)
    if (!item) return
    const oldLot  = item.lots?.find(l => l.id === lotId)
    const newLots  = (item.lots||[]).map(l => l.id===lotId ? {...l, qty:Number(qty), costPrice:Number(costPrice), note:note??l.note} : l)
    const newStock = newLots.reduce((s,l)=>s+l.qty, 0)
    const fifoCost = newLots[0]?.costPrice ?? Number(costPrice)
    setInventory(prev => prev.map(i => i.id === itemId ? { ...i, lots:newLots, stock:newStock, costPrice:fifoCost } : i))
    await supabase.from('inventory').update({ lots:newLots, stock:newStock, cost_price:fifoCost }).eq('id', itemId)
    await pushAudit({ type:'inventory', orderRef:item.name, field:'تعديل دفعة', oldValue:`${oldLot?.qty} وحدة × ${oldLot?.costPrice} LE`, newValue:`${qty} وحدة × ${costPrice} LE`, changedBy:user?.name||'مجهول', note:note||'' })
  }

  const updateInventoryItem = async (id, data, user) => {
    const old = inventory.find(i => i.id === id)
    const upd = {}
    if (data.name        !== undefined) upd.name        = data.name
    if (data.sku         !== undefined) upd.sku         = data.sku
    if (data.model       !== undefined) upd.model       = data.model
    if (data.brand       !== undefined) upd.brand       = data.brand
    if (data.category    !== undefined) upd.category    = data.category
    if (data.price       !== undefined) upd.price       = data.price
    if (data.costPrice   !== undefined) upd.cost_price  = data.costPrice
    if (data.stock       !== undefined) upd.stock       = data.stock
    if (data.description !== undefined) upd.description = data.description
    if (data.warranty    !== undefined) upd.warranty    = data.warranty
    // Optimistic update
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...data, costPrice: data.costPrice ?? i.costPrice } : i))
    if (Object.keys(upd).length) await supabase.from('inventory').update(upd).eq('id', id)
    if (old && data.stock !== undefined && data.stock !== old.stock)
      await pushAudit({ type:'inventory', orderRef:old.name, field:'تعديل المخزون', oldValue:`${old.stock} وحدة`, newValue:`${data.stock} وحدة`, changedBy:user?.name||'مجهول', note:data.adjustNote||'' })
  }

  const deleteInventoryItem = async (id, user) => {
    const item = inventory.find(i => i.id === id)
    await supabase.from('inventory').delete().eq('id', id)
    await pushAudit({ type:'inventory', orderRef:item?.name||id, field:'حذف صنف', oldValue:`${item?.stock} وحدة`, newValue:'—', changedBy:user?.name||'مجهول' })
  }

  // ── Tax Invoices ──────────────────────────────────────────────────────────────
  const addTaxInvoice = async (invoice, user) => {
    const row = {
      id:`ti-${Date.now()}`, order_id:invoice.orderId||null,
      client_name:invoice.clientName, filename:invoice.filename,
      amount:invoice.amount||null, invoice_date:invoice.invoiceDate||null,
      uploaded_at:new Date().toISOString(), uploaded_by:user?.name||'مجهول', verified:false,
    }
    await supabase.from('tax_invoices').insert(row)
    await pushAudit({ type:'tax_invoice', orderId:invoice.orderId, orderRef:invoice.clientName, field:'رفع فاتورة ضريبية', oldValue:'—', newValue:invoice.filename, changedBy:user?.name||'مجهول' })
    return mapTax(row)
  }

  const verifyTaxInvoice = async (id, user) => {
    const inv = taxInvoices.find(i => i.id === id)
    await supabase.from('tax_invoices').update({ verified:true }).eq('id', id)
    await pushAudit({ type:'tax_invoice', orderRef:inv?.clientName||id, field:'اعتماد فاتورة', oldValue:'غير معتمدة', newValue:'معتمدة', changedBy:user?.name||'مجهول' })
  }

  const deleteTaxInvoice = async (id, user) => {
    const inv = taxInvoices.find(i => i.id === id)
    await supabase.from('tax_invoices').delete().eq('id', id)
    await pushAudit({ type:'tax_invoice', orderRef:inv?.clientName||id, field:'حذف فاتورة ضريبية', oldValue:inv?.filename||'—', newValue:'—', changedBy:user?.name||'مجهول' })
  }

  return (
    <OrdersContext.Provider value={{
      orders, inventory, auditLog, taxInvoices,
      addOrder, updateOrder, updateOrderStatus, approveOrder, rejectOrder,
      getOrdersByRep, getOrdersByRepGrouped,
      addInventoryItem, addStockLot, updateStockLot, updateInventoryItem, deleteInventoryItem,
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
