import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/ui/Toast'
import { useAuth } from './useAuth'
import { mapOrder, mapItem, mapAudit, mapTax, mapTarget } from '../lib/mappers'
import { friendlyRpcError } from '../lib/orderInventory'

const OrdersContext = createContext(null)

const PAGE_SIZE = 100

// Inventory matching (SKU-first, name fallback only when the line has no
// SKU) and every stock movement now live in the database — see
// _order_resolve_inventory_id() / _order_apply_inventory() in
// src/lib/order_creation.sql. The client no longer computes stock values.

// Calls an order RPC. If Postgres aborted the call with a deadlock (40P01) or
// serialization failure (40001) the whole transaction was rolled back, so
// retrying once is safe (no partial effect, no duplicate). Network errors and
// every other error are NOT retried: after those it is unknown whether the
// server committed.
async function callRpc(fn, args) {
  const res = await supabase.rpc(fn, args)
  if (res.error && (res.error.code === '40P01' || res.error.code === '40001')) {
    return supabase.rpc(fn, args)
  }
  return res
}

// The order fields every order RPC accepts (camelCase, as the SQL functions read them).
function buildOrderPayload(d) {
  return {
    clientName:    d.clientName,   company:      d.company,
    mobile:        d.mobile,       whatsapp:     d.whatsapp,
    address:       d.address,      locationLink: d.locationLink,
    salesRep:      d.salesRep,     items:        d.items,
    subtotal:      d.subtotal,     vatPercent:   d.vatPercent,
    vatAmount:     d.vatAmount,    total:        d.total,
    invoiceType:   d.invoiceType,  invoiceName:  d.invoiceName,
    taxNumber:     d.taxNumber,    notes:        d.notes,
    paymentMethod: d.paymentMethod,
    date: d.date, time: d.time,
  }
}

// Translates a duplicate-SKU database error (Postgres 23505, from the
// partial unique index on inventory.sku — see
// src/lib/inventory_sku_uniqueness.sql) into the same friendly Arabic
// message used by InventoryManager.jsx's client-side pre-check. Any other
// error is passed through with its real message — only this one,
// specifically recognized case is ever hidden behind a friendlier text.
function inventoryErrorMessage(error, fallbackPrefix) {
  if (error?.code === '23505') return 'هذا الـSKU مستخدم بالفعل لمنتج آخر'
  return fallbackPrefix + (error?.message || '')
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
  // Order IDs with a lifecycle RPC (return / reject / cancel / un-cancel /
  // revert) currently in flight — a fast double-click is stopped here without
  // waiting for a round trip. A ref, not state, so a second invocation in the
  // same tick sees it synchronously. The database still enforces correctness
  // on its own (row lock + status checks); this only avoids a needless call.
  const inFlightOrderOps = useRef(new Set())

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

  // The stock rows were changed by a database function, not by this client, so
  // local inventory state must be re-read rather than patched from guesses.
  // Failure here is harmless (realtime / the visibility refetch will catch up).
  const refreshInventory = async () => {
    const { data, error } = await supabase.from('inventory').select('*').order('name', { ascending: true })
    if (error) { console.error('refreshInventory:', error); return }
    setInventory((data || []).map(mapItem))
  }

  // ── Orders ────────────────────────────────────────────────────────────────────
  // The RPCs' own RAISE EXCEPTION messages are Arabic and shown as-is; raw
  // Postgres/PostgREST errors are translated (missing function, deadlock,
  // expired session, ...) or replaced with this generic text plus the error
  // code, so a failure is diagnosable from the toast (see lib/orderInventory.js).
  const friendlyOrderError = (err) =>
    friendlyRpcError(err, 'تعذر حفظ الطلب — يرجى المحاولة مرة أخرى.')

  // Re-reads ONE order from the database and replaces the local copy (or drops it if it
  // no longer exists). Called after any failed or refused write, so the screen never keeps
  // showing a state the database rejected or that another user has since changed.
  const refreshOrder = async (id) => {
    const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle()
    if (error) { console.error('refreshOrder:', error); return }
    if (!data) { setOrders(prev => prev.filter(o => o.id !== id)); return }
    const fresh = mapOrder(data)
    setOrders(prev => prev.some(o => o.id === id) ? prev.map(o => o.id === id ? fresh : o) : [fresh, ...prev])
  }

  // Serial generation, the stock deduction and the insert all happen inside
  // create_order() (src/lib/order_creation.sql), in one transaction. `clientRequestId`
  // (one random id per submission intent, reused only for retries of the SAME payload)
  // lets the database recognise a retry whose first attempt committed but whose response
  // was lost, and return that original order instead of creating and deducting twice.
  const addOrder = async (orderData, user) => {
    const { data, error: rpcError } = await callRpc('create_order', {
      p_order: { ...buildOrderPayload(orderData), clientRequestId: orderData.clientRequestId },
    })
    if (rpcError) {
      console.error('addOrder (create_order RPC):', rpcError)
      throw new Error(friendlyOrderError(rpcError))
    }
    const newOrder = mapOrder(data)
    // A replayed request returns an order this client may already know (realtime delivers
    // the INSERT) — then the audit row was already written for it.
    const alreadyKnown = orders.some(o => o.id === newOrder.id)
    setOrders(prev => prev.some(o => o.id === newOrder.id) ? prev : [newOrder, ...prev])
    await refreshInventory()
    if (!alreadyKnown) {
      await pushAudit({
        type: 'order_create', orderId: newOrder.id,
        orderRef: `${orderData.clientName} — ${orderData.company}`,
        field: 'إنشاء طلب', oldValue: '—',
        newValue: `${orderData.total?.toLocaleString()} LE`,
        changedBy: user?.name || newOrder.salesRep || 'مجهول',
      })
    }
    return newOrder
  }

  // Plain edit (no status change, no stock movement) → update_order_details(). Carries the
  // order's updated_at as it was when the form was opened: if anyone changed the order
  // since, the database refuses (stale form) instead of overwriting. While the order holds
  // stock its SKUs / quantities / lines are frozen server-side — change those through
  // Return to Sales → edit → resubmit. Throws on failure; state changes only on success.
  const updateOrder = async (id, orderData, user) => {
    const token = orderData.expectedUpdatedAt ?? orders.find(o => o.id === id)?.updatedAt ?? null
    const { data, error } = await callRpc('update_order_details', {
      p_order_id: id,
      p_expected_updated_at: token,
      p_order: { ...buildOrderPayload(orderData), changedByName: user?.name },
    })
    if (error) {
      console.error('updateOrder (update_order_details RPC):', error)
      await refreshOrder(id)
      throw new Error(friendlyRpcError(error, 'فشل تحديث الطلب — يرجى المحاولة مرة أخرى.'))
    }
    const previous = orders.find(o => o.id === id)
    const updated = mapOrder(data)
    setOrders(prev => prev.map(o => o.id === id ? updated : o))
    await pushAudit({
      type: 'order_edit', orderId: id,
      orderRef: `${previous?.clientName ?? updated.clientName} — ${previous?.company ?? updated.company}`,
      field: 'تعديل الطلب',
      oldValue: `${previous?.total?.toLocaleString()} LE`,
      newValue: `${orderData.total?.toLocaleString()} LE`,
      changedBy: user?.name || 'مجهول',
    })
    return updated
  }

  // Resubmitting an order that was returned to Sales (جديد) or rejected (مرفوض) deducts
  // inventory again — atomically, using the FINAL edited quantities only, and only once
  // even under a rapid double-click or a second tab (resubmit_order row-locks the order and
  // checks its state itself). The version token stops a stale form overwriting a newer edit.
  const resubmitOrder = async (id, orderData, user) => {
    const { data, error: rpcError } = await callRpc('resubmit_order', {
      p_order_id: id,
      p_order: {
        ...buildOrderPayload(orderData),
        changedByName: user?.name,
        expectedUpdatedAt: orderData.expectedUpdatedAt,
      },
    })
    if (rpcError) {
      console.error('resubmitOrder (resubmit_order RPC):', rpcError)
      await refreshOrder(id)
      throw new Error(friendlyOrderError(rpcError))
    }
    const updatedOrder = mapOrder(data)
    setOrders(prev => prev.map(o => o.id === id ? updatedOrder : o))
    await refreshInventory()
    await pushAudit({
      type: 'order_edit', orderId: id,
      orderRef: `${orderData.clientName} — ${orderData.company}`,
      field: 'إعادة إرسال الطلب', oldValue: 'مرفوض/جديد', newValue: 'بانتظار الموافقة',
      changedBy: user?.name || 'مجهول',
    })
    return updatedOrder
  }

  // Statuses that only admin / super_admin may advance an order to.
  // team_leader can approve/reject and revert, but cannot finalise dispatch or collection.
  const TEAM_LEADER_FORBIDDEN_STATUSES = ['تم الصرف', 'تم التحصيل']

  // One lifecycle operation per order at a time from THIS tab (a fast double-click is
  // stopped without a round trip). The database still enforces correctness on its own.
  const beginOrderOp = (id) => {
    if (inFlightOrderOps.current.has(id)) {
      toast('جارٍ معالجة هذا الطلب بالفعل...', 'error')
      return false
    }
    inFlightOrderOps.current.add(id)
    return true
  }
  const endOrderOp = (id) => { inFlightOrderOps.current.delete(id) }

  // Runs one lifecycle RPC (return / reject / cancel / un-cancel / revert). Each is a SINGLE
  // database transaction that changes the order AND its stock reservation together (see
  // src/lib/order_lifecycle.sql); this only calls it and refreshes local state from what the
  // database actually returned — it never computes or writes stock itself. Returns the updated
  // order, or null on failure. On failure the error toast has ALREADY been shown (callers must
  // not add another, and must only report success on a non-null result) and the order is
  // re-read so a stale screen shows the truth.
  const runOrderRpc = async (id, fn, user, failureFallback, extraParams = {}) => {
    if (!beginOrderOp(id)) return null
    try {
      const { data, error } = await callRpc(fn, { p_order_id: id, p_changed_by: user?.name ?? null, ...extraParams })
      if (error) {
        console.error(`${fn}:`, error)
        toast(friendlyRpcError(error, failureFallback), 'error')
        await refreshOrder(id)
        return null
      }
      const updated = mapOrder(data)
      setOrders(prev => prev.map(o => o.id === id ? updated : o))
      await refreshInventory()
      return updated
    } finally {
      endOrderOp(id)
    }
  }

  // Rejection releases the order's stock, so it goes through reject_order.
  const rejectOrder = async (id, user) => {
    const order = orders.find(o => o.id === id)
    const updated = await runOrderRpc(id, 'reject_order', user, 'فشل رفض الطلب — يرجى المحاولة مرة أخرى.')
    if (!updated) return false
    await pushAudit({
      type: 'status_change', orderId: id,
      orderRef: `${order?.clientName} — ${order?.company}`,
      field: 'الحالة', oldValue: order?.status || '—', newValue: 'مرفوض',
      changedBy: user?.name || 'مجهول',
    })
    return true
  }

  // Approve / dispatch / complete / collect → advance_order_status. The call carries the
  // status this screen saw: if the order has since been rejected, returned, cancelled or
  // advanced by someone else, the database refuses instead of overwriting the newer change
  // (and no stale history array is written). None of these move stock — the reservation was
  // made when the order was created or resubmitted. Returns true only when confirmed.
  const updateOrderStatus = async (id, status, user) => {
    // Role guard — frontend enforcement (the database checks the role again)
    if (user?.role === 'team_leader' && TEAM_LEADER_FORBIDDEN_STATUSES.includes(status)) {
      toast('ليس لديك صلاحية تحديث الطلب إلى هذه الحالة', 'error')
      return false
    }
    if (status === 'مرفوض') return rejectOrder(id, user)

    const order = orders.find(o => o.id === id)
    if (!order) return false
    if (!beginOrderOp(id)) return false
    try {
      const { data, error } = await callRpc('advance_order_status', {
        p_order_id: id, p_expected_status: order.status, p_new_status: status, p_changed_by: user?.name ?? null,
      })
      if (error) {
        console.error('updateOrderStatus (advance_order_status):', error)
        toast(friendlyRpcError(error, 'فشل تحديث الحالة — يرجى المحاولة مرة أخرى.'), 'error')
        await refreshOrder(id)
        return false
      }
      setOrders(prev => prev.map(o => o.id === id ? mapOrder(data) : o))
      await pushAudit({
        type: 'status_change', orderId: id,
        orderRef: `${order.clientName} — ${order.company}`,
        field: 'الحالة', oldValue: order.status || '—', newValue: status,
        changedBy: user?.name || 'مجهول',
      })
      return true
    } finally {
      endOrderOp(id)
    }
  }

  const approveOrder = (id, user) => updateOrderStatus(id, 'موافق عليه', user)

  const cancelOrder = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return false
    const updated = await runOrderRpc(id, 'cancel_order', user, 'فشل إلغاء الطلب — يرجى المحاولة مرة أخرى.', { p_expected_status: order.status })
    if (!updated) return false
    await pushAudit({
      type: 'order_cancel', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'إلغاء الطلب', oldValue: order.status, newValue: 'ملغي',
      changedBy: user?.name || 'مجهول',
    })
    return true
  }

  const restoreOrder = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return false
    const updated = await runOrderRpc(id, 'restore_cancelled_order', user, 'فشل استعادة الطلب — يرجى المحاولة مرة أخرى.')
    if (!updated) return false
    await pushAudit({
      type: 'order_restore', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'استعادة الطلب', oldValue: 'ملغي', newValue: updated.status,
      changedBy: user?.name || 'مجهول',
    })
    return true
  }

  // Reverts only the newest lifecycle entry, and only if it still explains the current status
  // (the database re-checks this; the button is hidden otherwise — getRevertableStatusChange).
  const revertLastStatus = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return false
    const updated = await runOrderRpc(id, 'revert_order_status', user, 'فشل التراجع — يرجى المحاولة مرة أخرى.', { p_expected_status: order.status })
    if (!updated) return false
    await pushAudit({
      type: 'status_revert', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'تراجع عن الحالة', oldValue: order.status, newValue: updated.status,
      changedBy: user?.name || 'مجهول',
    })
    return true
  }

  // Returns true only when the order was returned to Sales AND (if it held stock) that stock
  // was released — one database transaction (return_order_to_sales), no half-done state.
  const returnToSales = async (id, user) => {
    const order = orders.find(o => o.id === id)
    if (!order) return false
    const updated = await runOrderRpc(id, 'return_order_to_sales', user, 'فشل إعادة الطلب للسيلز — يرجى المحاولة مرة أخرى.', { p_expected_status: order.status })
    if (!updated) return false
    await pushAudit({
      type: 'returned_to_sales', orderId: id,
      orderRef: `${order.clientName} — ${order.company}`,
      field: 'إعادة للسيلز للتعديل', oldValue: order.status, newValue: 'جديد',
      changedBy: user?.name || 'مجهول',
    })
    return true
  }

  // Permanent delete. The database refuses while the order still holds stock (Cancel it first —
  // that returns the stock — then delete it from the cancelled list) and RLS restricts who may
  // delete at all; a delete RLS silently filtered removes 0 rows, which is reported as a failure
  // here instead of a false success. Local state changes only once the row is really gone.
  const deleteOrder = async (id, user) => {
    const order = orders.find(o => o.id === id)
    const { data, error: delErr } = await supabase.from('orders').delete().eq('id', id).select('id')
    if (delErr) {
      console.error('deleteOrder:', delErr)
      toast(friendlyRpcError(delErr, 'فشل حذف الطلب — يرجى المحاولة مرة أخرى.'), 'error')
      await refreshOrder(id)
      return false
    }
    if (!data || data.length === 0) {
      toast('لم يتم حذف الطلب — قد لا تملك الصلاحية أو تم حذفه بالفعل', 'error')
      await refreshOrder(id)
      return false
    }
    setOrders(prev => prev.filter(o => o.id !== id))
    await pushAudit({
      type: 'order_delete', orderId: id,
      orderRef: `${order?.clientName} — ${order?.company}`,
      field: 'حذف طلب', oldValue: order?.status || '—', newValue: '—',
      changedBy: user?.name || 'مجهول',
    })
    return true
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

  // ── Inventory ─────────────────────────────────────────────────────────────────
  // Every stock / lot / SKU / delete change goes through a database function (see
  // src/lib/inventory_management.sql) that locks the product row, compares against what the
  // screen saw wherever a value is being replaced, keeps stock and lots moving together, and
  // refuses changes that would orphan a reserved order. The client never computes or writes
  // stock, lots or cost. Each returns true only when the change is confirmed.
  const inventoryFail = (fn, error, fallback) => {
    console.error(`${fn}:`, error)
    toast(friendlyRpcError(error, fallback), 'error')
  }
  const applyItemRow = (id, row) => setInventory(prev => prev.map(i => i.id === id ? mapItem(row) : i))

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
    if (invErr) {
      console.error('addInventoryItem:', invErr)
      toast(inventoryErrorMessage(invErr, 'فشل إضافة المنتج — '), 'error')
      return null
    }
    await pushAudit({ type:'inventory', orderRef:item.name, field:'إضافة صنف', oldValue:'—', newValue:`${qty} وحدة`, changedBy:user?.name||'مجهول' })
    return mapItem(row)
  }

  const addStockLot = async (itemId, { qty, costPrice, note }, user) => {
    const item = inventory.find(i => i.id === itemId)
    const { data, error } = await callRpc('add_stock_lot', {
      p_item_id: itemId, p_qty: Number(qty), p_cost: Number(costPrice), p_note: note || null,
    })
    if (error) { inventoryFail('addStockLot', error, 'فشل إضافة الدفعة — يرجى المحاولة مرة أخرى.'); return false }
    applyItemRow(itemId, data)
    await pushAudit({ type:'inventory', orderRef:item?.name||itemId, field:'إضافة دفعة', oldValue:`${item?.stock ?? '—'} وحدة`, newValue:`+${qty} وحدة × ${costPrice} LE`, changedBy:user?.name||'مجهول', note:note||'' })
    return true
  }

  // expectedQty = the lot quantity the admin saw; if it changed since (a reservation consumed
  // it, or another admin edited it) the database refuses instead of overwriting.
  const updateStockLot = async (itemId, lotId, { qty, costPrice, note, expectedQty }, user) => {
    const item   = inventory.find(i => i.id === itemId)
    const oldLot = item?.lots?.find(l => l.id === lotId)
    const { data, error } = await callRpc('update_stock_lot', {
      p_item_id: itemId, p_lot_id: lotId,
      p_expected_qty: expectedQty === undefined ? (oldLot ? Number(oldLot.qty) : null) : expectedQty,
      p_qty: Number(qty), p_cost: Number(costPrice), p_note: note ?? null,
    })
    if (error) { inventoryFail('updateStockLot', error, 'فشل تعديل الدفعة — يرجى المحاولة مرة أخرى.'); return false }
    applyItemRow(itemId, data)
    await pushAudit({ type:'inventory', orderRef:item?.name||itemId, field:'تعديل دفعة', oldValue:`${oldLot?.qty} وحدة × ${oldLot?.costPrice} LE`, newValue:`${qty} وحدة × ${costPrice} LE`, changedBy:user?.name||'مجهول', note:note||'' })
    return true
  }

  // Descriptive fields only (name, sku, brand, category, price, costPrice, description, …) and
  // ONLY the ones the admin actually changed — stock and lots are never sent from here.
  const updateInventoryItem = async (id, changes, user) => {
    const old = inventory.find(i => i.id === id)
    const { data, error } = await callRpc('update_inventory_item', { p_item_id: id, p_changes: changes })
    if (error) { inventoryFail('updateInventoryItem', error, 'فشل تعديل المنتج — يرجى المحاولة مرة أخرى.'); return false }
    applyItemRow(id, data)
    await pushAudit({ type:'inventory', orderRef:old?.name||id, field:'تعديل منتج', oldValue:'—', newValue:Object.keys(changes).join('، '), changedBy:user?.name||'مجهول' })
    return true
  }

  // Sets the stock figure. expectedStock is the stock the admin SAW when the form opened;
  // reservations made since make the database refuse rather than be silently overwritten.
  const adjustInventoryStock = async (id, { expectedStock, newStock, note }, user) => {
    const old = inventory.find(i => i.id === id)
    const { data, error } = await callRpc('adjust_inventory_stock', {
      p_item_id: id, p_expected_stock: Number(expectedStock), p_new_stock: Number(newStock), p_note: note || null,
    })
    if (error) { inventoryFail('adjustInventoryStock', error, 'فشل تعديل المخزون — يرجى المحاولة مرة أخرى.'); return false }
    applyItemRow(id, data)
    await pushAudit({ type:'inventory', orderRef:old?.name||id, field:'تعديل المخزون', oldValue:`${expectedStock} وحدة`, newValue:`${newStock} وحدة`, changedBy:user?.name||'مجهول', note:note||'' })
    return true
  }

  // Refused by the database while a reserved order still depends on the product.
  const deleteInventoryItem = async (id, user) => {
    const item = inventory.find(i => i.id === id)
    const { error } = await callRpc('delete_inventory_item', { p_item_id: id })
    if (error) { inventoryFail('deleteInventoryItem', error, 'فشل حذف المنتج — يرجى المحاولة مرة أخرى.'); return false }
    setInventory(prev => prev.filter(i => i.id !== id))
    await pushAudit({ type:'inventory', orderRef:item?.name||id, field:'حذف صنف', oldValue:`${item?.stock} وحدة`, newValue:'—', changedBy:user?.name||'مجهول' })
    return true
  }

  // Explicit, reasoned, server-audited fix for a product whose stock and lots disagree.
  // mode: 'add_lot_for_shortfall' | 'set_stock_to_lots'
  const reconcileInventoryLots = async (id, mode, reason) => {
    const { data, error } = await callRpc('reconcile_inventory_lots', { p_item_id: id, p_mode: mode, p_reason: reason })
    if (error) { inventoryFail('reconcileInventoryLots', error, 'فشلت تسوية الدفعات — يرجى المحاولة مرة أخرى.'); return false }
    applyItemRow(id, data)
    return true
  }

  // Super-admin-only, audited override: changes the SKU AND rewrites it on the reserved
  // orders that carry it, in one transaction. (Ordinary SKU edits are refused while reserved
  // orders depend on the SKU.)
  const changeInventorySku = async (id, newSku, reason) => {
    const { data, error } = await callRpc('change_inventory_sku', { p_item_id: id, p_new_sku: newSku, p_reason: reason })
    if (error) { inventoryFail('changeInventorySku', error, 'فشل تغيير الـSKU — يرجى المحاولة مرة أخرى.'); return false }
    applyItemRow(id, data)
    return true
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
      addOrder, updateOrder, resubmitOrder, updateOrderStatus, approveOrder, rejectOrder,
      cancelOrder, restoreOrder, revertLastStatus, returnToSales, deleteOrder,
      getOrdersByRep, getOrdersByRepGrouped,
      addInventoryItem, addStockLot, updateStockLot, updateInventoryItem, deleteInventoryItem,
      adjustInventoryStock, reconcileInventoryLots, changeInventorySku,
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
