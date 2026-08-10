-- Phase A: locations, item pack/control modes, stock-by-location.
-- Idempotent: safe to run repeatedly.

-- ---------------------------------------------------------------------------
-- Items: pack type, control mode, home location, master completeness
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='items' AND column_name='pack_type'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN pack_type character varying(20) DEFAULT 'loose';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='items' AND column_name='control_mode'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN control_mode character varying(30) DEFAULT 'item_controlled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='items' AND column_name='home_location_id'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN home_location_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='items' AND column_name='master_complete'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN master_complete boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='items' AND column_name='barcode'
  ) THEN
    ALTER TABLE public.items
      ADD COLUMN barcode character varying(100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'items_pack_type_check' AND conrelid = 'public.items'::regclass
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_pack_type_check
      CHECK (pack_type IS NULL OR pack_type IN ('loose', 'packed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'items_control_mode_check' AND conrelid = 'public.items'::regclass
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_control_mode_check
      CHECK (control_mode IS NULL OR control_mode IN ('item_controlled', 'bin_controlled'));
  END IF;
END $$;

UPDATE public.items
SET pack_type = COALESCE(pack_type, 'loose'),
    control_mode = COALESCE(control_mode, 'item_controlled'),
    master_complete = COALESCE(
      master_complete,
      (code IS NOT NULL AND name IS NOT NULL AND length(trim(name)) > 0)
    );

-- ---------------------------------------------------------------------------
-- Warehouses: allow distributor-friendly types
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouses_warehouse_type_check'
      AND conrelid = 'public.warehouses'::regclass
  ) THEN
    ALTER TABLE public.warehouses DROP CONSTRAINT warehouses_warehouse_type_check;
  END IF;

  ALTER TABLE public.warehouses
    ADD CONSTRAINT warehouses_warehouse_type_check
    CHECK (
      warehouse_type IS NULL OR warehouse_type IN (
        'hub', 'satellite', 'storage', 'incoming', 'returns', 'transit',
        'warehouse', 'stores'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouses_picking_mode_check'
      AND conrelid = 'public.warehouses'::regclass
  ) THEN
    ALTER TABLE public.warehouses DROP CONSTRAINT warehouses_picking_mode_check;
  END IF;

  ALTER TABLE public.warehouses
    ADD CONSTRAINT warehouses_picking_mode_check
    CHECK (
      picking_mode IS NULL OR picking_mode IN (
        'scan', 'manual', 'fifo', 'lifo'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Warehouse locations: aisle / shelf / level / number + capacity
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='shelf'
  ) THEN
    ALTER TABLE public.warehouse_locations ADD COLUMN shelf character varying(20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='level'
  ) THEN
    ALTER TABLE public.warehouse_locations ADD COLUMN level character varying(20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='number'
  ) THEN
    ALTER TABLE public.warehouse_locations ADD COLUMN number character varying(20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='location_type'
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD COLUMN location_type character varying(30) DEFAULT 'storage';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='max_capacity_qty'
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD COLUMN max_capacity_qty numeric(18,6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='allow_mixed_items'
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD COLUMN allow_mixed_items boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='disabled'
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD COLUMN disabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='created_at'
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD COLUMN created_at timestamp with time zone DEFAULT now();
  END IF;
END $$;

-- Backfill structured fields from legacy aisle/rack/bin when empty.
UPDATE public.warehouse_locations
SET shelf = COALESCE(NULLIF(shelf, ''), NULLIF(rack, ''), '01'),
    level = COALESCE(NULLIF(level, ''), 'low'),
    number = COALESCE(NULLIF(number, ''), NULLIF(bin, ''), '01'),
    location_type = COALESCE(location_type, 'storage'),
    allow_mixed_items = COALESCE(allow_mixed_items, true),
    disabled = COALESCE(disabled, false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouse_locations_location_type_check'
      AND conrelid = 'public.warehouse_locations'::regclass
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD CONSTRAINT warehouse_locations_location_type_check
      CHECK (
        location_type IS NULL OR location_type IN (
          'storage', 'pick_face', 'staging', 'hold', 'damaged', 'incoming'
        )
      );
  END IF;
END $$;

-- Prefer unique (warehouse_id, code); drop global code uniqueness if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouse_locations_code_key'
      AND conrelid = 'public.warehouse_locations'::regclass
  ) THEN
    ALTER TABLE public.warehouse_locations DROP CONSTRAINT warehouse_locations_code_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouse_locations_warehouse_code_key'
      AND conrelid = 'public.warehouse_locations'::regclass
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD CONSTRAINT warehouse_locations_warehouse_code_key UNIQUE (warehouse_id, code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'items_home_location_id_fkey'
      AND conrelid = 'public.items'::regclass
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_home_location_id_fkey
      FOREIGN KEY (home_location_id) REFERENCES public.warehouse_locations(id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Stock by location (operational truth for inventory screens)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.stock_location_balances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.stock_location_balances (
    id integer NOT NULL DEFAULT nextval('public.stock_location_balances_id_seq'::regclass),
    item_code character varying(100) NOT NULL,
    warehouse_id integer NOT NULL,
    location_id integer NOT NULL,
    batch_no character varying(100),
    actual_qty numeric(18,6) DEFAULT 0 NOT NULL,
    reserved_qty numeric(18,6) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_location_balances_pkey'
      AND conrelid = 'public.stock_location_balances'::regclass
  ) THEN
    ALTER TABLE public.stock_location_balances
      ADD CONSTRAINT stock_location_balances_pkey PRIMARY KEY (id);
  END IF;

END $$;

-- NULL batch_no is treated as '' so only one open-lot row exists per bin.
CREATE UNIQUE INDEX IF NOT EXISTS stock_location_balances_uniq
  ON public.stock_location_balances (item_code, location_id, COALESCE(batch_no, ''));

DO $$
BEGIN

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_location_balances_warehouse_id_fkey'
      AND conrelid = 'public.stock_location_balances'::regclass
  ) THEN
    ALTER TABLE public.stock_location_balances
      ADD CONSTRAINT stock_location_balances_warehouse_id_fkey
      FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_location_balances_location_id_fkey'
      AND conrelid = 'public.stock_location_balances'::regclass
  ) THEN
    ALTER TABLE public.stock_location_balances
      ADD CONSTRAINT stock_location_balances_location_id_fkey
      FOREIGN KEY (location_id) REFERENCES public.warehouse_locations(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_slb_item_code ON public.stock_location_balances (item_code);
CREATE INDEX IF NOT EXISTS idx_slb_location_id ON public.stock_location_balances (location_id);
CREATE INDEX IF NOT EXISTS idx_slb_warehouse_id ON public.stock_location_balances (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wl_warehouse_id ON public.warehouse_locations (warehouse_id);

-- Ensure every warehouse has a default Incoming staging location for putaway source.
INSERT INTO public.warehouse_locations (
  id, code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
  location_type, allow_mixed_items, disabled, is_occupied, updated_at, created_at
)
SELECT
  nextval('public.warehouse_locations_id_seq'),
  'INCOMING-01',
  w.id,
  'IN',
  'IN',
  '01',
  '01',
  '01',
  'low',
  '01',
  'incoming',
  true,
  false,
  false,
  now(),
  now()
FROM public.warehouses w
WHERE NOT EXISTS (
  SELECT 1 FROM public.warehouse_locations wl
  WHERE wl.warehouse_id = w.id AND wl.code = 'INCOMING-01'
);
