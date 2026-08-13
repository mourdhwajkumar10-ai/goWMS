-- 017: Commercial / ERP-style product master fields + remark
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS mrp numeric(18,6) DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS hsn_no varchar(32);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS gst_percentage numeric(8,2) DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS vech varchar(100);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS make varchar(100);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS uom varchar(50) DEFAULT 'PCS';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS category varchar(100);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS parts_movement varchar(50);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS parts_pbo varchar(100);
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS threshold_value numeric(18,6) DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS max_rate_discount numeric(18,6) DEFAULT 0;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS remark text;
