-- ══════════════════════════════════════════════════════════════
-- Migration: Foreign Keys + Indexes
-- Run in: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── Step 1: Clean up orphaned references before adding FK constraints ──────────
-- Null out any audit_log.order_id values that point to non-existent orders
UPDATE audit_log
SET order_id = NULL
WHERE order_id IS NOT NULL
  AND order_id NOT IN (SELECT id FROM orders);

-- Null out any tax_invoices.order_id values that point to non-existent orders
UPDATE tax_invoices
SET order_id = NULL
WHERE order_id IS NOT NULL
  AND order_id NOT IN (SELECT id FROM orders);


-- ── Step 2: Foreign Keys ────────────────────────────────────────────────────────

-- tax_invoices.order_id → orders.id  (nullable, so SET NULL on delete)
ALTER TABLE tax_invoices
  ADD CONSTRAINT fk_tax_invoices_order_id
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- audit_log.order_id → orders.id  (nullable, SET NULL on delete)
ALTER TABLE audit_log
  ADD CONSTRAINT fk_audit_log_order_id
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;


-- ── Step 3: Indexes ─────────────────────────────────────────────────────────────

-- orders: most common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_sales_rep     ON orders(sales_rep);
CREATE INDEX IF NOT EXISTS idx_orders_created_at    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_serial_number ON orders(serial_number);
CREATE INDEX IF NOT EXISTS idx_orders_client_name   ON orders(client_name);

-- inventory: lookups by name and category
CREATE INDEX IF NOT EXISTS idx_inventory_name       ON inventory(name);
CREATE INDEX IF NOT EXISTS idx_inventory_category   ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_sku        ON inventory(sku);

-- audit_log: time-ordered lookups and per-order history
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_order_id   ON audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_type       ON audit_log(type);

-- tax_invoices: per-order lookups
CREATE INDEX IF NOT EXISTS idx_tax_invoices_order_id    ON tax_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_uploaded_at ON tax_invoices(uploaded_at DESC);


-- ── Step 4: Verify ──────────────────────────────────────────────────────────────
-- Run this after the above to confirm everything was created:
--
-- SELECT conname, conrelid::regclass AS table_name
-- FROM pg_constraint
-- WHERE contype = 'f' AND conname LIKE 'fk_%';
--
-- SELECT indexname, tablename
-- FROM pg_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
