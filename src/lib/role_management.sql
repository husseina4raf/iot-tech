-- ══════════════════════════════════════════════════════════════
-- Role Management — Secure RPC + RLS hardening
-- Run in: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════


-- ── 0. Recursion-safe role-reading helpers ────────────────────
-- Both functions are SECURITY DEFINER, which means PostgreSQL runs
-- them as their owner (postgres — a superuser that bypasses RLS).
-- Calling these functions from inside a policy on the `profiles`
-- table therefore does NOT re-enter any RLS policy on `profiles`.
-- An inline subquery (SELECT role FROM profiles …) would run as
-- the `authenticated` role and *would* trigger SELECT policies,
-- making the solution fragile.  These SECURITY DEFINER wrappers
-- are the correct, recursion-proof approach.

-- get_my_role()
--   Returns the role of the currently-authenticated caller.
--   Used in the USING clause of profiles_update so that admins
--   and super-admins can update any profile row.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

REVOKE ALL  ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;


-- get_profile_role(p_user_id UUID)
--   Returns the STORED (current) role for any given user_id.
--   Used in the WITH CHECK clause of profiles_update to compare
--   the incoming NEW.role value against what is already in the DB.
--   If they differ the check fails, blocking direct role changes.
CREATE OR REPLACE FUNCTION get_profile_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM profiles WHERE id = p_user_id
$$;

REVOKE ALL  ON FUNCTION public.get_profile_role(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_role(UUID) TO authenticated;


-- ── 1. Secure RPC: change_user_role ──────────────────────────
-- SECURITY DEFINER → runs as DB owner → bypasses RLS.
-- All business-logic guards are enforced INSIDE this function,
-- so bypassing the UI (e.g. calling Supabase from the console)
-- cannot circumvent the permission rules.
CREATE OR REPLACE FUNCTION change_user_role(
  target_user_id UUID,
  new_role        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id          UUID;
  caller_role        TEXT;
  target_role        TEXT;
  target_name        TEXT;
  caller_name        TEXT;
  super_admin_count  INTEGER;
BEGIN
  -- ── Who is calling? ──────────────────────────────────────────
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح — يجب تسجيل الدخول أولاً';
  END IF;

  SELECT role, name INTO caller_role, caller_name
    FROM profiles WHERE id = caller_id;

  IF caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تغيير الأدوار';
  END IF;

  -- ── Who is the target? ───────────────────────────────────────
  SELECT role, name INTO target_role, target_name
    FROM profiles WHERE id = target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  -- ── Validate new_role value ──────────────────────────────────
  IF new_role NOT IN ('sales', 'team_leader', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'قيمة دور غير صالحة: %', new_role;
  END IF;

  -- ── Self-change is always forbidden ──────────────────────────
  IF caller_id = target_user_id THEN
    RAISE EXCEPTION 'لا يمكنك تغيير دورك الخاص';
  END IF;

  -- ── No-op guard ──────────────────────────────────────────────
  IF target_role = new_role THEN
    RAISE EXCEPTION 'المستخدم يمتلك هذا الدور بالفعل: %', new_role;
  END IF;

  -- ── Admin-specific restrictions ──────────────────────────────
  IF caller_role = 'admin' THEN
    -- Admin may only touch sales ↔ team_leader
    IF target_role NOT IN ('sales', 'team_leader') THEN
      RAISE EXCEPTION 'المدير لا يستطيع تغيير دور مستخدمي الإدارة';
    END IF;
    IF new_role NOT IN ('sales', 'team_leader') THEN
      RAISE EXCEPTION 'المدير لا يستطيع تعيين دور الإدارة';
    END IF;
  END IF;

  -- ── Super Admin: last-super-admin guard ──────────────────────
  -- (Super Admin cannot change own role — caught by self-change guard above)
  IF caller_role = 'super_admin'
     AND target_role = 'super_admin'
     AND new_role    <> 'super_admin'
  THEN
    SELECT COUNT(*) INTO super_admin_count
      FROM profiles
      WHERE role = 'super_admin' AND active = TRUE;

    IF super_admin_count <= 1 THEN
      RAISE EXCEPTION 'لا يمكن تغيير الدور: هذا هو آخر مدير عام في النظام — يجب أن يبقى مدير عام واحد على الأقل';
    END IF;
  END IF;

  -- ── Apply the change ─────────────────────────────────────────
  -- NOTE: profiles has no updated_at column — do not add it.
  UPDATE profiles
     SET role = new_role
   WHERE id = target_user_id;

  -- ── Write audit entry ────────────────────────────────────────
  INSERT INTO audit_log (
    id, type, order_id, order_ref,
    field, old_value, new_value,
    changed_by, changed_at
  ) VALUES (
    'al-rc-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-'
              || SUBSTR(MD5(RANDOM()::TEXT), 1, 6),
    'role_change',
    target_user_id::TEXT,   -- stored in order_id (TEXT) for traceability
    target_name,
    'الصلاحية',
    target_role,
    new_role,
    caller_name,
    NOW()
  );

  RETURN JSONB_BUILD_OBJECT(
    'ok',            TRUE,
    'previous_role', target_role,
    'new_role',      new_role,
    'target_name',   target_name
  );
END;
$$;

-- Lock down public access; only authenticated users may call this RPC.
REVOKE ALL  ON FUNCTION public.change_user_role(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_user_role(UUID, TEXT) TO authenticated;


-- ── 2. Harden profiles_update RLS ────────────────────────────
-- USING:      who is allowed to attempt the update at all.
-- WITH CHECK: which new values are accepted after the update.
--
-- The WITH CHECK blocks any attempt to write a different role value
-- through a plain Supabase client update.  Role changes MUST go
-- through change_user_role() — a SECURITY DEFINER RPC that bypasses
-- RLS entirely and enforces all permission rules server-side.
--
-- Both get_my_role() and get_profile_role() are SECURITY DEFINER,
-- so they run as the DB owner (postgres / superuser) and bypass RLS.
-- Neither can trigger a recursive evaluation of profiles_update.
DROP POLICY IF EXISTS "profiles_update" ON profiles;

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (
    -- Allow: user updating their own profile row.
    auth.uid() = id
    -- Allow: admin or super_admin updating any profile row.
    OR get_my_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    -- Accept the new row only when the role value has not changed.
    -- get_profile_role() reads the STORED role via SECURITY DEFINER
    -- (bypasses RLS → no recursion) and compares it to NEW.role.
    -- Any attempt to write a different role is silently rejected here;
    -- the caller will see a "0 rows updated" result, not an error.
    role = get_profile_role(profiles.id)
  );
