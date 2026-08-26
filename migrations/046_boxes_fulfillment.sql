-- 046: boxes warehouse / SO / packing location + unique label per warehouse
ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS warehouse_id integer;

ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS sales_order_id integer;

ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS packing_location_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'boxes_warehouse_id_fkey'
      AND conrelid = 'public.boxes'::regclass
  ) THEN
    ALTER TABLE public.boxes
      ADD CONSTRAINT boxes_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'boxes_sales_order_id_fkey'
      AND conrelid = 'public.boxes'::regclass
  ) THEN
    ALTER TABLE public.boxes
      ADD CONSTRAINT boxes_sales_order_id_fkey
      FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'boxes_packing_location_id_fkey'
      AND conrelid = 'public.boxes'::regclass
  ) THEN
    ALTER TABLE public.boxes
      ADD CONSTRAINT boxes_packing_location_id_fkey
      FOREIGN KEY (packing_location_id) REFERENCES public.warehouse_locations(id);
  END IF;
END $$;

-- Backfill warehouse_id from pick list when possible
UPDATE public.boxes b
SET warehouse_id = pl.warehouse_id
FROM public.pick_lists pl
WHERE b.pick_list_id = pl.id
  AND b.warehouse_id IS NULL
  AND pl.warehouse_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_warehouse_label
  ON public.boxes (warehouse_id, label)
  WHERE warehouse_id IS NOT NULL;
