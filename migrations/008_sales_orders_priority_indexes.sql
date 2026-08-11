-- 008: Sales order priority fields, performance indexes, additive supplier/employee/GRN columns.
-- Safe additive migration — does not alter existing FEFO/GRN/putaway paths.

-- Sales order priority queue (Feature 08)
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS priority integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS priority_label character varying(50) DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS priority_set_by integer,
  ADD COLUMN IF NOT EXISTS priority_set_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS warehouse_id integer,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS allocated_qty numeric(18,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS backordered_qty numeric(18,6) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status character varying(50) DEFAULT 'open';

-- Priority override audit trail
CREATE TABLE IF NOT EXISTS public.priority_history (
    id serial PRIMARY KEY,
    sales_order_id integer NOT NULL REFERENCES public.sales_orders(id),
    old_priority integer,
    new_priority integer NOT NULL,
    reason text,
    set_by integer,
    set_at timestamp with time zone DEFAULT now()
);

-- Packing list import templates (Feature 18) — maps supplier Excel columns → GRN fields
CREATE TABLE IF NOT EXISTS public.packing_list_templates (
    id serial PRIMARY KEY,
    name character varying(100) NOT NULL,
    supplier_id integer REFERENCES public.suppliers(id),
    header_row integer DEFAULT 1,
    column_map jsonb NOT NULL DEFAULT '{}'::jsonb,
    skip_summary_row boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

-- Supplier carrier fields (Feature 17/19) — additive
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS carrier_code character varying(50),
  ADD COLUMN IF NOT EXISTS contact_phone character varying(50),
  ADD COLUMN IF NOT EXISTS contact_email character varying(200),
  ADD COLUMN IF NOT EXISTS vehicle_fleet text,
  ADD COLUMN IF NOT EXISTS default_service_level character varying(50);

-- GRN line supplier SKU traceability
ALTER TABLE public.grn_lines
  ADD COLUMN IF NOT EXISTS supplier_sku character varying(100),
  ADD COLUMN IF NOT EXISTS grn_session_id integer,
  ADD COLUMN IF NOT EXISTS notes text;

-- Employee PIN auth (Feature 03) — parallel to password auth
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pin_hash character varying(255),
  ADD COLUMN IF NOT EXISTS warehouse_id integer,
  ADD COLUMN IF NOT EXISTS badge_code character varying(100),
  ADD COLUMN IF NOT EXISTS wms_role character varying(50) DEFAULT 'picker',
  ADD COLUMN IF NOT EXISTS token_version integer DEFAULT 1;

-- Delivery trip carrier link (Feature 19)
ALTER TABLE public.delivery_trips
  ADD COLUMN IF NOT EXISTS carrier_id integer,
  ADD COLUMN IF NOT EXISTS carrier_name character varying(255);

ALTER TABLE public.delivery_notes
  ADD COLUMN IF NOT EXISTS trip_id integer,
  ADD COLUMN IF NOT EXISTS pod_signature_id integer,
  ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone;

-- High-impact indexes from ANALYSIS report
CREATE INDEX IF NOT EXISTS idx_grn_lines_session_item ON public.grn_lines(grn_session_id, item_code);
CREATE INDEX IF NOT EXISTS idx_pick_list_items_list_status ON public.pick_list_items(pick_list_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_balances_item_wh ON public.stock_location_balances(item_code, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_priority_date ON public.sales_orders(priority DESC, delivery_date);
CREATE INDEX IF NOT EXISTS idx_backorders_so_status ON public.backorders(sales_order_no, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_sales_orders_status_wms ON public.sales_orders ((COALESCE(wms_status, status)));
CREATE INDEX IF NOT EXISTS idx_sales_order_items_so ON public.sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_employees_badge ON public.employees(badge_code) WHERE badge_code IS NOT NULL;

-- Seed a default packing-list template matching spares_packing_list.xlsx
INSERT INTO public.packing_list_templates (name, header_row, column_map, skip_summary_row)
SELECT 'Spares Packing List (default)', 1,
  '{"invoice_no":"Invoice No","invoice_date":"Invoice Date","supplier_name":"Supplier Name","part_no":"Part No","part_name":"Part Name","qty":"Qty","uom":"UOM","batch_no":"Batch No","box_number":"Box Number","weight":"Weight"}'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.packing_list_templates WHERE name = 'Spares Packing List (default)');
