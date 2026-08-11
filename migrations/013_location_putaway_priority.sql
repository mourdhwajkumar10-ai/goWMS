-- 013: Location putaway priority + support lower/middle/upper levels
-- shelf = bay in UI; number = bin in UI

ALTER TABLE warehouse_locations
    ADD COLUMN IF NOT EXISTS putaway_priority integer NOT NULL DEFAULT 5;

COMMENT ON COLUMN warehouse_locations.putaway_priority IS
  '1=highest putaway preference, 10=lowest; used when suggesting empty bins';

CREATE INDEX IF NOT EXISTS idx_wl_putaway_priority
    ON warehouse_locations (warehouse_id, putaway_priority, code)
    WHERE COALESCE(disabled, false) = false;

-- Widen location_type for returns/quarantine used by returns flow (idempotent)
ALTER TABLE warehouse_locations DROP CONSTRAINT IF EXISTS warehouse_locations_location_type_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouse_locations_location_type_check'
      AND conrelid = 'public.warehouse_locations'::regclass
  ) THEN
    ALTER TABLE warehouse_locations
      ADD CONSTRAINT warehouse_locations_location_type_check
      CHECK (
        location_type IS NULL OR location_type IN (
          'storage', 'pick_face', 'staging', 'hold', 'damaged', 'incoming', 'quarantine', 'returns'
        )
      );
  END IF;
END $$;

-- Normalize legacy low → lower for display consistency
UPDATE warehouse_locations SET level = 'lower' WHERE level IN ('low', 'l', 'bottom');
UPDATE warehouse_locations SET level = 'upper' WHERE level IN ('up', 'u', 'high', 'top');
UPDATE warehouse_locations SET level = 'middle' WHERE level IN ('mid', 'm', 'med');
