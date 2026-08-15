-- S-051–S-060: COA/evidence attachments, supplier barcode, warehouse receiving hours.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouses' AND column_name='receiving_open'
  ) THEN
    ALTER TABLE public.warehouses ADD COLUMN receiving_open time DEFAULT '06:00';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouses' AND column_name='receiving_close'
  ) THEN
    ALTER TABLE public.warehouses ADD COLUMN receiving_close time DEFAULT '18:00';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='warehouses' AND column_name='receiving_days'
  ) THEN
    ALTER TABLE public.warehouses ADD COLUMN receiving_days character varying(40) DEFAULT '1,2,3,4,5';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='suppliers' AND column_name='barcode'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN barcode character varying(100);
  END IF;
END $$;
