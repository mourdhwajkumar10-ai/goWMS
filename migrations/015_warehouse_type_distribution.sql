-- Allow distributor-friendly warehouse_type = 'distribution'
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
        'warehouse', 'stores', 'distribution'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
