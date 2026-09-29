-- ══════════════════════════════════════════════════════════════
-- Order report listing — server-side pagination + date filtering
-- Run in: Supabase Dashboard → SQL Editor
--
-- THIS FILE HAS NOT BEEN EXECUTED. Review before running manually.
--
-- Purpose
-- -------
-- The Sales/Team Leader "Invoices" and "Profit Reports" screens used to read
-- the frontend's client-paginated `orders` array (useOrders.jsx, PAGE_SIZE =
-- 100, newest-first, never extended for these screens — only the Admin-only
-- OrdersList screen calls loadMoreOrders()). Any invoice older than the
-- 100th most-recent order, company-wide, was therefore invisible to Sales /
-- Team Leader no matter what date filter they picked, while a Super Admin
-- who had separately browsed OrdersList (sharing the same in-memory array)
-- could see further back. This function fetches a filtered, paginated page
-- directly from the database instead, so a selected month/year genuinely
-- queries that period rather than filtering whatever 100 rows happened to
-- already be loaded.
--
-- This does NOT touch orders_select RLS (rls_migration.sql) or
-- get_profit_summary (profit_aggregation.sql) — both are left exactly as
-- they are. This function is SECURITY DEFINER (so it can serve a stable,
-- ordered, paginated result set) and therefore re-implements, verbatim, the
-- same visibility rule get_profit_summary already re-implements for the
-- same reason: admin/super_admin/team_leader may query any rep (or all,
-- p_rep_name = NULL); a sales user is force-scoped to their own rep_name
-- and denied outright if their profile has none.
--
-- Date filtering matches get_profit_summary's own convention exactly:
-- order.date is stored as free-text 'DD-MM-YYYY' (see OrderForm.jsx), split
-- on '-' the same way, so a selected month/year matches the same rows the
-- profit totals RPC would count for that period — the invoice list and the
-- profit totals never disagree about which period a filter means.
--
-- THIS FILE HAS NOT BEEN EXECUTED. Explicit BEGIN … COMMIT with a
-- lock_timeout; on any error run ROLLBACK; and retry — same convention as
-- every other file in this migration set.
-- ══════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ── Preflight assertions (fail fast, change nothing) ───────────────────────
DO $pre$
BEGIN
  IF to_regprocedure('public.get_my_role()') IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — public.get_my_role() is missing; nothing was changed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'rep_name') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — public.profiles.rep_name is missing; nothing was changed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'date' AND data_type = 'text') THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED — public.orders.date must exist as TEXT (''DD-MM-YYYY''); nothing was changed';
  END IF;
END
$pre$;


CREATE OR REPLACE FUNCTION list_report_orders(
  p_rep_name TEXT    DEFAULT NULL,  -- NULL = all reps (admin/team_leader/super_admin only)
  p_year     TEXT    DEFAULT NULL,  -- matches the year segment of order.date; NULL = all years
  p_month    TEXT    DEFAULT NULL,  -- matches the month segment, zero-padded; NULL = all months
  p_day      TEXT    DEFAULT NULL,  -- matches the day segment, zero-padded; NULL = all days
  p_status   TEXT    DEFAULT NULL,  -- NULL = any status; pass a specific status (e.g. 'تم التحصيل') to scope
  p_search   TEXT    DEFAULT NULL,  -- optional free-text match on client name / mobile / whatsapp
  p_limit    INTEGER DEFAULT 15,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (order_row orders, total_count BIGINT, total_revenue NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role TEXT;
  caller_rep  TEXT;
  v_search    TEXT := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  -- ── Authorization — mirrors get_profit_summary's re-implementation of
  -- orders_select (rls_migration.sql) verbatim; see that function's own
  -- comment for why get_my_rep_name() is not used here. ────────────────────
  caller_role := get_my_role();

  SELECT p.rep_name
    INTO caller_rep
    FROM profiles AS p
   WHERE p.id = auth.uid();

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول أولاً';
  END IF;

  IF caller_role IN ('admin', 'super_admin', 'team_leader') THEN
    NULL; -- full visibility, matching orders_select for these roles
  ELSIF caller_role = 'sales' THEN
    IF caller_rep IS NULL THEN
      RAISE EXCEPTION 'حسابك غير مرتبط باسم مندوب مبيعات — لا يمكن عرض الفواتير';
    END IF;
    IF p_rep_name IS NOT NULL AND p_rep_name <> caller_rep THEN
      RAISE EXCEPTION 'ليس لديك صلاحية عرض بيانات مندوب آخر';
    END IF;
    -- Force-scope even if NULL ("all reps") was requested.
    p_rep_name := caller_rep;
  ELSE
    RAISE EXCEPTION 'دور غير معروف — لا يمكن عرض الفواتير';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    p_limit := 15;
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    p_offset := 0;
  END IF;

  RETURN QUERY
  SELECT o, count(*) OVER ()::BIGINT AS total_count,
         COALESCE(SUM(o.total) OVER (), 0)::NUMERIC AS total_revenue
    FROM orders o
   WHERE (p_rep_name IS NULL OR o.sales_rep = p_rep_name)
     AND (p_status   IS NULL OR o.status = p_status)
     AND (p_year  IS NULL OR split_part(o.date, '-', 3) = p_year)
     AND (p_month IS NULL OR lpad(split_part(o.date, '-', 2), 2, '0') = lpad(p_month, 2, '0'))
     AND (p_day   IS NULL OR lpad(split_part(o.date, '-', 1), 2, '0') = lpad(p_day, 2, '0'))
     AND (v_search IS NULL
          OR o.client_name ILIKE '%' || v_search || '%'
          OR o.mobile      ILIKE '%' || v_search || '%'
          OR o.whatsapp    ILIKE '%' || v_search || '%')
   ORDER BY o.created_at DESC, o.id DESC
   LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Lock down public access; only authenticated users may call this RPC.
-- The role-based scoping above is what actually restricts what each
-- authenticated caller can see — identical model to get_profit_summary.
REVOKE ALL  ON FUNCTION public.list_report_orders(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_report_orders(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
-- Note: if this function is ever re-run after a prior version with a
-- DIFFERENT RETURNS TABLE shape is already live, CREATE OR REPLACE will
-- fail ("cannot change return type of existing function") — DROP FUNCTION
-- public.list_report_orders(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,INTEGER)
-- first in that case. Not applicable on a first run (this file has not
-- been executed yet).

COMMIT;
