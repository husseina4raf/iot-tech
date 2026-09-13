-- ══════════════════════════════════════════════════════════════
-- Leaderboard Aggregation — server-side RPC (separate from Profit)
-- Run in: Supabase Dashboard → SQL Editor
--
-- THIS FILE HAS NOT BEEN EXECUTED. Review before running manually.
--
-- Purpose
-- -------
-- Leaderboard.jsx previously reused get_profit_summary (profit_aggregation.sql)
-- for its ranking data. That RPC's authorization is correct for the
-- Profit/Reports use case — it deliberately forces a 'sales' caller's
-- p_rep_name to their own rep only, so a Sales user can never pull another
-- rep's private financial data through a report screen. But a Leaderboard
-- is a different kind of view: it is an intentionally shared business
-- ranking, where every Sales user is meant to see every other Sales
-- user's total. Those two authorization needs conflict, so rather than
-- weaken get_profit_summary (which would leak data through Profit
-- Report / Sales Reports / Team Invoices too), this is a SEPARATE RPC
-- with its own, Leaderboard-appropriate authorization.
--
-- The underlying business formula is intentionally IDENTICAL to
-- get_profit_summary's — this does not introduce a second, different
-- definition of profit:
--   - status = 'تم التحصيل' only
--   - revenue = order.subtotal (VAT-exclusive)
--   - cost = SUM(item.costPrice × item.quantity), stored snapshot only,
--     never the live inventory cost
--   - missing/null/zero costPrice or quantity = 0
--   - a non-array/malformed `items` value is treated as an empty array
--     (cost 0), never excludes the order or crashes the aggregation
--
-- What's different from get_profit_summary is ONLY the authorization and
-- the returned columns (rep_name, order_count, total_profit — no
-- subtotal/cost breakdown, since the Leaderboard never displays those):
--   - sales / team_leader / admin / super_admin may all call this and see
--     every qualifying rep's row (no per-rep restriction) — this is the
--     one deliberate difference from get_profit_summary.
--   - EXCEPT: a 'sales' caller's results exclude any rep whose profile
--     role is 'team_leader' — enforced here, server-side, via the profiles
--     join below, not left to the frontend to filter alone.
--   - team_leader/admin/super_admin see both sales and team_leader reps
--     (team_leader's own view is unchanged from what get_profit_summary
--     already gave it — that role was never restricted there either).
--
-- Zero-activity reps: intentionally NOT handled here. A rep with no
-- qualifying orders simply produces no row (same as get_profit_summary) —
-- Leaderboard.jsx's existing merge (enumerate salesReps, default missing
-- rows to 0) already covers this and is unchanged by this migration.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_leaderboard_summary(
  p_year  TEXT DEFAULT NULL,  -- matches the year segment of order.date ('DD-MM-YYYY'); NULL = all years
  p_month TEXT DEFAULT NULL,  -- matches the month segment, zero-padded; NULL = all months
  p_day   TEXT DEFAULT NULL   -- matches the day segment, zero-padded; NULL = all days
)
RETURNS TABLE (
  rep_name     TEXT,
  order_count  BIGINT,
  total_profit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  caller_role := get_my_role();
  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول أولاً';
  END IF;
  IF caller_role NOT IN ('sales', 'team_leader', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية عرض المتصدرين';
  END IF;

  RETURN QUERY
  SELECT
    o.sales_rep AS rep_name,
    COUNT(*)::BIGINT AS order_count,
    (COALESCE(SUM(o.subtotal), 0) - COALESCE(SUM(item_cost.total_item_cost), 0))::NUMERIC AS total_profit
  FROM orders o
  -- Join to profiles only to know each rep's role (for the sales/team_leader
  -- visibility rule below) — no profile field beyond role/rep_name is read
  -- or returned, and no order/customer detail beyond what's aggregated here
  -- ever leaves this function.
  JOIN profiles p ON p.rep_name = o.sales_rep AND p.active = TRUE
  LEFT JOIN LATERAL (
    SELECT SUM(
      COALESCE((elem->>'costPrice')::NUMERIC, 0)
      * COALESCE((elem->>'quantity')::NUMERIC, 0)
    ) AS total_item_cost
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
    ) AS elem
  ) item_cost ON TRUE
  WHERE o.status = 'تم التحصيل'
    AND p.role IN ('sales', 'team_leader')
    -- The one authorization difference from get_profit_summary: a sales
    -- caller sees every OTHER sales rep's total (intentional — this is a
    -- shared ranking, not a private report), but never a team_leader's.
    AND (caller_role <> 'sales' OR p.role = 'sales')
    AND (p_year  IS NULL OR split_part(o.date, '-', 3) = p_year)
    AND (p_month IS NULL OR lpad(split_part(o.date, '-', 2), 2, '0') = lpad(p_month, 2, '0'))
    AND (p_day   IS NULL OR lpad(split_part(o.date, '-', 1), 2, '0') = lpad(p_day, 2, '0'))
  GROUP BY o.sales_rep;
END;
$$;

-- Lock down public access; only authenticated users may call this RPC.
-- The role-based filtering above is what actually restricts what each
-- authenticated caller receives.
REVOKE ALL  ON FUNCTION public.get_leaderboard_summary(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_summary(TEXT, TEXT, TEXT) TO authenticated;
