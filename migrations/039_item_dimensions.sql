-- 039: Item + bin dimensions, volume, and weight for volumetric putaway fit.
-- Layered model: quantity cap -> weight limit -> volume limit. Each layer is
-- optional and skipped when its inputs are missing, so existing deployments
-- degrade gracefully without any per-SKU measurements.

-- Items: physical unit size. Volume may be set directly or derived from L*W*H.
ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS unit_length_cm numeric(18,6);
ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS unit_width_cm numeric(18,6);
ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS unit_height_cm numeric(18,6);
ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS unit_volume_cm3 numeric(18,6);

COMMENT ON COLUMN public.items.unit_length_cm IS 'Unit length in cm. Optional; used with width/height to derive volume for bin fit.';
COMMENT ON COLUMN public.items.unit_width_cm IS 'Unit width in cm. Optional.';
COMMENT ON COLUMN public.items.unit_height_cm IS 'Unit height in cm. Optional.';
COMMENT ON COLUMN public.items.unit_volume_cm3 IS 'Unit volume in cubic cm. NULL => derived from L*W*H; if all missing, volume fit is skipped.';

-- weight_per_unit already exists (migration 001/017); normalize its UOM default.
UPDATE public.items SET weight_uom = 'Kg' WHERE weight_uom IS NULL AND weight_per_unit IS NOT NULL AND weight_per_unit > 0;

-- Locations: physical capacity of a bin.
ALTER TABLE public.warehouse_locations
    ADD COLUMN IF NOT EXISTS length_cm numeric(18,6);
ALTER TABLE public.warehouse_locations
    ADD COLUMN IF NOT EXISTS width_cm numeric(18,6);
ALTER TABLE public.warehouse_locations
    ADD COLUMN IF NOT EXISTS height_cm numeric(18,6);
ALTER TABLE public.warehouse_locations
    ADD COLUMN IF NOT EXISTS volume_cm3 numeric(18,6);
ALTER TABLE public.warehouse_locations
    ADD COLUMN IF NOT EXISTS max_weight_kg numeric(18,6);

COMMENT ON COLUMN public.warehouse_locations.length_cm IS 'Bin length in cm. Optional.';
COMMENT ON COLUMN public.warehouse_locations.width_cm IS 'Bin width in cm. Optional.';
COMMENT ON COLUMN public.warehouse_locations.height_cm IS 'Bin height in cm. Optional.';
COMMENT ON COLUMN public.warehouse_locations.volume_cm3 IS 'Bin usable volume in cubic cm. NULL => derived from L*W*H; if missing, volume fit is skipped.';
COMMENT ON COLUMN public.warehouse_locations.max_weight_kg IS 'Max load the bin/shelf can safely hold in kg. NULL => weight fit is skipped.';
