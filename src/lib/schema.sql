-- ══════════════════════════════════════════════════
-- SmartLock Pro — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════

-- 1. Profiles (user metadata linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id       UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name     TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  role     TEXT NOT NULL CHECK (role IN ('sales','team_leader','admin','super_admin')),
  rep_name TEXT,
  active   BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read"   ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (true);

-- 2. Orders
CREATE TABLE IF NOT EXISTS orders (
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
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders_all" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Inventory
CREATE TABLE IF NOT EXISTS inventory (
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
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_all" ON inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
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
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read"   ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- 5. Tax Invoices
CREATE TABLE IF NOT EXISTS tax_invoices (
  id           TEXT PRIMARY KEY,
  order_id     TEXT,
  client_name  TEXT,
  filename     TEXT,
  amount       NUMERIC,
  invoice_date TEXT,
  uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by  TEXT,
  verified     BOOLEAN DEFAULT FALSE
);
ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_all" ON tax_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
