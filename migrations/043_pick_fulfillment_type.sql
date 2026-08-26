-- 043: pick_lists fulfillment_type + packing_location_id
ALTER TABLE public.pick_lists
  ADD COLUMN IF NOT EXISTS fulfillment_type character varying(20);

ALTER TABLE public.pick_lists
  ADD COLUMN IF NOT EXISTS packing_location_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pick_lists_packing_location_id_fkey'
      AND conrelid = 'public.pick_lists'::regclass
  ) THEN
    ALTER TABLE public.pick_lists
      ADD CONSTRAINT pick_lists_packing_location_id_fkey
      FOREIGN KEY (packing_location_id) REFERENCES public.warehouse_locations(id);
  END IF;
END $$;

-- Backfill from picking_mode for existing rows that already look like waves.
UPDATE public.pick_lists
SET fulfillment_type = 'wave'
WHERE fulfillment_type IS NULL AND COALESCE(picking_mode,'') = 'wave';

CREATE INDEX IF NOT EXISTS idx_pick_lists_fulfillment_type
  ON public.pick_lists (fulfillment_type)
  WHERE fulfillment_type IS NOT NULL;
