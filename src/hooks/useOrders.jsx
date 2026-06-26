import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { mapOrder, mapItem, mapAudit, mapTax } from '../lib/mappers'

const OrdersContext = createContext(null)

const PAGE_SIZE = 100

export function OrdersProvider({ children }) {
  const toast = useToast()
  const [orders,      setOrders]      = useState([])
  const [inventory,   setInventory]   = useState([])
  const [auditLog,    setAuditLog]    = useState([])
  const [taxInvoices, setTaxInvoices] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [hasMoreOrders, setHasMoreOrders] = useState(false)
  const [ordersPage,    setOrdersPage]    = useState(0)
  // Tracks inventory item IDs we just wrote to — blocks stale real-time events
  const pendingInvWrites = useRef(new Set())

  const loadMoreOrders = useCallback(async () => {
    const next = ordersPage + 1
    const from = next * PAGE_SIZE
    const { data, error } = await supabase
      .from('orders').select('*').order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) { console.error('loadMoreOrders:', error); toast('خطأ في تحميل المزيد من الطلبات', 'error'); return }
    setOrders(prev => {
      const ids = new Set(prev.map(o => o.id))
      return [...prev, ...(data || []).filter(r => !ids.has(r.id)).map(mapOrder)]
    })
    setHasMoreOrders((data || []).length === PAGE_SIZE)
    setOrdersPage(next)
  }, [ordersPage, toast])

  // ── Initial fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }).range(0, PAGE_SIZE - 1),
      supabase.from('inventory').select('*').order('created_at'),
      supabase.from('audit_log').select('*').order('changed_at', { ascending: false }),
      supabase.from('tax_invoices').select('*').order('uploaded_at', { ascending: false }),
    ]).then(([o, inv, al, ti]) => {
      if (o.error)   { console.error('orders fetch:', o.error);   toast('خطأ في تحميل الطلبات', 'error') }
      if (inv.error) { console.error('inventory fetch:', inv.error) }
      if (al.error)  { console.error('audit fetch:', al.error) }
      if (ti.error)  { console.error('tax fetch:', ti.error) }
      setOrders((o.data || []).map(mapOrder))
      setHasMoreOrders((o.data || []).length === PAGE_SIZE)
      setInventory((inv.data || []).map(mapItem))
      setAuditLog((al.data || []).map(mapAudit))
      setTaxInvoices((ti.data || []).map(mapTax))
      setLoading(false)
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
        // Skip UPDATE events for items we just wrote — our confirmed state is already correct
        if (p.eventType === 'UPDATE' && !pendingInvWrites.current.has(p.new.id)) setInventory(prev => prev.map(i => i.id === p.new.id ? mapItem(p.new) : i))
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
    const { error: insertErr } = await supabase.from('orders').insert(row)
    if (insertErr) {
      console.error('addOrder:', insertErr)
      toast('فشل حفظ الطلب — ' + insertErr.message, 'error')
      setOrders(prev => prev.filter(o => o.id !== row.id))
      return
    }
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
      ...(orderData.status && { status: orderData.status }),
    }
    // Optimistic update — reflect edit immediately
    setOrders(prev => prev.map(o => o.id === id ? {
      ...o,
      clientName: orderData.clientName, company: orderData.company,
      mobile: orderData.mobile, whatsapp: orderData.whatsapp,
      address: orderData.address, locationLink: orderData.locationLink,
      governorate: orderData.governorate, city: orderData.city,
      district: orderData.district, street: orderData.street, buildingNo: orderData.buildingNo,
      salesRep: orderData.salesRep, items: orderData.items,
      subtotal: orderData.subtotal, vatPercent: orderData.vatPercent,
      vatAmount: orderData.vatAmount, total: orderData.total,
      invoiceType: orderData.invoiceType, invoiceName: orderData.invoiceName,
      taxNumber: orderData.taxNumber, notes: orderData.notes,
      paymentMethod: orderData.paymentMethod, date: orderData.date, time: orderData.time,
      updatedAt: new Date().toISOString(), editHistory: editHistory,
      ...(orderData.status && { status: orderData.status }),
    } : o))
    const { error: updateErr } = await supabase.from('orders').update(updatedRow).eq('id', id)
    if (updateErr) {
      console.error('updateOrder:', updateErr)
      toast('فشل تحديث الطلب — ' + updateErr.message, 'error')
      return
    }
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
    const { error: statusErr } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (statusErr) {
      console.error('updateOrderStatus:', statusErr)
      toast('فشل تحديث الحالة — ' + statusErr.message, 'error')
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: order?.status } : o))
      return
    }

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
        const { error: stockErr } = await supabase.from('inventory').update({ stock: newStock, lots: newLots, cost_price: fifoCost }).eq('id', invItem.id)
        if (stockErr) {
          console.error('updateOrderStatus — inventory deduction:', stockErr)
          toast(`فشل خصم المخزون للمنتج "${invItem.name}" — ${stockErr.message}`, 'error')
        }
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

  const deleteOrder = async (id, user) => {
    const order = orders.find(o => o.id === id)
    setOrders(prev => prev.filter(o => o.id !== id))
    const { error: delErr } = await supabase.from('orders').delete().eq('id', id)
    if (delErr) {
      console.error('deleteOrder:', delErr)
      toast('فشل حذف الطلب — ' + delErr.message, 'error')
      setOrders(prev => [...prev, order].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)))
      return
    }
    await pushAudit({
      type: 'order_delete', orderId: id,
      orderRef: `${order?.clientName} — ${order?.company}`,
      field: 'حذف طلب', oldValue: order?.status || '—', newValue: '—',
      changedBy: user?.name || 'مجهول',
    })
  }

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

  // ── Inventory write-lock helper ───────────────────────────────────────────────
  // Marks an item as "we just wrote" so real-time UPDATE events from earlier
  // operations can't race ahead and overwrite our fresh confirmed state.
  const lockInv  = (id) => pendingInvWrites.current.add(id)
  const unlockInv = (id) => setTimeout(() => pendingInvWrites.current.delete(id), 3000)

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
    const { error: invErr } = await supabase.from('inventory').insert(row)
    if (invErr) { console.error('addInventoryItem:', invErr); toast('فشل إضافة المنتج — ' + invErr.message, 'error'); return }
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
    lockInv(itemId)
    setInventory(prev => prev.map(i => i.id === itemId ? { ...i, lots:updatedLots, stock:newStock, costPrice:fifoCost } : i))
    const { error: lotErr } = await supabase.from('inventory').update({ lots:updatedLots, stock:newStock, cost_price:fifoCost }).eq('id', itemId)
    if (lotErr) { console.error('addStockLot:', lotErr); toast('فشل إضافة الدفعة — ' + lotErr.message, 'error'); setInventory(prev => prev.map(i => i.id === itemId ? { ...i, lots:item.lots, stock:item.stock, costPrice:item.costPrice } : i)); unlockInv(itemId); return }
    // Force-confirm from DB so no stale real-time event can overwrite our result
    const { data: confirmed } = await supabase.from('inventory').select('*').eq('id', itemId).single()
    if (confirmed) setInventory(prev => prev.map(i => i.id === itemId ? mapItem(confirmed) : i))
    unlockInv(itemId)
    await pushAudit({ type:'inventory', orderRef:item.name, field:'إضافة دفعة', oldValue:`${item.stock} وحدة`, newValue:`+${qty} وحدة × ${costPrice} LE`, changedBy:user?.name||'مجهول', note:note||'' })
  }

  const updateStockLot = async (itemId, lotId, { qty, costPrice, note }, user) => {
    const item    = inventory.find(i => i.id === itemId)
    if (!item) return
    const oldLot  = item.lots?.find(l => l.id === lotId)
    const newLots  = (item.lots||[]).map(l => l.id===lotId ? {...l, qty:Number(qty), costPrice:Number(costPrice), note:note??l.note} : l)
    const newStock = newLots.reduce((s,l)=>s+l.qty, 0)
    const fifoCost = newLots[0]?.costPrice ?? Number(costPrice)
    lockInv(itemId)
    setInventory(prev => prev.map(i => i.id === itemId ? { ...i, lots:newLots, stock:newStock, costPrice:fifoCost } : i))
    const { error: updLotErr } = await supabase.from('inventory').update({ lots:newLots, stock:newStock, cost_price:fifoCost }).eq('id', itemId)
    if (updLotErr) { console.error('updateStockLot:', updLotErr); toast('فشل تعديل الدفعة — ' + updLotErr.message, 'error'); setInventory(prev => prev.map(i => i.id === itemId ? { ...i, lots:item.lots, stock:item.stock, costPrice:item.costPrice } : i)); unlockInv(itemId); return }
    const { data: confirmedLot } = await supabase.from('inventory').select('*').eq('id', itemId).single()
    if (confirmedLot) setInventory(prev => prev.map(i => i.id === itemId ? mapItem(confirmedLot) : i))
    unlockInv(itemId)
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
    lockInv(id)
    setInventory(prev => prev.map(i => i.id === id ? { ...i, ...data, costPrice: data.costPrice ?? i.costPrice } : i))
    if (Object.keys(upd).length) {
      const { error: itmErr } = await supabase.from('inventory').update(upd).eq('id', id)
      if (itmErr) { console.error('updateInventoryItem:', itmErr); toast('فشل تعديل المنتج — ' + itmErr.message, 'error'); setInventory(prev => prev.map(i => i.id === id ? old : i)); unlockInv(id); return }
      const { data: confirmedItem } = await supabase.from('inventory').select('*').eq('id', id).single()
      if (confirmedItem) setInventory(prev => prev.map(i => i.id === id ? mapItem(confirmedItem) : i))
    }
    unlockInv(id)
    if (old && data.stock !== undefined && data.stock !== old.stock)
      await pushAudit({ type:'inventory', orderRef:old.name, field:'تعديل المخزون', oldValue:`${old.stock} وحدة`, newValue:`${data.stock} وحدة`, changedBy:user?.name||'مجهول', note:data.adjustNote||'' })
  }

  const deleteInventoryItem = async (id, user) => {
    const item = inventory.find(i => i.id === id)
    setInventory(prev => prev.filter(i => i.id !== id))
    const { error: delInvErr } = await supabase.from('inventory').delete().eq('id', id)
    if (delInvErr) { console.error('deleteInventoryItem:', delInvErr); toast('فشل حذف المنتج — ' + delInvErr.message, 'error'); setInventory(prev => [...prev, item]); return }
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
    const { error: taxErr } = await supabase.from('tax_invoices').insert(row)
    if (taxErr) { console.error('addTaxInvoice:', taxErr); toast('فشل رفع الفاتورة الضريبية — ' + taxErr.message, 'error'); return null }
    await pushAudit({ type:'tax_invoice', orderId:invoice.orderId, orderRef:invoice.clientName, field:'رفع فاتورة ضريبية', oldValue:'—', newValue:invoice.filename, changedBy:user?.name||'مجهول' })
    return mapTax(row)
  }

  const verifyTaxInvoice = async (id, user) => {
    const inv = taxInvoices.find(i => i.id === id)
    setTaxInvoices(prev => prev.map(i => i.id === id ? { ...i, verified:true } : i))
    const { error: verErr } = await supabase.from('tax_invoices').update({ verified:true }).eq('id', id)
    if (verErr) { console.error('verifyTaxInvoice:', verErr); toast('فشل اعتماد الفاتورة — ' + verErr.message, 'error'); setTaxInvoices(prev => prev.map(i => i.id === id ? { ...i, verified:false } : i)); return }
    await pushAudit({ type:'tax_invoice', orderRef:inv?.clientName||id, field:'اعتماد فاتورة', oldValue:'غير معتمدة', newValue:'معتمدة', changedBy:user?.name||'مجهول' })
  }

  const deleteTaxInvoice = async (id, user) => {
    const inv = taxInvoices.find(i => i.id === id)
    setTaxInvoices(prev => prev.filter(i => i.id !== id))
    const { error: delTaxErr } = await supabase.from('tax_invoices').delete().eq('id', id)
    if (delTaxErr) { console.error('deleteTaxInvoice:', delTaxErr); toast('فشل حذف الفاتورة — ' + delTaxErr.message, 'error'); setTaxInvoices(prev => [...prev, inv]); return }
    await pushAudit({ type:'tax_invoice', orderRef:inv?.clientName||id, field:'حذف فاتورة ضريبية', oldValue:inv?.filename||'—', newValue:'—', changedBy:user?.name||'مجهول' })
  }

  return (
    <OrdersContext.Provider value={{
      orders, inventory, auditLog, taxInvoices, loading,
      hasMoreOrders, loadMoreOrders,
      addOrder, updateOrder, updateOrderStatus, approveOrder, rejectOrder, deleteOrder,
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
