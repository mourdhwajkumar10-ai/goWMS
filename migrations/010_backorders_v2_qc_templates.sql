-- 010: Enable backorders v2 (multi-SO), QC templates, box capacity, priority SLA fields.
-- Additive — does NOT drop backorders_sales_order_no_key on live v1 table.

-- Backorders v2 (parallel to UNIQUE(sales_order_no) v1)
CREATE SEQUENCE IF NOT EXISTS public.backorders_v2_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.backorder_lines_v2_id_seq;

CREATE TABLE IF NOT EXISTS public.backorders_v2 (
    id integer PRIMARY KEY DEFAULT nextval('backorders_v2_id_seq'),
    backorder_no character varying(30) NOT NULL UNIQUE,
    sales_order_no character varying(100) NOT NULL,
    customer character varying(255),
    warehouse character varying(255),
    notes text,
    status character varying(50) DEFAULT 'pending',
    source_pick_list_id integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backorders_v2_so ON public.backorders_v2(sales_order_no, status);

CREATE TABLE IF NOT EXISTS public.backorder_lines_v2 (
    id integer PRIMARY KEY DEFAULT nextval('backorder_lines_v2_id_seq'),
    backorder_id integer REFERENCES public.backorders_v2(id) ON DELETE CASCADE,
    item_code character varying(100) NOT NULL,
    qty numeric(18,6) NOT NULL,
    warehouse character varying(255),
    status character varying(50) DEFAULT 'pending'
);

-- Dedup open lines by item + warehouse (expression unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_backorder_lines_v2_open_dedup
  ON public.backorder_lines_v2 (item_code, (COALESCE(warehouse, '')))
  WHERE status = 'pending';

-- Migrate existing open v1 backorders into v2 (idempotent by backorder_no prefix)
INSERT INTO public.backorders_v2 (backorder_no, sales_order_no, customer, warehouse, notes, status, created_at)
SELECT 'V1-'||b.backorder_no, b.sales_order_no, b.customer, b.warehouse, b.notes, b.status, b.created_at
FROM public.backorders b
WHERE b.status IN ('pending','partially_fulfilled')
  AND NOT EXISTS (SELECT 1 FROM public.backorders_v2 v WHERE v.backorder_no = 'V1-'||b.backorder_no);

INSERT INTO public.backorder_lines_v2 (backorder_id, item_code, qty, warehouse, status)
SELECT v.id, bl.item_code, COALESCE(bl.backorder_qty, bl.ordered_qty, 0), b.warehouse, COALESCE(bl.status,'pending')
FROM public.backorder_lines bl
JOIN public.backorders b ON b.id = bl.backorder_id
JOIN public.backorders_v2 v ON v.backorder_no = 'V1-'||b.backorder_no
WHERE COALESCE(bl.backorder_qty, bl.ordered_qty, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.backorder_lines_v2 x
    WHERE x.backorder_id = v.id AND x.item_code = bl.item_code
  );

-- QC templates
CREATE TABLE IF NOT EXISTS public.qc_templates (
    id serial PRIMARY KEY,
    name character varying(100) NOT NULL,
    category character varying(200),
    sample_size integer DEFAULT 1,
    checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
    auto_approve boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

INSERT INTO public.qc_templates (name, category, sample_size, checklist)
SELECT 'Default Incoming QC', NULL, 1,
  '[{"specification":"Visual","min_value":null,"max_value":null,"required":true},{"specification":"Quantity","min_value":null,"max_value":null,"required":true}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.qc_templates WHERE name='Default Incoming QC');

-- Box capacity (soft validation)
ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS max_weight numeric(18,6),
  ADD COLUMN IF NOT EXISTS max_volume numeric(18,6),
  ADD COLUMN IF NOT EXISTS declared_weight numeric(18,6) DEFAULT 0;

-- Priority SLA tracking
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS priority_sla_hours integer,
  ADD COLUMN IF NOT EXISTS priority_decay_at timestamp with time zone;

-- Supplier vehicle fleet as structured JSON (additive; vehicle_fleet text remains)
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS vehicles jsonb DEFAULT '[]'::jsonb;
