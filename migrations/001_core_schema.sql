-- Auto-regenerated from recovered schema dump (pg_dump --schema-only).
-- Idempotent: safe to run repeatedly.

CREATE SEQUENCE IF NOT EXISTS public.business_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.companies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.cost_centers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.currencies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.customer_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.fiscal_years_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.item_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.motorcycle_models_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.payment_terms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.supplier_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.uoms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.warehouses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.business_units (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    gstin character varying(20),
    default_warehouse_id integer
);

CREATE TABLE IF NOT EXISTS public.companies (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    abbr character varying(10),
    currency character varying(10) DEFAULT 'INR'::character varying,
    country character varying(200),
    tax_id character varying(100),
    default_warehouse character varying(200),
    default_receivable_account character varying(200),
    default_payable_account character varying(200),
    default_expense_account character varying(200),
    default_income_account character varying(200),
    default_bank_account character varying(200),
    default_cash_account character varying(200),
    write_off_account character varying(200),
    round_off_account character varying(200),
    round_off_cost_center character varying(200),
    cost_center character varying(200),
    stock_adjustment_account character varying(200),
    valuation_method character varying(50) DEFAULT 'FIFO'::character varying,
    enable_perpetual_inventory boolean DEFAULT true,
    credit_limit numeric(18,6) DEFAULT 0,
    domain character varying(100),
    phone_no character varying(50),
    email character varying(200),
    website character varying(200),
    date_of_establishment date,
    company_logo character varying(500),
    company_description text
);

CREATE TABLE IF NOT EXISTS public.cost_centers (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    company_id integer,
    is_group boolean DEFAULT false,
    parent_id integer,
    cost_center_number character varying(50),
    disabled boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.currencies (
    id integer NOT NULL,
    currency_name character varying(10) NOT NULL,
    enabled boolean DEFAULT true,
    fraction character varying(50),
    fraction_units integer DEFAULT 100,
    symbol character varying(10),
    smallest_currency_fraction_value numeric(18,6) DEFAULT 0.01,
    number_format character varying(20) DEFAULT '#,###.##'::character varying,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_groups (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    parent_id integer
);

CREATE TABLE IF NOT EXISTS public.customers (
    id integer NOT NULL,
    erp_id character varying(100),
    name character varying(255) NOT NULL,
    customer_group character varying(100),
    gstin character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    customer_type character varying(50) DEFAULT 'Company'::character varying,
    territory character varying(200),
    default_currency character varying(10) DEFAULT 'INR'::character varying,
    disabled boolean DEFAULT false,
    is_internal_customer boolean DEFAULT false,
    payment_terms_template character varying(100),
    tax_category character varying(100),
    default_price_list character varying(100),
    loyalty_program character varying(100),
    website character varying(200),
    language character varying(50),
    market_segment character varying(200),
    industry character varying(200),
    customer_details text,
    customer_primary_address character varying(200),
    customer_primary_contact character varying(200),
    tax_withholding_category character varying(100),
    lead_name character varying(200)
);

CREATE TABLE IF NOT EXISTS public.employees (
    id integer NOT NULL,
    employee_name character varying(200) NOT NULL,
    first_name character varying(100),
    middle_name character varying(100),
    last_name character varying(100),
    company character varying(200) NOT NULL,
    status character varying(50) DEFAULT 'Active'::character varying,
    gender character varying(20),
    date_of_birth date,
    date_of_joining date,
    department character varying(200),
    designation character varying(200),
    reports_to integer,
    branch character varying(200),
    employee_number character varying(50),
    user_id integer,
    cell_number character varying(50),
    company_email character varying(200),
    personal_email character varying(200),
    salary_mode character varying(50),
    bank_name character varying(200),
    bank_ac_no character varying(100),
    ctc numeric(18,6) DEFAULT 0,
    salary_currency character varying(10) DEFAULT 'INR'::character varying,
    current_address text,
    permanent_address text,
    passport_number character varying(100),
    marital_status character varying(50),
    blood_group character varying(10),
    disabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiscal_years (
    id integer NOT NULL,
    year character varying(10) NOT NULL,
    year_start_date date NOT NULL,
    year_end_date date NOT NULL,
    disabled boolean DEFAULT false,
    is_short_year boolean DEFAULT false,
    auto_created boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_groups (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    parent_id integer,
    is_group boolean DEFAULT false,
    image character varying(500)
);

CREATE TABLE IF NOT EXISTS public.items (
    id integer NOT NULL,
    code character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    item_group_id integer,
    stock_uom_id integer,
    has_serial boolean DEFAULT false,
    has_batch boolean DEFAULT false,
    is_stock boolean DEFAULT true,
    disabled boolean DEFAULT false,
    abc_tier character varying(5),
    carton_qty integer DEFAULT 0,
    safety_stock numeric(18,6) DEFAULT 0,
    lead_time_days integer DEFAULT 15,
    reorder_level numeric(18,6) DEFAULT 0,
    reorder_qty numeric(18,6) DEFAULT 0,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    description text,
    brand character varying(200),
    valuation_method character varying(50),
    valuation_rate numeric(18,6) DEFAULT 0,
    standard_rate numeric(18,6) DEFAULT 0,
    opening_stock numeric(18,6) DEFAULT 0,
    is_sales_item boolean DEFAULT true,
    is_purchase_item boolean DEFAULT true,
    has_variants boolean DEFAULT false,
    variant_of character varying(100),
    min_order_qty numeric(18,6) DEFAULT 0,
    last_purchase_rate numeric(18,6) DEFAULT 0,
    warranty_period character varying(50),
    weight_per_unit numeric(18,6) DEFAULT 0,
    weight_uom character varying(50),
    end_of_life date DEFAULT '2099-12-31'::date,
    allow_negative_stock boolean DEFAULT false,
    over_delivery_receipt_allowance numeric(18,6) DEFAULT 0,
    over_billing_allowance numeric(18,6) DEFAULT 0,
    image character varying(500),
    shelf_life_in_days integer,
    has_expiry_date boolean DEFAULT false,
    batch_number_series character varying(100),
    serial_no_series character varying(100),
    total_projected_qty numeric(18,6) DEFAULT 0,
    is_sub_contracted_item boolean DEFAULT false,
    default_bom character varying(100),
    country_of_origin character varying(100),
    customs_tariff_number character varying(100),
    CONSTRAINT items_abc_tier_check CHECK (((abc_tier)::text = ANY ((ARRAY['AF'::character varying, 'AS'::character varying, 'BF'::character varying, 'BS'::character varying, 'CF'::character varying, 'CS'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.motorcycle_models (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    manufacturer character varying(100),
    active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.payment_terms (
    id integer NOT NULL,
    name character varying(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.supplier_groups (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    parent_id integer,
    is_group boolean DEFAULT false,
    payment_terms character varying(100),
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id integer NOT NULL,
    erp_id character varying(100),
    name character varying(255) NOT NULL,
    supplier_group character varying(100),
    gstin character varying(20),
    created_at timestamp with time zone DEFAULT now(),
    supplier_type character varying(50) DEFAULT 'Company'::character varying,
    country character varying(200),
    default_currency character varying(10) DEFAULT 'INR'::character varying,
    disabled boolean DEFAULT false,
    is_internal_supplier boolean DEFAULT false,
    payment_terms_template character varying(100),
    tax_category character varying(100),
    default_price_list character varying(100),
    is_transporter boolean DEFAULT false,
    on_hold boolean DEFAULT false,
    hold_type character varying(50),
    release_date date,
    is_frozen boolean DEFAULT false,
    website character varying(200),
    language character varying(50),
    supplier_details text,
    supplier_primary_address character varying(200),
    supplier_primary_contact character varying(200),
    tax_withholding_group character varying(100)
);

CREATE TABLE IF NOT EXISTS public.uoms (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    conversion_factor numeric(10,4) DEFAULT 1,
    symbol character varying(20),
    common_code character varying(50),
    description text,
    category character varying(100),
    enabled boolean DEFAULT true,
    must_be_whole_number boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.users (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['picker'::character varying, 'packer'::character varying, 'driver'::character varying, 'wm'::character varying, 'billing'::character varying, 'admin'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.warehouses (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(50) NOT NULL,
    parent_id integer,
    company_id integer,
    is_group boolean DEFAULT false,
    warehouse_type character varying(20),
    picking_mode character varying(20) DEFAULT 'scan'::character varying,
    disabled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    account character varying(200),
    is_rejected_warehouse boolean DEFAULT false,
    customer character varying(200),
    default_in_transit_warehouse character varying(200),
    email_id character varying(200),
    phone_no character varying(50),
    mobile_no character varying(50),
    address_line_1 character varying(200),
    address_line_2 character varying(200),
    city character varying(100),
    state character varying(100),
    pin character varying(20),
    CONSTRAINT warehouses_picking_mode_check CHECK (((picking_mode)::text = ANY ((ARRAY['scan'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT warehouses_warehouse_type_check CHECK (((warehouse_type)::text = ANY ((ARRAY['hub'::character varying, 'satellite'::character varying])::text[])))
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='business_units' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.business_units ALTER COLUMN id SET DEFAULT nextval('public.business_units_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval('public.companies_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cost_centers' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.cost_centers ALTER COLUMN id SET DEFAULT nextval('public.cost_centers_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='currencies' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.currencies ALTER COLUMN id SET DEFAULT nextval('public.currencies_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_groups' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.customer_groups ALTER COLUMN id SET DEFAULT nextval('public.customer_groups_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='employees' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='fiscal_years' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.fiscal_years ALTER COLUMN id SET DEFAULT nextval('public.fiscal_years_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='item_groups' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.item_groups ALTER COLUMN id SET DEFAULT nextval('public.item_groups_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.items ALTER COLUMN id SET DEFAULT nextval('public.items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='motorcycle_models' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.motorcycle_models ALTER COLUMN id SET DEFAULT nextval('public.motorcycle_models_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_terms' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.payment_terms ALTER COLUMN id SET DEFAULT nextval('public.payment_terms_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier_groups' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.supplier_groups ALTER COLUMN id SET DEFAULT nextval('public.supplier_groups_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='uoms' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.uoms ALTER COLUMN id SET DEFAULT nextval('public.uoms_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='warehouses' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.warehouses ALTER COLUMN id SET DEFAULT nextval('public.warehouses_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_units_name_key' AND conrelid = 'public.business_units'::regclass) THEN
    ALTER TABLE public.business_units
    ADD CONSTRAINT business_units_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_units_pkey' AND conrelid = 'public.business_units'::regclass) THEN
    ALTER TABLE public.business_units
    ADD CONSTRAINT business_units_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_name_key' AND conrelid = 'public.companies'::regclass) THEN
    ALTER TABLE public.companies
    ADD CONSTRAINT companies_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_pkey' AND conrelid = 'public.companies'::regclass) THEN
    ALTER TABLE public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_name_key' AND conrelid = 'public.cost_centers'::regclass) THEN
    ALTER TABLE public.cost_centers
    ADD CONSTRAINT cost_centers_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_pkey' AND conrelid = 'public.cost_centers'::regclass) THEN
    ALTER TABLE public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'currencies_currency_name_key' AND conrelid = 'public.currencies'::regclass) THEN
    ALTER TABLE public.currencies
    ADD CONSTRAINT currencies_currency_name_key UNIQUE (currency_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'currencies_pkey' AND conrelid = 'public.currencies'::regclass) THEN
    ALTER TABLE public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_groups_name_key' AND conrelid = 'public.customer_groups'::regclass) THEN
    ALTER TABLE public.customer_groups
    ADD CONSTRAINT customer_groups_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_groups_pkey' AND conrelid = 'public.customer_groups'::regclass) THEN
    ALTER TABLE public.customer_groups
    ADD CONSTRAINT customer_groups_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_erp_id_key' AND conrelid = 'public.customers'::regclass) THEN
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_erp_id_key UNIQUE (erp_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_pkey' AND conrelid = 'public.customers'::regclass) THEN
    ALTER TABLE public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_pkey' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_years_pkey' AND conrelid = 'public.fiscal_years'::regclass) THEN
    ALTER TABLE public.fiscal_years
    ADD CONSTRAINT fiscal_years_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_years_year_key' AND conrelid = 'public.fiscal_years'::regclass) THEN
    ALTER TABLE public.fiscal_years
    ADD CONSTRAINT fiscal_years_year_key UNIQUE (year);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_groups_name_key' AND conrelid = 'public.item_groups'::regclass) THEN
    ALTER TABLE public.item_groups
    ADD CONSTRAINT item_groups_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_groups_pkey' AND conrelid = 'public.item_groups'::regclass) THEN
    ALTER TABLE public.item_groups
    ADD CONSTRAINT item_groups_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_code_key' AND conrelid = 'public.items'::regclass) THEN
    ALTER TABLE public.items
    ADD CONSTRAINT items_code_key UNIQUE (code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_pkey' AND conrelid = 'public.items'::regclass) THEN
    ALTER TABLE public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'motorcycle_models_name_key' AND conrelid = 'public.motorcycle_models'::regclass) THEN
    ALTER TABLE public.motorcycle_models
    ADD CONSTRAINT motorcycle_models_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'motorcycle_models_pkey' AND conrelid = 'public.motorcycle_models'::regclass) THEN
    ALTER TABLE public.motorcycle_models
    ADD CONSTRAINT motorcycle_models_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_terms_name_key' AND conrelid = 'public.payment_terms'::regclass) THEN
    ALTER TABLE public.payment_terms
    ADD CONSTRAINT payment_terms_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_terms_pkey' AND conrelid = 'public.payment_terms'::regclass) THEN
    ALTER TABLE public.payment_terms
    ADD CONSTRAINT payment_terms_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_groups_name_key' AND conrelid = 'public.supplier_groups'::regclass) THEN
    ALTER TABLE public.supplier_groups
    ADD CONSTRAINT supplier_groups_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_groups_pkey' AND conrelid = 'public.supplier_groups'::regclass) THEN
    ALTER TABLE public.supplier_groups
    ADD CONSTRAINT supplier_groups_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_erp_id_key' AND conrelid = 'public.suppliers'::regclass) THEN
    ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_erp_id_key UNIQUE (erp_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_pkey' AND conrelid = 'public.suppliers'::regclass) THEN
    ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uoms_name_key' AND conrelid = 'public.uoms'::regclass) THEN
    ALTER TABLE public.uoms
    ADD CONSTRAINT uoms_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uoms_pkey' AND conrelid = 'public.uoms'::regclass) THEN
    ALTER TABLE public.uoms
    ADD CONSTRAINT uoms_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_pkey' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key' AND conrelid = 'public.users'::regclass) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_code_key' AND conrelid = 'public.warehouses'::regclass) THEN
    ALTER TABLE public.warehouses
    ADD CONSTRAINT warehouses_code_key UNIQUE (code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_pkey' AND conrelid = 'public.warehouses'::regclass) THEN
    ALTER TABLE public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_abc_tier ON public.items USING btree (abc_tier);

CREATE INDEX IF NOT EXISTS idx_items_code ON public.items USING btree (code);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_units_default_warehouse_id_fkey' AND conrelid = 'public.business_units'::regclass) THEN
    ALTER TABLE public.business_units
    ADD CONSTRAINT business_units_default_warehouse_id_fkey FOREIGN KEY (default_warehouse_id) REFERENCES public.warehouses(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_centers_company_id_fkey' AND conrelid = 'public.cost_centers'::regclass) THEN
    ALTER TABLE public.cost_centers
    ADD CONSTRAINT cost_centers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_groups_parent_id_fkey' AND conrelid = 'public.customer_groups'::regclass) THEN
    ALTER TABLE public.customer_groups
    ADD CONSTRAINT customer_groups_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.customer_groups(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_reports_to_fkey' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE public.employees
    ADD CONSTRAINT employees_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES public.employees(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_groups_parent_id_fkey' AND conrelid = 'public.item_groups'::regclass) THEN
    ALTER TABLE public.item_groups
    ADD CONSTRAINT item_groups_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.item_groups(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_item_group_id_fkey' AND conrelid = 'public.items'::regclass) THEN
    ALTER TABLE public.items
    ADD CONSTRAINT items_item_group_id_fkey FOREIGN KEY (item_group_id) REFERENCES public.item_groups(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_stock_uom_id_fkey' AND conrelid = 'public.items'::regclass) THEN
    ALTER TABLE public.items
    ADD CONSTRAINT items_stock_uom_id_fkey FOREIGN KEY (stock_uom_id) REFERENCES public.uoms(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_groups_parent_id_fkey' AND conrelid = 'public.supplier_groups'::regclass) THEN
    ALTER TABLE public.supplier_groups
    ADD CONSTRAINT supplier_groups_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.supplier_groups(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_company_id_fkey' AND conrelid = 'public.warehouses'::regclass) THEN
    ALTER TABLE public.warehouses
    ADD CONSTRAINT warehouses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouses_parent_id_fkey' AND conrelid = 'public.warehouses'::regclass) THEN
    ALTER TABLE public.warehouses
    ADD CONSTRAINT warehouses_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.warehouses(id);
  END IF;
END $$;

ALTER TABLE public.business_units OWNER TO gowms;

ALTER TABLE public.companies OWNER TO gowms;

ALTER TABLE public.cost_centers OWNER TO gowms;

ALTER TABLE public.currencies OWNER TO gowms;

ALTER TABLE public.customer_groups OWNER TO gowms;

ALTER TABLE public.customers OWNER TO gowms;

ALTER TABLE public.employees OWNER TO gowms;

ALTER TABLE public.fiscal_years OWNER TO gowms;

ALTER TABLE public.item_groups OWNER TO gowms;

ALTER TABLE public.items OWNER TO gowms;

ALTER TABLE public.motorcycle_models OWNER TO gowms;

ALTER TABLE public.payment_terms OWNER TO gowms;

ALTER TABLE public.supplier_groups OWNER TO gowms;

ALTER TABLE public.suppliers OWNER TO gowms;

ALTER TABLE public.uoms OWNER TO gowms;

ALTER TABLE public.users OWNER TO gowms;

ALTER TABLE public.warehouses OWNER TO gowms;
