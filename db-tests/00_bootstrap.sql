
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
-- mimic Supabase defaults: new functions/tables in public are usable by the API roles
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE TABLE profiles (
  id       UUID PRIMARY KEY,
  name     TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  role     TEXT NOT NULL CHECK (role IN ('sales','team_leader','admin','super_admin')),
  rep_name TEXT,
  active   BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE orders (
  id             TEXT PRIMARY KEY,
  serial_number  TEXT,
  client_name    TEXT,
  company        TEXT,
  mobile         TEXT,
  whatsapp       TEXT,
  address        TEXT,
  location_link  TEXT,
  sales_rep      TEXT,
  items          JSONB DEFAULT '[]',
  subtotal       NUMERIC DEFAULT 0,
  vat_percent    NUMERIC DEFAULT 0,
  vat_amount     NUMERIC DEFAULT 0,
  total          NUMERIC DEFAULT 0,
  invoice_type   TEXT DEFAULT 'بيان اسعار',
  invoice_name   TEXT,
  tax_number     TEXT,
  notes          TEXT,
  payment_method TEXT,
  date           TEXT,
  time           TEXT,
  status         TEXT DEFAULT 'جديد',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  edit_history   JSONB DEFAULT '[]'
);
CREATE TABLE inventory (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sku         TEXT,
  model       TEXT,
  brand       TEXT,
  category    TEXT,
  price       NUMERIC DEFAULT 0,
  cost_price  NUMERIC DEFAULT 0,
  stock       INTEGER DEFAULT 0,
  lots        JSONB DEFAULT '[]',
  description TEXT,
  warranty    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  type       TEXT,
  order_id   TEXT,
  order_ref  TEXT,
  field      TEXT,
  old_value  TEXT,
  new_value  TEXT,
  changed_by TEXT,
  note       TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION get_my_rep_name()
RETURNS TEXT AS $$
  SELECT rep_name FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;
ALTER TABLE orders    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
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



CREATE POLICY "audit_read"   ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

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
