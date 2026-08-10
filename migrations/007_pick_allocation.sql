-- Phase D: pick allocation against location balances (FEFO + reserve) and consume tracking.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pick_list_items' AND column_name='location_id'
  ) THEN
    ALTER TABLE public.pick_list_items ADD COLUMN location_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pick_list_items' AND column_name='location_code'
  ) THEN
    ALTER TABLE public.pick_list_items ADD COLUMN location_code character varying(100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pick_list_items' AND column_name='balance_id'
  ) THEN
    ALTER TABLE public.pick_list_items ADD COLUMN balance_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pick_list_items' AND column_name='expiry_date'
  ) THEN
    ALTER TABLE public.pick_list_items ADD COLUMN expiry_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pick_list_items' AND column_name='consumed_qty'
  ) THEN
    ALTER TABLE public.pick_list_items ADD COLUMN consumed_qty numeric(18,6) DEFAULT 0 NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pick_list_items_location_id_fkey'
      AND conrelid = 'public.pick_list_items'::regclass
  ) THEN
    ALTER TABLE public.pick_list_items
      ADD CONSTRAINT pick_list_items_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES public.warehouse_locations(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pick_list_items_balance_id_fkey'
      AND conrelid = 'public.pick_list_items'::regclass
  ) THEN
    ALTER TABLE public.pick_list_items
      ADD CONSTRAINT pick_list_items_balance_id_fkey
      FOREIGN KEY (balance_id) REFERENCES public.stock_location_balances(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pick_list_items_location_id ON public.pick_list_items (location_id);
CREATE INDEX IF NOT EXISTS idx_pick_list_items_balance_id ON public.pick_list_items (balance_id);

-- Idempotent stock consume on boxes (pack/dispatch load).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='boxes' AND column_name='stock_consumed'
  ) THEN
    ALTER TABLE public.boxes ADD COLUMN stock_consumed boolean DEFAULT false NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='boxes' AND column_name='delivery_note'
  ) THEN
    ALTER TABLE public.boxes ADD COLUMN delivery_note character varying(100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='pick_lists' AND column_name='stock_consumed'
  ) THEN
    ALTER TABLE public.pick_lists ADD COLUMN stock_consumed boolean DEFAULT false NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='delivery_trips' AND column_name='driver_name'
  ) THEN
    ALTER TABLE public.delivery_trips ADD COLUMN driver_name character varying(200);
  END IF;
END $$;
