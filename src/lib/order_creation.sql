-- ══════════════════════════════════════════════════════════════
-- Atomic Order Creation — server-side sequence + RPC
-- Run in: Supabase Dashboard → SQL Editor
--
-- THIS FILE HAS NOT BEEN EXECUTED. Review before running manually.
--
-- Purpose
-- -------
-- Order creation previously computed the next `serial_number` on the
-- client (useOrders.jsx: getNextSerial() = Math.max over the browser's
-- local, paginated `orders` array + 1), then inserted a row whose `id` is
-- `ORD-<serial>`. Two browsers submitting close together (well within
-- realtime's normal propagation latency) could compute the identical
-- serial, and the second INSERT would fail with a duplicate-key error
-- (23505) on `orders_pkey` — with no server-side guarantee preventing the
-- collision from being attempted in the first place.
--
-- This migration replaces that with a PostgreSQL SEQUENCE (atomic,
-- lock-free, guaranteed-unique even under heavy concurrency) plus a
-- SECURITY DEFINER RPC that reserves the next serial AND inserts the
-- order in the same function call — closing the race entirely, with no
-- dependency on frontend state, pagination, or realtime timing.
--
-- Verified live-data facts (as reported before writing this file):
--   - orders row count: 233
--   - current MAX numeric serial_number: 3004
--   - invalid/null serial_number count: 0
--   => the sequence below MUST start at 3005 to avoid colliding with any
--      already-issued serial.
--
-- Identity format is unchanged: future orders still get
-- id = 'ORD-<serial>', serial_number = '<serial>' as plain text — exactly
-- as historical orders already do. No existing row is touched.
--
-- ══════════════════════════════════════════════════════════════
-- UPDATE — Inventory deduction moved to order creation
-- ══════════════════════════════════════════════════════════════
-- Business rule change: inventory is now deducted the moment an order is
-- successfully created (previously it was deducted when an order reached
-- "تم الصرف" — that dispatch-time deduction has been REMOVED from the
-- application code; useOrders.jsx's updateOrderStatus() no longer touches
-- inventory for any status transition).
--
-- Both create_order() (below) and the new resubmit_order() perform the
-- order write AND the inventory deduction inside the SAME function call —
-- a Postgres function body is one transaction, so if any item can't be
-- matched to inventory, RAISE EXCEPTION rolls back the ENTIRE call,
-- including the order INSERT/UPDATE itself. This is genuine database
-- atomicity: either the order exists with its inventory fully deducted,
-- or neither the order nor any inventory change exists at all. There is
-- no client-side "two independent calls" step here.
--
-- New column: orders.inventory_deducted — an explicit, unambiguous flag
-- (replacing the previous fragile "was this order ever seen at تم الصرف"
-- inference from status/editHistory) that the client uses to decide
-- whether cancelling / rejecting / returning-to-Sales an order needs to
-- restore stock. Defaults to FALSE for existing historical rows — this
-- migration does NOT attempt to guess or backfill whether an old,
-- already-dispatched order's stock was actually deducted under the
-- previous model; only orders created/resubmitted after this migration
-- runs get an authoritative TRUE/FALSE value.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_deducted BOOLEAN NOT NULL DEFAULT FALSE;


-- ── 1. The authoritative serial source ───────────────────────────────────
-- A sequence can never hand out the same value twice, even to two callers
-- requesting nextval() in the same millisecond — this is what actually
-- closes the race (not any amount of client-side care).
CREATE SEQUENCE IF NOT EXISTS orders_serial_seq START WITH 3005;


-- ── 2. Atomic create-order RPC ───────────────────────────────────────────
-- Accepts the order payload as JSONB (the same fields useOrders.jsx's
-- addOrder() already sends, in the same camelCase shape the frontend
-- already uses — see the INSERT below for the exact field mapping) and
-- returns the newly created `orders` row, generated id and serial_number
-- included, so the frontend never has to guess or recompute them.
--
-- id, serial_number, status, created_at, updated_at and edit_history are
-- entirely server-controlled — the client cannot influence any of them
-- through this payload.
CREATE OR REPLACE FUNCTION create_order(p_order JSONB)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id   UUID;
  caller_role TEXT;
  caller_rep  TEXT;
  v_serial    TEXT;
  v_sales_rep TEXT;
  v_row       orders;
  -- ── Inventory deduction locals (see the FIFO loop before the INSERT) ──
  v_item      JSONB;
  v_item_sku  TEXT;
  v_item_name TEXT;
  v_item_qty  NUMERIC;
  v_inv_id    TEXT;
  v_inv_name  TEXT;
  v_inv_stock NUMERIC;
  v_inv_lots  JSONB;
  v_inv_cost  NUMERIC;
  v_new_lots  JSONB;
  v_remaining NUMERIC;
  v_lot       JSONB;
  v_lot_qty   NUMERIC;
  v_consume   NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost  NUMERIC;
  v_unmatched TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── Authorization ────────────────────────────────────────────────────
  -- This function is SECURITY DEFINER and therefore bypasses RLS
  -- entirely — the live database was found to have NO orders INSERT
  -- policy at all (a `pg_policies` check for public.orders INSERT
  -- returned zero rows), so this function is the only thing standing
  -- between an authenticated session and this table. Every rule below
  -- exists specifically because RLS cannot be relied upon here.
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول أولاً';
  END IF;

  caller_role := get_my_role();
  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — الحساب غير مرتبط بأي صلاحية';
  END IF;

  IF caller_role NOT IN ('sales', 'team_leader', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية إنشاء طلب';
  END IF;

  -- sales_rep attribution:
  --   sales → always the CALLER'S OWN rep_name, read here from `profiles`,
  --     never taken from the client-supplied payload. This is what
  --     actually prevents a sales user from submitting an order under a
  --     different rep's name — the client's `salesRep` field is ignored
  --     entirely for this role.
  --   team_leader / admin / super_admin → may create an order on behalf
  --     of any rep. OrderFormFields.jsx's `isSalesRep` check is true only
  --     for role === 'sales', so Team Leaders see the same free rep-
  --     selection dropdown Admin/Super Admin do (this is a confirmed,
  --     intentional, actively-used capability — see the Sidebar "New
  --     Order" shortcut, explicitly grouped as admin/super_admin/
  --     team_leader) — so the payload's `salesRep` is used for all three
  --     of these roles, validated as non-empty.
  IF caller_role = 'sales' THEN
    SELECT p.rep_name INTO caller_rep
      FROM profiles AS p
     WHERE p.id = caller_id;

    IF caller_rep IS NULL THEN
      RAISE EXCEPTION 'حسابك غير مرتبط باسم مندوب مبيعات — لا يمكن إنشاء طلب';
    END IF;

    v_sales_rep := caller_rep;
  ELSIF caller_role IN ('team_leader', 'admin', 'super_admin') THEN
    v_sales_rep := NULLIF(TRIM(p_order->>'salesRep'), '');
    IF v_sales_rep IS NULL THEN
      RAISE EXCEPTION 'يرجى اختيار مندوب المبيعات';
    END IF;
  ELSE
    RAISE EXCEPTION 'دور غير مسموح — لا يمكن إنشاء طلب';
  END IF;

  -- ── The atomic reservation ───────────────────────────────────────────
  -- Reserved and used inside this same function call — no window exists
  -- between "get a serial" and "use it" for another caller to race into.
  -- A rolled-back call after this point leaves a harmless gap in the
  -- sequence, never a duplicate or a reused value — this is expected and
  -- requires no manual repair.
  v_serial := nextval('orders_serial_seq')::TEXT;

  -- ── Inventory deduction — SKU-first, FIFO lot consumption ─────────────
  -- Mirrors findInventoryMatch()/the FIFO logic previously in
  -- useOrders.jsx's updateOrderStatus() (now removed from there — see the
  -- header note above). Runs BEFORE the order INSERT so an unmatched item
  -- aborts before any row is written at all; because this whole function
  -- is one transaction, raising here would roll back the INSERT below
  -- even if it ran first, so the ordering is for clarity, not correctness.
  --
  -- Row locking (concurrency): each matched inventory row is locked with
  -- FOR UPDATE at the moment it's read. Two concurrent create_order() (or
  -- resubmit_order()) calls matching the SAME inventory row will have
  -- their SELECT ... FOR UPDATE serialize — the second caller's SELECT
  -- blocks until the first caller's transaction COMMITs (releasing the
  -- lock) or ROLLBACKs. The second caller then reads the FIRST caller's
  -- already-updated stock, so quantity checks below always see the true
  -- remaining stock rather than a stale pre-deduction snapshot. Only the
  -- one matched row is ever locked — no other inventory row is touched.
  --
  -- Insufficient-stock handling: if the requested quantity exceeds the
  -- now-locked row's stock, RAISE EXCEPTION here aborts the ENTIRE
  -- function call — since a PL/pgSQL function body is one transaction,
  -- this rolls back every inventory UPDATE already applied to EARLIER
  -- items in this same order, as well as the order INSERT/UPDATE itself.
  -- Stock is never clamped to zero.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_order->'items', '[]'::jsonb))
  LOOP
    v_item_sku  := LOWER(TRIM(COALESCE(v_item->>'sku', '')));
    v_item_name := COALESCE(v_item->>'name', '');
    v_item_qty  := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    v_inv_id := NULL;
    IF v_item_sku <> '' THEN
      -- Exact, normalized SKU match — authoritative whenever present.
      SELECT id, name, stock, lots, cost_price INTO v_inv_id, v_inv_name, v_inv_stock, v_inv_lots, v_inv_cost
        FROM inventory WHERE LOWER(TRIM(sku)) = v_item_sku LIMIT 1 FOR UPDATE;
    ELSE
      -- Fallback fuzzy name match, only for items with no SKU at all —
      -- same bidirectional substring rule as findInventoryMatch().
      SELECT id, name, stock, lots, cost_price INTO v_inv_id, v_inv_name, v_inv_stock, v_inv_lots, v_inv_cost
        FROM inventory
       WHERE LOWER(name) LIKE '%' || LOWER(v_item_name) || '%'
          OR LOWER(v_item_name) LIKE '%' || LOWER(name) || '%'
       LIMIT 1 FOR UPDATE;
    END IF;

    IF v_inv_id IS NULL THEN
      v_unmatched := array_append(v_unmatched,
        v_item_name || CASE WHEN v_item_sku <> '' THEN ' (SKU: ' || (v_item->>'sku') || ')' ELSE '' END);
      CONTINUE;
    END IF;

    -- Stock availability — checked against the just-locked, up-to-date row
    -- BEFORE any lot is consumed or written. Insufficient stock aborts the
    -- whole order (see comment above the loop) rather than clamping to 0.
    IF v_item_qty > v_inv_stock THEN
      RAISE EXCEPTION 'الكمية المطلوبة غير متاحة في المخزون للصنف: % — المتاح: % — المطلوب: %', v_inv_name, v_inv_stock, v_item_qty;
    END IF;

    -- FIFO: consume from the earliest lots first, drop exhausted lots,
    -- keep the remaining lots' original order and cost.
    v_remaining := v_item_qty;
    v_new_lots  := '[]'::jsonb;
    FOR v_lot IN SELECT * FROM jsonb_array_elements(COALESCE(v_inv_lots, '[]'::jsonb))
    LOOP
      v_lot_qty := COALESCE((v_lot->>'qty')::NUMERIC, 0);
      IF v_remaining > 0 THEN
        v_consume   := LEAST(v_remaining, v_lot_qty);
        v_remaining := v_remaining - v_consume;
        v_lot_qty   := v_lot_qty - v_consume;
      END IF;
      IF v_lot_qty > 0 THEN
        v_new_lots := v_new_lots || jsonb_build_array(jsonb_set(v_lot, '{qty}', to_jsonb(v_lot_qty)));
      END IF;
    END LOOP;

    v_new_stock := v_inv_stock - v_item_qty;
    v_new_cost  := CASE WHEN jsonb_array_length(v_new_lots) > 0
                        THEN (v_new_lots->0->>'costPrice')::NUMERIC
                        ELSE COALESCE(v_inv_cost, 0) END;

    UPDATE inventory SET stock = v_new_stock, lots = v_new_lots, cost_price = v_new_cost
     WHERE id = v_inv_id;
  END LOOP;

  IF array_length(v_unmatched, 1) > 0 THEN
    RAISE EXCEPTION 'تعذر إنشاء الطلب — لم يتم العثور على تطابق في المخزون للأصناف التالية: %', array_to_string(v_unmatched, '، ');
  END IF;

  INSERT INTO orders (
    id, serial_number,
    client_name, company, mobile, whatsapp,
    address, location_link,
    sales_rep, items,
    subtotal, vat_percent, vat_amount, total,
    invoice_type, invoice_name, tax_number, notes,
    payment_method, date, time,
    status, inventory_deducted, created_at, updated_at, edit_history
  ) VALUES (
    'ORD-' || v_serial, v_serial,
    p_order->>'clientName', p_order->>'company', p_order->>'mobile', p_order->>'whatsapp',
    p_order->>'address', p_order->>'locationLink',
    v_sales_rep, COALESCE(p_order->'items', '[]'::jsonb),
    COALESCE((p_order->>'subtotal')::NUMERIC, 0),
    COALESCE((p_order->>'vatPercent')::NUMERIC, 0),
    COALESCE((p_order->>'vatAmount')::NUMERIC, 0),
    COALESCE((p_order->>'total')::NUMERIC, 0),
    p_order->>'invoiceType', p_order->>'invoiceName', p_order->>'taxNumber', p_order->>'notes',
    p_order->>'paymentMethod', p_order->>'date', p_order->>'time',
    'بانتظار الموافقة', TRUE, NOW(), NOW(), '[]'::jsonb
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Lock down public access; only authenticated users may call this RPC.
-- The role/rep scoping above is what actually restricts what each
-- authenticated caller can do with it.
REVOKE ALL  ON FUNCTION public.create_order(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO authenticated;


-- ── 3. Atomic resubmit-order RPC ─────────────────────────────────────────
-- Covers the "Return to Sales → Sales edits → submits again" lifecycle.
-- When an order is returned to Sales (status جديد) or rejected (مرفوض),
-- its inventory has already been restored (see restoreStockForOrder() in
-- useOrders.jsx, now triggered off the inventory_deducted flag instead of
-- a تم الصرف-based guess). Re-submitting that order through OrderForm.jsx
-- must deduct the (possibly edited) quantities again, exactly once, and
-- must not be reachable from any other order state.
--
-- Like create_order(), the order UPDATE and the inventory deduction
-- happen inside this single function call — one transaction, so a
-- deduction failure rolls back the order update too. `SELECT ... FOR
-- UPDATE` row-locks the order for the duration of this call, so a rapid
-- double-click (two concurrent resubmissions of the same order) cannot
-- both pass the "not already deducted" check: the second call blocks
-- until the first commits, then sees inventory_deducted already TRUE and
-- is rejected.
CREATE OR REPLACE FUNCTION resubmit_order(p_order_id TEXT, p_order JSONB)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id   UUID;
  caller_role TEXT;
  caller_rep  TEXT;
  v_sales_rep TEXT;
  v_current   orders;
  v_row       orders;
  v_item      JSONB;
  v_item_sku  TEXT;
  v_item_name TEXT;
  v_item_qty  NUMERIC;
  v_inv_id    TEXT;
  v_inv_name  TEXT;
  v_inv_stock NUMERIC;
  v_inv_lots  JSONB;
  v_inv_cost  NUMERIC;
  v_new_lots  JSONB;
  v_remaining NUMERIC;
  v_lot       JSONB;
  v_lot_qty   NUMERIC;
  v_consume   NUMERIC;
  v_new_stock NUMERIC;
  v_new_cost  NUMERIC;
  v_unmatched TEXT[] := ARRAY[]::TEXT[];
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول أولاً';
  END IF;

  caller_role := get_my_role();
  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — الحساب غير مرتبط بأي صلاحية';
  END IF;

  IF caller_role NOT IN ('sales', 'team_leader', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل هذا الطلب';
  END IF;

  -- Row-locked read: blocks a concurrent resubmit of the same order until
  -- this transaction commits or rolls back.
  SELECT * INTO v_current FROM orders WHERE id = p_order_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;
  IF v_current.status NOT IN ('جديد', 'مرفوض') THEN
    RAISE EXCEPTION 'لا يمكن إعادة إرسال هذا الطلب من حالته الحالية';
  END IF;
  IF v_current.inventory_deducted THEN
    -- Defensive idempotency guard: should never be true when status is
    -- جديد/مرفوض given the client's own restore logic, but this is the
    -- authoritative, database-level stop against a double deduction.
    RAISE EXCEPTION 'تم خصم المخزون لهذا الطلب بالفعل';
  END IF;

  IF caller_role = 'sales' THEN
    SELECT p.rep_name INTO caller_rep FROM profiles AS p WHERE p.id = caller_id;
    IF caller_rep IS NULL THEN
      RAISE EXCEPTION 'حسابك غير مرتبط باسم مندوب مبيعات — لا يمكن إعادة إرسال الطلب';
    END IF;
    v_sales_rep := caller_rep;
  ELSIF caller_role IN ('team_leader', 'admin', 'super_admin') THEN
    v_sales_rep := COALESCE(NULLIF(TRIM(p_order->>'salesRep'), ''), v_current.sales_rep);
  END IF;

  -- ── Inventory deduction — identical logic to create_order() above ────
  -- (row locking + insufficient-stock handling — see the detailed comment
  -- above the equivalent loop in create_order()). If this raises for any
  -- reason, the ENTIRE transaction rolls back: no inventory row already
  -- updated by an earlier item in this same order stays changed, the
  -- order UPDATE below never runs, the order stays in its pre-resubmit
  -- state, and inventory_deducted is never set to TRUE.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_order->'items', '[]'::jsonb))
  LOOP
    v_item_sku  := LOWER(TRIM(COALESCE(v_item->>'sku', '')));
    v_item_name := COALESCE(v_item->>'name', '');
    v_item_qty  := COALESCE((v_item->>'quantity')::NUMERIC, 0);

    v_inv_id := NULL;
    IF v_item_sku <> '' THEN
      SELECT id, name, stock, lots, cost_price INTO v_inv_id, v_inv_name, v_inv_stock, v_inv_lots, v_inv_cost
        FROM inventory WHERE LOWER(TRIM(sku)) = v_item_sku LIMIT 1 FOR UPDATE;
    ELSE
      SELECT id, name, stock, lots, cost_price INTO v_inv_id, v_inv_name, v_inv_stock, v_inv_lots, v_inv_cost
        FROM inventory
       WHERE LOWER(name) LIKE '%' || LOWER(v_item_name) || '%'
          OR LOWER(v_item_name) LIKE '%' || LOWER(name) || '%'
       LIMIT 1 FOR UPDATE;
    END IF;

    IF v_inv_id IS NULL THEN
      v_unmatched := array_append(v_unmatched,
        v_item_name || CASE WHEN v_item_sku <> '' THEN ' (SKU: ' || (v_item->>'sku') || ')' ELSE '' END);
      CONTINUE;
    END IF;

    IF v_item_qty > v_inv_stock THEN
      RAISE EXCEPTION 'الكمية المطلوبة غير متاحة في المخزون للصنف: % — المتاح: % — المطلوب: %', v_inv_name, v_inv_stock, v_item_qty;
    END IF;

    v_remaining := v_item_qty;
    v_new_lots  := '[]'::jsonb;
    FOR v_lot IN SELECT * FROM jsonb_array_elements(COALESCE(v_inv_lots, '[]'::jsonb))
    LOOP
      v_lot_qty := COALESCE((v_lot->>'qty')::NUMERIC, 0);
      IF v_remaining > 0 THEN
        v_consume   := LEAST(v_remaining, v_lot_qty);
        v_remaining := v_remaining - v_consume;
        v_lot_qty   := v_lot_qty - v_consume;
      END IF;
      IF v_lot_qty > 0 THEN
        v_new_lots := v_new_lots || jsonb_build_array(jsonb_set(v_lot, '{qty}', to_jsonb(v_lot_qty)));
      END IF;
    END LOOP;

    v_new_stock := v_inv_stock - v_item_qty;
    v_new_cost  := CASE WHEN jsonb_array_length(v_new_lots) > 0
                        THEN (v_new_lots->0->>'costPrice')::NUMERIC
                        ELSE COALESCE(v_inv_cost, 0) END;

    UPDATE inventory SET stock = v_new_stock, lots = v_new_lots, cost_price = v_new_cost
     WHERE id = v_inv_id;
  END LOOP;

  IF array_length(v_unmatched, 1) > 0 THEN
    RAISE EXCEPTION 'تعذر إرسال الطلب — لم يتم العثور على تطابق في المخزون للأصناف التالية: %', array_to_string(v_unmatched, '، ');
  END IF;

  UPDATE orders SET
    client_name = p_order->>'clientName', company = p_order->>'company',
    mobile = p_order->>'mobile', whatsapp = p_order->>'whatsapp',
    address = p_order->>'address', location_link = p_order->>'locationLink',
    sales_rep = v_sales_rep, items = COALESCE(p_order->'items', '[]'::jsonb),
    subtotal = COALESCE((p_order->>'subtotal')::NUMERIC, 0),
    vat_percent = COALESCE((p_order->>'vatPercent')::NUMERIC, 0),
    vat_amount = COALESCE((p_order->>'vatAmount')::NUMERIC, 0),
    total = COALESCE((p_order->>'total')::NUMERIC, 0),
    invoice_type = p_order->>'invoiceType', invoice_name = p_order->>'invoiceName',
    tax_number = p_order->>'taxNumber', notes = p_order->>'notes',
    payment_method = p_order->>'paymentMethod', date = p_order->>'date', time = p_order->>'time',
    status = 'بانتظار الموافقة',
    inventory_deducted = TRUE,
    updated_at = NOW(),
    edit_history = COALESCE(v_current.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type', 'status_change',
      'previousStatus', v_current.status,
      'newStatus', 'بانتظار الموافقة',
      'changedAt', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'changedBy', COALESCE(NULLIF(TRIM(p_order->>'changedByName'), ''), 'مجهول')
    ))
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL  ON FUNCTION public.resubmit_order(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_order(TEXT, JSONB) TO authenticated;
