-- 031: capture unit price / amount decoded from item QR labels ({item}-{qty}_{amount}).
ALTER TABLE public.grn_lines ADD COLUMN IF NOT EXISTS unit_price numeric(18,6);
ALTER TABLE public.grn_lines ADD COLUMN IF NOT EXISTS line_amount numeric(18,6);
