-- ══════════════════════════════════════════════════════════════
-- Order / inventory reservation — READ-ONLY DIAGNOSTICS + RECONCILIATION PLAN
-- Run in: Supabase Dashboard → SQL Editor, one query at a time.
--
-- Every statement in PART A and PART B is a plain SELECT. Nothing here
-- modifies data. The only write statements in this file are inside the
-- COMMENTED-OUT template in PART C — they must never be run without a reviewed
-- list of order ids.
--
-- Golden rule: current inventory quantities alone can NOT prove whether a
-- specific order's stock was deducted. Stock is shared by many orders,
-- manual stock edits/receipts happen at any time, and the old code paths
-- (dispatch-time deduction, client-side restore) could fail silently. These
-- queries narrow the candidates; a human decides each order.
-- ══════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════
-- PART A — ENVIRONMENT (works before AND after the migration)
-- ══════════════════════════════════════════════════════════════

-- A1. Which order functions exist, with exact signatures (any schema), overloads,
--     SECURITY DEFINER flag, search_path config and owner.
--     PROVES: what is deployed. Two rows for create_order = overload → PostgREST
--     ambiguity; investigate before running order_creation.sql (order_preflight.sql reports the same).
--     CANNOT PROVE: that a function's body matches the repo (use A2).
SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       pg_get_function_result(p.oid) AS returns, p.prosecdef AS security_definer,
       p.proconfig AS config, pg_get_userbyid(p.proowner) AS owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.proname IN ('create_order','resubmit_order','return_order_to_sales','reject_order',
                     'cancel_order','restore_cancelled_order','revert_order_status','get_my_role')
    OR p.proname LIKE '\_order\_%'
 ORDER BY p.proname, n.nspname;

-- A2. Does the LIVE body of create_order / resubmit_order contain the new logic?
--     Expect after migration: all TRUE for both functions.
SELECT p.oid::regprocedure AS fn,
       pg_get_functiondef(p.oid) ILIKE '%inventory_deducted%'           AS mentions_flag,
       pg_get_functiondef(p.oid) ILIKE '%_order_apply_inventory%'       AS uses_shared_routine,
       pg_get_functiondef(p.oid) ILIKE '%_order_validate_items%'        AS validates_items
  FROM pg_proc p
 WHERE p.proname IN ('create_order','resubmit_order') AND p.pronamespace = 'public'::regnamespace;

-- A3. The reservation column (any schema), plus where the orders table lives.
SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'orders' AND column_name = 'inventory_deducted';

SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'orders';

-- A4. EXECUTE privileges. Expected after migration:
--       helpers (_order_*): anon = false, authenticated = false
--       RPCs (create_order, resubmit_order, return_order_to_sales, reject_order,
--             cancel_order, restore_cancelled_order, revert_order_status):
--             anon = false, authenticated = true
SELECT p.oid::regprocedure AS fn,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       p.proacl
  FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace
   AND (p.proname IN ('create_order','resubmit_order','return_order_to_sales','reject_order',
                      'cancel_order','restore_cancelled_order','revert_order_status','get_my_role')
        OR p.proname LIKE '\_order\_%')
 ORDER BY p.oid::regprocedure::TEXT;

-- A5. Serial sequence vs highest existing serial. Reading does NOT advance the
--     sequence. next_value must be GREATER than max_numeric_serial.
--     If it says DANGER: do NOT reset blindly — investigate how orders with
--     higher serials were created, then setval() deliberately in a reviewed step.
SELECT s.sequencename, s.start_value, s.last_value, s.increment_by,
       COALESCE(s.last_value + s.increment_by, s.start_value) AS next_value,
       m.max_numeric_serial,
       CASE WHEN COALESCE(s.last_value + s.increment_by, s.start_value) > COALESCE(m.max_numeric_serial, 0)
            THEN 'OK' ELSE 'DANGER: next nextval() may collide with an existing serial' END AS verdict
  FROM pg_sequences s
  CROSS JOIN (SELECT MAX(serial_number::BIGINT) AS max_numeric_serial
                FROM public.orders WHERE serial_number ~ '^[0-9]+$') m
 WHERE s.schemaname = 'public' AND s.sequencename = 'orders_serial_seq';

-- A6. Column types the functions rely on, and inventory data quality.
--     Repo schema.sql says inventory.stock is INTEGER and ids are TEXT. Whole-number
--     quantities are enforced by the new validation for that reason.
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'inventory' AND column_name IN ('id','sku','name','stock','lots','cost_price'))
     OR (table_name = 'orders'    AND column_name IN ('id','status','items','edit_history','sales_rep')))
 ORDER BY table_name, column_name;

-- Duplicate non-empty SKUs (the new resolver REJECTS ambiguous SKUs)
SELECT lower(btrim(sku)) AS sku, count(*) AS rows_with_sku, array_agg(id ORDER BY id) AS inventory_ids
  FROM public.inventory
 WHERE sku IS NOT NULL AND btrim(sku) <> ''
 GROUP BY 1 HAVING count(*) > 1;

-- Duplicate product names (informational — names are allowed to repeat; lines
-- with no SKU that match >1 same-name product are rejected as ambiguous)
SELECT lower(btrim(name)) AS name, count(*) AS rows_with_name
  FROM public.inventory GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC;

-- NULL / negative stock (the new code treats NULL as 0)
SELECT id, name, sku, stock FROM public.inventory WHERE stock IS NULL OR stock < 0;

-- A7. Triggers on orders and which RLS policy set is live (rls_migration.sql
--     replaces the permissive "orders_all"/"inventory_all" policies).
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal;

SELECT tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies WHERE tablename IN ('orders','inventory') ORDER BY tablename, policyname;


-- ══════════════════════════════════════════════════════════════
-- PART B — COHORTS  (requires orders.inventory_deducted — run order_creation.sql's
-- ALTER TABLE first; these SELECTs then read the default-FALSE historical state)
-- ══════════════════════════════════════════════════════════════

-- B0. Status × flag matrix — the overview everything else drills into.
SELECT status, inventory_deducted, count(*) AS orders
  FROM public.orders GROUP BY 1, 2 ORDER BY 1, 2;

-- B1. IMPOSSIBLE-AFTER-MIGRATION rows: flag TRUE while the order is unreserved
--     (جديد / مرفوض / ملغي). These are dead ends (resubmit refuses them).
--     PROVES: the row is inconsistent. CANNOT PROVE: which side is wrong — whether
--     stock was actually restored. Needs manual review of inventory movements.
SELECT id, serial_number, status, sales_rep, updated_at
  FROM public.orders
 WHERE inventory_deducted AND status IN ('جديد','مرفوض','ملغي')
 ORDER BY updated_at;

-- B2. OPEN orders with flag FALSE — orders created before deduction-at-creation
--     existed, OR created after the frontend deploy but before the SQL
--     migration (create_order did not deduct then). Under both, stock was NOT
--     reserved at creation. Neither cohort's stock will ever be taken unless the
--     order is re-submitted, because dispatch no longer deducts.
--     EDIT the timestamp below to the moment the new FRONTEND went live.
WITH params AS (SELECT TIMESTAMPTZ '2000-01-01 00:00:00+00' AS frontend_deploy_at)   -- ← EDIT ME
SELECT o.id, o.serial_number, o.status, o.sales_rep, o.created_at,
       CASE WHEN o.created_at < p.frontend_deploy_at
            THEN 'A: created before the new frontend (old model)'
            ELSE 'B: created after frontend deploy, before SQL migration' END AS cohort
  FROM public.orders o CROSS JOIN params p
 WHERE NOT o.inventory_deducted AND o.status IN ('بانتظار الموافقة','موافق عليه')
 ORDER BY o.created_at;
--   PROVES: these orders hold no reservation according to the flag.
--   CANNOT PROVE: that stock was never touched manually for them.

-- Same cohort, bucketed by day — helps you find the real deploy/migration boundary.
SELECT date_trunc('day', created_at)::date AS created_day, status, count(*) AS orders
  FROM public.orders
 WHERE NOT inventory_deducted AND status IN ('بانتظار الموافقة','موافق عليه')
 GROUP BY 1, 2 ORDER BY 1, 2;

-- B3. DISPATCHED-FAMILY orders with flag FALSE. Under the OLD model these had their
--     stock deducted at dispatch (if dispatched before the frontend deploy).
--     If returned to Sales now, the new code restores NOTHING (flag FALSE) and the
--     resubmit would deduct AGAIN → double deduction. Each needs a human decision.
--     first_dispatch_at older than your frontend deploy time ⇒ old-model deduction
--     is LIKELY; newer ⇒ dispatch did not deduct, so stock was never taken.
SELECT o.id, o.serial_number, o.status, o.sales_rep, o.created_at,
       (SELECT min((e->>'changedAt')::TIMESTAMPTZ)
          FROM jsonb_array_elements(COALESCE(o.edit_history, '[]'::jsonb)) AS e
         WHERE e->>'type' = 'status_change' AND e->>'newStatus' = 'تم الصرف') AS first_dispatch_at,
       (SELECT count(*)
          FROM jsonb_array_elements(COALESCE(o.edit_history, '[]'::jsonb)) AS e
         WHERE e->>'type' = 'returned_to_sales') AS times_returned
  FROM public.orders o
 WHERE NOT o.inventory_deducted AND o.status IN ('تم الصرف','مكتمل','تم التحصيل')
 ORDER BY first_dispatch_at NULLS FIRST;
--   PROVES: when the dispatch event was logged.
--   CANNOT PROVE: that the old deduction actually succeeded (it was a client-side,
--   partly-swallowed write) or that later manual stock edits did not compensate.

-- B4. RETURNED orders (status جديد) with flag FALSE. Old code restored stock only when
--     it detected a prior dispatch, client-side (a Team Leader's restore was
--     silently blocked by RLS — inventory UPDATE is admin-only).
SELECT o.id, o.serial_number, o.sales_rep, o.updated_at,
       r.entry->>'previousStatus' AS returned_from, r.entry->>'returnedAt' AS returned_at,
       r.entry->>'returnedBy' AS returned_by
  FROM public.orders o
  LEFT JOIN LATERAL (
        SELECT x.e AS entry
          FROM jsonb_array_elements(COALESCE(o.edit_history, '[]'::jsonb)) WITH ORDINALITY AS x(e, ord)
         WHERE x.e->>'type' = 'returned_to_sales'
         ORDER BY x.ord DESC LIMIT 1) r ON TRUE
 WHERE o.status = 'جديد' AND NOT o.inventory_deducted
 ORDER BY o.updated_at;
--   returned_from in the dispatched family + returned BEFORE the deploy ⇒ old code
--   probably restored stock (unverified). Returned AFTER the deploy but before the
--   SQL migration ⇒ no restore happened at all (the flag column did not exist).

-- B5. CANCELLED orders. inventory_was_deducted_recorded is NULL for cancellations made
--     before this migration ⇒ their reservation state is unknowable; the new
--     un-cancel sends those orders to `جديد` (Sales resubmits).
SELECT o.id, o.serial_number, o.sales_rep, o.updated_at,
       c.entry->>'previousStatus' AS cancelled_from,
       c.entry->'inventoryWasDeducted' AS inventory_was_deducted_recorded
  FROM public.orders o
  LEFT JOIN LATERAL (
        SELECT x.e AS entry
          FROM jsonb_array_elements(COALESCE(o.edit_history, '[]'::jsonb)) WITH ORDINALITY AS x(e, ord)
         WHERE x.e->>'type' = 'cancellation'
         ORDER BY x.ord DESC LIMIT 1) c ON TRUE
 WHERE o.status = 'ملغي'
 ORDER BY o.updated_at;

-- B6. Existing orders whose stored items would FAIL the new server-side validation
--     (blank/zero/negative/decimal/non-numeric quantity). Such an order cannot be
--     returned/resubmitted/reverted through the RPCs until its items are corrected.
SELECT o.id, o.serial_number, o.status, i.ord AS line, i.item->>'name' AS name, i.item->>'quantity' AS quantity
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) WITH ORDINALITY AS i(item, ord)
 WHERE o.status <> 'ملغي'
   AND CASE WHEN btrim(COALESCE(i.item->>'quantity', '')) ~ '^[0-9]{1,7}([.]0+)?$'
            THEN split_part(btrim(i.item->>'quantity'), '.', 1)::INTEGER < 1
            ELSE TRUE END;

-- B7. Existing order lines that the resolver would NOT match cleanly.
--     (a) SKU present but matching 0 or >1 inventory rows:
SELECT o.id, o.serial_number, o.status, i.item->>'sku' AS sku, i.item->>'name' AS name,
       (SELECT count(*) FROM public.inventory inv
         WHERE lower(btrim(inv.sku)) = lower(btrim(i.item->>'sku'))) AS inventory_matches
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS i(item)
 WHERE o.status <> 'ملغي'
   AND btrim(COALESCE(i.item->>'sku', '')) <> ''
   AND (SELECT count(*) FROM public.inventory inv
         WHERE lower(btrim(inv.sku)) = lower(btrim(i.item->>'sku'))) <> 1;

--     (b) No SKU and the EXACT-name match is not exactly one product (the resolver
--         then tries a substring match; this lists the lines most likely to be
--         rejected as unmatched/ambiguous):
SELECT o.id, o.serial_number, o.status, i.item->>'name' AS name,
       (SELECT count(*) FROM public.inventory inv
         WHERE lower(btrim(inv.name)) = lower(btrim(i.item->>'name'))) AS exact_name_matches
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS i(item)
 WHERE o.status <> 'ملغي'
   AND btrim(COALESCE(i.item->>'sku', '')) = ''
   AND (SELECT count(*) FROM public.inventory inv
         WHERE lower(btrim(inv.name)) = lower(btrim(i.item->>'name'))) <> 1;

-- B8. Inventory rows whose stock disagrees with the sum of their lots. FIFO cost
--     and the stock check both depend on these agreeing.
SELECT inv.id, inv.name, inv.sku, inv.stock, COALESCE(l.lots_sum, 0) AS lots_sum
  FROM public.inventory inv
  LEFT JOIN LATERAL (
        SELECT sum((x->>'qty')::NUMERIC) AS lots_sum
          FROM jsonb_array_elements(COALESCE(inv.lots, '[]'::jsonb)) AS x) l ON TRUE
 WHERE COALESCE(inv.stock, 0) <> COALESCE(l.lots_sum, 0)
 ORDER BY inv.name;

-- B9. Quantity currently RESERVED by flag-TRUE orders, per product (SKU lines).
--     A reconciliation aid only: it does not prove current stock is correct.
SELECT lower(btrim(i.item->>'sku')) AS sku,
       sum(CASE WHEN btrim(COALESCE(i.item->>'quantity','')) ~ '^[0-9]{1,7}([.]0+)?$'
                THEN split_part(btrim(i.item->>'quantity'), '.', 1)::INTEGER ELSE 0 END) AS reserved_qty,
       count(DISTINCT o.id) AS orders
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS i(item)
 WHERE o.inventory_deducted AND btrim(COALESCE(i.item->>'sku','')) <> ''
 GROUP BY 1 ORDER BY 1;


-- ══════════════════════════════════════════════════════════════
-- PART C — RECONCILIATION PLAN (human decisions; NOTHING below runs by itself)
-- ══════════════════════════════════════════════════════════════
-- 1. Run PART A. Resolve anything unexpected (overloaded create_order, sequence
--    DANGER, duplicate SKUs, wrong column types) BEFORE running the migration.
-- 2. Run, in order: order_creation.sql, order_lifecycle.sql, inventory_management.sql;
--    deploy the frontend; smoke-test with the scenarios in the repair report; then
--    guard_order_client_writes.sql and guard_inventory_client_writes.sql.
-- 3. Run PART B and export B1–B5 to a spreadsheet. For EACH order decide, with
--    the physical stock count / warehouse records:
--
--    B2 (open, never reserved) — do NOT flip the flag. Use the workflow:
--        بانتظار الموافقة → Reject, then Sales edits and resubmits
--        موافق عليه       → Return to Sales, then Sales edits and resubmits
--    resubmit_order reserves the stock and sets the flag correctly. (Approve /
--    dispatch of a flag-FALSE order is refused once the optional triggers in
--    guard_order_dispatch.sql is installed.)
--
--    B3 (dispatched family, flag FALSE) — decide per order whether stock was
--    really deducted at dispatch under the old model:
--        deducted     → the flag should be TRUE so that a later return/cancel
--                       restores the stock (manual update below);
--        not deducted → leave FALSE and correct inventory through the app with
--                       an audit note if needed.
--    Until decided, DO NOT return such an order to Sales: the restore would be
--    skipped and the resubmit would deduct twice.
--
--    B1 / B4 / B5 — verify against inventory movements (audit_log, stock lots
--    notes "مُرجَع من طلب #…") and the physical count, then correct either the
--    flag (below) or the stock (through the app), never both blindly.
--
-- 4. Flag corrections are manual, reviewed, id-by-id, inside ONE transaction.
--    (The client-write guards only apply to the anon / authenticated API roles; the
--    SQL editor runs as postgres and is exempt — so nothing stops a careless mass
--    UPDATE except this discipline. Use an explicit id list, never a status filter.)
--    TEMPLATE — DO NOT RUN AS-IS:
--
--    -- BEGIN;
--    -- UPDATE public.orders
--    --    SET inventory_deducted = TRUE            -- or FALSE, per the review
--    --  WHERE id IN ('ORD-XXXX', 'ORD-YYYY');      -- ONLY reviewed ids; never a status filter
--    -- -- verify: SELECT id, status, inventory_deducted FROM public.orders WHERE id IN (...);
--    -- COMMIT;                                     -- or ROLLBACK;
--
-- 5. Stock quantities are corrected through the application's inventory screens
--    (add lot / adjust stock), which write an audit_log row — not with raw SQL.
-- 6. Only after the cohorts are handled, run guard_order_dispatch.sql (last).
