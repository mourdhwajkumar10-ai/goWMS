-- 042: packing location type + seed PACK-01 per warehouse
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
          'storage', 'pick_face', 'staging', 'hold', 'damaged', 'incoming',
          'quarantine', 'returns', 'packing'
        )
      );
  END IF;
END $$;

INSERT INTO public.warehouse_locations (
  id, code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
  location_type, allow_mixed_items, disabled, is_occupied, updated_at, created_at
)
SELECT
  nextval('public.warehouse_locations_id_seq'),
  'PACK-01',
  w.id,
  'PK',
  'PK',
  '01',
  '01',
  '01',
  'low',
  '01',
  'packing',
  true,
  false,
  false,
  now(),
  now()
FROM public.warehouses w
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouse_locations wl
  WHERE wl.warehouse_id = w.id AND wl.code = 'PACK-01'
);
