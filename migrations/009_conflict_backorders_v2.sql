-- CONFLICT MIGRATION — Backorders v2 (multi-SO, item-level dedup)
-- DO NOT apply until UNIQUE(sales_order_no) redesign is approved.
-- Why: Live backorders_sales_order_no_key blocks multiple backorders per SO.
-- Enable: run this file manually, then register backorder.RegisterV2 in main.go

/*
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
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backorders_v2_so ON public.backorders_v2(sales_order_no, status);

CREATE TABLE IF NOT EXISTS public.backorder_lines_v2 (
    id integer PRIMARY KEY DEFAULT nextval('backorder_lines_v2_id_seq'),
    backorder_id integer REFERENCES public.backorders_v2(id),
    item_code character varying(100) NOT NULL,
    qty numeric(18,6) NOT NULL,
    warehouse character varying(255),
    status character varying(50) DEFAULT 'pending'
);

-- Partial unique for open-line dedup by item+warehouse
CREATE UNIQUE INDEX IF NOT EXISTS idx_backorder_lines_v2_open_dedup
  ON public.backorder_lines_v2 (item_code, COALESCE(warehouse, ''))
  WHERE status = 'pending';
*/
