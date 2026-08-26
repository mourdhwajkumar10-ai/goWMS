-- 047: sales_invoices GST header fields + number sequences for counter/invoice
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS customer_gstin character varying(20);

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS place_of_supply character varying(100);

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS net_total numeric(18,6) DEFAULT 0;

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS total_taxes numeric(18,6) DEFAULT 0;

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS payment_mode character varying(20);

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS against_sales_order character varying(100);

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS warehouse_id integer;

ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_invoices_name_key'
      AND conrelid = 'public.sales_invoices'::regclass
  ) THEN
    ALTER TABLE public.sales_invoices
      ADD CONSTRAINT sales_invoices_name_key UNIQUE (name);
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.counter_sale_no_seq;
CREATE SEQUENCE IF NOT EXISTS public.sales_invoice_no_seq;
