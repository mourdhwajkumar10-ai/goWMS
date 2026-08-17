-- 033: Add suggested_location_id for auto-putaway suggestions
ALTER TABLE stock_location_balances
ADD COLUMN IF NOT EXISTS suggested_location_id INT REFERENCES warehouse_locations(id);

CREATE INDEX IF NOT EXISTS idx_slb_suggested ON stock_location_balances(suggested_location_id)
WHERE suggested_location_id IS NOT NULL;

COMMENT ON COLUMN stock_location_balances.suggested_location_id IS
  'Pre-computed best storage location for items in incoming/staging. Set by auto-putaway goroutine.';
