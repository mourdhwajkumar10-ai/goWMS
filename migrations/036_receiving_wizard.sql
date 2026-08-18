-- Migration 036: Receiving Wizard — extend existing tables for RF-gun flow

-- 4.2.1 Add delivery_no and packing-list metadata to grn_cartons
ALTER TABLE public.grn_cartons 
    ADD COLUMN IF NOT EXISTS delivery_no varchar(100);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS dealer_code varchar(50);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS dealer_name varchar(255);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS plant varchar(100);
ALTER TABLE public.grn_cartons
    ADD COLUMN IF NOT EXISTS box_type varchar(10);  -- 'carton' or 'envelope'

CREATE INDEX IF NOT EXISTS idx_grn_cartons_delivery 
    ON public.grn_cartons(delivery_no);

-- 4.2.2 Add weight and routing to grn_lines
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS unit_weight_kg numeric(18,6);
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS unit_price numeric(18,6);
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS route_location varchar(100);
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS routed_at timestamp with time zone;
ALTER TABLE public.grn_lines
    ADD COLUMN IF NOT EXISTS part_name varchar(255);

-- 4.2.3 Add transporter to grn_sessions (driver_name, driver_phone, truck_no already exist via 018)
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS transporter varchar(255);
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS delivery_no varchar(100);
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS default_route_location varchar(100) DEFAULT 'INCOMING-01';
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS boxes_total integer DEFAULT 0;
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS boxes_received integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_grn_sessions_delivery
    ON public.grn_sessions(delivery_no);
