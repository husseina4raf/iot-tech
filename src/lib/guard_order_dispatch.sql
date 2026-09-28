-- ══════════════════════════════════════════════════════════════
-- GUARD 3 — never approve / dispatch an order that holds no stock  (7th, LAST)
-- Run in: Supabase Dashboard → SQL Editor
-- REQUIRES order_creation.sql (the inventory_deducted column).
--
-- THIS FILE HAS NOT BEEN EXECUTED. Explicit BEGIN … COMMIT with a lock_timeout; on
-- any error run ROLLBACK; and retry.
--
-- ⚠ OPERATIONAL CONSEQUENCE — run this only AFTER the historical reconciliation
-- described in order_inventory_diagnostics.sql (PART C) ⚠
--
-- With inventory_deducted FALSE an order may not be
--     approved:   بانتظار الموافقة / جديد / مرفوض → موافق عليه
--     dispatched: بانتظار الموافقة / جديد / مرفوض / موافق عليه → تم الصرف
-- Dispatch no longer deducts stock, so dispatching a never-reserved order would take
-- goods out of the warehouse without ever recording it. Every order that is still open
-- with flag FALSE — orders created before deduction-at-creation existed, or between the
-- frontend deploy and the SQL migration — is therefore blocked from approval/dispatch
-- until reconciled. Intended path:
--     بانتظار الموافقة → Reject, then Sales edits and resubmits
--     موافق عليه       → Return to Sales, then Sales edits and resubmits
-- (resubmit_order reserves the stock and sets the flag).
--
-- Not affected: orders already in تم الصرف / مكتمل / تم التحصيل (moves within that
-- family, and a revert from it to موافق عليه), and the cancel / un-cancel round trip
-- (a transition out of ملغي is decided deliberately by restore_cancelled_order).
--
-- Unlike guards 1 and 2 this trigger applies to EVERY session, including the RPCs —
-- it is the backstop behind advance_order_status. It is deliberately a separate
-- migration so it can be enabled (and, if needed, dropped:
--   DROP TRIGGER tg_orders_dispatch_requires_reservation ON orders;) independently.
-- ══════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='orders' AND column_name='inventory_deducted') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — run order_creation.sql first; nothing was changed';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION enforce_order_dispatch_requires_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT NEW.inventory_deducted
     AND (
          (OLD.status IN ('بانتظار الموافقة', 'جديد', 'مرفوض') AND NEW.status IN ('موافق عليه', 'تم الصرف'))
       OR (OLD.status = 'موافق عليه' AND NEW.status = 'تم الصرف')
     ) THEN
    RAISE EXCEPTION 'لا يمكن اعتماد أو صرف الطلب — لم يتم حجز مخزونه. أعد الطلب للسيلز ثم يعيد إرساله ليتم حجز المخزون';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION enforce_order_dispatch_requires_reservation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_orders_dispatch_requires_reservation ON orders;
CREATE TRIGGER tg_orders_dispatch_requires_reservation
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_dispatch_requires_reservation();

COMMIT;
