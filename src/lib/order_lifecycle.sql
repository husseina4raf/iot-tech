-- ══════════════════════════════════════════════════════════════
-- Order lifecycle RPCs — PART B            (2nd of the migration set)
-- Run in: Supabase Dashboard → SQL Editor
-- REQUIRES order_creation.sql (helpers + orders.inventory_deducted).
--
-- THIS FILE HAS NOT BEEN EXECUTED. Same transaction rules as Part A: explicit
-- BEGIN … COMMIT with a lock_timeout; on any error run ROLLBACK; and retry.
--
-- Every order write the application performs (other than a plain DELETE) is one
-- of the functions below or create_order / resubmit_order (Part A). Each one is
-- a single transaction that locks the order row FIRST and then the affected
-- inventory rows (deterministic order, inside _order_apply_inventory), so status,
-- history, stock and inventory_deducted change together or not at all.
--
-- Stale-screen protection (compare-and-set)
--   * advance_order_status  requires the status the screen believed the order had;
--   * return / cancel / revert accept an optional expected status;
--   * update_order_details  requires the order's updated_at the form was loaded at
--     (every write stamps updated_at with clock_timestamp(), so the token changes on
--     EVERY write — NOW() would repeat within one transaction — and is compared exactly);
--   * reject_order / restore_cancelled_order have a single valid source status.
--   A stale screen therefore gets an Arabic "changed since you loaded it" error
--   and can never approve, dispatch, reject, edit or revert over a newer change.
--
-- Invariants
--   "Reserved" statuses (stock is held):   بانتظار الموافقة, موافق عليه, تم الصرف,
--                                           مكتمل, تم التحصيل
--   "Unreserved" statuses (stock NOT held): جديد, مرفوض, ملغي
--   inventory_deducted = TRUE ⇔ the order currently holds stock. Historical rows
--   (flag FALSE) are never guessed or rewritten; a function only moves stock when
--   the flag / transition says it must.
--
-- Re-activation paths
--   restore_cancelled_order: re-deducts if the order held stock when cancelled
--     (cancellation entry has inventoryWasDeducted = true); restores without a
--     stock movement if it held none; cancellations recorded before this
--     migration (no field) go back to `جديد` so Sales resubmits.
--   revert_order_status: only reverts the NEWEST applicable history entry
--     (status_change / returned_to_sales / cancellation), and only if it is a
--     status_change whose newStatus still equals the current status. Moves stock
--     only when it crosses the reserved/unreserved boundary.
-- ══════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regprocedure('public._order_apply_inventory(jsonb,text,text)') IS NULL
     OR to_regprocedure('public._order_actor_name(text)') IS NULL
     OR to_regprocedure('private.order_items_signature(jsonb)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='orders' AND column_name='inventory_deducted') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — run order_creation.sql (Part A) first; nothing was changed';
  END IF;
END
$pre$;


CREATE OR REPLACE FUNCTION _order_status_reserved(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_status IN ('بانتظار الموافقة', 'موافق عليه', 'تم الصرف', 'مكتمل', 'تم التحصيل')
$$;

REVOKE ALL ON FUNCTION _order_status_reserved(TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- B1. return_order_to_sales
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION return_order_to_sales(
  p_order_id        TEXT,
  p_changed_by      TEXT DEFAULT NULL,
  p_expected_status TEXT DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current orders;
  v_row     orders;
BEGIN
  PERFORM _order_require_role(
    ARRAY['team_leader', 'admin', 'super_admin'],
    'ليس لديك صلاحية إعادة الطلب للسيلز'
  );

  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF p_expected_status IS NOT NULL AND v_current.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'تغيّرت حالة الطلب منذ آخر تحديث للصفحة (الحالة الحالية: %) — حدّث الصفحة ثم أعد المحاولة', v_current.status;
  END IF;

  IF v_current.status NOT IN ('موافق عليه', 'تم الصرف', 'مكتمل', 'تم التحصيل') THEN
    RAISE EXCEPTION 'لا يمكن إعادة هذا الطلب للسيلز من حالته الحالية';
  END IF;

  IF v_current.inventory_deducted THEN
    PERFORM _order_apply_inventory(v_current.items, 'restore', v_current.serial_number);
  END IF;

  UPDATE orders SET
    status = 'جديد',
    inventory_deducted = FALSE,
    updated_at = clock_timestamp(),
    edit_history = COALESCE(v_current.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type', 'returned_to_sales',
      'previousStatus', v_current.status,
      'newStatus', 'جديد',
      'returnedAt', _order_iso_now(),
      'returnedBy', _order_actor_name(p_changed_by),
      'reason', 'إعادة للسيلز للتعديل'
    ))
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- B2. reject_order  (only from بانتظار الموافقة)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION reject_order(p_order_id TEXT, p_changed_by TEXT DEFAULT NULL)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current orders;
  v_row     orders;
BEGIN
  PERFORM _order_require_role(
    ARRAY['team_leader', 'admin', 'super_admin'],
    'ليس لديك صلاحية رفض الطلب'
  );

  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF v_current.status <> 'بانتظار الموافقة' THEN
    RAISE EXCEPTION 'لا يمكن رفض هذا الطلب من حالته الحالية (الحالة الحالية: %) — حدّث الصفحة', v_current.status;
  END IF;

  IF v_current.inventory_deducted THEN
    PERFORM _order_apply_inventory(v_current.items, 'restore', v_current.serial_number);
  END IF;

  UPDATE orders SET
    status = 'مرفوض',
    inventory_deducted = FALSE,
    updated_at = clock_timestamp(),
    edit_history = COALESCE(v_current.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type', 'status_change',
      'previousStatus', v_current.status,
      'newStatus', 'مرفوض',
      'changedAt', _order_iso_now(),
      'changedBy', _order_actor_name(p_changed_by)
    ))
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- B3. cancel_order
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION cancel_order(
  p_order_id        TEXT,
  p_changed_by      TEXT DEFAULT NULL,
  p_expected_status TEXT DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current orders;
  v_row     orders;
BEGIN
  PERFORM _order_require_role(
    ARRAY['admin', 'super_admin'],
    'ليس لديك صلاحية إلغاء الطلب'
  );

  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF p_expected_status IS NOT NULL AND v_current.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'تغيّرت حالة الطلب منذ آخر تحديث للصفحة (الحالة الحالية: %) — حدّث الصفحة ثم أعد المحاولة', v_current.status;
  END IF;

  IF v_current.status = 'ملغي' THEN
    RAISE EXCEPTION 'هذا الطلب ملغي بالفعل';
  END IF;

  IF v_current.inventory_deducted THEN
    PERFORM _order_apply_inventory(v_current.items, 'restore', v_current.serial_number);
  END IF;

  UPDATE orders SET
    status = 'ملغي',
    inventory_deducted = FALSE,
    updated_at = clock_timestamp(),
    edit_history = COALESCE(v_current.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type', 'cancellation',
      'previousStatus', v_current.status,
      'cancelledAt', _order_iso_now(),
      'cancelledBy', _order_actor_name(p_changed_by),
      'inventoryWasDeducted', v_current.inventory_deducted
    ))
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- B4. restore_cancelled_order  (un-cancel)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION restore_cancelled_order(p_order_id TEXT, p_changed_by TEXT DEFAULT NULL)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current  orders;
  v_row      orders;
  v_hist     JSONB;
  v_idx      BIGINT;
  v_entry    JSONB;
  v_was      JSONB;
  v_prev     TEXT;
  v_target   TEXT;
  v_new_flag BOOLEAN := FALSE;
  v_new_hist JSONB;
BEGIN
  PERFORM _order_require_role(
    ARRAY['admin', 'super_admin'],
    'ليس لديك صلاحية استعادة الطلب'
  );

  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF v_current.status <> 'ملغي' THEN
    RAISE EXCEPTION 'هذا الطلب غير ملغي';
  END IF;
  IF v_current.inventory_deducted THEN
    RAISE EXCEPTION 'حالة المخزون لهذا الطلب غير متسقة — يرجى مراجعة الإدارة قبل استعادته';
  END IF;

  v_hist := COALESCE(v_current.edit_history, '[]'::jsonb);

  SELECT e.ord INTO v_idx
    FROM jsonb_array_elements(v_hist) WITH ORDINALITY AS e(value, ord)
   WHERE e.value->>'type' = 'cancellation'
   ORDER BY e.ord DESC
   LIMIT 1;

  IF v_idx IS NOT NULL THEN
    v_entry := v_hist -> ((v_idx - 1)::INTEGER);
    v_was   := v_entry -> 'inventoryWasDeducted';
    v_prev  := NULLIF(v_entry->>'previousStatus', '');
  END IF;

  IF v_idx IS NULL OR v_was IS NULL OR jsonb_typeof(v_was) <> 'boolean' THEN
    v_target := 'جديد';
  ELSIF v_was = 'true'::jsonb THEN
    v_target := COALESCE(v_prev, 'بانتظار الموافقة');
    IF NOT _order_status_reserved(v_target) THEN
      v_target := 'بانتظار الموافقة';
    END IF;
    PERFORM _order_apply_inventory(v_current.items, 'deduct', v_current.serial_number);
    v_new_flag := TRUE;
  ELSE
    v_target := COALESCE(v_prev, 'جديد');
    IF v_target = 'ملغي' THEN
      v_target := 'جديد';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(e.value ORDER BY e.ord), '[]'::jsonb) INTO v_new_hist
    FROM jsonb_array_elements(v_hist) WITH ORDINALITY AS e(value, ord)
   WHERE v_idx IS NULL OR e.ord <> v_idx;

  UPDATE orders SET
    status = v_target,
    inventory_deducted = v_new_flag,
    updated_at = clock_timestamp(),
    edit_history = v_new_hist
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- B5. revert_order_status
-- ══════════════════════════════════════════════════════════════
-- Reverts ONLY the newest applicable history entry, and only if it is still the
-- reason the order has its current status. So an old approval cannot be reverted
-- after the order was returned to Sales / cancelled / moved on.
CREATE OR REPLACE FUNCTION revert_order_status(
  p_order_id        TEXT,
  p_changed_by      TEXT DEFAULT NULL,
  p_expected_status TEXT DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current  orders;
  v_row      orders;
  v_hist     JSONB;
  v_idx      BIGINT;
  v_entry    JSONB;
  v_prev     TEXT;
  v_new_hist JSONB;
  v_new_flag BOOLEAN;
BEGIN
  PERFORM _order_require_role(
    ARRAY['admin', 'super_admin'],
    'ليس لديك صلاحية التراجع عن الحالة'
  );

  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF p_expected_status IS NOT NULL AND v_current.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'تغيّرت حالة الطلب منذ آخر تحديث للصفحة (الحالة الحالية: %) — حدّث الصفحة ثم أعد المحاولة', v_current.status;
  END IF;

  IF v_current.status = 'ملغي' THEN
    RAISE EXCEPTION 'الطلب ملغي — استخدم الاستعادة من تبويب الطلبات الملغاة';
  END IF;

  v_hist := COALESCE(v_current.edit_history, '[]'::jsonb);

  -- The newest entry that describes a lifecycle transition (plain edit notes are ignored)
  SELECT e.ord, e.value INTO v_idx, v_entry
    FROM jsonb_array_elements(v_hist) WITH ORDINALITY AS e(value, ord)
   WHERE e.value->>'type' IN ('status_change', 'returned_to_sales', 'cancellation')
   ORDER BY e.ord DESC
   LIMIT 1;

  IF v_idx IS NULL THEN
    RAISE EXCEPTION 'لا يوجد تغيير حالة سابق للتراجع عنه';
  END IF;
  IF v_entry->>'type' <> 'status_change' THEN
    RAISE EXCEPTION 'لا يمكن التراجع — آخر إجراء على الطلب لم يكن تغيير حالة قابلاً للتراجع (مثل إعادته للسيلز أو إلغائه)';
  END IF;
  IF v_entry->>'newStatus' IS DISTINCT FROM v_current.status THEN
    RAISE EXCEPTION 'لا يمكن التراجع — الحالة الحالية لا تطابق آخر تغيير مسجل، حدّث الصفحة';
  END IF;

  v_prev := NULLIF(v_entry->>'previousStatus', '');
  IF v_prev IS NULL OR v_prev NOT IN (
       'بانتظار الموافقة', 'جديد', 'موافق عليه', 'تم الصرف', 'مكتمل', 'تم التحصيل', 'مرفوض') THEN
    RAISE EXCEPTION 'تعذر تحديد الحالة السابقة لهذا الطلب';
  END IF;

  v_new_flag := v_current.inventory_deducted;

  IF _order_status_reserved(v_current.status) AND NOT _order_status_reserved(v_prev) THEN
    IF v_current.inventory_deducted THEN
      PERFORM _order_apply_inventory(v_current.items, 'restore', v_current.serial_number);
      v_new_flag := FALSE;
    END IF;
  ELSIF NOT _order_status_reserved(v_current.status) AND _order_status_reserved(v_prev) THEN
    IF NOT v_current.inventory_deducted THEN
      PERFORM _order_apply_inventory(v_current.items, 'deduct', v_current.serial_number);
      v_new_flag := TRUE;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(e.value ORDER BY e.ord), '[]'::jsonb) INTO v_new_hist
    FROM jsonb_array_elements(v_hist) WITH ORDINALITY AS e(value, ord)
   WHERE e.ord <> v_idx;

  UPDATE orders SET
    status = v_prev,
    inventory_deducted = v_new_flag,
    updated_at = clock_timestamp(),
    edit_history = v_new_hist
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- B6. advance_order_status — approve / dispatch / complete / collect
-- ══════════════════════════════════════════════════════════════
-- Replaces the client's direct `UPDATE orders SET status` (which had no
-- precondition and wrote a stale history array). The caller states the status it
-- saw; if the order has moved on, the call is refused. Exactly the transitions
-- the UI offers are allowed; none of them moves stock (the reservation was made
-- at creation / resubmission). The optional dispatch guard trigger
-- (guard_order_dispatch.sql) still applies to these updates when installed.
CREATE OR REPLACE FUNCTION advance_order_status(
  p_order_id        TEXT,
  p_expected_status TEXT,
  p_new_status      TEXT,
  p_changed_by      TEXT DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role    TEXT;
  v_current orders;
  v_row     orders;
BEGIN
  v_role := _order_require_role(
    ARRAY['team_leader', 'admin', 'super_admin'],
    'ليس لديك صلاحية تحديث حالة الطلب'
  );

  IF p_expected_status IS NULL OR p_new_status IS NULL THEN
    RAISE EXCEPTION 'بيانات تحديث الحالة غير مكتملة — حدّث الصفحة ثم أعد المحاولة';
  END IF;

  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF v_current.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'تغيّرت حالة الطلب منذ آخر تحديث للصفحة (الحالة الحالية: %) — حدّث الصفحة ثم أعد المحاولة', v_current.status;
  END IF;

  IF NOT ((v_current.status, p_new_status) IN (
        ('بانتظار الموافقة', 'موافق عليه'),
        ('موافق عليه',       'تم الصرف'),
        ('تم الصرف',         'مكتمل'),
        ('مكتمل',            'تم التحصيل'))) THEN
    RAISE EXCEPTION 'انتقال الحالة غير مسموح (من "%" إلى "%")', v_current.status, p_new_status;
  END IF;

  IF v_role = 'team_leader' AND p_new_status <> 'موافق عليه' THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تحديث الطلب إلى هذه الحالة';
  END IF;

  UPDATE orders SET
    status = p_new_status,
    updated_at = clock_timestamp(),
    edit_history = COALESCE(v_current.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type', 'status_change',
      'previousStatus', v_current.status,
      'newStatus', p_new_status,
      'changedAt', _order_iso_now(),
      'changedBy', _order_actor_name(p_changed_by)
    ))
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- B7. update_order_details — plain edits (no status change, no stock movement)
-- ══════════════════════════════════════════════════════════════
-- Replaces the client's direct full-row UPDATE (stale-form overwrites, history
-- rewritten client-side, and — for a reserved order — silently changing the items
-- so stock and the order disagreed). Here:
--   * the form must carry the order's updated_at it was loaded at (compare-and-set);
--   * while the order holds stock (inventory_deducted), the per-product quantity
--     fingerprint of the items must not change — prices, notes, customer and
--     address fields may; SKUs, quantities and added/removed lines may not.
--     (Change those via Return to Sales → edit → resubmit.)
--   * a `sales` caller may only edit their OWN order, and only while it is `جديد` or
--     `مرفوض` (returned / rejected); team_leader / admin / super_admin are unchanged;
--   * history gets a server-written entry.
CREATE OR REPLACE FUNCTION update_order_details(
  p_order_id            TEXT,
  p_expected_updated_at TEXT,
  p_order               JSONB
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role TEXT;
  caller_rep  TEXT;
  v_sales_rep TEXT;
  v_subtotal  NUMERIC;
  v_vat_pct   NUMERIC;
  v_vat_amt   NUMERIC;
  v_total     NUMERIC;
  v_expected  TIMESTAMPTZ;
  v_current   orders;
  v_row       orders;
BEGIN
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'بيانات الطلب غير صحيحة';
  END IF;

  caller_role := _order_require_role(
    ARRAY['sales', 'team_leader', 'admin', 'super_admin'],
    'ليس لديك صلاحية تعديل هذا الطلب'
  );

  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF v_current.status = 'ملغي' THEN
    RAISE EXCEPTION 'لا يمكن تعديل طلب ملغي — استعده أولاً';
  END IF;

  IF caller_role = 'sales' THEN
    SELECT p.rep_name INTO caller_rep FROM profiles AS p WHERE p.id = auth.uid();
    IF caller_rep IS NULL OR v_current.sales_rep IS DISTINCT FROM caller_rep THEN
      RAISE EXCEPTION 'ليس لديك صلاحية تعديل هذا الطلب';
    END IF;
    -- Sales may edit only orders that are back with them (returned / rejected). Once an order
    -- is submitted (pending, approved, dispatched, completed, collected) its prices, totals and
    -- invoice fields are no longer theirs to change — matching the UI, where Sales can open an
    -- order for editing only in these two statuses.
    IF v_current.status NOT IN ('جديد', 'مرفوض') THEN
      RAISE EXCEPTION 'لا يمكنك تعديل الطلب بعد إرساله — يمكن تعديله فقط عند إعادته إليك للتعديل';
    END IF;
    v_sales_rep := caller_rep;
  ELSE
    v_sales_rep := COALESCE(NULLIF(TRIM(p_order->>'salesRep'), ''), v_current.sales_rep);
  END IF;

  IF NULLIF(btrim(COALESCE(p_expected_updated_at, '')), '') IS NULL THEN
    RAISE EXCEPTION 'بيانات التحقق من إصدار الطلب مفقودة — حدّث الصفحة ثم أعد المحاولة';
  END IF;
  BEGIN
    v_expected := p_expected_updated_at::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'بيانات التحقق من إصدار الطلب غير صحيحة — حدّث الصفحة ثم أعد المحاولة';
  END;
  IF v_current.updated_at IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'تم تعديل هذا الطلب من مستخدم آخر منذ فتحه — يرجى تحديث الصفحة ثم إعادة المحاولة';
  END IF;

  PERFORM _order_validate_items(p_order->'items');
  v_subtotal := _order_parse_amount(p_order->'subtotal',   'المجموع الفرعي');
  v_vat_pct  := _order_parse_amount(p_order->'vatPercent', 'نسبة الضريبة');
  v_vat_amt  := _order_parse_amount(p_order->'vatAmount',  'قيمة الضريبة');
  v_total    := _order_parse_amount(p_order->'total',      'الإجمالي');

  IF v_current.inventory_deducted
     AND private.order_items_signature(v_current.items) IS DISTINCT FROM private.order_items_signature(p_order->'items') THEN
    RAISE EXCEPTION 'لا يمكن تعديل الأصناف أو الكميات أو الـSKU لطلب محجوز المخزون — استخدم «إعادة للسيلز للتعديل» ثم عدّل وأعد الإرسال';
  END IF;

  UPDATE orders SET
    client_name = p_order->>'clientName', company = p_order->>'company',
    mobile = p_order->>'mobile', whatsapp = p_order->>'whatsapp',
    address = p_order->>'address', location_link = p_order->>'locationLink',
    sales_rep = v_sales_rep, items = p_order->'items',
    subtotal = v_subtotal, vat_percent = v_vat_pct, vat_amount = v_vat_amt, total = v_total,
    invoice_type = p_order->>'invoiceType', invoice_name = p_order->>'invoiceName',
    tax_number = p_order->>'taxNumber', notes = p_order->>'notes',
    payment_method = p_order->>'paymentMethod', date = p_order->>'date', time = p_order->>'time',
    updated_at = clock_timestamp(),
    edit_history = COALESCE(v_current.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'editedAt', _order_iso_now(),
      'editedBy', _order_actor_name(p_order->>'changedByName'),
      'note', 'تم التعديل'
    ))
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ── Grants: authenticated only (role checks are inside each function) ─────
REVOKE ALL ON FUNCTION public.return_order_to_sales(TEXT, TEXT, TEXT)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_order(TEXT, TEXT)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_order(TEXT, TEXT, TEXT)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_cancelled_order(TEXT, TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_order_status(TEXT, TEXT, TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.advance_order_status(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_order_details(TEXT, TEXT, JSONB)      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.return_order_to_sales(TEXT, TEXT, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_order(TEXT, TEXT)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(TEXT, TEXT, TEXT)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_cancelled_order(TEXT, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_order_status(TEXT, TEXT, TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_order_status(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_details(TEXT, TEXT, JSONB)      TO authenticated;

COMMIT;
