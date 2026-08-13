-- 016: Progressive shelf levels (01 = bottom … N = top)
-- Legacy lower/middle/upper remain readable via API normalize aliases.
-- Existing location codes are NOT rewritten (physical labels stay valid).

COMMENT ON COLUMN public.warehouse_locations.level IS
  'Shelf level from bottom: 01, 02, … N. Legacy values lower/middle/upper may still exist.';
