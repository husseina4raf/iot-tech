import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useAuth } from './useAuth'
import { mapOrder, mapItem, mapAudit, mapTax, mapTarget } from '../lib/mappers'

const OrdersContext = createContext(null)

const PAGE_SIZE = 100

// Matches an order item to its inventory record. SKU is authoritative
// whenever the order item has one — an exact (trimmed, case-insensitive)
// SKU match is unambiguous, unlike name matching, which can silently
// match the wrong product whenever one product's name happens to be a
// substring of another's, or fail entirely once an inventory item's name
// has been edited since the order was created. Falls back to the
// original fuzzy name match only when the item genuinely has no SKU
// (e.g. a free-typed line never selected from the inventory picker).
// Used by both the dispatch-time deduction and the restore-stock path, so
// the two always resolve to the same inventory row for the same item.
function findInventoryMatch(item, inventoryList) {
  const sku = (item.sku || '').trim().toLowerCase()
  if (sku) {
    return inventoryList.find(i => (i.sku || '').trim().toLowerCase() === sku) || null
  }
  return inventoryList.find(i =>
    i.name.toLowerCase().includes(item.name.toLowerCase()) ||
    item.name.toLowerCase().includes(i.name.toLowerCase())
  ) || null
}

export function OrdersProvider({ children }) {
  const toast = useToast()
  // The authenticated user's stable id — null while logged out (or before the
  // session-restore check has resolved). Protected data must only be fetched
  // once this identity is known, and must be refetched whenever it changes
  // (fresh login, or switching from one logged-in user to another).
  const { user } = useAuth()
  const authUserId = user?.id ?? null
  const [orders,       setOrders]       = useState([])
  const [inventory,    setInventory]    = useState([])
  const [auditLog,     setAuditLog]     = useState([])
  const [taxInvoices,  setTaxInvoices]  = useState([])
  const [salesTargets, setSalesTargets] = useState([])
  const [loading,       setLoading]       = useState(true)
  const [hasMoreOrders, setHasMoreOrders] = useState(false)
  const [ordersPage,    setOrdersPage]    = useState(0)
  // Tracks inventory item IDs we just wrote to — blocks stale real-time events
  const pendingInvWrites = useRef(new Set())
  // Tracks order IDs currently mid-dispatch (transitioning to تم الصرف) —
  // closes the rapid-double-click race for inventory deduction. A ref, not
  // state: it must be synchronously visible to a second invocation within
  // the same tick, which a batched setState update would not guarantee.
  const dispatchingOrders = useRef(new Set())

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
  // Gated on `authUserId` rather than running once on mount: this table's RLS
  // policies require an authenticated request, so fetching before a real user
  // is known would silently come back empty and (with the old `[]` dependency)
  // never retry after a fresh login. Re-running when `authUserId` changes also
  // covers logout → login as a different user without stale data lingering.
  useEffect(() => {
    if (!authUserId) {
      // Logged out (or session-restore check not resolved yet) — nothing to
      // fetch, and any previously-loaded data belongs to a session that's no
      // longer current. Reset pagination too, so a subsequent login starts a
      // fresh `loadMoreOrders()` sequence instead of continuing an old one.
      // The reset runs from a resolved-promise callback rather than directly
      // in the effect body — same-tick, same behavior, just not a batch of
      // top-level setState calls the effect itself is making.
      Promise.resolve().then(() => {
        setOrders([])
        setInventory([])
        setAuditLog([])
        setTaxInvoices([])
        setSalesTargets([])
        setHasMoreOrders(false)
        setOrdersPage(0)
        setLoading(true)
      })
      return
    }

    // `loading` is already true here: it defaults to true on first mount, and
    // the logged-out branch above sets it true on every path into this branch
    // (a real `authUserId` is only ever reached from `null` — see logout in
    // useAuth.jsx — so there is no transition that needs an extra reset here).
    let cancelled = false

    Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }).range(0, PAGE_SIZE - 1),
      supabase.from('inventory').select('*').order('name', { ascending: true }),
      supabase.from('audit_log').select('*').order('changed_at', { ascending: false }),
      supabase.from('tax_invoices').select('*').order('uploaded_at', { ascending: false }),
      supabase.from('sales_targets').select('*').order('month', { ascending: false }),
    ]).then(([o, inv, al, ti, st]) => {
      if (cancelled) return // a newer auth transition already superseded this fetch
      if (o.error)   { console.error('orders fetch:', o.error);   toast('خطأ في تحميل الطلبات', 'error') }
      if (inv.error) { console.error('inventory fetch:', inv.error); toast('خطأ في تحميل المنتجات — ' + inv.error.message, 'error') }
      if (al.error)  { console.error('audit fetch:', al.error) }
      if (ti.error)  { console.error('tax fetch:', ti.error) }
      setOrders((o.data || []).map(mapOrder))
      setHasMoreOrders((o.data || []).length === PAGE_SIZE)
      setOrdersPage(0)
      setInventory((inv.data || []).map(mapItem))
      setAuditLog((al.data || []).map(mapAudit))
      setTaxInvoices((ti.data || []).map(mapTax))
      setSalesTargets((st.data || []).map(mapTarget))
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_targets' }, p => {
        if (p.eventType === 'INSERT') setSalesTargets(prev => prev.some(t => t.id === p.new.id) ? prev : [mapTarget(p.new), ...prev])
        if (p.eventType === 'UPDATE') setSalesTargets(prev => prev.map(t => t.id === p.new.id ? mapTarget(p.new) : t))
        if (p.eventType === 'DELETE') setSalesTargets(prev => prev.filter(t => t.id !== p.old.id))
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
      cancelled = true
      supabase.removeChannel(ch)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authUserId])

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
  // A raw Arabic-lettered message is one of create_order()'s own RAISE
  // EXCEPTION messages (see order_creation.sql) — those are already
  // written to be shown to the user as-is. Anything else (a raw
  // Postgres/network error, e.g. a driver-level duplicate-key message)
  // gets replaced with a generic, friendly message rather than exposed.
  const isUserFacingMessage = (msg) => /[؀-ۿ]/.test(msg || '')
  const friendlyOrderError = (err) => isUserFacingMessage(err?.message)
    ? err.message
    : 'تعذر حفظ الطلب — يرجى المحاولة مرة أخرى.'

  // Serial generation is no longer computed here (it previously read
  // Math.max(...) over this component's local, paginated `orders` array —
  // exactly the race that let two browsers compute the same serial before
  // realtime caught up). The complete `orders` table, the sequence, and
  // the atomic reservation all now live in create_order() — see
  // src/lib/order_creation.sql.
  const addOrder = async (orderData, user) => {
    const { data, error: rpcError } = await supabase.rpc('create_order', {
      p_order: {
        clientName:   orderData.clientName,   company:      orderData.company,
        mobile:       orderData.mobile,       whatsapp:     orderData.whatsapp,
        address:      orderData.address,      locationLink: orderData.locationLink,
        salesRep:     orderData.salesRep,     items:        orderData.items,
        subtotal:     orderData.subtotal,     vatPercent:   orderData.vatPercent,
        vatAmount:    orderData.vatAmount,    total:        orderData.total,
        invoiceType:  orderData.invoiceType,  invoiceName:  orderData.invoiceName,
        taxNumber:    orderData.taxNumber,    notes:        orderData.notes,
        paymentMethod: orderData.paymentMethod,
        date: orderData.date, time: orderData.time,
      },
    })
    if (rpcError) {
      console.error('addOrder (create_order RPC):', rpcError)
      throw new Error(friendlyOrderError(rpcError))
    }
    const newOrder = mapOrder(data)
    // Add to local state only now that the database has confirmed the
    // insert — the real, server-generated id/serial is used directly, so
    // there is nothing to roll back and nothing that could ever mismatch
    // what was actually written. The realtime INSERT handler below already
    // dedupes by id, so a subsequent echo of this same row is a no-op.
    setOrders(prev => prev.some(o => o.id === newOrder.id) ? prev : [newOrder, ...prev])
    await pushAudit({
      type: 'order_create', orderId: newOrder.id,
      orderRef: `${orderData.clientName} — ${orderData.company}`,
      field: 'إنشاء طلب', oldValue: '—',
      newValue: `${orderData.total?.toLocaleString()} LE`,
      changedBy: user?.name || newOrder.salesRep || 'مجهول',
    })
    return newOrder
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

  // Statuses that only admin / super_admin may advance an order to.
  // team_leader can approve/reject and revert, but cannot finalise dispatch or collection.
  const TEAM_LEADER_FORBIDDEN_STATUSES = ['تم الصرف', 'تم التحصيل']

  const updateOrderStatus = async (id, status, user) => {
    // Role guard — frontend enforcement (DB trigger mirrors this server-side)
    if (user?.role === 'team_leader' && TEAM_LEADER_FORBIDDEN_STATUSES.includes(status)) {
      toast('ليس لديك صلاحية تحديث الطلب إلى هذه الحالة', 'error')
      return
    }
    const order = orders.find(o => o.id === id)
    const isDispatching = status === 'تم الصرف'

    if (isDispatching) {
      // Idempotency guard #1 — a redundant "already there" request (e.g. a
      // slower repeated click, after an earlier call's status update has
      // already committed and re-rendered). Never re-deduct in that case.
      if (order?.status === status) {
        toast('تم صرف هذا الطلب بالفعل', 'error')
        return
      }
      // Idempotency guard #2 — a genuinely CONCURRENT call for the same
      // order (a rapid double-click, before the first call's optimistic
      // update has re-rendered and hidden the button).
      if (dispatchingOrders.current.has(id)) {
        toast('جارٍ معالجة هذا الطلب بالفعل...', 'error')
        return
      }
      dispatchingOrders.current.add(id)
    }

    try {
      // ── Pre-flight: resolve every item's inventory match BEFORE
      // committing the status change, so an order can never end up marked
      // تم الصرف while one of its items was silently never deducted. SKU
      // is authoritative (see findInventoryMatch); a name-only fallback is
      // used only for items with no SKU. Any unmatched item aborts the
      // WHOLE transition — no status change, no inventory touched — rather
      // than partially deducting.
      let dispatchPlan = null
      if (isDispatching && order) {
        const unmatched = []
        dispatchPlan = order.items.map(item => {
          const invItem = findInventoryMatch(item, inventory)
          if (!invItem) unmatched.push(item)
          return { item, invItem }
        })
        if (unmatched.length > 0) {
          const names = unmatched.map(i => `${i.name}${i.sku ? ` (SKU: ${i.sku})` : ''}`).join('، ')
          console.error('updateOrderStatus — no inventory match for items:', unmatched)
          toast(`تعذر تحديث الحالة — لم يتم العثور على تطابق في المخزون للأصناف التالية: ${names}`, 'error')
          return
        }
      }

      const statusEntry = {
        type: 'status_change',
        previousStatus: order?.status,
        newStatus: status,
        changedAt: new Date().toISOString(),
        changedBy: user?.name || 'مجهول',
      }
      const editHistory = [...(order?.editHistory || []), statusEntry]
      // Optimistic update — change status immediately in local state
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status, editHistory } : o))
      const { error: statusErr } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString(), edit_history: editHistory }).eq('id', id)
      if (statusErr) {
        console.error('updateOrderStatus:', statusErr)
        toast('فشل تحديث الحالة — ' + statusErr.message, 'error')
        setOrders(prev => prev.map(o => o.id === id ? { ...o, status: order?.status } : o))
        return
      }

      if (isDispatching && order && dispatchPlan) {
        let deductionFailed = false
        for (const { item, invItem } of dispatchPlan) {
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
          // Update local state immediately on success — do not rely solely
          // on the realtime subscription to reflect a confirmed write.
          lockInv(invItem.id)
          setInventory(prev => prev.map(i => i.id === invItem.id ? { ...i, stock: newStock, lots: newLots, costPrice: fifoCost } : i))
          const { error: stockErr } = await supabase.from('inventory').update({ stock: newStock, lots: newLots, cost_price: fifoCost }).eq('id', invItem.id)
          if (stockErr) {
            deductionFailed = true
            console.error('updateOrderStatus — inventory deduction:', stockErr)
            toast(`فشل خصم المخزون للمنتج "${invItem.name}" — ${stockErr.message}`, 'error')
            // Roll back the optimistic local change for this item only.
            setInventory(prev => prev.map(i => i.id === invItem.id ? invItem : i))
          }
          unlockInv(invItem.id)
        }
        if (deductionFailed) {
          // The order's status was already committed above (pre-flight
          // matching passed for every item) — a write failure here is a
          // rarer, non-deterministic case (e.g. a network error), not the
          // "unmatched item" case this fix targets. Surfaced clearly
          // rather than left silent, so it can be corrected manually.
          toast('تنبيه: تم تحديث حالة الطلب إلى "تم الصرف" لكن حدث خطأ أثناء خصم بعض الأصناف من المخزون — يرجى المراجعة اليدوية', 'error')
        }
      }

      await pushAudit({
        type: 'status_change', orderId: id,
        orderRef: `${order?.clientName} — ${order?.company}`,
        field: 'الحالة', oldValue: order?.status || '—', newValue: status,
        changedBy: user?.name || 'مجهول',
      })
    } finally {
      if (isDispatching) dispatchingOrders.current.delete(id)
    }
  }

  const approveOrder = (id, user) => updateOrderStatus(id, 'موافق عليه', user)
  const rejectOrder  = (id, user) => updateOrderStatus(id, 'مرفوض', user)

  const cancelOrder = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return
    const cancelEntry = {
      type: 'cancellation',
      previousStatus: order.status,
      cancelledAt: new Date().toISOString(),
      cancelledBy: user?.name || 'مجهول',
    }
    const editHistory = [...(order.editHistory || []), cancelEntry]
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'ملغي', editHistory } : o))
    const { error } = await supabase.from('orders').update({
      status: 'ملغي',
      updated_at: new Date().toISOString(),
      edit_history: editHistory,
    }).eq('id', id)
    if (error) {
      console.error('cancelOrder:', error)
      toast('فشل إلغاء الطلب — ' + error.message, 'error')
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: order.status, editHistory: order.editHistory } : o))
      return
    }
    // Restore inventory if goods had already been dispatched
    if (order.status === 'تم الصرف') {
      await restoreStockForOrder(order)
    }
    await pushAudit({
      type: 'order_cancel', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'إلغاء الطلب', oldValue: order.status, newValue: 'ملغي',
      changedBy: user?.name || 'مجهول',
    })
  }

  const restoreOrder = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return
    const cancelEntry = [...(order.editHistory || [])].reverse().find(h => h.type === 'cancellation')
    const restoreStatus = cancelEntry?.previousStatus || 'بانتظار الموافقة'
    const editHistory = (order.editHistory || []).filter(h => h !== cancelEntry)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: restoreStatus, editHistory } : o))
    const { error } = await supabase.from('orders').update({
      status: restoreStatus,
      updated_at: new Date().toISOString(),
      edit_history: editHistory,
    }).eq('id', id)
    if (error) {
      console.error('restoreOrder:', error)
      toast('فشل استعادة الطلب — ' + error.message, 'error')
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: order.status, editHistory: order.editHistory } : o))
      return
    }
    await pushAudit({
      type: 'order_restore', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'استعادة الطلب', oldValue: 'ملغي', newValue: restoreStatus,
      changedBy: user?.name || 'مجهول',
    })
  }

  const revertLastStatus = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return
    const history = order.editHistory || []
    const lastChangeIdx = [...history].reverse().findIndex(h => h.type === 'status_change')
    if (lastChangeIdx === -1) return
    const realIdx = history.length - 1 - lastChangeIdx
    const lastEntry = history[realIdx]
    const prevStatus = lastEntry.previousStatus
    const editHistory = history.filter((_, i) => i !== realIdx)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: prevStatus, editHistory } : o))
    const { error } = await supabase.from('orders').update({
      status: prevStatus,
      updated_at: new Date().toISOString(),
      edit_history: editHistory,
    }).eq('id', id)
    if (error) {
      console.error('revertLastStatus:', error)
      toast('فشل التراجع — ' + error.message, 'error')
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: order.status, editHistory: order.editHistory } : o))
      return
    }
    // Restore inventory when reverting a dispatch (goods going back to warehouse)
    if (order.status === 'تم الصرف') {
      await restoreStockForOrder(order)
    }
    await pushAudit({
      type: 'status_revert', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'تراجع عن الحالة', oldValue: order.status, newValue: prevStatus,
      changedBy: user?.name || 'مجهول',
    })
  }

  const returnToSales = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return
    const previousStatus = order.status

    // ── Stock deduction detection ─────────────────────────────────────────────
    // Stock is deducted the moment an order transitions INTO 'تم الصرف'.
    // It may need restoring even if the order has since advanced to 'مكتمل' or
    // 'تم التحصيل' — those moves do NOT reverse the inventory change.
    //
    // Algorithm:
    //  1. If current status is 'تم الصرف', stock is clearly still deducted.
    //  2. Otherwise scan editHistory for the last status_change TO 'تم الصرف'.
    //     If found, check whether any subsequent event already restored stock
    //     (returned_to_sales, a status_revert FROM 'تم الصرف', or a cancellation).
    //     If none found → stock is still deducted and must be restored now.
    const stockWasDeducted = (() => {
      if (previousStatus === 'تم الصرف') return true
      const history = order.editHistory || []
      let lastDispatchIdx = -1
      history.forEach((entry, idx) => {
        if (entry.type === 'status_change' && entry.newStatus === 'تم الصرف') lastDispatchIdx = idx
      })
      if (lastDispatchIdx === -1) return false // Never dispatched → nothing to restore
      // Any restoration event recorded after the dispatch?
      return !history.slice(lastDispatchIdx + 1).some(e =>
        e.type === 'returned_to_sales' ||
        (e.type === 'status_revert' && e.previousStatus === 'تم الصرف') ||
        e.type === 'cancellation'
      )
    })()

    const returnEntry = {
      type: 'returned_to_sales',
      previousStatus,
      newStatus: 'جديد',
      returnedAt: new Date().toISOString(),
      returnedBy: user?.name || 'مجهول',
      reason: 'إعادة للسيلز للتعديل',
    }
    const editHistory = [...(order.editHistory || []), returnEntry]

    // Persist the status change first; roll back locally if it fails
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'جديد', editHistory } : o))
    const { error } = await supabase.from('orders').update({
      status: 'جديد',
      updated_at: new Date().toISOString(),
      edit_history: editHistory,
    }).eq('id', id)
    if (error) {
      console.error('returnToSales:', error)
      toast('فشل إعادة الطلب للسيلز — ' + error.message, 'error')
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: previousStatus, editHistory: order.editHistory } : o))
      return
    }

    // Restore stock only when we confirmed the order update succeeded,
    // and only when stock was actually deducted (and not already restored).
    if (stockWasDeducted) {
      await restoreStockForOrder(order)
    }

    await pushAudit({
      type: 'returned_to_sales', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'إعادة للسيلز للتعديل', oldValue: previousStatus, newValue: 'جديد',
      changedBy: user?.name || 'مجهول',
    })
  }

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

  const getOrdersByRep = (rep) => orders.filter(o => o.salesRep === rep && o.status !== 'ملغي')

  const getOrdersByRepGrouped = (rep) => {
    const repOrders = orders.filter(o => o.salesRep === rep && o.status !== 'ملغي')
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

  // ── Stock restoration helper ──────────────────────────────────────────────────
  // Called when a dispatched order ('تم الصرف') is cancelled or reverted.
  // Adds back each item's quantity to inventory as a return lot.
  const restoreStockForOrder = async (order) => {
    for (const item of (order.items || [])) {
      // SKU-first, same as the dispatch-time deduction — keeps both paths
      // resolving to the same inventory row for the same item.
      const invItem = findInventoryMatch(item, inventory)
      if (!invItem) continue
      const qty = Number(item.quantity) || 0
      if (qty <= 0) continue
      const returnLot = {
        id: `lot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        qty, costPrice: invItem.costPrice || 0,
        date: new Date().toISOString().split('T')[0],
        note: `مُرجَع من طلب #${order.serialNumber}`,
      }
      const updatedLots = [...(invItem.lots || []), returnLot]
      const newStock    = (invItem.stock || 0) + qty
      const fifoCost    = updatedLots[0]?.costPrice ?? (invItem.costPrice || 0)
      lockInv(invItem.id)
      setInventory(prev => prev.map(i => i.id === invItem.id
        ? { ...i, stock: newStock, lots: updatedLots, costPrice: fifoCost } : i))
      const { error } = await supabase.from('inventory')
        .update({ stock: newStock, lots: updatedLots, cost_price: fifoCost })
        .eq('id', invItem.id)
      if (error) {
        console.error('restoreStockForOrder:', error)
        toast(`فشل إعادة المخزون للمنتج "${invItem.name}" — ${error.message}`, 'error')
        setInventory(prev => prev.map(i => i.id === invItem.id
          ? { ...i, stock: invItem.stock, lots: invItem.lots, costPrice: invItem.costPrice } : i))
      }
      unlockInv(invItem.id)
    }
  }

  // ── Inventory ─────────────────────────────────────────────────────────────────
  const addInventoryItem = async (item, user) => {
    const qty  = Number(item.stock) || 0
    const uid  = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`
    const lots = qty > 0 ? [{ id:`lot-${uid()}`, qty, costPrice:Number(item.costPrice)||0, date:new Date().toISOString().split('T')[0], note:'دفعة أولى' }] : []
    const row  = {
      id:`inv-${uid()}`, name:item.name, sku:item.sku||null,
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

  // ── Sales Targets ─────────────────────────────────────────────────────────────
  const upsertTarget = useCallback(async (repName, month, target, user) => {
    const existing = salesTargets.find(t => t.repName === repName && t.month === month)
    const id = existing?.id || `tgt-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
    const row = {
      id, rep_name: repName, month, target: Number(target),
      set_by: user?.name || 'مجهول', updated_at: new Date().toISOString(),
    }
    if (existing) {
      setSalesTargets(prev => prev.map(t => t.id === existing.id ? { ...t, target: Number(target) } : t))
    } else {
      setSalesTargets(prev => [...prev, { id, repName, month, target: Number(target), setBy: user?.name || 'مجهول' }])
    }
    const { error } = await supabase.from('sales_targets').upsert(row, { onConflict: 'rep_name,month' })
    if (error) {
      console.error('upsertTarget:', error)
      toast('فشل حفظ الهدف — ' + error.message, 'error')
      if (existing) {
        setSalesTargets(prev => prev.map(t => t.id === existing.id ? existing : t))
      } else {
        setSalesTargets(prev => prev.filter(t => t.id !== id))
      }
    }
  }, [salesTargets, toast])

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
      orders: orders.filter(o => o.status !== 'ملغي'),
      cancelledOrders: orders.filter(o => o.status === 'ملغي'),
      inventory, auditLog, taxInvoices, salesTargets, loading,
      hasMoreOrders, loadMoreOrders,
      addOrder, updateOrder, updateOrderStatus, approveOrder, rejectOrder,
      cancelOrder, restoreOrder, revertLastStatus, returnToSales, deleteOrder,
      getOrdersByRep, getOrdersByRepGrouped,
      addInventoryItem, addStockLot, updateStockLot, updateInventoryItem, deleteInventoryItem,
      addTaxInvoice, verifyTaxInvoice, deleteTaxInvoice,
      upsertTarget,
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
