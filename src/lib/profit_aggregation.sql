-- ══════════════════════════════════════════════════════════════
-- Canonical Profit Aggregation — server-side RPC
-- Run in: Supabase Dashboard → SQL Editor
--
-- THIS FILE HAS NOT BEEN EXECUTED. Review before running manually.
--
-- Purpose
-- -------
-- Every profit report in the frontend previously computed profit by
-- reducing over the React `orders` array, which only ever holds whatever
-- pages OrdersList has paginated in (PAGE_SIZE = 100). Loading more orders
-- in an unrelated screen could silently change an already-displayed
-- profit number. This function computes the canonical Profit total
-- directly in the database, over the COMPLETE `orders` table, so the
-- result is independent of what happens to be loaded in the browser.
--
-- Canonical business rule (see PROFIT / COMMISSION AUDIT REPORT):
--   Profit = SUM(order.subtotal) − SUM(item.costPrice × item.quantity)
--   for orders where status = 'تم التحصيل' only.
--
--   - order.subtotal is used, never order.total: subtotal is already
--     VAT-exclusive for every order (VAT, when it applies, is added on
--     top of subtotal to produce total — see OrderFormFields.jsx). Using
--     subtotal means VAT never has to be subtracted and never distorts
--     Profit, whether the order had VAT or not.
--   - item.costPrice is the cost snapshot stored on the order's own
--     items JSONB array at the moment the item was added to the order
--     (see OrderFormFields.jsx selectProduct(): costPrice: inv.costPrice).
--     This function deliberately does NOT join against the live
--     `inventory` table — historical Profit must not change just because
--     a product's current cost changed later.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_profit_summary(
  p_rep_name TEXT DEFAULT NULL,  -- NULL = all reps (grouped result, one row per rep)
  p_year     TEXT DEFAULT NULL,  -- matches the year segment of order.date ('DD-MM-YYYY'); NULL = all years
  p_month    TEXT DEFAULT NULL,  -- matches the month segment, zero-padded ('01'-'12'); NULL = all months
  p_day      TEXT DEFAULT NULL   -- matches the day segment, zero-padded ('01'-'31'); NULL = all days
)
RETURNS TABLE (
  rep_name       TEXT,
  order_count    BIGINT,
  total_subtotal NUMERIC,
  total_cost     NUMERIC,
  total_profit   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_role TEXT;
  caller_rep  TEXT;
BEGIN
  -- ── Authorization — mirrors the existing `orders_select` RLS policy ────────
  -- (rls_migration.sql). This function is SECURITY DEFINER and therefore
  -- bypasses RLS entirely, so the same visibility rule must be re-applied
  -- explicitly here: admin/super_admin/team_leader may query any rep (or
  -- all reps via p_rep_name = NULL); a 'sales' user may only ever see their
  -- own rep's numbers, exactly as they can only see their own orders today.
  --
  -- get_my_role() is confirmed present on the live database (role_management.sql
  -- defines it — CREATE OR REPLACE — and that migration has already been run
  -- successfully; change_user_role() already depends on it in production).
  --
  -- get_my_rep_name() is NOT used here: it does not exist on the live
  -- database (confirmed — calling this RPC failed with
  -- "function get_my_rep_name() does not exist"; it was only ever defined
  -- in rls_migration.sql, which was apparently never run, or not fully).
  -- Rather than depend on an unconfirmed helper, the caller's rep_name is
  -- read directly from `profiles` here, inline, using the same auth.uid()
  -- pattern get_my_rep_name() itself would have used.
  caller_role := get_my_role();

  -- Explicitly qualified as p.rep_name: this function's own RETURNS TABLE
  -- declares an output column also named rep_name, and PostgreSQL treats
  -- that as an in-scope identifier inside the function body — an
  -- unqualified `rep_name` here is ambiguous between it and
  -- profiles.rep_name (confirmed: "column reference \"rep_name\" is
  -- ambiguous" when run unqualified).
  SELECT p.rep_name
    INTO caller_rep
    FROM profiles AS p
   WHERE p.id = auth.uid();

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول أولاً';
  END IF;

  IF caller_role IN ('admin', 'super_admin', 'team_leader') THEN
    -- Full visibility, matching orders_select for these roles. p_rep_name
    -- is used as given (a specific rep, or NULL for "all reps").
    NULL;
  ELSIF caller_role = 'sales' THEN
    -- A sales profile with no rep_name must be denied outright. Without
    -- this guard, the fallback below would set p_rep_name := NULL, and the
    -- main query's "(p_rep_name IS NULL OR ...)" filter treats NULL as
    -- "no filter" — silently handing this caller every rep's profit data.
    IF caller_rep IS NULL THEN
      RAISE EXCEPTION 'حسابك غير مرتبط باسم مندوب مبيعات — لا يمكن حساب الأرباح';
    END IF;
    IF p_rep_name IS NOT NULL AND p_rep_name <> caller_rep THEN
      RAISE EXCEPTION 'ليس لديك صلاحية عرض بيانات مندوب آخر';
    END IF;
    -- Force-scope to the caller's own rep even if NULL ("all reps") was
    -- requested — a sales user must never receive another rep's row.
    p_rep_name := caller_rep;
  ELSE
    RAISE EXCEPTION 'دور غير معروف — لا يمكن حساب الأرباح';
  END IF;

  RETURN QUERY
  SELECT
    o.sales_rep AS rep_name,
    COUNT(*)::BIGINT AS order_count,
    COALESCE(SUM(o.subtotal), 0)::NUMERIC AS total_subtotal,
    COALESCE(SUM(item_cost.total_item_cost), 0)::NUMERIC AS total_cost,
    (COALESCE(SUM(o.subtotal), 0) - COALESCE(SUM(item_cost.total_item_cost), 0))::NUMERIC AS total_profit
  FROM orders o
  -- Sum each order's own stored item cost snapshots. A missing/null/zero
  -- item.costPrice (or item.quantity) is treated as 0 — explicit, visible
  -- here via COALESCE, not silently defaulted somewhere else. This never
  -- falls back to a live inventory lookup.
  --
  -- jsonb_array_elements() requires a JSON array — it raises a hard error
  -- on any other JSONB shape (an object, a scalar, etc.). Since items has
  -- no CHECK constraint enforcing "array", a single malformed row could
  -- otherwise fail this entire aggregate for every caller. The CASE below
  -- treats NULL items and any non-array items value identically as an
  -- empty array (item cost 0) — the order itself is never excluded, and
  -- its subtotal (summed separately below) is completely unaffected.
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
    AND (p_rep_name IS NULL OR o.sales_rep = p_rep_name)
    AND (p_year  IS NULL OR split_part(o.date, '-', 3) = p_year)
    AND (p_month IS NULL OR lpad(split_part(o.date, '-', 2), 2, '0') = lpad(p_month, 2, '0'))
    AND (p_day   IS NULL OR lpad(split_part(o.date, '-', 1), 2, '0') = lpad(p_day, 2, '0'))
  GROUP BY o.sales_rep;
END;
$$;

-- Lock down public access; only authenticated users may call this RPC.
-- The role-based scoping above is what actually restricts what each
-- authenticated caller can see.
REVOKE ALL  ON FUNCTION public.get_profit_summary(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profit_summary(TEXT, TEXT, TEXT, TEXT) TO authenticated;
