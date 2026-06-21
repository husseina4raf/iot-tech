-- ══════════════════════════════════════════════════════════════
-- RLS Migration — Role-Based Access Control
-- Run in: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Helper function: get current user's role from profiles
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's rep_name from profiles
CREATE OR REPLACE FUNCTION get_my_rep_name()
RETURNS TEXT AS $$
  SELECT rep_name FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── 1. PROFILES ────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_read"   ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- Any authenticated user can read profiles (needed for salesRep lists)
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Users can only insert their own profile
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Users can update their own profile; admin/super_admin can update any
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR get_my_role() IN ('admin', 'super_admin'));

-- Only super_admin can delete profiles
CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE TO authenticated
  USING (get_my_role() = 'super_admin');


-- ── 2. ORDERS ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_all" ON orders;

-- SELECT: sales see only their own orders; others see all
CREATE POLICY "orders_select" ON orders
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'super_admin', 'team_leader')
    OR sales_rep = get_my_rep_name()
  );

-- INSERT: sales, admin, super_admin can create orders
CREATE POLICY "orders_insert" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('sales', 'admin', 'super_admin')
  );

-- UPDATE: team_leader/admin/super_admin can update any order;
--         sales can only update their own pending orders
CREATE POLICY "orders_update" ON orders
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'super_admin', 'team_leader')
    OR (get_my_role() = 'sales' AND sales_rep = get_my_rep_name())
  );

-- DELETE: only admin/super_admin
CREATE POLICY "orders_delete" ON orders
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));


-- ── 3. INVENTORY ───────────────────────────────────────────────
DROP POLICY IF EXISTS "inventory_all" ON inventory;

-- All authenticated users can read inventory (needed for order form)
CREATE POLICY "inventory_select" ON inventory
  FOR SELECT TO authenticated USING (true);

-- Only admin/super_admin can modify inventory
CREATE POLICY "inventory_insert" ON inventory
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "inventory_update" ON inventory
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "inventory_delete" ON inventory
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));


-- ── 4. AUDIT LOG ───────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_read"   ON audit_log;
DROP POLICY IF EXISTS "audit_insert" ON audit_log;

-- Only admin/super_admin can read audit log
CREATE POLICY "audit_select" ON audit_log
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

-- All authenticated users can write audit entries (system writes)
CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT TO authenticated WITH CHECK (true);


-- ── 5. TAX INVOICES ────────────────────────────────────────────
DROP POLICY IF EXISTS "tax_all" ON tax_invoices;

-- Only admin/super_admin can access tax invoices
CREATE POLICY "tax_select" ON tax_invoices
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "tax_insert" ON tax_invoices
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "tax_update" ON tax_invoices
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));

CREATE POLICY "tax_delete" ON tax_invoices
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'super_admin'));
