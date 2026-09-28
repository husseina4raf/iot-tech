-- ══════════════════════════════════════════════════════════════
-- Order creation, resubmission and inventory reservation — PART A
-- Run in: Supabase Dashboard → SQL Editor        (1st of the migration set)
--
-- THIS FILE HAS NOT BEEN EXECUTED. Run src/lib/order_preflight.sql first.
--
-- Migration set and SAFE ORDER (run 1–5 back-to-back in ONE maintenance window)
--   0. order_preflight.sql           read-only; resolve every FAIL first
--   1. order_creation.sql            ← this file  (column, helpers, create/resubmit)
--   2. order_lifecycle.sql           (return / reject / cancel / un-cancel / revert,
--                                     advance status, update order details)
--   3. inventory_management.sql      (atomic inventory RPCs + reference checks)
--   4. guard_order_client_writes.sql + guard_inventory_client_writes.sql
--                                    IMMEDIATELY after step 3, BEFORE the frontend deploy:
--                                    from the moment create_order reserves stock, an old
--                                    cached bundle must not be able to edit reserved items
--                                    or "return" orders client-side (its inventory restore is
--                                    silently filtered by RLS for Team Leaders while it still
--                                    clears the flag). With the guards on, old tabs fail loudly
--                                    with a "refresh the page" message instead of corrupting.
--   5. deploy the frontend, then smoke-test (the new frontend only uses the RPCs)
--   6. reconcile historical orders (order_inventory_diagnostics.sql)
--   7. guard_order_dispatch.sql      LAST — only after reconciliation
--
-- Transaction boundary
--   This file is wrapped in an explicit BEGIN … COMMIT and starts with
--   SET LOCAL lock_timeout, so it either applies completely or not at all,
--   and it never sits waiting on a lock while blocking production traffic.
--   If ANY statement errors, the transaction is aborted: run  ROLLBACK;  and
--   fix the reported problem before retrying. Do not assume the SQL editor
--   wraps a script in a transaction — this file does not depend on that.
--
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS /
-- CREATE OR REPLACE); it never touches existing orders, inventory rows,
-- order history or the serial sequence's current value.
--
-- Business model
--   * Inventory is deducted when an order is created / resubmitted, in the
--     SAME transaction as the order write (any RAISE rolls back everything).
--   * orders.inventory_deducted = "stock is currently reserved for this order".
--     Historical rows default to FALSE and are never guessed or backfilled.
--   * SKU is authoritative. Name matching is only for lines with no SKU.
--   * A deduction needs BOTH enough `stock` AND enough quantity in the FIFO
--     `lots`; a product whose lots cannot cover the order is refused instead of
--     silently over-deducting (historical lots are never rewritten here).
--   * create_order() is idempotent per client request id: a retry after a lost
--     response returns the original order instead of creating a second one.
-- ══════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';


-- ── 0. Preflight assertions (fail fast, change nothing) ───────────────────
DO $pre$
DECLARE
  v_problems TEXT[] := ARRAY[]::TEXT[];
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('orders','id','text'), ('orders','serial_number','text'), ('orders','status','text'),
      ('orders','items','jsonb'), ('orders','edit_history','jsonb'), ('orders','sales_rep','text'),
      ('orders','updated_at','timestamp with time zone'), ('orders','created_at','timestamp with time zone'),
      ('inventory','id','text'), ('inventory','name','text'), ('inventory','sku','text'),
      ('inventory','lots','jsonb'), ('inventory','cost_price','numeric'),
      ('profiles','id','uuid'), ('profiles','name','text'), ('profiles','role','text'), ('profiles','rep_name','text'),
      ('audit_log','id','text')
    ) AS x(t, c, ty)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = r.t
                      AND column_name = r.c AND data_type = r.ty) THEN
      v_problems := array_append(v_problems, format('column public.%s.%s must exist with type %s', r.t, r.c, r.ty));
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='inventory' AND column_name='stock'
                    AND data_type IN ('integer','bigint','smallint','numeric')) THEN
    v_problems := array_append(v_problems, 'column public.inventory.stock must exist (integer or numeric)');
  END IF;

  IF to_regprocedure('public.get_my_role()') IS NULL THEN
    v_problems := array_append(v_problems, 'function public.get_my_role() must exist (see rls_migration.sql / role_management.sql)');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    v_problems := array_append(v_problems, 'role authenticated must exist');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    v_problems := array_append(v_problems, 'role anon must exist');
  END IF;

  -- Overloads that would make PostgREST ambiguous or that CREATE OR REPLACE would not replace
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND ((p.proname = 'create_order'   AND pg_get_function_identity_arguments(p.oid) <> 'p_order jsonb')
         OR (p.proname = 'resubmit_order' AND pg_get_function_identity_arguments(p.oid) <> 'p_order_id text, p_order jsonb'))
  LOOP
    v_problems := array_append(v_problems, format('unexpected overload public.%s(%s) — resolve manually first', r.proname, r.args));
  END LOOP;

  -- The role running this script must own (or be a member of the owner of) what it replaces
  FOR r IN
    SELECT p.proname, pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND (p.proname IN ('create_order','resubmit_order') OR p.proname LIKE '\_order\_%')
       AND NOT pg_has_role(current_user, p.proowner, 'MEMBER')
  LOOP
    v_problems := array_append(v_problems, format('function public.%s is owned by %s — run as that owner', r.proname, r.owner));
  END LOOP;

  FOR r IN
    SELECT c.relname,
           pg_get_userbyid(c.relowner)                    AS owner,
           pg_has_role(current_user, c.relowner, 'MEMBER') AS is_member,
           c.relforcerowsecurity                          AS forced
      FROM pg_class c
     WHERE c.oid IN ('public.orders'::regclass, 'public.inventory'::regclass)
  LOOP
    IF NOT r.is_member THEN
      v_problems := array_append(v_problems, format('table public.%s is owned by %s — run as that owner', r.relname, r.owner));
    END IF;
    IF r.forced THEN
      v_problems := array_append(v_problems, format('table public.%s has FORCE ROW LEVEL SECURITY — the SECURITY DEFINER functions would be filtered by RLS', r.relname));
    END IF;
  END LOOP;

  -- Serial safety: the sequence must never hand out a serial that already exists
  IF to_regclass('public.orders_serial_seq') IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE serial_number ~ '^[0-9]{1,15}$' AND serial_number::BIGINT >= 3005) THEN
      v_problems := array_append(v_problems, 'orders_serial_seq does not exist but orders with serial >= 3005 do — creating it at 3005 would collide; setval it deliberately first');
    END IF;
  ELSIF EXISTS (
      SELECT 1 FROM pg_sequences s
       WHERE s.schemaname = 'public' AND s.sequencename = 'orders_serial_seq'
         AND COALESCE(s.last_value + s.increment_by, s.start_value) <=
             COALESCE((SELECT MAX(serial_number::BIGINT) FROM public.orders WHERE serial_number ~ '^[0-9]{1,15}$'), 0)) THEN
    v_problems := array_append(v_problems, 'orders_serial_seq next value is not above the highest existing serial — investigate before running (this file never resets it)');
  END IF;

  IF cardinality(v_problems) > 0 THEN
    RAISE EXCEPTION E'PREFLIGHT FAILED — nothing was changed:\n  - %', array_to_string(v_problems, E'\n  - ');
  END IF;
END
$pre$;


-- ── 1. Columns, index, sequence ───────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS inventory_deducted   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_id    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_hash  TEXT;

-- One order per client request id (NULL for historical / legacy-client orders)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_request_id
  ON orders (client_request_id) WHERE client_request_id IS NOT NULL;

-- Never reset: IF NOT EXISTS keeps the live value. (A5 in the preflight compares
-- it with MAX(serial) — do not setval() blindly.)
CREATE SEQUENCE IF NOT EXISTS orders_serial_seq START WITH 3005;


-- ══════════════════════════════════════════════════════════════
-- 2. INTERNAL HELPERS (public schema — NOT callable by clients)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _order_iso_now()
RETURNS TEXT
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;


-- Trusted display name for history/audit entries (server-side, not spoofable).
CREATE OR REPLACE FUNCTION _order_actor_name(p_hint TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.name FROM profiles AS p WHERE p.id = auth.uid()),
    NULLIF(btrim(p_hint), ''),
    'مجهول'
  )
$$;


CREATE OR REPLACE FUNCTION _order_require_role(
  p_allowed    TEXT[],
  p_denied_msg TEXT DEFAULT 'ليس لديك صلاحية تنفيذ هذا الإجراء'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول أولاً';
  END IF;

  v_role := get_my_role();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — الحساب غير مرتبط بأي صلاحية';
  END IF;

  IF NOT (v_role = ANY (p_allowed)) THEN
    RAISE EXCEPTION '%', p_denied_msg;
  END IF;

  RETURN v_role;
END;
$$;


-- Whole number 1 … 9,999,999 as a JSON number or numeric string. Rejects NULL,
-- '', 0, negatives, decimals other than "N.0", exponents, NaN/Infinity, text.
CREATE OR REPLACE FUNCTION _order_parse_quantity(p_val JSONB, p_item_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type TEXT := jsonb_typeof(p_val);
  v_text TEXT;
  v_int  INTEGER;
BEGIN
  IF v_type = 'number' THEN
    v_text := p_val #>> '{}';
  ELSIF v_type = 'string' THEN
    v_text := btrim(p_val #>> '{}');
  ELSE
    RAISE EXCEPTION 'الكمية غير صحيحة للصنف "%" — يجب أن تكون عدداً صحيحاً أكبر من صفر', p_item_name;
  END IF;

  IF v_text !~ '^[0-9]{1,7}([.]0+)?$' THEN
    RAISE EXCEPTION 'الكمية غير صحيحة للصنف "%" — يجب أن تكون عدداً صحيحاً أكبر من صفر', p_item_name;
  END IF;

  v_int := split_part(v_text, '.', 1)::INTEGER;
  IF v_int < 1 THEN
    RAISE EXCEPTION 'الكمية غير صحيحة للصنف "%" — يجب أن تكون عدداً صحيحاً أكبر من صفر', p_item_name;
  END IF;

  RETURN v_int;
END;
$$;


-- Amounts: NULL / absent / blank → 0; otherwise a non-negative number.
CREATE OR REPLACE FUNCTION _order_parse_amount(p_val JSONB, p_label TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type TEXT := jsonb_typeof(p_val);
  v_text TEXT;
BEGIN
  IF p_val IS NULL OR v_type IS NULL OR v_type = 'null' THEN
    RETURN 0;
  END IF;

  IF v_type = 'number' THEN
    v_text := p_val #>> '{}';
  ELSIF v_type = 'string' THEN
    v_text := btrim(p_val #>> '{}');
    IF v_text = '' THEN
      RETURN 0;
    END IF;
  ELSE
    RAISE EXCEPTION 'قيمة غير صحيحة في الحقل: %', p_label;
  END IF;

  IF v_text !~ '^[0-9]{1,15}([.][0-9]{1,10})?$' THEN
    RAISE EXCEPTION 'قيمة غير صحيحة في الحقل: %', p_label;
  END IF;

  RETURN v_text::NUMERIC;
END;
$$;


CREATE OR REPLACE FUNCTION _order_validate_items(p_items JSONB)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec  RECORD;
  v_name TEXT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'يجب أن يحتوي الطلب على صنف واحد على الأقل';
  END IF;

  IF jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'عدد الأصناف في الطلب يتجاوز الحد المسموح';
  END IF;

  FOR v_rec IN
    SELECT e.value AS item, e.ord AS ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ord)
     ORDER BY e.ord
  LOOP
    IF jsonb_typeof(v_rec.item) <> 'object' THEN
      RAISE EXCEPTION 'بيانات الصنف رقم % غير صحيحة', v_rec.ord;
    END IF;

    v_name := btrim(COALESCE(v_rec.item->>'name', ''));
    IF v_name = '' THEN
      RAISE EXCEPTION 'اسم الصنف مطلوب (الصنف رقم %)', v_rec.ord;
    END IF;

    PERFORM _order_parse_quantity(v_rec.item->'quantity', v_name);
  END LOOP;
END;
$$;


-- Resolves one order line to exactly one inventory row id, or NULL.
--   SKU present → exact SKU match only (no name fallback); >1 rows → error.
--   SKU absent  → exact name, then substring; name is NOT unique so >1 → error.
CREATE OR REPLACE FUNCTION _order_resolve_inventory_id(p_sku TEXT, p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sku  TEXT := lower(btrim(COALESCE(p_sku, '')));
  v_name TEXT := lower(btrim(COALESCE(p_name, '')));
  v_ids  TEXT[];
BEGIN
  IF v_sku <> '' THEN
    SELECT array_agg(i.id ORDER BY i.id) INTO v_ids
      FROM inventory AS i
     WHERE lower(btrim(i.sku)) = v_sku;

    IF v_ids IS NULL THEN
      RETURN NULL;
    END IF;
    IF cardinality(v_ids) > 1 THEN
      RAISE EXCEPTION 'الـSKU "%" مسجّل لأكثر من صنف في المخزون — يرجى تصحيح بيانات المخزون أولاً', p_sku;
    END IF;
    RETURN v_ids[1];
  END IF;

  IF v_name = '' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(i.id ORDER BY i.id) INTO v_ids
    FROM inventory AS i
   WHERE lower(btrim(i.name)) = v_name;

  IF v_ids IS NULL THEN
    SELECT array_agg(i.id ORDER BY i.id) INTO v_ids
      FROM inventory AS i
     WHERE btrim(i.name) <> ''
       AND (strpos(lower(i.name), v_name) > 0 OR strpos(v_name, lower(i.name)) > 0);
  END IF;

  IF v_ids IS NULL THEN
    RETURN NULL;
  END IF;
  IF cardinality(v_ids) > 1 THEN
    RAISE EXCEPTION 'يوجد أكثر من صنف مطابق للاسم "%" — يرجى اختيار الصنف من قائمة المخزون ليتم تحديده عبر الـSKU', p_name;
  END IF;
  RETURN v_ids[1];
END;
$$;


-- Lot id generator shared by every function that creates a lot
CREATE OR REPLACE FUNCTION _order_new_lot_id()
RETURNS TEXT
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  SELECT 'lot-' || (floor(extract(epoch FROM clock_timestamp()) * 1000))::BIGINT
         || '-' || substr(md5(random()::TEXT), 1, 4)
$$;


-- ── Private schema: helpers that TRIGGERS need (they run as the invoking client
-- role) but that must NOT be exposed as API RPCs. PostgREST only exposes the
-- configured schemas (public by default) — keep `private` out of "Exposed schemas".
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Per-product quantity fingerprint of an items array: line order and split lines
-- do not matter; SKU (or name when there is no SKU), and totals do. Two arrays
-- with the same fingerprint reserve exactly the same stock.
CREATE OR REPLACE FUNCTION private.order_items_signature(p_items JSONB)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_object_agg(s.k, s.q), '{}'::jsonb)
    FROM (
      SELECT x.k AS k, SUM(x.q) AS q
        FROM (
          SELECT
            CASE WHEN btrim(COALESCE(e->>'sku', '')) <> ''
                 THEN 'sku:' || lower(btrim(e->>'sku'))
                 ELSE 'name:' || lower(btrim(COALESCE(e->>'name', ''))) END
            || CASE WHEN btrim(COALESCE(e->>'quantity', '')) ~ '^[0-9]{1,7}([.]0+)?$'
                    THEN '' ELSE '|invalid:' || COALESCE(e->>'quantity', '<null>') END AS k,
            CASE WHEN btrim(COALESCE(e->>'quantity', '')) ~ '^[0-9]{1,7}([.]0+)?$'
                 THEN split_part(btrim(e->>'quantity'), '.', 1)::NUMERIC ELSE 1 END AS q
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) AS e
        ) x
       GROUP BY x.k
    ) s
$$;

REVOKE ALL ON FUNCTION private.order_items_signature(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.order_items_signature(JSONB) TO authenticated;


-- The single deduction / restoration routine used by every order RPC.
--   p_mode = 'deduct'  → consume FIFO; needs enough `stock` AND enough lot quantity
--   p_mode = 'restore' → give stock back as a new "return" lot
-- All affected inventory rows are locked in ascending id order before any
-- change, quantities are aggregated per product, and the locked rows are the
-- source of truth (never a client snapshot). Any RAISE aborts the transaction.
CREATE OR REPLACE FUNCTION _order_apply_inventory(
  p_items     JSONB,
  p_mode      TEXT,
  p_order_ref TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rec        RECORD;
  v_inv        RECORD;
  v_row        RECORD;
  v_ids        TEXT[]    := ARRAY[]::TEXT[];
  v_qtys       INTEGER[] := ARRAY[]::INTEGER[];
  v_unmatched  TEXT[]    := ARRAY[]::TEXT[];
  v_id         TEXT;
  v_qty        INTEGER;
  v_name       TEXT;
  v_sku_raw    TEXT;
  v_stock      NUMERIC;
  v_lots_total NUMERIC;
  v_new_lots   JSONB;
  v_remaining  NUMERIC;
  v_lot        JSONB;
  v_lot_qty    NUMERIC;
  v_consume    NUMERIC;
  v_new_stock  NUMERIC;
  v_new_cost   NUMERIC;
BEGIN
  IF p_mode NOT IN ('deduct', 'restore') THEN
    RAISE EXCEPTION 'عملية المخزون غير صحيحة';
  END IF;

  PERFORM _order_validate_items(p_items);

  -- 1. Resolve every line
  FOR v_rec IN
    SELECT e.value AS item, e.ord AS ord
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ord)
     ORDER BY e.ord
  LOOP
    v_name    := btrim(v_rec.item->>'name');
    v_sku_raw := btrim(COALESCE(v_rec.item->>'sku', ''));
    v_qty     := _order_parse_quantity(v_rec.item->'quantity', v_name);
    v_id      := _order_resolve_inventory_id(v_sku_raw, v_name);

    IF v_id IS NULL THEN
      v_unmatched := array_append(
        v_unmatched,
        v_name || CASE WHEN v_sku_raw <> '' THEN ' (SKU: ' || v_sku_raw || ')' ELSE '' END
      );
    ELSE
      v_ids  := array_append(v_ids, v_id);
      v_qtys := array_append(v_qtys, v_qty);
    END IF;
  END LOOP;

  IF cardinality(v_unmatched) > 0 THEN
    RAISE EXCEPTION '% — لم يتم العثور على تطابق في المخزون للأصناف التالية: %',
      CASE WHEN p_mode = 'deduct' THEN 'تعذر حفظ الطلب' ELSE 'تعذر إعادة المخزون' END,
      array_to_string(v_unmatched, '، ');
  END IF;

  -- 2. Lock every affected row, in deterministic order
  PERFORM 1 FROM inventory WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  -- 3. Apply once per product, using the locked rows
  FOR v_inv IN
    SELECT u.inv_id AS inv_id, SUM(u.q)::NUMERIC AS total_qty
      FROM unnest(v_ids, v_qtys) AS u(inv_id, q)
     GROUP BY u.inv_id
     ORDER BY u.inv_id
  LOOP
    SELECT i.name, i.stock, i.lots, i.cost_price
      INTO v_row
      FROM inventory AS i
     WHERE i.id = v_inv.inv_id;

    v_stock := COALESCE(v_row.stock, 0);

    IF p_mode = 'deduct' THEN
      IF v_inv.total_qty > v_stock THEN
        RAISE EXCEPTION 'الكمية المطلوبة غير متاحة في المخزون للصنف: % — المتاح: % — المطلوب: %',
          v_row.name, v_stock, v_inv.total_qty;
      END IF;

      -- The stock figure is not enough on its own: the FIFO lots must also cover
      -- the order, otherwise cost basis would be lost / stock and lots would drift.
      SELECT COALESCE(SUM(COALESCE((l->>'qty')::NUMERIC, 0)), 0) INTO v_lots_total
        FROM jsonb_array_elements(COALESCE(v_row.lots, '[]'::jsonb)) AS l;

      IF v_inv.total_qty > v_lots_total THEN
        RAISE EXCEPTION 'دفعات المخزون المسجلة للصنف "%" لا تغطي الكمية المطلوبة (المتاح في الدفعات: % — المطلوب: %) — يرجى مراجعة دفعات الصنف أو تسويتها قبل المتابعة',
          v_row.name, v_lots_total, v_inv.total_qty;
      END IF;

      v_remaining := v_inv.total_qty;
      v_new_lots  := '[]'::jsonb;
      FOR v_lot IN SELECT * FROM jsonb_array_elements(COALESCE(v_row.lots, '[]'::jsonb))
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

      IF v_remaining > 0 THEN
        RAISE EXCEPTION 'تعذر تغطية الكمية المطلوبة من دفعات الصنف "%" — يرجى مراجعة المخزون', v_row.name;
      END IF;

      v_new_stock := v_stock - v_inv.total_qty;
    ELSE
      v_new_lots := COALESCE(v_row.lots, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'id',        _order_new_lot_id(),
        'qty',       v_inv.total_qty,
        'costPrice', COALESCE(v_row.cost_price, 0),
        'date',      to_char(CURRENT_DATE, 'YYYY-MM-DD'),
        'note',      'مُرجَع من طلب #' || COALESCE(p_order_ref, '')
      ));

      v_new_stock := v_stock + v_inv.total_qty;
    END IF;

    v_new_cost := COALESCE(
      CASE WHEN jsonb_array_length(v_new_lots) > 0
           THEN (v_new_lots->0->>'costPrice')::NUMERIC END,
      COALESCE(v_row.cost_price, 0)
    );

    UPDATE inventory
       SET stock = v_new_stock, lots = v_new_lots, cost_price = v_new_cost
     WHERE id = v_inv.inv_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION _order_iso_now()                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_actor_name(TEXT)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_require_role(TEXT[], TEXT)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_parse_quantity(JSONB, TEXT)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_parse_amount(JSONB, TEXT)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_validate_items(JSONB)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_resolve_inventory_id(TEXT, TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_new_lot_id()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_apply_inventory(JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;


-- ══════════════════════════════════════════════════════════════
-- 3. create_order — atomic create + deduct, idempotent per client request
-- ══════════════════════════════════════════════════════════════
-- p_order.clientRequestId (optional): a random id the browser generates for one
-- submission intent and reuses only for retries of the SAME payload. If the first
-- request committed but its response was lost, the retry returns that original
-- order instead of creating a second one and deducting twice. The same id with a
-- DIFFERENT payload is refused (never silently merged). Concurrent duplicates are
-- serialized with an advisory lock. Requests without an id (legacy clients) behave
-- exactly as before.
CREATE OR REPLACE FUNCTION create_order(p_order JSONB)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role TEXT;
  caller_rep  TEXT;
  v_serial    TEXT;
  v_sales_rep TEXT;
  v_subtotal  NUMERIC;
  v_vat_pct   NUMERIC;
  v_vat_amt   NUMERIC;
  v_total     NUMERIC;
  v_req_id    TEXT;
  v_req_hash  TEXT;
  v_existing  orders;
  v_row       orders;
BEGIN
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'بيانات الطلب غير صحيحة';
  END IF;

  caller_role := _order_require_role(
    ARRAY['sales', 'team_leader', 'admin', 'super_admin'],
    'ليس لديك صلاحية إنشاء طلب'
  );

  IF caller_role = 'sales' THEN
    SELECT p.rep_name INTO caller_rep FROM profiles AS p WHERE p.id = auth.uid();
    IF caller_rep IS NULL THEN
      RAISE EXCEPTION 'حسابك غير مرتبط باسم مندوب مبيعات — لا يمكن إنشاء طلب';
    END IF;
    v_sales_rep := caller_rep;
  ELSE
    v_sales_rep := NULLIF(TRIM(p_order->>'salesRep'), '');
    IF v_sales_rep IS NULL THEN
      RAISE EXCEPTION 'يرجى اختيار مندوب المبيعات';
    END IF;
  END IF;

  -- Idempotency: replay of an already-committed request
  v_req_id := NULLIF(btrim(COALESCE(p_order->>'clientRequestId', '')), '');
  IF v_req_id IS NOT NULL THEN
    IF length(v_req_id) > 100 THEN
      RAISE EXCEPTION 'معرّف الطلب غير صحيح';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('create_order:' || v_req_id, 0));
    v_req_hash := md5((p_order - 'clientRequestId')::TEXT);

    SELECT * INTO v_existing FROM orders WHERE client_request_id = v_req_id;
    IF FOUND THEN
      IF caller_role = 'sales' AND v_existing.sales_rep IS DISTINCT FROM caller_rep THEN
        RAISE EXCEPTION 'معرّف الطلب هذا مستخدم بالفعل';
      END IF;
      IF v_existing.client_request_hash IS DISTINCT FROM v_req_hash THEN
        RAISE EXCEPTION 'تم استخدام معرّف الطلب هذا لطلب مختلف — يرجى إعادة المحاولة';
      END IF;
      RETURN v_existing;
    END IF;
  END IF;

  -- Validate everything BEFORE consuming a serial or touching inventory
  PERFORM _order_validate_items(p_order->'items');
  v_subtotal := _order_parse_amount(p_order->'subtotal',   'المجموع الفرعي');
  v_vat_pct  := _order_parse_amount(p_order->'vatPercent', 'نسبة الضريبة');
  v_vat_amt  := _order_parse_amount(p_order->'vatAmount',  'قيمة الضريبة');
  v_total    := _order_parse_amount(p_order->'total',      'الإجمالي');

  v_serial := nextval('orders_serial_seq')::TEXT;

  PERFORM _order_apply_inventory(p_order->'items', 'deduct', v_serial);

  INSERT INTO orders (
    id, serial_number,
    client_name, company, mobile, whatsapp,
    address, location_link,
    sales_rep, items,
    subtotal, vat_percent, vat_amount, total,
    invoice_type, invoice_name, tax_number, notes,
    payment_method, date, time,
    status, inventory_deducted, created_at, updated_at, edit_history,
    client_request_id, client_request_hash
  ) VALUES (
    'ORD-' || v_serial, v_serial,
    p_order->>'clientName', p_order->>'company', p_order->>'mobile', p_order->>'whatsapp',
    p_order->>'address', p_order->>'locationLink',
    v_sales_rep, p_order->'items',
    v_subtotal, v_vat_pct, v_vat_amt, v_total,
    p_order->>'invoiceType', p_order->>'invoiceName', p_order->>'taxNumber', p_order->>'notes',
    p_order->>'paymentMethod', p_order->>'date', p_order->>'time',
    'بانتظار الموافقة', TRUE, NOW(), clock_timestamp(), '[]'::jsonb,
    v_req_id, v_req_hash
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(JSONB) TO authenticated;


-- ══════════════════════════════════════════════════════════════
-- 4. resubmit_order — atomic resubmit + deduct
-- ══════════════════════════════════════════════════════════════
-- Return to Sales → edit → resubmit. The order row is locked, so concurrent
-- resubmits cannot both deduct. Deducts the FINAL payload quantities only.
-- Optional p_order.expectedUpdatedAt: if given and the order changed since the
-- form was loaded, the resubmit is refused (a stale form cannot overwrite it).
CREATE OR REPLACE FUNCTION resubmit_order(p_order_id TEXT, p_order JSONB)
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

  IF v_current.status NOT IN ('جديد', 'مرفوض') THEN
    RAISE EXCEPTION 'لا يمكن إعادة إرسال هذا الطلب من حالته الحالية';
  END IF;
  IF v_current.inventory_deducted THEN
    RAISE EXCEPTION 'تم خصم المخزون لهذا الطلب بالفعل';
  END IF;

  IF NULLIF(btrim(COALESCE(p_order->>'expectedUpdatedAt', '')), '') IS NOT NULL THEN
    BEGIN
      v_expected := (p_order->>'expectedUpdatedAt')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'بيانات التحقق من إصدار الطلب غير صحيحة — حدّث الصفحة ثم أعد المحاولة';
    END;
    IF v_current.updated_at IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'تم تعديل هذا الطلب من مستخدم آخر منذ فتحه — يرجى تحديث الصفحة ثم إعادة المحاولة';
    END IF;
  END IF;

  IF caller_role = 'sales' THEN
    SELECT p.rep_name INTO caller_rep FROM profiles AS p WHERE p.id = auth.uid();
    IF caller_rep IS NULL THEN
      RAISE EXCEPTION 'حسابك غير مرتبط باسم مندوب مبيعات — لا يمكن إعادة إرسال الطلب';
    END IF;
    IF v_current.sales_rep IS DISTINCT FROM caller_rep THEN
      RAISE EXCEPTION 'ليس لديك صلاحية تعديل هذا الطلب';
    END IF;
    v_sales_rep := caller_rep;
  ELSE
    v_sales_rep := COALESCE(NULLIF(TRIM(p_order->>'salesRep'), ''), v_current.sales_rep);
  END IF;

  PERFORM _order_validate_items(p_order->'items');
  v_subtotal := _order_parse_amount(p_order->'subtotal',   'المجموع الفرعي');
  v_vat_pct  := _order_parse_amount(p_order->'vatPercent', 'نسبة الضريبة');
  v_vat_amt  := _order_parse_amount(p_order->'vatAmount',  'قيمة الضريبة');
  v_total    := _order_parse_amount(p_order->'total',      'الإجمالي');

  PERFORM _order_apply_inventory(p_order->'items', 'deduct', v_current.serial_number);

  UPDATE orders SET
    client_name = p_order->>'clientName', company = p_order->>'company',
    mobile = p_order->>'mobile', whatsapp = p_order->>'whatsapp',
    address = p_order->>'address', location_link = p_order->>'locationLink',
    sales_rep = v_sales_rep, items = p_order->'items',
    subtotal = v_subtotal, vat_percent = v_vat_pct, vat_amount = v_vat_amt, total = v_total,
    invoice_type = p_order->>'invoiceType', invoice_name = p_order->>'invoiceName',
    tax_number = p_order->>'taxNumber', notes = p_order->>'notes',
    payment_method = p_order->>'paymentMethod', date = p_order->>'date', time = p_order->>'time',
    status = 'بانتظار الموافقة',
    inventory_deducted = TRUE,
    updated_at = clock_timestamp(),
    edit_history = COALESCE(v_current.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'type', 'status_change',
      'previousStatus', v_current.status,
      'newStatus', 'بانتظار الموافقة',
      'changedAt', _order_iso_now(),
      'changedBy', _order_actor_name(p_order->>'changedByName')
    ))
  WHERE id = p_order_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_order(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_order(TEXT, JSONB) TO authenticated;

COMMIT;
