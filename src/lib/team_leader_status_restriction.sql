-- ══════════════════════════════════════════════════════════════
-- Team Leader Status Restriction — DB-level enforcement
-- Run in: Supabase Dashboard → SQL Editor
-- Purpose: Prevent team_leader from advancing orders to final
--          dispatch / collection statuses at the database level,
--          mirroring the frontend role-guard in useOrders.jsx.
-- ══════════════════════════════════════════════════════════════

-- Trigger function: raises an exception if a team_leader tries
-- to set order status to a forbidden value.
CREATE OR REPLACE FUNCTION enforce_team_leader_status_restriction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only applies when the status column is actually changing
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF get_my_role() = 'team_leader'
       AND NEW.status IN ('تم الصرف', 'تم التحصيل') THEN
      RAISE EXCEPTION
        'team_leader is not authorised to set order status to "%"', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach the trigger to the orders table (BEFORE UPDATE so the row is never written)
DROP TRIGGER IF EXISTS tg_team_leader_status_restriction ON orders;
CREATE TRIGGER tg_team_leader_status_restriction
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_team_leader_status_restriction();
