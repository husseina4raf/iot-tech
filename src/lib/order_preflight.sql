-- ══════════════════════════════════════════════════════════════
-- PRODUCTION PREFLIGHT — READ-ONLY                       (run BEFORE any migration)
-- Run in: Supabase Dashboard → SQL Editor, as the SAME role you will run the
-- migrations with. It is a single SELECT: it changes nothing, takes no locks
-- beyond ACCESS SHARE, and does not advance any sequence.
--
-- Reading the result
--   FAIL  a migration would abort or misbehave — fix before running anything.
--   WARN  not a blocker by itself, but needs a human decision (see detail).
--   PASS / INFO  as labelled.
-- It is column-agnostic on purpose (to_jsonb(row)->>'col'), so a missing column
-- shows up as a FAIL line instead of an error that hides the other checks.
-- The migrations also start with their own assertions (DO $pre$) and are wrapped
-- in an explicit BEGIN … COMMIT with SET LOCAL lock_timeout — this query lets you
-- see every problem at once instead of one at a time.
-- ══════════════════════════════════════════════════════════════

WITH
req_cols(t, c, ty) AS (VALUES
  ('orders','id','text'), ('orders','serial_number','text'), ('orders','status','text'),
  ('orders','items','jsonb'), ('orders','edit_history','jsonb'), ('orders','sales_rep','text'),
  ('orders','updated_at','timestamp with time zone'), ('orders','created_at','timestamp with time zone'),
  ('inventory','id','text'), ('inventory','name','text'), ('inventory','sku','text'),
  ('inventory','lots','jsonb'), ('inventory','cost_price','numeric'),
  ('profiles','id','uuid'), ('profiles','name','text'), ('profiles','role','text'), ('profiles','rep_name','text'),
  ('audit_log','id','text'), ('audit_log','changed_at','timestamp with time zone')
),
fn_names(n) AS (VALUES ('create_order'), ('resubmit_order'), ('return_order_to_sales'), ('reject_order'),
                       ('cancel_order'), ('restore_cancelled_order'), ('revert_order_status'),
                       ('advance_order_status'), ('update_order_details'), ('update_inventory_item'),
                       ('delete_inventory_item'), ('adjust_inventory_stock'), ('add_stock_lot'),
                       ('update_stock_lot'), ('reconcile_inventory_lots'), ('change_inventory_sku')),
checks AS (

  -- 1. Server / role basics ------------------------------------------------
  SELECT 10 AS ord, 'server version' AS check_name,
         CASE WHEN current_setting('server_version_num')::INT >= 110000 THEN 'PASS' ELSE 'FAIL' END AS status,
         version() AS detail
  UNION ALL
  SELECT 11, 'running as role', 'INFO', current_user || ' (session ' || session_user || ')'
  UNION ALL
  SELECT 12, 'role ' || r, CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN 'PASS' ELSE 'FAIL' END, ''
    FROM unnest(ARRAY['anon','authenticated','service_role']) AS r

  -- 2. Tables and columns ----------------------------------------------------
  UNION ALL
  SELECT 20, 'table public.' || t,
         CASE WHEN to_regclass('public.' || t) IS NOT NULL THEN 'PASS' ELSE 'FAIL' END, ''
    FROM unnest(ARRAY['orders','inventory','profiles','audit_log']) AS t
  UNION ALL
  SELECT 21, 'column ' || rc.t || '.' || rc.c || ' (' || rc.ty || ')',
         CASE WHEN ic.data_type = rc.ty THEN 'PASS'
              WHEN ic.data_type IS NULL THEN 'FAIL' ELSE 'FAIL' END,
         COALESCE('actual type: ' || ic.data_type, 'MISSING')
    FROM req_cols rc
    LEFT JOIN information_schema.columns ic
           ON ic.table_schema = 'public' AND ic.table_name = rc.t AND ic.column_name = rc.c
  UNION ALL
  SELECT 22, 'column inventory.stock (integer or numeric)',
         CASE WHEN ic.data_type IN ('integer','bigint','smallint','numeric') THEN 'PASS' ELSE 'FAIL' END,
         COALESCE('actual type: ' || ic.data_type, 'MISSING') ||
         CASE WHEN ic.data_type = 'numeric' THEN ' — fractional stock possible; whole-number order quantities are enforced' ELSE '' END
    FROM (SELECT 1) one
    LEFT JOIN information_schema.columns ic
           ON ic.table_schema = 'public' AND ic.table_name = 'inventory' AND ic.column_name = 'stock'
  UNION ALL
  SELECT 23, 'orders.inventory_deducted (added by Part A)',
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema='public' AND table_name='orders' AND column_name='inventory_deducted')
              THEN 'INFO' ELSE 'INFO' END,
         CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                            WHERE table_schema='public' AND table_name='orders' AND column_name='inventory_deducted')
              THEN 'already present (re-run is safe)' ELSE 'not present yet — Part A will add it (metadata-only on PG ≥ 11)' END

  -- 3. Dependencies, ownership, overloads ------------------------------------
  UNION ALL
  SELECT 30, 'function get_my_role()',
         CASE WHEN p.oid IS NULL THEN 'FAIL' WHEN NOT p.prosecdef THEN 'WARN' ELSE 'PASS' END,
         COALESCE('owner ' || pg_get_userbyid(p.proowner) || CASE WHEN p.prosecdef THEN ', security definer' ELSE ', NOT security definer' END,
                  'MISSING — run rls_migration.sql / role_management.sql')
    FROM (SELECT 1) one
    LEFT JOIN pg_proc p ON p.pronamespace = 'public'::regnamespace AND p.proname = 'get_my_role' AND p.pronargs = 0
  UNION ALL
  SELECT 31, 'can run as owner of public.' || c.relname,
         CASE WHEN pg_has_role(current_user, c.relowner, 'MEMBER') THEN 'PASS' ELSE 'FAIL' END,
         'table owner: ' || pg_get_userbyid(c.relowner)
    FROM pg_class c WHERE c.oid IN ('public.orders'::regclass, 'public.inventory'::regclass)
  UNION ALL
  SELECT 32, 'FORCE ROW LEVEL SECURITY on public.' || c.relname,
         CASE WHEN c.relforcerowsecurity THEN 'FAIL' ELSE 'PASS' END,
         CASE WHEN c.relforcerowsecurity THEN 'SECURITY DEFINER functions would be filtered by RLS' ELSE 'off (definer functions bypass RLS as table owner)' END
    FROM pg_class c WHERE c.oid IN ('public.orders'::regclass, 'public.inventory'::regclass)
  UNION ALL
  SELECT 33, 'existing function public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         CASE WHEN NOT pg_has_role(current_user, p.proowner, 'MEMBER') THEN 'FAIL'
              WHEN p.proname = 'create_order'   AND pg_get_function_identity_arguments(p.oid) <> 'p_order jsonb' THEN 'FAIL'
              WHEN p.proname = 'resubmit_order' AND pg_get_function_identity_arguments(p.oid) <> 'p_order_id text, p_order jsonb' THEN 'FAIL'
              ELSE 'PASS' END,
         'owner ' || pg_get_userbyid(p.proowner) ||
         CASE WHEN pg_get_userbyid(p.proowner) IN ('anon','authenticated') THEN ' — a CLIENT role must never own these' ELSE '' END ||
         ' — FAIL means: another owner, or an overload that PostgREST could not disambiguate'
    FROM pg_proc p JOIN fn_names f ON f.n = p.proname
   WHERE p.pronamespace = 'public'::regnamespace
  UNION ALL
  SELECT 34, 'new order/inventory functions already installed', 'INFO',
         count(*)::TEXT || ' of ' || (SELECT count(*) FROM fn_names) || ' (0 expected before the first migration run)'
    FROM pg_proc p JOIN fn_names f ON f.n = p.proname WHERE p.pronamespace = 'public'::regnamespace

  -- 4. Serial sequence ---------------------------------------------------------
  UNION ALL
  SELECT 40, 'orders_serial_seq vs highest serial',
         CASE WHEN s.sequencename IS NULL AND COALESCE(m.mx, 0) >= 3005 THEN 'FAIL'
              WHEN s.sequencename IS NULL THEN 'INFO'
              WHEN COALESCE(s.last_value + s.increment_by, s.start_value) > COALESCE(m.mx, 0) THEN 'PASS'
              ELSE 'FAIL' END,
         CASE WHEN s.sequencename IS NULL
              THEN 'sequence not created yet — Part A creates it at 3005; max serial is ' || COALESCE(m.mx::TEXT, 'none') ||
                   CASE WHEN COALESCE(m.mx, 0) >= 3005 THEN ' ⇒ 3005 WOULD COLLIDE: setval deliberately first' ELSE '' END
              ELSE 'next value ' || COALESCE(s.last_value + s.increment_by, s.start_value) || ' vs max serial ' || COALESCE(m.mx::TEXT, 'none') ||
                   ' — Part A never resets it' END
    FROM (SELECT 1) one
    LEFT JOIN pg_sequences s ON s.schemaname = 'public' AND s.sequencename = 'orders_serial_seq'
    CROSS JOIN (SELECT MAX(serial_number::BIGINT) AS mx FROM public.orders
                 WHERE serial_number ~ '^[0-9]{1,15}$') m

  -- 5. Data quality the new rules depend on -------------------------------------
  UNION ALL
  SELECT 50, 'duplicate non-empty SKUs in inventory',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
         count(*) || ' duplicated SKU value(s) — the resolver rejects ambiguous SKUs'
    FROM (SELECT lower(btrim(to_jsonb(i)->>'sku')) AS k FROM public.inventory i
           WHERE btrim(COALESCE(to_jsonb(i)->>'sku', '')) <> ''
           GROUP BY 1 HAVING count(*) > 1) d
  UNION ALL
  SELECT 51, 'inventory with NULL or negative stock',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN' END, count(*) || ' row(s) (NULL is treated as 0)'
    FROM public.inventory i
   WHERE (to_jsonb(i)->>'stock') IS NULL OR (to_jsonb(i)->>'stock')::NUMERIC < 0
  UNION ALL
  SELECT 52, 'inventory stock ≠ sum of lots',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN' END,
         count(*) || ' product(s): after migration, orders for them are refused until their lots are reconciled (reconcile_inventory_lots) — list them with diagnostics B8'
    FROM public.inventory i
    LEFT JOIN LATERAL (SELECT COALESCE(SUM(COALESCE((x->>'qty')::NUMERIC, 0)), 0) AS lots_sum
                         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(to_jsonb(i)->'lots') = 'array' THEN to_jsonb(i)->'lots' ELSE '[]'::jsonb END) x) l ON TRUE
   WHERE COALESCE((to_jsonb(i)->>'stock')::NUMERIC, 0) <> l.lots_sum
  UNION ALL
  SELECT 53, 'existing order lines with an invalid quantity',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN' END,
         count(*) || ' line(s) in non-cancelled orders would fail server validation (diagnostics B6)'
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(to_jsonb(o)->'items') = 'array' THEN to_jsonb(o)->'items' ELSE '[]'::jsonb END) e
   WHERE to_jsonb(o)->>'status' <> 'ملغي'
     AND NOT (btrim(COALESCE(e->>'quantity', '')) ~ '^[0-9]{1,7}([.]0+)?$')
  UNION ALL
  SELECT 54, 'orders needing reconciliation (open, never reserved)', 'INFO',
         count(*) || ' open order(s) — all of them, since the flag does not exist yet (diagnostics B2 splits the cohorts after Part A)'
    FROM public.orders o WHERE to_jsonb(o)->>'status' IN ('بانتظار الموافقة','موافق عليه')

  -- 6. Locking / concurrency risk for ALTER TABLE ---------------------------------
  UNION ALL
  SELECT 60, 'transactions open > 30 s (ALTER TABLE would queue behind them)',
         CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN' END,
         count(*) || ' session(s)' || COALESCE(' — oldest: ' || min(now() - xact_start)::TEXT, '')
    FROM pg_stat_activity
   WHERE datname = current_database() AND pid <> pg_backend_pid()
     AND xact_start IS NOT NULL AND now() - xact_start > interval '30 seconds'
  UNION ALL
  SELECT 61, 'sessions idle in transaction', CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'WARN' END, count(*)::TEXT
    FROM pg_stat_activity
   WHERE datname = current_database() AND state = 'idle in transaction' AND pid <> pg_backend_pid()

  -- 7. Existing triggers, RLS, PostgREST behaviour ----------------------------------
  UNION ALL
  SELECT 70, 'trigger ' || tgrelid::regclass::TEXT || '.' || tgname, 'INFO',
         CASE WHEN tgenabled = 'O' THEN 'enabled' ELSE 'state ' || tgenabled::TEXT END
    FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.orders'::regclass, 'public.inventory'::regclass)
  UNION ALL
  SELECT 71, 'RLS on public.' || c.relname, CASE WHEN c.relrowsecurity THEN 'PASS' ELSE 'WARN' END,
         (SELECT count(*) FROM pg_policies pp WHERE pp.schemaname = 'public' AND pp.tablename = c.relname) || ' polic(ies)'
    FROM pg_class c WHERE c.oid IN ('public.orders'::regclass, 'public.inventory'::regclass)
  UNION ALL
  SELECT 72, 'PostgREST schema-cache reload on DDL',
         CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'WARN' END,
         CASE WHEN count(*) > 0 THEN 'event trigger(s) present: ' || string_agg(evtname, ', ')
              ELSE 'no pgrst event trigger found — run  NOTIFY pgrst, ''reload schema'';  after each migration' END
    FROM pg_event_trigger WHERE evtname LIKE 'pgrst%'
  UNION ALL
  SELECT 73, 'API role settings (statement / lock timeouts)', 'INFO',
         rolname || ': ' || COALESCE(array_to_string(rolconfig, ', '), '(none)')
    FROM pg_roles WHERE rolname IN ('authenticator', 'authenticated', 'anon')
  UNION ALL
  SELECT 74, 'schema private', 'INFO',
         CASE WHEN to_regnamespace('private') IS NULL
              THEN 'not created yet — Part A creates it; make sure Dashboard → API settings → "Exposed schemas" does NOT list it'
              ELSE 'exists — confirm it is NOT in the API "Exposed schemas" list' END
)
SELECT status, check_name, detail
  FROM checks
 ORDER BY CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1 WHEN 'INFO' THEN 2 ELSE 3 END, ord, check_name;
