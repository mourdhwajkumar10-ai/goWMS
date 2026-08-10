-- Phase B: GRN variance fields + staging HOLD locations + QI location links.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='grn_lines' AND column_name='damaged_qty'
  ) THEN
    ALTER TABLE public.grn_lines ADD COLUMN damaged_qty numeric(18,6) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='grn_lines' AND column_name='notes'
  ) THEN
    ALTER TABLE public.grn_lines ADD COLUMN notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='grn_lines' AND column_name='requires_qi'
  ) THEN
    ALTER TABLE public.grn_lines ADD COLUMN requires_qi boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quality_inspections' AND column_name='warehouse_id'
  ) THEN
    ALTER TABLE public.quality_inspections ADD COLUMN warehouse_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quality_inspections' AND column_name='location_id'
  ) THEN
    ALTER TABLE public.quality_inspections ADD COLUMN location_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quality_inspections' AND column_name='qty'
  ) THEN
    ALTER TABLE public.quality_inspections ADD COLUMN qty numeric(18,6) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='quality_inspections' AND column_name='grn_session_id'
  ) THEN
    ALTER TABLE public.quality_inspections ADD COLUMN grn_session_id integer;
  END IF;
END $$;

-- Default HOLD + DAMAGED staging locations for every warehouse.
INSERT INTO public.warehouse_locations (
  id, code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
  location_type, allow_mixed_items, disabled, is_occupied, updated_at, created_at
)
SELECT nextval('public.warehouse_locations_id_seq'), 'HOLD-01', w.id,
       'HOLD', 'HOLD', '01', '01', '01', 'low', '01',
       'hold', true, false, false, now(), now()
FROM public.warehouses w
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouse_locations wl
  WHERE wl.warehouse_id = w.id AND wl.code = 'HOLD-01'
);

INSERT INTO public.warehouse_locations (
  id, code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
  location_type, allow_mixed_items, disabled, is_occupied, updated_at, created_at
)
SELECT nextval('public.warehouse_locations_id_seq'), 'DAMAGED-01', w.id,
       'DMG', 'DMG', '01', '01', '01', 'low', '01',
       'damaged', true, false, false, now(), now()
FROM public.warehouses w
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouse_locations wl
  WHERE wl.warehouse_id = w.id AND wl.code = 'DAMAGED-01'
);
