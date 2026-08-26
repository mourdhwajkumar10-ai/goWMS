-- 044: packed_qty on pick lines
ALTER TABLE public.pick_list_items
  ADD COLUMN IF NOT EXISTS packed_qty numeric(18,6) NOT NULL DEFAULT 0;
