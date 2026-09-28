-- ══════════════════════════════════════════════════════════════
-- GUARD 2 — refuse unsafe CLIENT writes to inventory            (4th of the set)
-- Run in: Supabase Dashboard → SQL Editor
-- REQUIRES inventory_management.sql. Run it together with guard_order_client_writes.sql,
-- right after the migrations and BEFORE the new frontend is deployed (see that file).
--
-- THIS FILE HAS NOT BEEN EXECUTED. Explicit BEGIN … COMMIT with a lock_timeout; on
-- any error run ROLLBACK; and retry.
--
-- Independent of guard_order_client_writes.sql and guard_order_dispatch.sql — run
-- in any order relative to them. Tabs on the previous frontend then fail loudly on stock /
-- lot / SKU / delete edits until refreshed.
--
-- Like the order guard it applies ONLY to the client roles (anon / authenticated);
-- the inventory RPCs run as the function owner and are exempt, as are the service
-- role and SQL-editor operators. For a direct client write it refuses:
--   UPDATE of stock / lots / cost_price   — use adjust_inventory_stock / add_stock_lot /
--                                            update_stock_lot / reconcile_inventory_lots
--                                            (a stale form can no longer overwrite the
--                                            reservations made since it was opened)
--   UPDATE of the SKU   when a reserved order has a line with that SKU
--   UPDATE of the name  when a reserved order has a SKU-less line that resolves to it
--   DELETE              when any reserved order depends on the product
-- Plain INSERT of a new product and edits of descriptive fields are unaffected.
-- ══════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF to_regprocedure('private.inventory_reserved_refs(text)') IS NULL
     OR to_regprocedure('private.inventory_assert_unreferenced(text,boolean,boolean,text)') IS NULL
     OR to_regprocedure('public.adjust_inventory_stock(text,integer,integer,text)') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — run inventory_management.sql first; nothing was changed';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION enforce_inventory_client_write_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM private.inventory_assert_unreferenced(OLD.id, TRUE, TRUE, 'حذف المنتج');
    RETURN OLD;
  END IF;

  IF NEW.stock IS DISTINCT FROM OLD.stock
     OR NEW.lots IS DISTINCT FROM OLD.lots
     OR NEW.cost_price IS DISTINCT FROM OLD.cost_price THEN
    RAISE EXCEPTION 'لا يمكن تعديل الكمية أو الدفعات أو التكلفة مباشرةً — هذه العملية لم تعد متاحة من هذه النسخة من الصفحة. يرجى تحديث الصفحة (Ctrl+F5) ثم إعادة المحاولة';
  END IF;

  IF lower(btrim(COALESCE(NEW.sku, ''))) IS DISTINCT FROM lower(btrim(COALESCE(OLD.sku, ''))) THEN
    PERFORM private.inventory_assert_unreferenced(OLD.id, TRUE, FALSE, 'تغيير الـSKU');
  END IF;
  IF lower(btrim(COALESCE(NEW.name, ''))) IS DISTINCT FROM lower(btrim(COALESCE(OLD.name, ''))) THEN
    PERFORM private.inventory_assert_unreferenced(OLD.id, FALSE, TRUE, 'تغيير اسم المنتج');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_inventory_client_write_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_inventory_client_write_guard ON inventory;
CREATE TRIGGER tg_inventory_client_write_guard
  BEFORE UPDATE OR DELETE ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION enforce_inventory_client_write_guard();

COMMIT;
