// Shared, UI-side helpers for the order ⇄ inventory reservation model.
// The DATABASE is the authority (see src/lib/order_creation.sql and
// order_lifecycle.sql); nothing here changes stock. These helpers only
// (a) mirror the server's rules for immediate form feedback and confirmation
// wording, and (b) turn raw PostgREST/Postgres errors into Arabic messages.

// Statuses in which an order holds stock. Must match _order_status_reserved()
// in order_lifecycle.sql.
export const INVENTORY_RESERVED_STATUSES = [
  'بانتظار الموافقة', 'موافق عليه', 'تم الصرف', 'مكتمل', 'تم التحصيل',
]

export const isInventoryReservedStatus = (status) =>
  INVENTORY_RESERVED_STATUSES.includes(status)

// Mirrors revert_order_status() in order_lifecycle.sql: the only history entry a
// revert may undo is the NEWEST lifecycle entry (status_change / returned_to_sales /
// cancellation — plain edit notes are ignored), and only if it is a status_change
// that still explains the order's current status. Returns that entry, or null when
// a revert is not possible (e.g. the order was returned to Sales after the approval).
export function getRevertableStatusChange(order) {
  const history = order?.editHistory || []
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]
    if (h && ['status_change', 'returned_to_sales', 'cancellation'].includes(h.type)) {
      return h.type === 'status_change' && h.newStatus === order.status ? h : null
    }
  }
  return null
}

// Whether the order's items (SKU / quantities / lines) are frozen because it holds
// stock and is not in a Sales-editable state. Price, notes and customer fields stay
// editable. The database enforces this independently (update_order_details + guard).
export const areOrderItemsLocked = (order) =>
  !!order?.inventoryDeducted && !['مرفوض', 'جديد'].includes(order?.status)

// One random id per submission INTENT. The browser reuses it only for retries of the
// same payload, so create_order can recognise a retry after a lost response.
export function newClientRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // fall through to the non-crypto id below
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

// Mirrors _order_parse_quantity() in order_creation.sql: a whole number from
// 1 to 9,999,999 (a number, or a numeric string such as "7" / "7.0").
// Returns the integer, or null when invalid (blank, 0, negative, decimal,
// exponent, non-numeric).
export function parseOrderQuantity(raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  if (!/^\d{1,7}(\.0+)?$/.test(s)) return null
  const n = parseInt(s, 10)
  return n >= 1 ? n : null
}

// A raw Arabic-lettered message is one of the RPCs' own RAISE EXCEPTION texts
// — written to be shown to the user as-is. Anything else is a raw
// Postgres/PostgREST/network error and is translated (or replaced) below.
const hasArabic = (msg) => /[؀-ۿ]/.test(msg || '')

const DB_UPDATE_REQUIRED =
  'تحديث قاعدة البيانات مطلوب — الدالة أو العمود المطلوب غير موجود. يرجى إبلاغ مسؤول النظام.'

export function friendlyRpcError(err, fallback = 'تعذر إتمام العملية — يرجى المحاولة مرة أخرى.') {
  if (!err) return fallback
  if (hasArabic(err.message)) return err.message

  const code = err.code || ''
  const msg  = String(err.message || '')

  // Function / column missing (migration not run, or PostgREST schema cache stale)
  if (code === 'PGRST202' || code === 'PGRST204' || code === '42883' || code === '42703') {
    return DB_UPDATE_REQUIRED
  }
  // Rolled back by Postgres; safe to retry
  if (code === '40P01' || code === '40001') {
    return 'تعذر إتمام العملية بسبب تعارض مؤقت مع عملية أخرى — يرجى المحاولة مرة أخرى.'
  }
  // Statement / lock timeout: waited too long behind another operation; rolled back
  if (code === '57014' || code === '55P03') {
    return 'استغرقت العملية وقتاً أطول من المعتاد بسبب ازدحام — لم يتم حفظ أي تغيير، يرجى المحاولة مرة أخرى.'
  }
  if (code === 'PGRST301' || /jwt/i.test(msg)) {
    return 'انتهت الجلسة — يرجى تسجيل الدخول مرة أخرى.'
  }
  if (code === '22P02' || code === '22003') {
    return 'قيمة غير صحيحة في بيانات الطلب — يرجى مراجعة الكميات والأسعار.'
  }
  if (code === '42501') {
    return 'ليس لديك صلاحية تنفيذ هذا الإجراء.'
  }
  return code ? `${fallback} (رمز الخطأ: ${code})` : fallback
}
