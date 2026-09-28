-- ══════════════════════════════════════════════════════════════
-- Inventory management RPCs — PART B2         (3rd of the migration set)
-- Run in: Supabase Dashboard → SQL Editor
-- REQUIRES order_creation.sql (Part A) and order_lifecycle.sql (Part B).
--
-- THIS FILE HAS NOT BEEN EXECUTED. Same transaction rules as Part A.
--
-- Why
-- ---
-- The admin screens used to write inventory straight from the browser:
--   * a price-only edit re-sent `stock` (and `cost_price`) captured when the form
--     was opened, silently overwriting reservations made since — and left `lots`
--     out of step with `stock`;
--   * add / edit lot recomputed stock from a local snapshot (lost updates);
--   * changing a SKU / name or deleting a product referenced by reserved orders
--     made those orders impossible to return / reject / cancel (their stock can no
--     longer be resolved).
--
-- Every function below locks the inventory row first, compares against what the
-- screen saw where a value is being replaced (compare-and-set), keeps `stock` and
-- `lots` moving together, and refuses SKU / name changes and deletes that would
-- orphan a reserved order. Only admin / super_admin may call them (the same roles
-- the inventory RLS policies already allow to write).
--
-- Reserved-order reference check
--   private.inventory_reserved_refs(id) → {by_sku:[serials], by_name:[serials]}
--     by_sku  : reserved orders (inventory_deducted) with a line whose SKU equals
--               this product's SKU;
--     by_name : reserved orders with a SKU-less line that resolves to this product.
--   SKU change is blocked by by_sku; name change by by_name; delete by either.
--   Sanctioned exception: change_inventory_sku() — super_admin only, mandatory
--   reason, rewrites the SKU on those reserved orders' lines in the same
--   transaction, and writes an audit_log row. There is deliberately NO override
--   for deleting a referenced product (release the orders first).
-- ══════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $pre$
BEGIN
  IF to_regprocedure('public._order_apply_inventory(jsonb,text,text)') IS NULL
     OR to_regprocedure('public.advance_order_status(text,text,text,text)') IS NULL
     OR to_regprocedure('private.order_items_signature(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — run order_creation.sql and order_lifecycle.sql first; nothing was changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='audit_log' AND column_name='changed_at') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — public.audit_log(changed_at) is missing; nothing was changed';
  END IF;
END
$pre$;


-- ── Helpers ───────────────────────────────────────────────────────────────

-- Server-written audit row (used by the privileged override functions so the
-- trail does not depend on the browser).
CREATE OR REPLACE FUNCTION _order_audit(
  p_type TEXT, p_order_id TEXT, p_order_ref TEXT, p_field TEXT,
  p_old TEXT, p_new TEXT, p_note TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO audit_log (id, type, order_id, order_ref, field, old_value, new_value, changed_by, note, changed_at)
  VALUES ('al-' || (floor(extract(epoch FROM clock_timestamp()) * 1000))::BIGINT || '-' || substr(md5(random()::TEXT), 1, 6),
          p_type, p_order_id, p_order_ref, p_field, p_old, p_new, _order_actor_name(NULL), p_note, NOW())
$$;

-- Does this order line resolve to that inventory row? Ambiguity → TRUE
-- (conservative: assume it might depend on it).
CREATE OR REPLACE FUNCTION _order_line_resolves_to(p_line JSONB, p_inv_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN _order_resolve_inventory_id(p_line->>'sku', p_line->>'name') IS NOT DISTINCT FROM p_inv_id;
EXCEPTION WHEN OTHERS THEN
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION private.inventory_reserved_refs(p_inv_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sku     TEXT;
  v_by_sku  JSONB;
  v_by_name JSONB;
BEGIN
  SELECT lower(btrim(COALESCE(i.sku, ''))) INTO v_sku FROM inventory AS i WHERE i.id = p_inv_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('by_sku', '[]'::jsonb, 'by_name', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT o.serial_number), '[]'::jsonb) INTO v_by_sku
    FROM orders AS o
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) AS e
   WHERE o.inventory_deducted
     AND v_sku <> ''
     AND lower(btrim(COALESCE(e->>'sku', ''))) = v_sku;

  SELECT COALESCE(jsonb_agg(DISTINCT o.serial_number), '[]'::jsonb) INTO v_by_name
    FROM orders AS o
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) AS e
   WHERE o.inventory_deducted
     AND btrim(COALESCE(e->>'sku', '')) = ''
     AND _order_line_resolves_to(e, p_inv_id);

  RETURN jsonb_build_object('by_sku', v_by_sku, 'by_name', v_by_name);
END;
$$;

-- Raises an Arabic error naming (up to 8 of) the reserved orders that depend on the
-- product, if any do, for the dimensions asked about.
CREATE OR REPLACE FUNCTION private.inventory_assert_unreferenced(
  p_inv_id TEXT, p_check_sku BOOLEAN, p_check_name BOOLEAN, p_action_ar TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refs    JSONB := private.inventory_reserved_refs(p_inv_id);
  v_serials JSONB := '[]'::jsonb;
  v_list    TEXT;
BEGIN
  IF p_check_sku  THEN v_serials := v_serials || (v_refs->'by_sku');  END IF;
  IF p_check_name THEN v_serials := v_serials || (v_refs->'by_name'); END IF;

  SELECT string_agg('#' || s, '، ') INTO v_list
    FROM (SELECT DISTINCT e AS s FROM jsonb_array_elements_text(v_serials) AS e ORDER BY 1 LIMIT 8) x;

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن % لأن طلبات محجوزة المخزون تعتمد على هذا المنتج (%) — أعد هذه الطلبات للسيلز أو ألغها أو ارفضها أولاً', p_action_ar, v_list;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION _order_audit(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION _order_line_resolves_to(JSONB, TEXT)                   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.inventory_reserved_refs(TEXT)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.inventory_assert_unreferenced(TEXT, BOOLEAN, BOOLEAN, TEXT) FROM PUBLIC, anon;
-- The inventory guard trigger (guard_inventory_client_writes.sql) runs as the
-- invoking client role and calls these; `private` is not exposed by the API.
GRANT EXECUTE ON FUNCTION private.inventory_reserved_refs(TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION private.inventory_assert_unreferenced(TEXT, BOOLEAN, BOOLEAN, TEXT) TO authenticated;


-- ══════════════════════════════════════════════════════════════
-- update_inventory_item — descriptive fields ONLY (never stock / lots)
-- ══════════════════════════════════════════════════════════════
-- p_changes carries only the keys the admin actually changed. Allowed keys:
-- name, sku, model, brand, category, price, costPrice, description, warranty.
CREATE OR REPLACE FUNCTION update_inventory_item(p_item_id TEXT, p_changes JSONB)
RETURNS inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old      inventory;
  v_row      inventory;
  v_new_name TEXT;
  v_new_sku  TEXT;
  v_price    NUMERIC;
  v_cost     NUMERIC;
BEGIN
  PERFORM _order_require_role(ARRAY['admin', 'super_admin'], 'ليس لديك صلاحية تعديل المخزون');

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'بيانات التعديل غير صحيحة';
  END IF;
  IF p_changes ?| ARRAY['stock', 'lots'] THEN
    RAISE EXCEPTION 'لا يمكن تعديل الكمية أو الدفعات من هنا — استخدم تعديل المخزون أو الدفعات';
  END IF;

  SELECT * INTO v_old FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  IF p_changes ? 'name' THEN
    v_new_name := btrim(COALESCE(p_changes->>'name', ''));
    IF v_new_name = '' THEN
      RAISE EXCEPTION 'اسم المنتج مطلوب';
    END IF;
    IF lower(v_new_name) IS DISTINCT FROM lower(btrim(v_old.name)) THEN
      PERFORM private.inventory_assert_unreferenced(p_item_id, FALSE, TRUE, 'تغيير اسم المنتج');
    END IF;
  ELSE
    v_new_name := v_old.name;
  END IF;

  IF p_changes ? 'sku' THEN
    v_new_sku := NULLIF(btrim(COALESCE(p_changes->>'sku', '')), '');
    IF lower(COALESCE(v_new_sku, '')) IS DISTINCT FROM lower(btrim(COALESCE(v_old.sku, ''))) THEN
      IF v_new_sku IS NOT NULL AND EXISTS (
           SELECT 1 FROM inventory i WHERE i.id <> p_item_id AND lower(btrim(i.sku)) = lower(v_new_sku)) THEN
        RAISE EXCEPTION 'هذا الـSKU مستخدم بالفعل لمنتج آخر';
      END IF;
      PERFORM private.inventory_assert_unreferenced(p_item_id, TRUE, FALSE, 'تغيير الـSKU');
    END IF;
  ELSE
    v_new_sku := v_old.sku;
  END IF;

  v_price := CASE WHEN p_changes ? 'price'     THEN _order_parse_amount(p_changes->'price', 'سعر البيع')     ELSE v_old.price END;
  v_cost  := CASE WHEN p_changes ? 'costPrice' THEN _order_parse_amount(p_changes->'costPrice', 'سعر التكلفة') ELSE v_old.cost_price END;

  UPDATE inventory SET
    name        = v_new_name,
    sku         = v_new_sku,
    model       = CASE WHEN p_changes ? 'model'       THEN p_changes->>'model'       ELSE model END,
    brand       = CASE WHEN p_changes ? 'brand'       THEN p_changes->>'brand'       ELSE brand END,
    category    = CASE WHEN p_changes ? 'category'    THEN p_changes->>'category'    ELSE category END,
    description = CASE WHEN p_changes ? 'description' THEN p_changes->>'description' ELSE description END,
    warranty    = CASE WHEN p_changes ? 'warranty'    THEN p_changes->>'warranty'    ELSE warranty END,
    price       = v_price,
    cost_price  = v_cost
  WHERE id = p_item_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- delete_inventory_item — refused while reserved orders depend on the product
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION delete_inventory_item(p_item_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old inventory;
BEGIN
  PERFORM _order_require_role(ARRAY['admin', 'super_admin'], 'ليس لديك صلاحية حذف المنتجات');

  SELECT * INTO v_old FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  PERFORM private.inventory_assert_unreferenced(p_item_id, TRUE, TRUE, 'حذف المنتج');

  DELETE FROM inventory WHERE id = p_item_id;
  RETURN TRUE;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- adjust_inventory_stock — set the stock figure, compare-and-set, lots kept in step
-- ══════════════════════════════════════════════════════════════
-- p_expected_stock is the stock the admin SAW. If reservations (or another admin)
-- changed it since, the call is refused instead of overwriting them. Increase →
-- an adjustment lot at the current cost; decrease → FIFO consumption (refused if
-- the lots cannot cover the decrease — reconcile the lots first).
CREATE OR REPLACE FUNCTION adjust_inventory_stock(
  p_item_id        TEXT,
  p_expected_stock INTEGER,
  p_new_stock      INTEGER,
  p_note           TEXT DEFAULT NULL
)
RETURNS inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old        inventory;
  v_row        inventory;
  v_cur        NUMERIC;
  v_delta      NUMERIC;
  v_lots       JSONB;
  v_new_lots   JSONB := '[]'::jsonb;
  v_lots_total NUMERIC;
  v_remaining  NUMERIC;
  v_lot        JSONB;
  v_lot_qty    NUMERIC;
  v_consume    NUMERIC;
BEGIN
  PERFORM _order_require_role(ARRAY['admin', 'super_admin'], 'ليس لديك صلاحية تعديل المخزون');

  IF p_expected_stock IS NULL OR p_new_stock IS NULL OR p_new_stock < 0 THEN
    RAISE EXCEPTION 'الكمية الجديدة غير صحيحة';
  END IF;

  SELECT * INTO v_old FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  v_cur := COALESCE(v_old.stock, 0);
  IF v_cur <> p_expected_stock THEN
    RAISE EXCEPTION 'تغيّر مخزون هذا الصنف منذ فتح النموذج (الكمية الحالية: %) بسبب طلبات أو تعديلات أخرى — حدّث الصفحة ثم أعد المحاولة', v_cur;
  END IF;

  v_delta := p_new_stock - v_cur;
  IF v_delta = 0 THEN
    RETURN v_old;
  END IF;

  v_lots := COALESCE(v_old.lots, '[]'::jsonb);

  IF v_delta > 0 THEN
    v_new_lots := v_lots || jsonb_build_array(jsonb_build_object(
      'id', _order_new_lot_id(), 'qty', v_delta, 'costPrice', COALESCE(v_old.cost_price, 0),
      'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'note', 'تعديل مخزون' || COALESCE(' — ' || NULLIF(btrim(p_note), ''), '')));
  ELSE
    SELECT COALESCE(SUM(COALESCE((l->>'qty')::NUMERIC, 0)), 0) INTO v_lots_total
      FROM jsonb_array_elements(v_lots) AS l;
    IF -v_delta > v_lots_total THEN
      RAISE EXCEPTION 'دفعات الصنف "%" (%) لا تغطي النقص المطلوب (%) — سوِّ دفعات الصنف أولاً', v_old.name, v_lots_total, -v_delta;
    END IF;

    v_remaining := -v_delta;
    FOR v_lot IN SELECT * FROM jsonb_array_elements(v_lots)
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
  END IF;

  UPDATE inventory SET
    stock      = p_new_stock,
    lots       = v_new_lots,
    cost_price = COALESCE(CASE WHEN jsonb_array_length(v_new_lots) > 0
                               THEN (v_new_lots->0->>'costPrice')::NUMERIC END, COALESCE(v_old.cost_price, 0))
  WHERE id = p_item_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- add_stock_lot
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION add_stock_lot(
  p_item_id TEXT,
  p_qty     NUMERIC,
  p_cost    NUMERIC,
  p_note    TEXT DEFAULT NULL
)
RETURNS inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old   inventory;
  v_row   inventory;
  v_qty   INTEGER;
  v_cost  NUMERIC;
  v_lots  JSONB;
BEGIN
  PERFORM _order_require_role(ARRAY['admin', 'super_admin'], 'ليس لديك صلاحية تعديل المخزون');

  SELECT * INTO v_old FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  v_qty  := _order_parse_quantity(to_jsonb(p_qty), v_old.name);
  v_cost := _order_parse_amount(to_jsonb(p_cost), 'سعر التكلفة');
  IF v_cost <= 0 THEN
    RAISE EXCEPTION 'سعر التكلفة يجب أن يكون أكبر من صفر';
  END IF;

  v_lots := COALESCE(v_old.lots, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', _order_new_lot_id(), 'qty', v_qty, 'costPrice', v_cost,
    'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'note', COALESCE(p_note, '')));

  -- stock moves by the added quantity (never recomputed from lots, so a historical
  -- stock/lots difference is neither hidden nor silently rewritten here)
  UPDATE inventory SET
    lots       = v_lots,
    stock      = COALESCE(v_old.stock, 0) + v_qty,
    cost_price = COALESCE((v_lots->0->>'costPrice')::NUMERIC, v_cost)
  WHERE id = p_item_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- update_stock_lot — compare-and-set on the lot's quantity
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_stock_lot(
  p_item_id      TEXT,
  p_lot_id       TEXT,
  p_expected_qty NUMERIC,
  p_qty          NUMERIC,
  p_cost         NUMERIC,
  p_note         TEXT DEFAULT NULL
)
RETURNS inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old       inventory;
  v_row       inventory;
  v_lot       JSONB;
  v_qty       INTEGER;
  v_cost      NUMERIC;
  v_old_qty   NUMERIC;
  v_new_stock NUMERIC;
  v_new_lots  JSONB;
BEGIN
  PERFORM _order_require_role(ARRAY['admin', 'super_admin'], 'ليس لديك صلاحية تعديل المخزون');

  SELECT * INTO v_old FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  SELECT l INTO v_lot FROM jsonb_array_elements(COALESCE(v_old.lots, '[]'::jsonb)) AS l WHERE l->>'id' = p_lot_id;
  IF v_lot IS NULL THEN
    RAISE EXCEPTION 'الدفعة غير موجودة — حدّث الصفحة';
  END IF;

  v_old_qty := COALESCE((v_lot->>'qty')::NUMERIC, 0);
  IF p_expected_qty IS NOT NULL AND v_old_qty <> p_expected_qty THEN
    RAISE EXCEPTION 'تغيّرت كمية هذه الدفعة منذ فتحها (الكمية الحالية: %) بسبب طلبات أو تعديلات أخرى — حدّث الصفحة ثم أعد المحاولة', v_old_qty;
  END IF;

  v_qty  := _order_parse_quantity(to_jsonb(p_qty), v_old.name);
  v_cost := _order_parse_amount(to_jsonb(p_cost), 'سعر التكلفة');
  IF v_cost <= 0 THEN
    RAISE EXCEPTION 'سعر التكلفة يجب أن يكون أكبر من صفر';
  END IF;

  v_new_stock := COALESCE(v_old.stock, 0) + (v_qty - v_old_qty);
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'لا يمكن تقليل الدفعة — سيصبح مخزون الصنف سالباً';
  END IF;

  SELECT jsonb_agg(
           CASE WHEN e.value->>'id' = p_lot_id
                THEN e.value || jsonb_build_object('qty', v_qty, 'costPrice', v_cost,
                                                   'note', COALESCE(p_note, e.value->>'note', ''))
                ELSE e.value END
           ORDER BY e.ord)
    INTO v_new_lots
    FROM jsonb_array_elements(v_old.lots) WITH ORDINALITY AS e(value, ord);

  UPDATE inventory SET
    lots       = v_new_lots,
    stock      = v_new_stock,
    cost_price = COALESCE((v_new_lots->0->>'costPrice')::NUMERIC, v_cost)
  WHERE id = p_item_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- reconcile_inventory_lots — explicit, reasoned, audited fix of a stock/lots mismatch
-- ══════════════════════════════════════════════════════════════
--   add_lot_for_shortfall : lots sum < stock → append an adjustment lot for the gap
--   set_stock_to_lots     : lots sum ≠ stock → set stock to the lots sum (whole number)
-- Never runs implicitly; historical lots are never rewritten, only appended to.
CREATE OR REPLACE FUNCTION reconcile_inventory_lots(p_item_id TEXT, p_mode TEXT, p_reason TEXT)
RETURNS inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old        inventory;
  v_row        inventory;
  v_stock      NUMERIC;
  v_lots_total NUMERIC;
  v_lots       JSONB;
BEGIN
  PERFORM _order_require_role(ARRAY['admin', 'super_admin'], 'ليس لديك صلاحية تسوية المخزون');

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'سبب التسوية مطلوب';
  END IF;
  IF p_mode NOT IN ('add_lot_for_shortfall', 'set_stock_to_lots') THEN
    RAISE EXCEPTION 'نوع التسوية غير صحيح';
  END IF;

  SELECT * INTO v_old FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  v_stock := COALESCE(v_old.stock, 0);
  v_lots  := COALESCE(v_old.lots, '[]'::jsonb);
  SELECT COALESCE(SUM(COALESCE((l->>'qty')::NUMERIC, 0)), 0) INTO v_lots_total
    FROM jsonb_array_elements(v_lots) AS l;

  IF p_mode = 'add_lot_for_shortfall' THEN
    IF v_lots_total >= v_stock THEN
      RAISE EXCEPTION 'لا يوجد نقص في دفعات هذا الصنف (المخزون: % — الدفعات: %)', v_stock, v_lots_total;
    END IF;
    v_lots := v_lots || jsonb_build_array(jsonb_build_object(
      'id', _order_new_lot_id(), 'qty', v_stock - v_lots_total, 'costPrice', COALESCE(v_old.cost_price, 0),
      'date', to_char(CURRENT_DATE, 'YYYY-MM-DD'), 'note', 'تسوية دفعات — ' || btrim(p_reason)));
    UPDATE inventory SET
      lots = v_lots,
      cost_price = COALESCE((v_lots->0->>'costPrice')::NUMERIC, COALESCE(v_old.cost_price, 0))
    WHERE id = p_item_id RETURNING * INTO v_row;
  ELSE
    IF v_lots_total = v_stock THEN
      RAISE EXCEPTION 'المخزون والدفعات متطابقان بالفعل';
    END IF;
    IF v_lots_total <> trunc(v_lots_total) THEN
      RAISE EXCEPTION 'مجموع الدفعات ليس عدداً صحيحاً — راجع الدفعات يدوياً';
    END IF;
    UPDATE inventory SET stock = v_lots_total WHERE id = p_item_id RETURNING * INTO v_row;
  END IF;

  PERFORM _order_audit('inventory_reconcile', NULL, v_old.name, 'تسوية دفعات المخزون',
                       'stock=' || v_stock || ' lots=' || v_lots_total,
                       'stock=' || COALESCE(v_row.stock, 0), p_mode || ' — ' || btrim(p_reason));
  RETURN v_row;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- change_inventory_sku — the sanctioned override (super_admin only, audited)
-- ══════════════════════════════════════════════════════════════
-- Changes a product's SKU AND rewrites that SKU on every reserved order's lines in
-- the same transaction, so those orders can still be returned / rejected /
-- cancelled. Locks the affected orders first (ascending id), then the product —
-- the same order the lifecycle functions use (order row, then inventory row).
-- Orders that hold no stock (returned / rejected / historical) are left untouched:
-- if resubmitted they must pick the product again.
CREATE OR REPLACE FUNCTION change_inventory_sku(p_item_id TEXT, p_new_sku TEXT, p_reason TEXT)
RETURNS inventory
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_new_sku   TEXT := NULLIF(btrim(COALESCE(p_new_sku, '')), '');
  v_old_sku   TEXT;
  v_old_low   TEXT;
  v_old       inventory;
  v_row       inventory;
  v_serials   TEXT[];
  v_count     INTEGER := 0;
BEGIN
  PERFORM _order_require_role(ARRAY['super_admin'], 'هذا الإجراء متاح لمدير النظام الأعلى فقط');

  IF v_new_sku IS NULL THEN
    RAISE EXCEPTION 'الـSKU الجديد مطلوب';
  END IF;
  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'سبب التغيير مطلوب';
  END IF;

  SELECT i.sku INTO v_old_sku FROM inventory AS i WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;
  v_old_low := lower(btrim(COALESCE(v_old_sku, '')));

  IF v_old_low <> '' THEN
    -- 1. lock the reserved orders that carry the old SKU
    PERFORM 1
       FROM orders o
      WHERE o.inventory_deducted
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) AS e
                     WHERE lower(btrim(COALESCE(e->>'sku', ''))) = v_old_low)
      ORDER BY o.id
        FOR UPDATE;
  END IF;

  -- 2. then the product
  SELECT * INTO v_old FROM inventory WHERE id = p_item_id FOR UPDATE;
  IF lower(btrim(COALESCE(v_old.sku, ''))) IS DISTINCT FROM v_old_low THEN
    RAISE EXCEPTION 'تغيّر الـSKU لهذا المنتج أثناء التنفيذ — أعد المحاولة';
  END IF;
  IF lower(v_new_sku) = v_old_low THEN
    RAISE EXCEPTION 'الـSKU الجديد مطابق للحالي';
  END IF;
  IF EXISTS (SELECT 1 FROM inventory i WHERE i.id <> p_item_id AND lower(btrim(i.sku)) = lower(v_new_sku)) THEN
    RAISE EXCEPTION 'هذا الـSKU مستخدم بالفعل لمنتج آخر';
  END IF;

  IF v_old_low <> '' THEN
    WITH upd AS (
      UPDATE orders o SET
        items = (SELECT jsonb_agg(
                          CASE WHEN lower(btrim(COALESCE(e.value->>'sku', ''))) = v_old_low
                               THEN jsonb_set(e.value, '{sku}', to_jsonb(v_new_sku))
                               ELSE e.value END
                          ORDER BY e.ord)
                   FROM jsonb_array_elements(o.items) WITH ORDINALITY AS e(value, ord)),
        updated_at = clock_timestamp()
      WHERE o.inventory_deducted
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END) AS e
                     WHERE lower(btrim(COALESCE(e->>'sku', ''))) = v_old_low)
      RETURNING o.serial_number
    )
    SELECT array_agg(u.serial_number ORDER BY u.serial_number) INTO v_serials FROM upd AS u;
    v_count := COALESCE(cardinality(v_serials), 0);
  END IF;

  UPDATE inventory SET sku = v_new_sku WHERE id = p_item_id RETURNING * INTO v_row;

  PERFORM _order_audit('inventory_sku_change', NULL, v_old.name, 'تغيير SKU مع تحديث الطلبات المحجوزة',
                       COALESCE(v_old_sku, '—'), v_new_sku,
                       btrim(p_reason) || ' — طلبات محجوزة تم تحديثها: ' || v_count
                       || COALESCE(' (' || array_to_string(v_serials, '، ') || ')', ''));
  RETURN v_row;
END;
$$;


-- ── Grants ────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.update_inventory_item(TEXT, JSONB)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_inventory_item(TEXT)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.adjust_inventory_stock(TEXT, INTEGER, INTEGER, TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_stock_lot(TEXT, NUMERIC, NUMERIC, TEXT)                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_stock_lot(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_inventory_lots(TEXT, TEXT, TEXT)                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_inventory_sku(TEXT, TEXT, TEXT)                      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_inventory_item(TEXT, JSONB)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_inventory_item(TEXT)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(TEXT, INTEGER, INTEGER, TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_stock_lot(TEXT, NUMERIC, NUMERIC, TEXT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_stock_lot(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory_lots(TEXT, TEXT, TEXT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_inventory_sku(TEXT, TEXT, TEXT)                      TO authenticated;

COMMIT;
