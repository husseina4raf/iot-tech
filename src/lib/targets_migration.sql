-- Run this in your Supabase SQL editor to add the sales_targets table.

CREATE TABLE IF NOT EXISTS sales_targets (
  id          TEXT PRIMARY KEY,
  rep_name    TEXT NOT NULL,
  month       TEXT NOT NULL,          -- format: YYYY-MM
  target      NUMERIC NOT NULL DEFAULT 0,
  set_by      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (rep_name, month)
);

ALTER TABLE sales_targets ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read targets; only admins can write.
CREATE POLICY "targets_read"  ON sales_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "targets_write" ON sales_targets FOR ALL    TO authenticated USING (true) WITH CHECK (true);
