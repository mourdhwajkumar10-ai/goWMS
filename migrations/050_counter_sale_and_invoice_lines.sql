-- 050: Walk-in customer + GST line fields for sales invoices
INSERT INTO public.customers (name, customer_type, customer_group, territory)
SELECT 'Walk-in', 'Individual', 'Retail', 'Local'
WHERE NOT EXISTS (SELECT 1 FROM public.customers WHERE lower(name) = 'walk-in');

ALTER TABLE public.sales_invoice_items
  ADD COLUMN IF NOT EXISTS hsn_no character varying(32);

ALTER TABLE public.sales_invoice_items
  ADD COLUMN IF NOT EXISTS gst_percentage numeric(8,2) DEFAULT 0;

ALTER TABLE public.sales_invoice_items
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18,6) DEFAULT 0;
