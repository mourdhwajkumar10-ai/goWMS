-- Auto-regenerated from recovered schema dump (pg_dump --schema-only).
-- Idempotent: safe to run repeatedly.

CREATE SEQUENCE IF NOT EXISTS public.box_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.boxes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.delivery_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.delivery_stops_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.delivery_trips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.grn_cartons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.grn_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.grn_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.packing_slips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.pick_list_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.pick_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.purchase_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.purchase_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.purchase_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.purchase_receipts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.sales_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.sales_orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.box_items (
    id integer NOT NULL,
    box_id integer,
    item_code character varying(100) NOT NULL,
    quantity numeric(18,6),
    batch_no character varying(100),
    scanned_at timestamp with time zone,
    scanned_by integer
);

CREATE TABLE IF NOT EXISTS public.boxes (
    id integer NOT NULL,
    label character varying(50) NOT NULL,
    pick_list_id integer,
    delivery_note character varying(100),
    loaded boolean DEFAULT false,
    loaded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_notes (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    customer_name character varying(255),
    status character varying(50),
    posting_date date,
    last_synced_at timestamp with time zone,
    company character varying(200),
    posting_time time without time zone DEFAULT CURRENT_TIME,
    currency character varying(10) DEFAULT 'INR'::character varying,
    conversion_rate numeric(18,6) DEFAULT 1,
    grand_total numeric(18,6) DEFAULT 0,
    net_total numeric(18,6) DEFAULT 0,
    total_qty numeric(18,6) DEFAULT 0,
    set_warehouse character varying(200),
    set_target_warehouse character varying(200),
    is_return boolean DEFAULT false,
    return_against character varying(100),
    per_billed numeric(5,2) DEFAULT 0,
    per_returned numeric(5,2) DEFAULT 0,
    transporter character varying(200),
    driver character varying(200),
    lr_no character varying(100),
    lr_date date,
    vehicle_no character varying(50),
    po_no character varying(100),
    po_date date,
    against_sales_order character varying(100),
    cost_center character varying(200),
    remarks text,
    tax_id character varying(100),
    contact_person character varying(200),
    customer_address character varying(200),
    shipping_address character varying(200),
    tax_category character varying(100),
    taxes_and_charges character varying(100)
);

CREATE TABLE IF NOT EXISTS public.delivery_stops (
    id integer NOT NULL,
    trip_id integer,
    delivery_note_no character varying(100),
    customer character varying(255),
    address text,
    stop_order integer,
    visited boolean DEFAULT false,
    visited_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_trips (
    id integer NOT NULL,
    trip_no character varying(30) NOT NULL,
    driver_id integer,
    vehicle_no character varying(50),
    departure_time timestamp with time zone,
    status character varying(20) DEFAULT 'draft'::character varying,
    total_distance numeric(10,2),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT delivery_trips_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'in_transit'::character varying, 'completed'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.grn_cartons (
    id integer NOT NULL,
    grn_session_id integer,
    carton_no character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    scanned_at timestamp with time zone,
    scanned_by integer,
    CONSTRAINT grn_cartons_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accounted'::character varying, 'unmatched'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.grn_lines (
    id integer NOT NULL,
    grn_carton_id integer,
    item_code character varying(100) NOT NULL,
    expected_qty numeric(18,6),
    scanned_qty numeric(18,6),
    status character varying(20) DEFAULT 'pending'::character varying,
    verification_method character varying(20),
    batch_no character varying(100),
    expiry_date date,
    manufacturing_date date,
    shelf_life_days integer,
    CONSTRAINT grn_lines_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'full_match'::character varying, 'shortage'::character varying, 'damage'::character varying, 'excess'::character varying, 'unknown'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.grn_sessions (
    id integer NOT NULL,
    session_no character varying(30) NOT NULL,
    warehouse_id integer,
    purchase_receipt_no character varying(100),
    supplier_name character varying(255),
    status character varying(20) DEFAULT 'open'::character varying,
    created_by integer,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT grn_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'stuck'::character varying, 'closed'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.packing_slips (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    delivery_note character varying(100),
    status character varying(50),
    last_synced_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.pick_list_items (
    id integer NOT NULL,
    pick_list_id integer,
    item_code character varying(100) NOT NULL,
    warehouse character varying(255) NOT NULL,
    ordered_qty numeric(18,6),
    picked_qty numeric(18,6) DEFAULT 0,
    shortage_qty numeric(18,6) DEFAULT 0,
    overage_qty numeric(18,6) DEFAULT 0,
    shortage_reason character varying(100),
    overage_reason character varying(100),
    allocated_qty numeric(18,6) DEFAULT 0,
    delivered_qty numeric(18,6) DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    batch_no character varying(100)
);

CREATE TABLE IF NOT EXISTS public.pick_lists (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    sales_order_no character varying(100),
    customer character varying(255),
    warehouse_id integer,
    status character varying(20) DEFAULT 'draft'::character varying,
    picking_mode character varying(20) DEFAULT 'scan'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pick_lists_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'open'::character varying, 'partially_delivered'::character varying, 'completed'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.purchase_invoices (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    supplier character varying(200) NOT NULL,
    supplier_name character varying(200),
    tax_id character varying(100),
    company character varying(200) NOT NULL,
    posting_date date DEFAULT CURRENT_DATE,
    posting_time time without time zone DEFAULT CURRENT_TIME,
    due_date date,
    is_paid boolean DEFAULT false,
    is_return boolean DEFAULT false,
    return_against character varying(100),
    bill_no character varying(100),
    bill_date date,
    cost_center character varying(200),
    project character varying(100),
    currency character varying(10) DEFAULT 'INR'::character varying,
    conversion_rate numeric(18,6) DEFAULT 1,
    buying_price_list character varying(100),
    total_qty numeric(18,6) DEFAULT 0,
    total_net_weight numeric(18,6) DEFAULT 0,
    base_total numeric(18,6) DEFAULT 0,
    base_net_total numeric(18,6) DEFAULT 0,
    total numeric(18,6) DEFAULT 0,
    net_total numeric(18,6) DEFAULT 0,
    tax_category character varying(100),
    taxes_and_charges character varying(100),
    total_taxes_and_charges numeric(18,6) DEFAULT 0,
    base_total_taxes_and_charges numeric(18,6) DEFAULT 0,
    additional_discount_percentage numeric(18,6) DEFAULT 0,
    discount_amount numeric(18,6) DEFAULT 0,
    apply_discount_on character varying(50) DEFAULT 'Grand Total'::character varying,
    base_grand_total numeric(18,6) DEFAULT 0,
    grand_total numeric(18,6) DEFAULT 0,
    rounded_total numeric(18,6) DEFAULT 0,
    rounding_adjustment numeric(18,6) DEFAULT 0,
    in_words character varying(200),
    outstanding_amount numeric(18,6) DEFAULT 0,
    total_advance numeric(18,6) DEFAULT 0,
    paid_amount numeric(18,6) DEFAULT 0,
    base_paid_amount numeric(18,6) DEFAULT 0,
    write_off_amount numeric(18,6) DEFAULT 0,
    base_write_off_amount numeric(18,6) DEFAULT 0,
    write_off_account character varying(200),
    write_off_cost_center character varying(200),
    credit_to character varying(200),
    mode_of_payment character varying(200),
    cash_bank_account character varying(200),
    clearance_date date,
    party_account_currency character varying(10),
    status character varying(50) DEFAULT 'draft'::character varying,
    remarks text,
    tax_withholding_group character varying(100),
    supplier_address character varying(200),
    contact_person character varying(200),
    shipping_address character varying(200),
    billing_address character varying(200),
    payment_terms_template character varying(100),
    tc_name character varying(200),
    terms text,
    set_warehouse character varying(200),
    set_from_warehouse character varying(200),
    update_stock boolean DEFAULT false,
    per_received numeric(5,2) DEFAULT 0,
    per_billed numeric(5,2) DEFAULT 0,
    amended_from character varying(100),
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id integer NOT NULL,
    purchase_order_id integer,
    item_code character varying(100) NOT NULL,
    item_name character varying(255),
    qty numeric(18,6) DEFAULT 0 NOT NULL,
    rate numeric(18,6) DEFAULT 0,
    amount numeric(18,6) DEFAULT 0,
    warehouse character varying(255),
    uom character varying(50) DEFAULT 'Nos'::character varying,
    schedule_date date,
    received_qty numeric(18,6) DEFAULT 0,
    rejected_qty numeric(18,6) DEFAULT 0,
    billed_qty numeric(18,6) DEFAULT 0,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    max_overreceipt_pct numeric(5,2) DEFAULT 0,
    stock_uom character varying(50),
    conversion_factor numeric(18,6) DEFAULT 1,
    stock_qty numeric(18,6) DEFAULT 0,
    price_list_rate numeric(18,6) DEFAULT 0,
    discount_percentage numeric(18,6) DEFAULT 0,
    discount_amount numeric(18,6) DEFAULT 0,
    base_rate numeric(18,6) DEFAULT 0,
    base_amount numeric(18,6) DEFAULT 0,
    net_rate numeric(18,6) DEFAULT 0,
    net_amount numeric(18,6) DEFAULT 0,
    item_group character varying(200),
    brand character varying(200),
    expense_account character varying(200),
    cost_center character varying(200),
    project character varying(100),
    material_request character varying(100),
    sales_order character varying(100),
    supplier_quotation character varying(100),
    blanket_order character varying(100),
    blanket_order_rate numeric(18,6) DEFAULT 0,
    manufacturer character varying(200),
    manufacturer_part_no character varying(200),
    expected_delivery_date date,
    weight_per_unit numeric(18,6) DEFAULT 0,
    total_weight numeric(18,6) DEFAULT 0,
    weight_uom character varying(50),
    item_tax_template character varying(100),
    from_warehouse character varying(200),
    fg_item character varying(100),
    fg_item_qty numeric(18,6) DEFAULT 1,
    subcontracted_qty numeric(18,6) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    supplier_name character varying(255),
    status character varying(50),
    per_received numeric(5,2) DEFAULT 0,
    last_synced_at timestamp with time zone,
    company character varying(200),
    transaction_date date DEFAULT CURRENT_DATE,
    schedule_date date,
    currency character varying(10) DEFAULT 'INR'::character varying,
    conversion_rate numeric(18,6) DEFAULT 1,
    total_qty numeric(18,6) DEFAULT 0,
    grand_total numeric(18,6) DEFAULT 0,
    net_total numeric(18,6) DEFAULT 0,
    base_grand_total numeric(18,6) DEFAULT 0,
    rounded_total numeric(18,6) DEFAULT 0,
    rounding_adjustment numeric(18,6) DEFAULT 0,
    in_words character varying(200),
    set_warehouse character varying(200),
    cost_center character varying(200),
    project character varying(100),
    payment_terms_template character varying(100),
    taxes_and_charges character varying(100),
    total_taxes_and_charges numeric(18,6) DEFAULT 0,
    additional_discount_percentage numeric(18,6) DEFAULT 0,
    discount_amount numeric(18,6) DEFAULT 0,
    apply_discount_on character varying(50) DEFAULT 'Grand Total'::character varying,
    terms text,
    tc_name character varying(200),
    buying_price_list character varying(100),
    tax_category character varying(100),
    incoterm character varying(100),
    named_place character varying(200),
    advance_paid numeric(18,6) DEFAULT 0,
    per_billed numeric(5,2) DEFAULT 0,
    supplier_address character varying(200),
    contact_person character varying(200),
    shipping_address character varying(200),
    billing_address character varying(200),
    is_subcontracted boolean DEFAULT false,
    supplier_warehouse character varying(200),
    scan_barcode character varying(200)
);

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    supplier_name character varying(255),
    status character varying(50),
    posting_date date,
    last_synced_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.sales_invoices (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    customer_name character varying(255),
    status character varying(50),
    grand_total numeric(18,6),
    posting_date date,
    last_synced_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.sales_orders (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    customer_name character varying(255),
    status character varying(50),
    grand_total numeric(18,6),
    currency character varying(20) DEFAULT 'INR'::character varying,
    delivery_date date,
    wms_status character varying(50) DEFAULT 'draft'::character varying,
    last_synced_at timestamp with time zone,
    order_type character varying(50) DEFAULT 'Sales'::character varying,
    transaction_date date DEFAULT CURRENT_DATE,
    company character varying(200),
    po_no character varying(100),
    po_date date,
    delivery_status character varying(50),
    per_delivered numeric(5,2) DEFAULT 0,
    per_billed numeric(5,2) DEFAULT 0,
    per_picked numeric(5,2) DEFAULT 0,
    tax_id character varying(100),
    conversion_rate numeric(18,6) DEFAULT 1,
    net_total numeric(18,6) DEFAULT 0,
    rounded_total numeric(18,6) DEFAULT 0,
    cost_center character varying(200),
    project character varying(100),
    payment_terms_template character varying(100),
    taxes_and_charges character varying(100),
    terms text,
    set_warehouse character varying(200),
    set_target_warehouse character varying(200),
    customer_address character varying(200),
    shipping_address_name character varying(200),
    contact_person character varying(200),
    territory character varying(200),
    selling_price_list character varying(100),
    tax_category character varying(100),
    scan_barcode character varying(200)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='box_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.box_items ALTER COLUMN id SET DEFAULT nextval('public.box_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='boxes' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.boxes ALTER COLUMN id SET DEFAULT nextval('public.boxes_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_notes' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.delivery_notes ALTER COLUMN id SET DEFAULT nextval('public.delivery_notes_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_stops' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.delivery_stops ALTER COLUMN id SET DEFAULT nextval('public.delivery_stops_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_trips' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.delivery_trips ALTER COLUMN id SET DEFAULT nextval('public.delivery_trips_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='grn_cartons' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.grn_cartons ALTER COLUMN id SET DEFAULT nextval('public.grn_cartons_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='grn_lines' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.grn_lines ALTER COLUMN id SET DEFAULT nextval('public.grn_lines_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='grn_sessions' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.grn_sessions ALTER COLUMN id SET DEFAULT nextval('public.grn_sessions_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='packing_slips' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.packing_slips ALTER COLUMN id SET DEFAULT nextval('public.packing_slips_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pick_list_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.pick_list_items ALTER COLUMN id SET DEFAULT nextval('public.pick_list_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pick_lists' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.pick_lists ALTER COLUMN id SET DEFAULT nextval('public.pick_lists_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_invoices' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.purchase_invoices ALTER COLUMN id SET DEFAULT nextval('public.purchase_invoices_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_order_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.purchase_order_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_order_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_orders' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.purchase_orders_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_receipts' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.purchase_receipts ALTER COLUMN id SET DEFAULT nextval('public.purchase_receipts_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_invoices' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.sales_invoices ALTER COLUMN id SET DEFAULT nextval('public.sales_invoices_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.sales_orders ALTER COLUMN id SET DEFAULT nextval('public.sales_orders_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_items_pkey' AND conrelid = 'public.box_items'::regclass) THEN
    ALTER TABLE public.box_items
    ADD CONSTRAINT box_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boxes_label_key' AND conrelid = 'public.boxes'::regclass) THEN
    ALTER TABLE public.boxes
    ADD CONSTRAINT boxes_label_key UNIQUE (label);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boxes_pkey' AND conrelid = 'public.boxes'::regclass) THEN
    ALTER TABLE public.boxes
    ADD CONSTRAINT boxes_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_notes_name_key' AND conrelid = 'public.delivery_notes'::regclass) THEN
    ALTER TABLE public.delivery_notes
    ADD CONSTRAINT delivery_notes_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_notes_pkey' AND conrelid = 'public.delivery_notes'::regclass) THEN
    ALTER TABLE public.delivery_notes
    ADD CONSTRAINT delivery_notes_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_stops_pkey' AND conrelid = 'public.delivery_stops'::regclass) THEN
    ALTER TABLE public.delivery_stops
    ADD CONSTRAINT delivery_stops_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_trips_pkey' AND conrelid = 'public.delivery_trips'::regclass) THEN
    ALTER TABLE public.delivery_trips
    ADD CONSTRAINT delivery_trips_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_trips_trip_no_key' AND conrelid = 'public.delivery_trips'::regclass) THEN
    ALTER TABLE public.delivery_trips
    ADD CONSTRAINT delivery_trips_trip_no_key UNIQUE (trip_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_cartons_pkey' AND conrelid = 'public.grn_cartons'::regclass) THEN
    ALTER TABLE public.grn_cartons
    ADD CONSTRAINT grn_cartons_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_lines_pkey' AND conrelid = 'public.grn_lines'::regclass) THEN
    ALTER TABLE public.grn_lines
    ADD CONSTRAINT grn_lines_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_sessions_pkey' AND conrelid = 'public.grn_sessions'::regclass) THEN
    ALTER TABLE public.grn_sessions
    ADD CONSTRAINT grn_sessions_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_sessions_session_no_key' AND conrelid = 'public.grn_sessions'::regclass) THEN
    ALTER TABLE public.grn_sessions
    ADD CONSTRAINT grn_sessions_session_no_key UNIQUE (session_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_slips_name_key' AND conrelid = 'public.packing_slips'::regclass) THEN
    ALTER TABLE public.packing_slips
    ADD CONSTRAINT packing_slips_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_slips_pkey' AND conrelid = 'public.packing_slips'::regclass) THEN
    ALTER TABLE public.packing_slips
    ADD CONSTRAINT packing_slips_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_list_items_pkey' AND conrelid = 'public.pick_list_items'::regclass) THEN
    ALTER TABLE public.pick_list_items
    ADD CONSTRAINT pick_list_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_lists_name_key' AND conrelid = 'public.pick_lists'::regclass) THEN
    ALTER TABLE public.pick_lists
    ADD CONSTRAINT pick_lists_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_lists_pkey' AND conrelid = 'public.pick_lists'::regclass) THEN
    ALTER TABLE public.pick_lists
    ADD CONSTRAINT pick_lists_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_name_key' AND conrelid = 'public.purchase_invoices'::regclass) THEN
    ALTER TABLE public.purchase_invoices
    ADD CONSTRAINT purchase_invoices_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_pkey' AND conrelid = 'public.purchase_invoices'::regclass) THEN
    ALTER TABLE public.purchase_invoices
    ADD CONSTRAINT purchase_invoices_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_pkey' AND conrelid = 'public.purchase_order_items'::regclass) THEN
    ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_name_key' AND conrelid = 'public.purchase_orders'::regclass) THEN
    ALTER TABLE public.purchase_orders
    ADD CONSTRAINT purchase_orders_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_pkey' AND conrelid = 'public.purchase_orders'::regclass) THEN
    ALTER TABLE public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_receipts_name_key' AND conrelid = 'public.purchase_receipts'::regclass) THEN
    ALTER TABLE public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_receipts_pkey' AND conrelid = 'public.purchase_receipts'::regclass) THEN
    ALTER TABLE public.purchase_receipts
    ADD CONSTRAINT purchase_receipts_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_name_key' AND conrelid = 'public.sales_invoices'::regclass) THEN
    ALTER TABLE public.sales_invoices
    ADD CONSTRAINT sales_invoices_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoices_pkey' AND conrelid = 'public.sales_invoices'::regclass) THEN
    ALTER TABLE public.sales_invoices
    ADD CONSTRAINT sales_invoices_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_name_key' AND conrelid = 'public.sales_orders'::regclass) THEN
    ALTER TABLE public.sales_orders
    ADD CONSTRAINT sales_orders_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_pkey' AND conrelid = 'public.sales_orders'::regclass) THEN
    ALTER TABLE public.sales_orders
    ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_boxes_label ON public.boxes USING btree (label);

CREATE INDEX IF NOT EXISTS idx_grn_cartons_session ON public.grn_cartons USING btree (grn_session_id);

CREATE INDEX IF NOT EXISTS idx_grn_lines_carton ON public.grn_lines USING btree (grn_carton_id);

CREATE INDEX IF NOT EXISTS idx_grn_sessions_status ON public.grn_sessions USING btree (status);

CREATE INDEX IF NOT EXISTS idx_pick_lists_status ON public.pick_lists USING btree (status);

CREATE INDEX IF NOT EXISTS idx_po_items_order ON public.purchase_order_items USING btree (purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_sales_orders_name ON public.sales_orders USING btree (name);

CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON public.sales_orders USING btree (status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_items_box_id_fkey' AND conrelid = 'public.box_items'::regclass) THEN
    ALTER TABLE public.box_items
    ADD CONSTRAINT box_items_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_items_scanned_by_fkey' AND conrelid = 'public.box_items'::regclass) THEN
    ALTER TABLE public.box_items
    ADD CONSTRAINT box_items_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boxes_pick_list_id_fkey' AND conrelid = 'public.boxes'::regclass) THEN
    ALTER TABLE public.boxes
    ADD CONSTRAINT boxes_pick_list_id_fkey FOREIGN KEY (pick_list_id) REFERENCES public.pick_lists(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_stops_trip_id_fkey' AND conrelid = 'public.delivery_stops'::regclass) THEN
    ALTER TABLE public.delivery_stops
    ADD CONSTRAINT delivery_stops_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.delivery_trips(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_trips_driver_id_fkey' AND conrelid = 'public.delivery_trips'::regclass) THEN
    ALTER TABLE public.delivery_trips
    ADD CONSTRAINT delivery_trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_cartons_grn_session_id_fkey' AND conrelid = 'public.grn_cartons'::regclass) THEN
    ALTER TABLE public.grn_cartons
    ADD CONSTRAINT grn_cartons_grn_session_id_fkey FOREIGN KEY (grn_session_id) REFERENCES public.grn_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_cartons_scanned_by_fkey' AND conrelid = 'public.grn_cartons'::regclass) THEN
    ALTER TABLE public.grn_cartons
    ADD CONSTRAINT grn_cartons_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_lines_grn_carton_id_fkey' AND conrelid = 'public.grn_lines'::regclass) THEN
    ALTER TABLE public.grn_lines
    ADD CONSTRAINT grn_lines_grn_carton_id_fkey FOREIGN KEY (grn_carton_id) REFERENCES public.grn_cartons(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_sessions_created_by_fkey' AND conrelid = 'public.grn_sessions'::regclass) THEN
    ALTER TABLE public.grn_sessions
    ADD CONSTRAINT grn_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grn_sessions_warehouse_id_fkey' AND conrelid = 'public.grn_sessions'::regclass) THEN
    ALTER TABLE public.grn_sessions
    ADD CONSTRAINT grn_sessions_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_list_items_pick_list_id_fkey' AND conrelid = 'public.pick_list_items'::regclass) THEN
    ALTER TABLE public.pick_list_items
    ADD CONSTRAINT pick_list_items_pick_list_id_fkey FOREIGN KEY (pick_list_id) REFERENCES public.pick_lists(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_lists_warehouse_id_fkey' AND conrelid = 'public.pick_lists'::regclass) THEN
    ALTER TABLE public.pick_lists
    ADD CONSTRAINT pick_lists_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_purchase_order_id_fkey' AND conrelid = 'public.purchase_order_items'::regclass) THEN
    ALTER TABLE public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.box_items OWNER TO gowms;

ALTER TABLE public.boxes OWNER TO gowms;

ALTER TABLE public.delivery_notes OWNER TO gowms;

ALTER TABLE public.delivery_stops OWNER TO gowms;

ALTER TABLE public.delivery_trips OWNER TO gowms;

ALTER TABLE public.grn_cartons OWNER TO gowms;

ALTER TABLE public.grn_lines OWNER TO gowms;

ALTER TABLE public.grn_sessions OWNER TO gowms;

ALTER TABLE public.packing_slips OWNER TO gowms;

ALTER TABLE public.pick_list_items OWNER TO gowms;

ALTER TABLE public.pick_lists OWNER TO gowms;

ALTER TABLE public.purchase_invoices OWNER TO gowms;

ALTER TABLE public.purchase_order_items OWNER TO gowms;

ALTER TABLE public.purchase_orders OWNER TO gowms;

ALTER TABLE public.purchase_receipts OWNER TO gowms;

ALTER TABLE public.sales_invoices OWNER TO gowms;

ALTER TABLE public.sales_orders OWNER TO gowms;
