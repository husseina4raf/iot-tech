-- ══════════════════════════════════════════════════════════════
-- GUARD 1 — refuse legacy / unsafe CLIENT writes to orders      (4th of the set)
-- Run in: Supabase Dashboard → SQL Editor
-- REQUIRES order_creation.sql, order_lifecycle.sql, inventory_management.sql and the
-- (the new frontend may be deployed after this — see "Activation" below).
--
-- THIS FILE HAS NOT BEEN EXECUTED. Explicit BEGIN … COMMIT with a lock_timeout; on
-- any error run ROLLBACK; and retry.
--
-- What it does
-- ------------
-- After the migration every order write the application makes goes through an RPC
-- (create_order, resubmit_order, update_order_details, advance_order_status, the
-- lifecycle functions) — except a plain DELETE. Those RPCs are SECURITY DEFINER, so
-- inside them current_user is the function owner. A raw write coming straight from
-- a browser (or an old cached bundle, or a crafted API call) runs as `authenticated`
-- / `anon`. These triggers apply ONLY to those two roles, so:
--   * the sanctioned RPCs are never affected,
--   * operators using the SQL editor (postgres) and the service role are exempt,
--   * ordinary users cannot switch the guard off (they cannot SET ROLE or forge
--     current_user — unlike a GUC-based flag).
--
-- SALES: any direct UPDATE by a sales user is refused outright (their edits go through the
-- RPCs, which enforce ownership and the جديد / مرفوض status rule).
-- INSERT: a direct INSERT by ANY client role is refused (orders are created only by create_order).
-- Admin / Super Admin / Team Leader keep their existing raw UPDATE / DELETE rights, limited as below.
--
-- For any other client-role direct UPDATE it refuses to change:
--   status, inventory_deducted, edit_history        — lifecycle state, only via RPCs
--   id, serial_number, created_at, client_request_*  — order identity
--   the stock-relevant items (SKU / name-when-no-SKU / quantities / added or removed
--   lines) while the order holds stock (inventory_deducted = TRUE)
-- Everything else (customer details, address, prices, notes …) stays editable under
-- the existing RLS policies. For a client-role DELETE it refuses orders that still
-- hold stock: Cancel first (which returns the stock), then delete from the
-- cancelled list.
--
-- Old cached bundles: their legacy operations (client-side return / reject / cancel /
-- status update / restore) are refused here with an Arabic "refresh the page"
-- message, so a stale tab can never bypass the atomic RPCs — this does not rely on
-- users reloading.
--
-- Activation
-- ----------
-- Run IMMEDIATELY after order_lifecycle.sql / inventory_management.sql, BEFORE deploying
-- the new frontend (same maintenance window). It only refuses writes the new frontend never
-- makes, so it is safe to have in place first; until the new frontend is live, tabs on the
-- previous frontend can create and resubmit orders but their approve / return / reject /
-- cancel / edit actions fail with an Arabic "refresh the page" message — a short, loud
-- outage instead of silent stock corruption. The new frontend also shows a "new version
-- available" banner (version.json check).
-- Before running, confirm the dead-end query (diagnostics B1) returns no rows.
-- ══════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regprocedure('public.advance_order_status(text,text,text,text)') IS NULL
     OR to_regprocedure('public.update_order_details(text,text,jsonb)') IS NULL
     OR to_regprocedure('private.order_items_signature(jsonb)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema='public' AND table_name='orders' AND column_name='client_request_id') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — run order_creation.sql and order_lifecycle.sql first; nothing was changed';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION enforce_order_client_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- RPCs (definer → owner), the service role and SQL-editor operators are exempt
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- Sales never write the orders table directly: every Sales change goes through
  -- create_order / resubmit_order / update_order_details, which check ownership and status.
  -- RLS alone is not enough — orders_update lets a sales user UPDATE their own orders in ANY
  -- status and ANY column, so prices, subtotal, VAT, total and invoice fields would otherwise be
  -- rewritable with a raw API call. (The RPCs run as the function owner, so they are exempt.)
  IF get_my_role() = 'sales' THEN
    RAISE EXCEPTION 'لا يمكن تعديل الطلب مباشرةً — استخدم شاشة تعديل الطلب';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
     OR NEW.client_request_hash IS DISTINCT FROM OLD.client_request_hash THEN
    RAISE EXCEPTION 'لا يمكن تعديل هوية الطلب (المعرّف / الرقم التسلسلي)';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.inventory_deducted IS DISTINCT FROM OLD.inventory_deducted
     OR NEW.edit_history IS DISTINCT FROM OLD.edit_history THEN
    RAISE EXCEPTION 'تم تحديث النظام — هذه العملية لم تعد متاحة من هذه النسخة من الصفحة. يرجى تحديث الصفحة (Ctrl+F5) ثم إعادة المحاولة';
  END IF;

  IF OLD.inventory_deducted
     AND private.order_items_signature(NEW.items) IS DISTINCT FROM private.order_items_signature(OLD.items) THEN
    RAISE EXCEPTION 'لا يمكن تعديل الأصناف أو الكميات أو الـSKU لطلب محجوز المخزون — استخدم «إعادة للسيلز للتعديل» ثم عدّل وأعد الإرسال';
  END IF;

  RETURN NEW;
END;
$$;

-- Likewise a raw INSERT by ANY client role (sales, admin, super_admin) would create an order
-- with arbitrary status / totals, no stock reservation, or a forged inventory_deducted = TRUE
-- (which a later cancel / return would "restore" into phantom stock). Orders are created only
-- through create_order, which runs as the function owner and so is exempt.
CREATE OR REPLACE FUNCTION enforce_order_client_insert_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'لا يمكن إنشاء طلب مباشرةً — استخدم شاشة إنشاء الطلب';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_order_delete_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND OLD.inventory_deducted THEN
    RAISE EXCEPTION 'لا يمكن حذف طلب محجوز المخزون — ألغِ الطلب أولاً ليتم إرجاع الكميات ثم احذفه من تبويب الطلبات الملغاة';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION enforce_order_client_write_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enforce_order_delete_guard()       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION enforce_order_client_insert_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_orders_client_write_guard ON orders;
CREATE TRIGGER tg_orders_client_write_guard
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_client_write_guard();

DROP TRIGGER IF EXISTS tg_orders_client_insert_guard ON orders;
CREATE TRIGGER tg_orders_client_insert_guard
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_client_insert_guard();

DROP TRIGGER IF EXISTS tg_orders_delete_guard ON orders;
CREATE TRIGGER tg_orders_delete_guard
  BEFORE DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_delete_guard();

COMMIT;
