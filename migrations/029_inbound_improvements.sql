-- Inbound receiving improvements: QI flag on item master, PO expected batch.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='items' AND column_name='requires_qi'
  ) THEN
    ALTER TABLE public.items ADD COLUMN requires_qi boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='purchase_order_items' AND column_name='batch_no'
  ) THEN
    ALTER TABLE public.purchase_order_items ADD COLUMN batch_no character varying(100);
  END IF;
END $$;
