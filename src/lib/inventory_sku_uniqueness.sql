-- ══════════════════════════════════════════════════════════════
-- Inventory SKU Uniqueness — enforce at the database level
-- Run in: Supabase Dashboard → SQL Editor
--
-- THIS FILE HAS NOT BEEN EXECUTED. Review before running manually.
--
-- Business rule (see the SKU/Name Uniqueness Audit Report):
--   - Product NAME is never unique — multiple inventory products may
--     legitimately share the exact same name (this migration does
--     NOT touch `name` at all).
--   - SKU must be unique whenever it is non-empty.
--   - NULL / empty / whitespace-only SKU means "no SKU" and stays
--     unconstrained — SKU remains optional, exactly as today.
--   - Comparison is trimmed and case-insensitive, matching the
--     normalization already used elsewhere in the app (see
--     findInventoryMatch() in useOrders.jsx: `.trim().toLowerCase()`).
--
-- Safety
-- ------
-- This script does NOT delete, merge, or modify any inventory row. It
-- first checks for existing duplicate non-empty SKUs (normalized the
-- same way the index below normalizes them) and RAISES AN EXCEPTION —
-- aborting before the index is created — if any are found. Nothing is
-- silently changed; duplicates found this way must be reviewed and
-- resolved manually, then this script re-run.
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  dup_count INTEGER;
  dup_list  TEXT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT LOWER(TRIM(sku)) AS norm_sku
    FROM inventory
    WHERE sku IS NOT NULL AND TRIM(sku) <> ''
    GROUP BY LOWER(TRIM(sku))
    HAVING COUNT(*) > 1
  ) d;

  IF dup_count > 0 THEN
    SELECT STRING_AGG(
      norm_sku || ' → ' || cnt || ' products (ids: ' || ids || ')', E'\n'
    ) INTO dup_list
    FROM (
      SELECT LOWER(TRIM(sku)) AS norm_sku,
             COUNT(*) AS cnt,
             STRING_AGG(id, ', ') AS ids
      FROM inventory
      WHERE sku IS NOT NULL AND TRIM(sku) <> ''
      GROUP BY LOWER(TRIM(sku))
      HAVING COUNT(*) > 1
    ) x;

    RAISE EXCEPTION
      'Cannot create unique SKU index — % duplicate SKU group(s) already exist in inventory. Resolve these manually (merge, delete, or re-assign a distinct SKU) before re-running this migration. Details:
%', dup_count, dup_list;
  END IF;
END $$;

-- Only reached if the check above found zero duplicate groups.
-- Partial + expression unique index: constrains only non-empty SKUs,
-- normalized the same way the application already compares them.
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_sku_unique
  ON inventory (LOWER(TRIM(sku)))
  WHERE sku IS NOT NULL AND TRIM(sku) <> '';
