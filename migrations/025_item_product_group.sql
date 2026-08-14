-- 025: Product GROUP as its own item-master field (separate from category)
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS product_group varchar(100);

COMMENT ON COLUMN public.items.product_group IS
  'OEM / product group from dealer Product Master (e.g. HERO, BAJAJ). Distinct from category.';
