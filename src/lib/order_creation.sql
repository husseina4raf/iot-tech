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
-- ══════════════════════════════════════════════════════════════

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

  INSERT INTO orders (
    id, serial_number,
    client_name, company, mobile, whatsapp,
    address, location_link,
    sales_rep, items,
    subtotal, vat_percent, vat_amount, total,
    invoice_type, invoice_name, tax_number, notes,
    payment_method, date, time,
    status, created_at, updated_at, edit_history
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
    'بانتظار الموافقة', NOW(), NOW(), '[]'::jsonb
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
