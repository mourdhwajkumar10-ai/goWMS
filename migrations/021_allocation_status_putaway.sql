-- 021: Stock allocation_status for inbound staging vs putaway bins

ALTER TABLE public.stock_location_balances
  ADD COLUMN IF NOT EXISTS allocation_status varchar(30) DEFAULT 'allocatable';

COMMENT ON COLUMN public.stock_location_balances.allocation_status IS
  'unallocatable = incoming/hold/damaged staging (not for sales allocation); allocatable = putaway bins';

UPDATE public.stock_location_balances slb
SET allocation_status = 'unallocatable'
FROM public.warehouse_locations wl
WHERE wl.id = slb.location_id
  AND wl.location_type IN ('incoming', 'hold', 'damaged', 'staging')
  AND COALESCE(slb.allocation_status, '') <> 'unallocatable';

UPDATE public.stock_location_balances slb
SET allocation_status = 'allocatable'
FROM public.warehouse_locations wl
WHERE wl.id = slb.location_id
  AND wl.location_type IN ('storage', 'pick_face')
  AND COALESCE(slb.allocation_status, '') = '';

-- Prefer pick_face on bottom shelves (01–04) and storage on upper (05+)
UPDATE public.warehouse_locations
SET location_type = 'pick_face'
WHERE COALESCE(disabled, false) = false
  AND location_type IN ('storage', 'pick_face')
  AND (
    level ~ '^[0-9]+$' AND level::int BETWEEN 1 AND 4
    OR lower(level) IN ('lower', 'low', 'l', 'bottom', 'middle', 'mid', 'm')
  );

UPDATE public.warehouse_locations
SET location_type = 'storage'
WHERE COALESCE(disabled, false) = false
  AND location_type IN ('storage', 'pick_face')
  AND (
    level ~ '^[0-9]+$' AND level::int >= 5
    OR lower(level) IN ('upper', 'up', 'u', 'high', 'top')
  );
