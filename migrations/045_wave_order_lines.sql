-- 045: wave_order_lines — per-order attribution for wave put-to-order
CREATE TABLE IF NOT EXISTS public.wave_order_lines (
  id                  serial PRIMARY KEY,
  pick_list_id        integer NOT NULL REFERENCES public.pick_lists(id),
  sales_order_id      integer NOT NULL REFERENCES public.sales_orders(id),
  sales_order_item_id integer REFERENCES public.sales_order_items(id),
  item_code           varchar(100) NOT NULL,
  required_qty        numeric(18,6) NOT NULL,
  consolidated_qty    numeric(18,6) NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (pick_list_id, sales_order_id, item_code)
);

CREATE INDEX IF NOT EXISTS idx_wave_order_lines_pick
  ON public.wave_order_lines (pick_list_id);

CREATE INDEX IF NOT EXISTS idx_wave_order_lines_so
  ON public.wave_order_lines (sales_order_id);
