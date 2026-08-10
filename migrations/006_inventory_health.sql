-- Phase C: inventory health, cycle-count by location, transfers.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cycle_count_lines' AND column_name='location_id'
  ) THEN
    ALTER TABLE public.cycle_count_lines ADD COLUMN location_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cycle_count_lines' AND column_name='batch_no'
  ) THEN
    ALTER TABLE public.cycle_count_lines ADD COLUMN batch_no character varying(100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cycle_count_sheets' AND column_name='zone'
  ) THEN
    ALTER TABLE public.cycle_count_sheets ADD COLUMN zone character varying(50);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cycle_count_sheets' AND column_name='aisle'
  ) THEN
    ALTER TABLE public.cycle_count_sheets ADD COLUMN aisle character varying(20);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cycle_count_lines_location_id_fkey'
      AND conrelid = 'public.cycle_count_lines'::regclass
  ) THEN
    ALTER TABLE public.cycle_count_lines
      ADD CONSTRAINT cycle_count_lines_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES public.warehouse_locations(id);
  END IF;
END $$;

-- Location links on stock entry items for WH transfers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_entry_items' AND column_name='s_location_id'
  ) THEN
    ALTER TABLE public.stock_entry_items ADD COLUMN s_location_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_entry_items' AND column_name='t_location_id'
  ) THEN
    ALTER TABLE public.stock_entry_items ADD COLUMN t_location_id integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_entries' AND column_name='from_warehouse_id'
  ) THEN
    ALTER TABLE public.stock_entries ADD COLUMN from_warehouse_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='stock_entries' AND column_name='to_warehouse_id'
  ) THEN
    ALTER TABLE public.stock_entries ADD COLUMN to_warehouse_id integer;
  END IF;
END $$;

-- Optional max stock for min/max alerts (reorder_level already exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='items' AND column_name='max_stock'
  ) THEN
    ALTER TABLE public.items ADD COLUMN max_stock numeric(18,6) DEFAULT 0;
  END IF;
END $$;
