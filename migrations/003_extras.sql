-- Auto-regenerated from recovered schema dump (pg_dump --schema-only).
-- Idempotent: safe to run repeatedly.

CREATE SEQUENCE IF NOT EXISTS public.attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.backorder_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.backorders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.bins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.box_load_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.comments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.currency_exchange_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.customer_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.cycle_count_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.cycle_count_sheets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.delivery_note_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.delivery_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.delivery_signatures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.demand_forecast_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.discount_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.error_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.gst_invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.item_hierarchy_nodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.item_model_fitment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.item_movement_classifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.item_variants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.journal_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.journal_entry_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.manual_pick_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.material_request_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.material_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.order_fulfillment_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.order_status_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.order_template_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.order_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.pack_reversals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.packing_slip_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.payment_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.pick_scan_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.price_observations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.purchase_invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.putaway_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.putaway_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.quality_inspection_readings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.quality_inspections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.request_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.return_claim_photos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.return_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.sales_invoice_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.sales_order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.saved_kit_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.saved_kits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.scheduler_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.seasonal_patterns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.serial_numbers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.stock_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.stock_entry_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.stock_ledger_entries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.stock_reconciliation_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.stock_reconciliations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.stock_reservations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.supplier_performance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.warehouse_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.warehouse_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.wishlists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.workflow_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.workflow_instances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.attachments (
    id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    filename character varying(255) NOT NULL,
    stored_name character varying(255) NOT NULL,
    mime_type character varying(100),
    size_bytes integer,
    uploaded_by integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
    id integer NOT NULL,
    operation character varying(50) NOT NULL,
    entity_type character varying(50),
    entity_id integer,
    old_value jsonb,
    new_value jsonb,
    actor_id integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.backorder_lines (
    id integer NOT NULL,
    backorder_id integer,
    item_code character varying(100) NOT NULL,
    ordered_qty numeric(18,6),
    available_qty numeric(18,6),
    backorder_qty numeric(18,6),
    fulfilled_qty numeric(18,6) DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying
);

CREATE TABLE IF NOT EXISTS public.backorders (
    id integer NOT NULL,
    backorder_no character varying(30) NOT NULL,
    sales_order_no character varying(100) NOT NULL,
    customer character varying(255),
    warehouse character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT backorders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'partially_fulfilled'::character varying, 'fulfilled'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.batches (
    id integer NOT NULL,
    batch_id character varying(100) NOT NULL,
    item_code character varying(100) NOT NULL,
    item_name character varying(200),
    manufacturing_date date DEFAULT CURRENT_DATE,
    expiry_date date,
    batch_qty numeric(18,6) DEFAULT 0,
    stock_uom character varying(50),
    disabled boolean DEFAULT false,
    description text,
    parent_batch_id integer,
    use_batchwise_valuation boolean DEFAULT false,
    allow_negative_stock boolean DEFAULT false,
    supplier character varying(200),
    reference_doctype character varying(100),
    reference_name character varying(100),
    qty_to_produce numeric(18,6) DEFAULT 0,
    produced_qty numeric(18,6) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bins (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    warehouse character varying(255) NOT NULL,
    actual_qty numeric(18,6) DEFAULT 0,
    ordered_qty numeric(18,6) DEFAULT 0,
    reserved_qty numeric(18,6) DEFAULT 0,
    projected_qty numeric(18,6) DEFAULT 0,
    stock_value numeric(18,2) DEFAULT 0,
    valuation_rate numeric(18,6) DEFAULT 0,
    last_synced_at timestamp with time zone,
    stock_uom character varying(50),
    company character varying(200),
    planned_qty numeric(18,6) DEFAULT 0,
    indented_qty numeric(18,6) DEFAULT 0,
    reserved_qty_for_production numeric(18,6) DEFAULT 0,
    reserved_qty_for_sub_contract numeric(18,6) DEFAULT 0,
    reserved_qty_for_production_plan numeric(18,6) DEFAULT 0,
    reserved_stock numeric(18,6) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.box_load_logs (
    id integer NOT NULL,
    box_id integer,
    trip_id integer,
    stop_id integer,
    loaded_at timestamp with time zone DEFAULT now(),
    loaded_by integer
);

CREATE TABLE IF NOT EXISTS public.comments (
    id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    user_id integer,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.currency_exchange (
    id integer NOT NULL,
    date date NOT NULL,
    from_currency character varying(10) NOT NULL,
    to_currency character varying(10) NOT NULL,
    exchange_rate numeric(18,6) NOT NULL,
    for_buying boolean DEFAULT true,
    for_selling boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_metrics (
    id integer NOT NULL,
    customer_id integer,
    total_orders integer DEFAULT 0,
    total_revenue numeric(18,2) DEFAULT 0,
    total_returns integer DEFAULT 0,
    return_rate numeric(5,2) DEFAULT 0,
    avg_order_value numeric(12,2) DEFAULT 0,
    backorder_count integer DEFAULT 0,
    backorder_rate numeric(5,2) DEFAULT 0,
    last_order_date date,
    ranking integer,
    last_calculated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cycle_count_lines (
    id integer NOT NULL,
    sheet_id integer,
    item_code character varying(100) NOT NULL,
    system_qty numeric(18,6),
    counted_qty numeric(18,6) DEFAULT 0,
    discrepancy_status character varying(20),
    counted_by integer,
    counted_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.cycle_count_sheets (
    id integer NOT NULL,
    sheet_no character varying(30) NOT NULL,
    warehouse_id integer,
    tier character varying(5),
    scheduled_date date,
    status character varying(20) DEFAULT 'pending'::character varying,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_note_items (
    id integer NOT NULL,
    delivery_note_id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    item_name character varying(200),
    qty numeric(18,6) DEFAULT 0 NOT NULL,
    rate numeric(18,6) DEFAULT 0,
    warehouse character varying(200),
    uom character varying(50),
    conversion_factor numeric(18,6) DEFAULT 1,
    stock_qty numeric(18,6) DEFAULT 0,
    amount numeric(18,6) DEFAULT 0,
    against_sales_order character varying(100),
    so_detail character varying(100),
    against_pick_list character varying(100),
    pick_list_item character varying(100),
    serial_no text,
    batch_no character varying(100),
    quality_inspection character varying(100),
    target_warehouse character varying(200),
    actual_qty numeric(18,6) DEFAULT 0,
    cost_center character varying(200),
    delivered_qty numeric(18,6) DEFAULT 0,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_photos (
    id integer NOT NULL,
    stop_id integer,
    photo_data text,
    issue_reason character varying(255),
    captured_by integer,
    captured_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_signatures (
    id integer NOT NULL,
    stop_id integer,
    order_no character varying(100),
    signature_data text,
    captured_by integer,
    captured_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demand_forecast (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    warehouse character varying(255),
    forecast_date date NOT NULL,
    forecast_qty numeric(18,6),
    actual_qty numeric(18,6),
    forecast_error numeric(10,4),
    method character varying(20) DEFAULT 'moving_avg'::character varying,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discount_rules (
    id integer NOT NULL,
    customer_group character varying(100),
    item_hierarchy_node character varying(100),
    discount_pct numeric(5,2),
    active boolean DEFAULT true,
    valid_from date,
    valid_to date
);

CREATE TABLE IF NOT EXISTS public.error_logs (
    id integer NOT NULL,
    method character varying(100),
    error text,
    traceback text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gst_invoices (
    id integer NOT NULL,
    invoice_no character varying(100) NOT NULL,
    sales_order_no character varying(100),
    customer character varying(255),
    gst_amount numeric(18,6),
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.item_hierarchy_nodes (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    level character varying(20),
    parent_id integer,
    CONSTRAINT item_hierarchy_nodes_level_check CHECK (((level)::text = ANY ((ARRAY['group'::character varying, 'category'::character varying, 'subcategory'::character varying, 'brand'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.item_model_fitment (
    id integer NOT NULL,
    item_id integer,
    model_id integer
);

CREATE TABLE IF NOT EXISTS public.item_movement_classifications (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    classification character varying(20),
    turnover_ratio numeric(10,4),
    days_since_last_sale integer,
    avg_daily_sales numeric(12,4),
    calculated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT item_movement_classifications_classification_check CHECK (((classification)::text = ANY ((ARRAY['fast'::character varying, 'slow'::character varying, 'dead'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.item_variants (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    variant_of character varying(100),
    item_attribute character varying(100) NOT NULL,
    item_attribute_value character varying(200) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    voucher_type character varying(100) DEFAULT 'Journal Entry'::character varying,
    posting_date date DEFAULT CURRENT_DATE,
    company character varying(200) NOT NULL,
    multi_currency boolean DEFAULT false,
    total_debit numeric(18,6) DEFAULT 0,
    total_credit numeric(18,6) DEFAULT 0,
    difference numeric(18,6) DEFAULT 0,
    cheque_no character varying(100),
    cheque_date date,
    clearance_date date,
    user_remark text,
    remark text,
    bill_no character varying(100),
    bill_date date,
    due_date date,
    reversal_of character varying(100),
    is_system_generated boolean DEFAULT false,
    pay_to_recd_from character varying(200),
    total_amount numeric(18,6) DEFAULT 0,
    total_amount_currency character varying(10),
    total_amount_in_words character varying(200),
    is_opening character varying(20) DEFAULT 'No'::character varying,
    mode_of_payment character varying(200),
    status character varying(50) DEFAULT 'draft'::character varying,
    title character varying(200),
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_entry_accounts (
    id integer NOT NULL,
    journal_entry_id integer NOT NULL,
    account character varying(200) NOT NULL,
    account_type character varying(100),
    bank_account character varying(200),
    party_type character varying(100),
    party character varying(200),
    cost_center character varying(200),
    project character varying(100),
    account_currency character varying(10),
    exchange_rate numeric(18,6) DEFAULT 1,
    debit_in_account_currency numeric(18,6) DEFAULT 0,
    debit numeric(18,6) DEFAULT 0,
    credit_in_account_currency numeric(18,6) DEFAULT 0,
    credit numeric(18,6) DEFAULT 0,
    reference_type character varying(100),
    reference_name character varying(100),
    reference_due_date date,
    user_remark text,
    against_account text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manual_pick_records (
    id integer NOT NULL,
    log_no character varying(30) NOT NULL,
    pick_list_id integer,
    item_code character varying(100) NOT NULL,
    qty_picked numeric(18,6),
    bin_location character varying(100),
    picker_name character varying(100),
    picked_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.material_request_items (
    id integer NOT NULL,
    request_id integer,
    item_code character varying(100) NOT NULL,
    qty numeric(18,6),
    schedule_date date
);

CREATE TABLE IF NOT EXISTS public.material_requests (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    request_type character varying(50),
    status character varying(50),
    schedule_date date,
    auto_created boolean DEFAULT false,
    last_synced_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id integer NOT NULL,
    type character varying(20) DEFAULT 'info'::character varying,
    title character varying(255) NOT NULL,
    message text,
    is_read boolean DEFAULT false,
    user_id integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_type_check CHECK (((type)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'error'::character varying, 'success'::character varying])::text[])))
);

CREATE TABLE IF NOT EXISTS public.order_fulfillment_log (
    id integer NOT NULL,
    sales_order_no character varying(100) NOT NULL,
    customer character varying(255),
    total_items integer,
    fulfilled_items integer DEFAULT 0,
    fill_rate numeric(5,2),
    backordered_items integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_status_logs (
    id integer NOT NULL,
    sales_order_no character varying(100) NOT NULL,
    from_status character varying(50),
    to_status character varying(50),
    actor_id integer,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_template_lines (
    id integer NOT NULL,
    template_id integer,
    item_code character varying(100) NOT NULL,
    quantity numeric(18,6)
);

CREATE TABLE IF NOT EXISTS public.order_templates (
    id integer NOT NULL,
    customer_id integer,
    name character varying(100) NOT NULL,
    frequency character varying(20),
    next_run date,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pack_reversals (
    id integer NOT NULL,
    box_id integer,
    box_item_id integer,
    item_code character varying(100) NOT NULL,
    qty_removed numeric(18,6),
    reason character varying(255),
    reversed_at timestamp with time zone DEFAULT now(),
    reversed_by integer
);

CREATE TABLE IF NOT EXISTS public.packing_slip_items (
    id integer NOT NULL,
    packing_slip_id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    item_name character varying(200),
    batch_no character varying(100),
    description text,
    qty numeric(18,6) DEFAULT 0 NOT NULL,
    net_weight numeric(18,6) DEFAULT 0,
    stock_uom character varying(50),
    weight_uom character varying(50),
    dn_detail character varying(100),
    pi_detail character varying(100),
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_entries (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    payment_type character varying(50) NOT NULL,
    posting_date date DEFAULT CURRENT_DATE,
    company character varying(200) NOT NULL,
    mode_of_payment character varying(200),
    party_type character varying(100),
    party character varying(200),
    party_name character varying(200),
    paid_from character varying(200),
    paid_from_account_currency character varying(10),
    paid_to character varying(200),
    paid_to_account_currency character varying(10),
    paid_amount numeric(18,6) DEFAULT 0,
    paid_amount_after_tax numeric(18,6) DEFAULT 0,
    source_exchange_rate numeric(18,6) DEFAULT 1,
    base_paid_amount numeric(18,6) DEFAULT 0,
    received_amount numeric(18,6) DEFAULT 0,
    target_exchange_rate numeric(18,6) DEFAULT 1,
    base_received_amount numeric(18,6) DEFAULT 0,
    total_allocated_amount numeric(18,6) DEFAULT 0,
    unallocated_amount numeric(18,6) DEFAULT 0,
    difference_amount numeric(18,6) DEFAULT 0,
    total_taxes_and_charges numeric(18,6) DEFAULT 0,
    reference_no character varying(100),
    reference_date date,
    clearance_date date,
    project character varying(100),
    cost_center character varying(200),
    status character varying(50) DEFAULT 'draft'::character varying,
    remarks text,
    title character varying(200),
    bank_account character varying(200),
    party_bank_account character varying(200),
    in_words character varying(200),
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pick_scan_logs (
    id integer NOT NULL,
    log_no character varying(30) NOT NULL,
    pick_list_id integer,
    pick_list_item_id integer,
    item_code character varying(100) NOT NULL,
    scanned_bin character varying(100),
    expected_bin character varying(100),
    location_drift boolean DEFAULT false,
    quantity numeric(18,6),
    scanned_at timestamp with time zone DEFAULT now(),
    scanned_by integer
);

CREATE TABLE IF NOT EXISTS public.price_observations (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    batch_no character varying(100),
    observed_mrp numeric(18,6),
    observed_at_stage character varying(50),
    flagged boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
    id integer NOT NULL,
    purchase_invoice_id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    item_name character varying(200),
    description text,
    item_group character varying(200),
    received_qty numeric(18,6) DEFAULT 0,
    qty numeric(18,6) DEFAULT 0 NOT NULL,
    rejected_qty numeric(18,6) DEFAULT 0,
    uom character varying(50),
    conversion_factor numeric(18,6) DEFAULT 1,
    stock_uom character varying(50),
    stock_qty numeric(18,6) DEFAULT 0,
    price_list_rate numeric(18,6) DEFAULT 0,
    discount_percentage numeric(18,6) DEFAULT 0,
    discount_amount numeric(18,6) DEFAULT 0,
    rate numeric(18,6) DEFAULT 0,
    amount numeric(18,6) DEFAULT 0,
    base_rate numeric(18,6) DEFAULT 0,
    base_amount numeric(18,6) DEFAULT 0,
    net_rate numeric(18,6) DEFAULT 0,
    net_amount numeric(18,6) DEFAULT 0,
    warehouse character varying(200),
    rejected_warehouse character varying(200),
    from_warehouse character varying(200),
    quality_inspection character varying(100),
    batch_no character varying(100),
    serial_no text,
    expense_account character varying(200),
    item_tax_template character varying(100),
    cost_center character varying(200),
    project character varying(100),
    purchase_order character varying(100),
    po_detail character varying(100),
    purchase_receipt character varying(100),
    pr_detail character varying(100),
    landed_cost_voucher_amount numeric(18,6) DEFAULT 0,
    weight_per_unit numeric(18,6) DEFAULT 0,
    total_weight numeric(18,6) DEFAULT 0,
    weight_uom character varying(50),
    manufacturer character varying(200),
    manufacturer_part_no character varying(200),
    page_break boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.putaway_logs (
    id integer NOT NULL,
    log_no character varying(30) NOT NULL,
    grn_line_id integer,
    item_code character varying(100) NOT NULL,
    batch_no character varying(100),
    source_warehouse character varying(255),
    target_location character varying(100),
    quantity numeric(18,6),
    verification_method character varying(20),
    placed_at timestamp with time zone,
    placed_by integer
);

CREATE TABLE IF NOT EXISTS public.putaway_rules (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    company character varying(100),
    warehouse character varying(255) NOT NULL,
    priority integer DEFAULT 1,
    stock_capacity numeric(18,6) DEFAULT 0,
    current_stock numeric(18,6) DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    item_name character varying(200),
    stock_uom character varying(50),
    uom character varying(50),
    conversion_factor numeric(18,6) DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.quality_inspection_readings (
    id integer NOT NULL,
    inspection_id integer,
    specification character varying(255),
    value character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    reading_1 character varying(200),
    reading_2 character varying(200),
    reading_3 character varying(200),
    reading_4 character varying(200),
    reading_5 character varying(200),
    reading_6 character varying(200),
    reading_7 character varying(200),
    reading_8 character varying(200),
    reading_9 character varying(200),
    reading_10 character varying(200),
    acceptance_formula text,
    formula_based_criteria boolean DEFAULT false,
    min_value numeric(18,6),
    max_value numeric(18,6),
    reading_value character varying(200),
    manual_inspection boolean DEFAULT false,
    "numeric" boolean DEFAULT true,
    parameter_group character varying(200)
);

CREATE TABLE IF NOT EXISTS public.quality_inspections (
    id integer NOT NULL,
    inspection_no character varying(30) NOT NULL,
    reference_type character varying(50),
    reference_name character varying(100),
    item_code character varying(100) NOT NULL,
    inspection_type character varying(20) DEFAULT 'incoming'::character varying,
    sample_size numeric(18,6) DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    inspected_by integer,
    inspected_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    report_date date DEFAULT CURRENT_DATE,
    item_serial_no character varying(100),
    batch_no character varying(100),
    item_name character varying(200),
    description text,
    verified_by character varying(200),
    bom_no character varying(100),
    remarks text,
    quality_inspection_template character varying(100),
    manual_inspection boolean DEFAULT false,
    company character varying(200)
);

CREATE TABLE IF NOT EXISTS public.request_logs (
    id integer NOT NULL,
    method character varying(10),
    path character varying(255),
    status_code integer,
    user_id integer,
    ip_address character varying(45),
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.return_claim_photos (
    id integer NOT NULL,
    claim_id integer,
    photo_data text,
    caption character varying(255)
);

CREATE TABLE IF NOT EXISTS public.return_claims (
    id integer NOT NULL,
    claim_no character varying(30) NOT NULL,
    customer_id integer,
    sales_invoice_no character varying(100),
    reason text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_invoice_items (
    id integer NOT NULL,
    sales_invoice_id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    item_name character varying(200),
    description text,
    item_group character varying(200),
    qty numeric(18,6) DEFAULT 0 NOT NULL,
    uom character varying(50),
    stock_uom character varying(50),
    conversion_factor numeric(18,6) DEFAULT 1,
    stock_qty numeric(18,6) DEFAULT 0,
    price_list_rate numeric(18,6) DEFAULT 0,
    discount_percentage numeric(18,6) DEFAULT 0,
    discount_amount numeric(18,6) DEFAULT 0,
    rate numeric(18,6) DEFAULT 0,
    amount numeric(18,6) DEFAULT 0,
    base_rate numeric(18,6) DEFAULT 0,
    base_amount numeric(18,6) DEFAULT 0,
    net_rate numeric(18,6) DEFAULT 0,
    net_amount numeric(18,6) DEFAULT 0,
    income_account character varying(200),
    expense_account character varying(200),
    cost_center character varying(200),
    warehouse character varying(200),
    target_warehouse character varying(200),
    batch_no character varying(100),
    serial_no text,
    quality_inspection character varying(100),
    sales_order character varying(100),
    so_detail character varying(100),
    delivery_note character varying(100),
    dn_detail character varying(100),
    delivered_qty numeric(18,6) DEFAULT 0,
    weight_per_unit numeric(18,6) DEFAULT 0,
    total_weight numeric(18,6) DEFAULT 0,
    weight_uom character varying(50),
    is_free_item boolean DEFAULT false,
    page_break boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
    id integer NOT NULL,
    sales_order_id integer,
    item_code character varying(100) NOT NULL,
    qty numeric(18,6),
    rate numeric(18,6),
    warehouse character varying(255),
    delivered_qty numeric(18,6) DEFAULT 0,
    picked_qty numeric(18,6) DEFAULT 0,
    item_name character varying(200),
    uom character varying(50),
    conversion_factor numeric(18,6) DEFAULT 1,
    stock_qty numeric(18,6) DEFAULT 0,
    amount numeric(18,6) DEFAULT 0,
    delivery_date date,
    description text,
    item_group character varying(200),
    stock_uom character varying(50),
    projected_qty numeric(18,6) DEFAULT 0,
    actual_qty numeric(18,6) DEFAULT 0,
    target_warehouse character varying(200),
    blanket_order character varying(100),
    cost_center character varying(200),
    batch_no character varying(100),
    serial_no text,
    discount_percentage numeric(18,6) DEFAULT 0,
    discount_amount numeric(18,6) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.saved_kit_lines (
    id integer NOT NULL,
    kit_id integer,
    item_code character varying(100) NOT NULL,
    quantity numeric(18,6)
);

CREATE TABLE IF NOT EXISTS public.saved_kits (
    id integer NOT NULL,
    customer_id integer,
    name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduler_logs (
    id integer NOT NULL,
    job_name character varying(100),
    status character varying(20),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error text
);

CREATE TABLE IF NOT EXISTS public.seasonal_patterns (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    month integer NOT NULL,
    avg_qty numeric(18,6),
    peak_qty numeric(18,6),
    trough_qty numeric(18,6),
    seasonality_index numeric(5,2),
    calculated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT seasonal_patterns_month_check CHECK (((month >= 1) AND (month <= 12)))
);

CREATE TABLE IF NOT EXISTS public.serial_numbers (
    id integer NOT NULL,
    serial_no character varying(100) NOT NULL,
    item_code character varying(100) NOT NULL,
    warehouse character varying(255),
    status character varying(20) DEFAULT 'available'::character varying,
    purchase_receipt character varying(100),
    batch_no character varying(100),
    warranty_expiry_date date,
    created_at timestamp with time zone DEFAULT now(),
    item_name character varying(200),
    description text,
    item_group character varying(200),
    brand character varying(200),
    purchase_rate numeric(18,6) DEFAULT 0,
    customer character varying(200),
    reference_doctype character varying(100),
    reference_name character varying(100),
    posting_date date,
    company character varying(200),
    work_order character varying(100),
    location character varying(200),
    employee character varying(200),
    maintenance_status character varying(50),
    amc_expiry_date date,
    warranty_period integer
);

CREATE TABLE IF NOT EXISTS public.stock_entries (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    stock_entry_type character varying(100),
    purpose character varying(100),
    company character varying(200) NOT NULL,
    posting_date date DEFAULT CURRENT_DATE,
    posting_time time without time zone DEFAULT CURRENT_TIME,
    from_warehouse character varying(200),
    to_warehouse character varying(200),
    work_order character varying(100),
    bom_no character varying(100),
    fg_completed_qty numeric(18,6) DEFAULT 0,
    total_incoming_value numeric(18,6) DEFAULT 0,
    total_outgoing_value numeric(18,6) DEFAULT 0,
    remarks text,
    supplier character varying(200),
    status character varying(50) DEFAULT 'draft'::character varying,
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_entry_items (
    id integer NOT NULL,
    stock_entry_id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    s_warehouse character varying(200),
    t_warehouse character varying(200),
    qty numeric(18,6) DEFAULT 0 NOT NULL,
    uom character varying(50) NOT NULL,
    stock_uom character varying(50),
    conversion_factor numeric(18,6) DEFAULT 1,
    transfer_qty numeric(18,6) DEFAULT 0,
    basic_rate numeric(18,6) DEFAULT 0,
    amount numeric(18,6) DEFAULT 0,
    serial_no text,
    batch_no character varying(100),
    actual_qty numeric(18,6) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_ledger_entries (
    id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    warehouse character varying(255) NOT NULL,
    actual_qty numeric(18,6),
    qty_after_transaction numeric(18,6),
    incoming_rate numeric(18,6),
    stock_value numeric(18,2),
    voucher_type character varying(100),
    voucher_no character varying(100),
    posting_date date,
    posting_time time without time zone,
    creation timestamp with time zone DEFAULT now(),
    serial_no text,
    batch_no character varying(100),
    voucher_detail_no character varying(100),
    outgoing_rate numeric(18,6) DEFAULT 0,
    valuation_rate numeric(18,6) DEFAULT 0,
    stock_value_difference numeric(18,6) DEFAULT 0,
    stock_queue text,
    company character varying(200),
    stock_uom character varying(50),
    project character varying(100),
    fiscal_year character varying(10),
    is_cancelled boolean DEFAULT false,
    is_adjustment_entry boolean DEFAULT false,
    serial_and_batch_bundle character varying(100),
    posting_datetime timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.stock_reconciliation_items (
    id integer NOT NULL,
    stock_reconciliation_id integer NOT NULL,
    item_code character varying(100) NOT NULL,
    warehouse character varying(200) NOT NULL,
    qty numeric(18,6),
    valuation_rate numeric(18,6),
    amount numeric(18,6),
    serial_no text,
    batch_no character varying(100),
    current_qty numeric(18,6) DEFAULT 0,
    current_valuation_rate numeric(18,6) DEFAULT 0,
    current_amount numeric(18,6) DEFAULT 0,
    quantity_difference numeric(18,6) DEFAULT 0,
    amount_difference numeric(18,6) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_reconciliations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    company character varying(200) NOT NULL,
    purpose character varying(100) NOT NULL,
    posting_date date DEFAULT CURRENT_DATE,
    posting_time time without time zone DEFAULT CURRENT_TIME,
    set_warehouse character varying(200),
    expense_account character varying(200),
    cost_center character varying(200),
    difference_amount numeric(18,6) DEFAULT 0,
    status character varying(50) DEFAULT 'draft'::character varying,
    created_by integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_reservations (
    id integer NOT NULL,
    order_no character varying(100) NOT NULL,
    item_code character varying(100) NOT NULL,
    warehouse character varying(255) NOT NULL,
    reserved_qty numeric(18,6),
    delivered_qty numeric(18,6) DEFAULT 0,
    status character varying(20) DEFAULT 'reserved'::character varying,
    sales_order character varying(100),
    is_cancelled boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_performance (
    id integer NOT NULL,
    supplier_name character varying(255) NOT NULL,
    total_grn integer DEFAULT 0,
    full_match_count integer DEFAULT 0,
    shortage_count integer DEFAULT 0,
    overage_count integer DEFAULT 0,
    avg_lead_time_days numeric(5,1),
    accuracy_pct numeric(5,2),
    last_calculated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.warehouse_locations (
    id integer NOT NULL,
    code character varying(100) NOT NULL,
    warehouse_id integer NOT NULL,
    zone character varying(20),
    aisle character varying(10),
    rack character varying(10),
    bin character varying(10),
    is_occupied boolean DEFAULT false,
    current_item character varying(100),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.warehouse_metrics (
    id integer NOT NULL,
    warehouse_id integer,
    total_bins integer DEFAULT 0,
    occupied_bins integer DEFAULT 0,
    utilization_pct numeric(5,2),
    avg_dock_to_stock_hours numeric(5,1),
    pick_accuracy_pct numeric(5,2),
    last_calculated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wishlists (
    id integer NOT NULL,
    customer_id integer,
    item_code character varying(100) NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_definitions (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    entity_type character varying(50) NOT NULL,
    states jsonb NOT NULL,
    transitions jsonb NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_instances (
    id integer NOT NULL,
    workflow_id integer,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    current_state character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='attachments' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.attachments ALTER COLUMN id SET DEFAULT nextval('public.attachments_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_log' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='backorder_lines' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.backorder_lines ALTER COLUMN id SET DEFAULT nextval('public.backorder_lines_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='backorders' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.backorders ALTER COLUMN id SET DEFAULT nextval('public.backorders_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='batches' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.batches ALTER COLUMN id SET DEFAULT nextval('public.batches_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bins' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.bins ALTER COLUMN id SET DEFAULT nextval('public.bins_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='box_load_logs' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.box_load_logs ALTER COLUMN id SET DEFAULT nextval('public.box_load_logs_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.comments ALTER COLUMN id SET DEFAULT nextval('public.comments_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='currency_exchange' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.currency_exchange ALTER COLUMN id SET DEFAULT nextval('public.currency_exchange_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customer_metrics' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.customer_metrics ALTER COLUMN id SET DEFAULT nextval('public.customer_metrics_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cycle_count_lines' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.cycle_count_lines ALTER COLUMN id SET DEFAULT nextval('public.cycle_count_lines_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cycle_count_sheets' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.cycle_count_sheets ALTER COLUMN id SET DEFAULT nextval('public.cycle_count_sheets_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_note_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.delivery_note_items ALTER COLUMN id SET DEFAULT nextval('public.delivery_note_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_photos' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.delivery_photos ALTER COLUMN id SET DEFAULT nextval('public.delivery_photos_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='delivery_signatures' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.delivery_signatures ALTER COLUMN id SET DEFAULT nextval('public.delivery_signatures_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='demand_forecast' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.demand_forecast ALTER COLUMN id SET DEFAULT nextval('public.demand_forecast_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='discount_rules' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.discount_rules ALTER COLUMN id SET DEFAULT nextval('public.discount_rules_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='error_logs' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.error_logs ALTER COLUMN id SET DEFAULT nextval('public.error_logs_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='gst_invoices' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.gst_invoices ALTER COLUMN id SET DEFAULT nextval('public.gst_invoices_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='item_hierarchy_nodes' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.item_hierarchy_nodes ALTER COLUMN id SET DEFAULT nextval('public.item_hierarchy_nodes_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='item_model_fitment' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.item_model_fitment ALTER COLUMN id SET DEFAULT nextval('public.item_model_fitment_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='item_movement_classifications' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.item_movement_classifications ALTER COLUMN id SET DEFAULT nextval('public.item_movement_classifications_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='item_variants' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.item_variants ALTER COLUMN id SET DEFAULT nextval('public.item_variants_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entries' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.journal_entries ALTER COLUMN id SET DEFAULT nextval('public.journal_entries_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='journal_entry_accounts' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.journal_entry_accounts ALTER COLUMN id SET DEFAULT nextval('public.journal_entry_accounts_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manual_pick_records' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.manual_pick_records ALTER COLUMN id SET DEFAULT nextval('public.manual_pick_records_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='material_request_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.material_request_items ALTER COLUMN id SET DEFAULT nextval('public.material_request_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='material_requests' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.material_requests ALTER COLUMN id SET DEFAULT nextval('public.material_requests_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.notifications ALTER COLUMN id SET DEFAULT nextval('public.notifications_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='order_fulfillment_log' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.order_fulfillment_log ALTER COLUMN id SET DEFAULT nextval('public.order_fulfillment_log_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='order_status_logs' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.order_status_logs ALTER COLUMN id SET DEFAULT nextval('public.order_status_logs_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='order_template_lines' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.order_template_lines ALTER COLUMN id SET DEFAULT nextval('public.order_template_lines_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='order_templates' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.order_templates ALTER COLUMN id SET DEFAULT nextval('public.order_templates_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pack_reversals' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.pack_reversals ALTER COLUMN id SET DEFAULT nextval('public.pack_reversals_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='packing_slip_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.packing_slip_items ALTER COLUMN id SET DEFAULT nextval('public.packing_slip_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='payment_entries' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.payment_entries ALTER COLUMN id SET DEFAULT nextval('public.payment_entries_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pick_scan_logs' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.pick_scan_logs ALTER COLUMN id SET DEFAULT nextval('public.pick_scan_logs_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='price_observations' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.price_observations ALTER COLUMN id SET DEFAULT nextval('public.price_observations_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchase_invoice_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.purchase_invoice_items ALTER COLUMN id SET DEFAULT nextval('public.purchase_invoice_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='putaway_logs' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.putaway_logs ALTER COLUMN id SET DEFAULT nextval('public.putaway_logs_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='putaway_rules' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.putaway_rules ALTER COLUMN id SET DEFAULT nextval('public.putaway_rules_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quality_inspection_readings' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.quality_inspection_readings ALTER COLUMN id SET DEFAULT nextval('public.quality_inspection_readings_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quality_inspections' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.quality_inspections ALTER COLUMN id SET DEFAULT nextval('public.quality_inspections_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='request_logs' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.request_logs ALTER COLUMN id SET DEFAULT nextval('public.request_logs_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='return_claim_photos' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.return_claim_photos ALTER COLUMN id SET DEFAULT nextval('public.return_claim_photos_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='return_claims' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.return_claims ALTER COLUMN id SET DEFAULT nextval('public.return_claims_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_invoice_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.sales_invoice_items ALTER COLUMN id SET DEFAULT nextval('public.sales_invoice_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_order_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.sales_order_items ALTER COLUMN id SET DEFAULT nextval('public.sales_order_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_kit_lines' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.saved_kit_lines ALTER COLUMN id SET DEFAULT nextval('public.saved_kit_lines_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='saved_kits' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.saved_kits ALTER COLUMN id SET DEFAULT nextval('public.saved_kits_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='scheduler_logs' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.scheduler_logs ALTER COLUMN id SET DEFAULT nextval('public.scheduler_logs_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='seasonal_patterns' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.seasonal_patterns ALTER COLUMN id SET DEFAULT nextval('public.seasonal_patterns_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='serial_numbers' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.serial_numbers ALTER COLUMN id SET DEFAULT nextval('public.serial_numbers_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_entries' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.stock_entries ALTER COLUMN id SET DEFAULT nextval('public.stock_entries_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_entry_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.stock_entry_items ALTER COLUMN id SET DEFAULT nextval('public.stock_entry_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_ledger_entries' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.stock_ledger_entries ALTER COLUMN id SET DEFAULT nextval('public.stock_ledger_entries_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_reconciliation_items' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.stock_reconciliation_items ALTER COLUMN id SET DEFAULT nextval('public.stock_reconciliation_items_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_reconciliations' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.stock_reconciliations ALTER COLUMN id SET DEFAULT nextval('public.stock_reconciliations_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_reservations' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.stock_reservations ALTER COLUMN id SET DEFAULT nextval('public.stock_reservations_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier_performance' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.supplier_performance ALTER COLUMN id SET DEFAULT nextval('public.supplier_performance_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='warehouse_locations' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.warehouse_locations ALTER COLUMN id SET DEFAULT nextval('public.warehouse_locations_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='warehouse_metrics' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.warehouse_metrics ALTER COLUMN id SET DEFAULT nextval('public.warehouse_metrics_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='wishlists' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.wishlists ALTER COLUMN id SET DEFAULT nextval('public.wishlists_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_definitions' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.workflow_definitions ALTER COLUMN id SET DEFAULT nextval('public.workflow_definitions_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workflow_instances' AND column_name='id' AND column_default IS NOT NULL) THEN
    ALTER TABLE ONLY public.workflow_instances ALTER COLUMN id SET DEFAULT nextval('public.workflow_instances_id_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_pkey' AND conrelid = 'public.attachments'::regclass) THEN
    ALTER TABLE public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_pkey' AND conrelid = 'public.audit_log'::regclass) THEN
    ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backorder_lines_pkey' AND conrelid = 'public.backorder_lines'::regclass) THEN
    ALTER TABLE public.backorder_lines
    ADD CONSTRAINT backorder_lines_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backorders_backorder_no_key' AND conrelid = 'public.backorders'::regclass) THEN
    ALTER TABLE public.backorders
    ADD CONSTRAINT backorders_backorder_no_key UNIQUE (backorder_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backorders_pkey' AND conrelid = 'public.backorders'::regclass) THEN
    ALTER TABLE public.backorders
    ADD CONSTRAINT backorders_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backorders_sales_order_no_key' AND conrelid = 'public.backorders'::regclass) THEN
    ALTER TABLE public.backorders
    ADD CONSTRAINT backorders_sales_order_no_key UNIQUE (sales_order_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_batch_id_key' AND conrelid = 'public.batches'::regclass) THEN
    ALTER TABLE public.batches
    ADD CONSTRAINT batches_batch_id_key UNIQUE (batch_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_pkey' AND conrelid = 'public.batches'::regclass) THEN
    ALTER TABLE public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bins_item_code_warehouse_key' AND conrelid = 'public.bins'::regclass) THEN
    ALTER TABLE public.bins
    ADD CONSTRAINT bins_item_code_warehouse_key UNIQUE (item_code, warehouse);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bins_pkey' AND conrelid = 'public.bins'::regclass) THEN
    ALTER TABLE public.bins
    ADD CONSTRAINT bins_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_load_logs_pkey' AND conrelid = 'public.box_load_logs'::regclass) THEN
    ALTER TABLE public.box_load_logs
    ADD CONSTRAINT box_load_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_pkey' AND conrelid = 'public.comments'::regclass) THEN
    ALTER TABLE public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'currency_exchange_pkey' AND conrelid = 'public.currency_exchange'::regclass) THEN
    ALTER TABLE public.currency_exchange
    ADD CONSTRAINT currency_exchange_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_metrics_pkey' AND conrelid = 'public.customer_metrics'::regclass) THEN
    ALTER TABLE public.customer_metrics
    ADD CONSTRAINT customer_metrics_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_count_lines_pkey' AND conrelid = 'public.cycle_count_lines'::regclass) THEN
    ALTER TABLE public.cycle_count_lines
    ADD CONSTRAINT cycle_count_lines_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_count_sheets_pkey' AND conrelid = 'public.cycle_count_sheets'::regclass) THEN
    ALTER TABLE public.cycle_count_sheets
    ADD CONSTRAINT cycle_count_sheets_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_count_sheets_sheet_no_key' AND conrelid = 'public.cycle_count_sheets'::regclass) THEN
    ALTER TABLE public.cycle_count_sheets
    ADD CONSTRAINT cycle_count_sheets_sheet_no_key UNIQUE (sheet_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_note_items_pkey' AND conrelid = 'public.delivery_note_items'::regclass) THEN
    ALTER TABLE public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_photos_pkey' AND conrelid = 'public.delivery_photos'::regclass) THEN
    ALTER TABLE public.delivery_photos
    ADD CONSTRAINT delivery_photos_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_signatures_pkey' AND conrelid = 'public.delivery_signatures'::regclass) THEN
    ALTER TABLE public.delivery_signatures
    ADD CONSTRAINT delivery_signatures_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demand_forecast_item_code_warehouse_forecast_date_key' AND conrelid = 'public.demand_forecast'::regclass) THEN
    ALTER TABLE public.demand_forecast
    ADD CONSTRAINT demand_forecast_item_code_warehouse_forecast_date_key UNIQUE (item_code, warehouse, forecast_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demand_forecast_pkey' AND conrelid = 'public.demand_forecast'::regclass) THEN
    ALTER TABLE public.demand_forecast
    ADD CONSTRAINT demand_forecast_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_rules_pkey' AND conrelid = 'public.discount_rules'::regclass) THEN
    ALTER TABLE public.discount_rules
    ADD CONSTRAINT discount_rules_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'error_logs_pkey' AND conrelid = 'public.error_logs'::regclass) THEN
    ALTER TABLE public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_invoices_invoice_no_key' AND conrelid = 'public.gst_invoices'::regclass) THEN
    ALTER TABLE public.gst_invoices
    ADD CONSTRAINT gst_invoices_invoice_no_key UNIQUE (invoice_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gst_invoices_pkey' AND conrelid = 'public.gst_invoices'::regclass) THEN
    ALTER TABLE public.gst_invoices
    ADD CONSTRAINT gst_invoices_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_hierarchy_nodes_name_key' AND conrelid = 'public.item_hierarchy_nodes'::regclass) THEN
    ALTER TABLE public.item_hierarchy_nodes
    ADD CONSTRAINT item_hierarchy_nodes_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_hierarchy_nodes_pkey' AND conrelid = 'public.item_hierarchy_nodes'::regclass) THEN
    ALTER TABLE public.item_hierarchy_nodes
    ADD CONSTRAINT item_hierarchy_nodes_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_model_fitment_item_id_model_id_key' AND conrelid = 'public.item_model_fitment'::regclass) THEN
    ALTER TABLE public.item_model_fitment
    ADD CONSTRAINT item_model_fitment_item_id_model_id_key UNIQUE (item_id, model_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_model_fitment_pkey' AND conrelid = 'public.item_model_fitment'::regclass) THEN
    ALTER TABLE public.item_model_fitment
    ADD CONSTRAINT item_model_fitment_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_movement_classifications_item_code_key' AND conrelid = 'public.item_movement_classifications'::regclass) THEN
    ALTER TABLE public.item_movement_classifications
    ADD CONSTRAINT item_movement_classifications_item_code_key UNIQUE (item_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_movement_classifications_pkey' AND conrelid = 'public.item_movement_classifications'::regclass) THEN
    ALTER TABLE public.item_movement_classifications
    ADD CONSTRAINT item_movement_classifications_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_variants_item_code_key' AND conrelid = 'public.item_variants'::regclass) THEN
    ALTER TABLE public.item_variants
    ADD CONSTRAINT item_variants_item_code_key UNIQUE (item_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_variants_pkey' AND conrelid = 'public.item_variants'::regclass) THEN
    ALTER TABLE public.item_variants
    ADD CONSTRAINT item_variants_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_name_key' AND conrelid = 'public.journal_entries'::regclass) THEN
    ALTER TABLE public.journal_entries
    ADD CONSTRAINT journal_entries_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_pkey' AND conrelid = 'public.journal_entries'::regclass) THEN
    ALTER TABLE public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_accounts_pkey' AND conrelid = 'public.journal_entry_accounts'::regclass) THEN
    ALTER TABLE public.journal_entry_accounts
    ADD CONSTRAINT journal_entry_accounts_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_pick_records_log_no_key' AND conrelid = 'public.manual_pick_records'::regclass) THEN
    ALTER TABLE public.manual_pick_records
    ADD CONSTRAINT manual_pick_records_log_no_key UNIQUE (log_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_pick_records_pkey' AND conrelid = 'public.manual_pick_records'::regclass) THEN
    ALTER TABLE public.manual_pick_records
    ADD CONSTRAINT manual_pick_records_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_request_items_pkey' AND conrelid = 'public.material_request_items'::regclass) THEN
    ALTER TABLE public.material_request_items
    ADD CONSTRAINT material_request_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_requests_name_key' AND conrelid = 'public.material_requests'::regclass) THEN
    ALTER TABLE public.material_requests
    ADD CONSTRAINT material_requests_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_requests_pkey' AND conrelid = 'public.material_requests'::regclass) THEN
    ALTER TABLE public.material_requests
    ADD CONSTRAINT material_requests_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_pkey' AND conrelid = 'public.notifications'::regclass) THEN
    ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_fulfillment_log_pkey' AND conrelid = 'public.order_fulfillment_log'::regclass) THEN
    ALTER TABLE public.order_fulfillment_log
    ADD CONSTRAINT order_fulfillment_log_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_fulfillment_log_sales_order_no_key' AND conrelid = 'public.order_fulfillment_log'::regclass) THEN
    ALTER TABLE public.order_fulfillment_log
    ADD CONSTRAINT order_fulfillment_log_sales_order_no_key UNIQUE (sales_order_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_logs_pkey' AND conrelid = 'public.order_status_logs'::regclass) THEN
    ALTER TABLE public.order_status_logs
    ADD CONSTRAINT order_status_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_template_lines_pkey' AND conrelid = 'public.order_template_lines'::regclass) THEN
    ALTER TABLE public.order_template_lines
    ADD CONSTRAINT order_template_lines_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_templates_pkey' AND conrelid = 'public.order_templates'::regclass) THEN
    ALTER TABLE public.order_templates
    ADD CONSTRAINT order_templates_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pack_reversals_pkey' AND conrelid = 'public.pack_reversals'::regclass) THEN
    ALTER TABLE public.pack_reversals
    ADD CONSTRAINT pack_reversals_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_slip_items_pkey' AND conrelid = 'public.packing_slip_items'::regclass) THEN
    ALTER TABLE public.packing_slip_items
    ADD CONSTRAINT packing_slip_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_entries_name_key' AND conrelid = 'public.payment_entries'::regclass) THEN
    ALTER TABLE public.payment_entries
    ADD CONSTRAINT payment_entries_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_entries_pkey' AND conrelid = 'public.payment_entries'::regclass) THEN
    ALTER TABLE public.payment_entries
    ADD CONSTRAINT payment_entries_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_scan_logs_log_no_key' AND conrelid = 'public.pick_scan_logs'::regclass) THEN
    ALTER TABLE public.pick_scan_logs
    ADD CONSTRAINT pick_scan_logs_log_no_key UNIQUE (log_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_scan_logs_pkey' AND conrelid = 'public.pick_scan_logs'::regclass) THEN
    ALTER TABLE public.pick_scan_logs
    ADD CONSTRAINT pick_scan_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_observations_pkey' AND conrelid = 'public.price_observations'::regclass) THEN
    ALTER TABLE public.price_observations
    ADD CONSTRAINT price_observations_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoice_items_pkey' AND conrelid = 'public.purchase_invoice_items'::regclass) THEN
    ALTER TABLE public.purchase_invoice_items
    ADD CONSTRAINT purchase_invoice_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'putaway_logs_log_no_key' AND conrelid = 'public.putaway_logs'::regclass) THEN
    ALTER TABLE public.putaway_logs
    ADD CONSTRAINT putaway_logs_log_no_key UNIQUE (log_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'putaway_logs_pkey' AND conrelid = 'public.putaway_logs'::regclass) THEN
    ALTER TABLE public.putaway_logs
    ADD CONSTRAINT putaway_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'putaway_rules_pkey' AND conrelid = 'public.putaway_rules'::regclass) THEN
    ALTER TABLE public.putaway_rules
    ADD CONSTRAINT putaway_rules_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_inspection_readings_pkey' AND conrelid = 'public.quality_inspection_readings'::regclass) THEN
    ALTER TABLE public.quality_inspection_readings
    ADD CONSTRAINT quality_inspection_readings_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_inspections_inspection_no_key' AND conrelid = 'public.quality_inspections'::regclass) THEN
    ALTER TABLE public.quality_inspections
    ADD CONSTRAINT quality_inspections_inspection_no_key UNIQUE (inspection_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_inspections_pkey' AND conrelid = 'public.quality_inspections'::regclass) THEN
    ALTER TABLE public.quality_inspections
    ADD CONSTRAINT quality_inspections_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_logs_pkey' AND conrelid = 'public.request_logs'::regclass) THEN
    ALTER TABLE public.request_logs
    ADD CONSTRAINT request_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_claim_photos_pkey' AND conrelid = 'public.return_claim_photos'::regclass) THEN
    ALTER TABLE public.return_claim_photos
    ADD CONSTRAINT return_claim_photos_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_claims_claim_no_key' AND conrelid = 'public.return_claims'::regclass) THEN
    ALTER TABLE public.return_claims
    ADD CONSTRAINT return_claims_claim_no_key UNIQUE (claim_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_claims_pkey' AND conrelid = 'public.return_claims'::regclass) THEN
    ALTER TABLE public.return_claims
    ADD CONSTRAINT return_claims_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoice_items_pkey' AND conrelid = 'public.sales_invoice_items'::regclass) THEN
    ALTER TABLE public.sales_invoice_items
    ADD CONSTRAINT sales_invoice_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_items_pkey' AND conrelid = 'public.sales_order_items'::regclass) THEN
    ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_kit_lines_pkey' AND conrelid = 'public.saved_kit_lines'::regclass) THEN
    ALTER TABLE public.saved_kit_lines
    ADD CONSTRAINT saved_kit_lines_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_kits_pkey' AND conrelid = 'public.saved_kits'::regclass) THEN
    ALTER TABLE public.saved_kits
    ADD CONSTRAINT saved_kits_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scheduler_logs_pkey' AND conrelid = 'public.scheduler_logs'::regclass) THEN
    ALTER TABLE public.scheduler_logs
    ADD CONSTRAINT scheduler_logs_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasonal_patterns_item_code_month_key' AND conrelid = 'public.seasonal_patterns'::regclass) THEN
    ALTER TABLE public.seasonal_patterns
    ADD CONSTRAINT seasonal_patterns_item_code_month_key UNIQUE (item_code, month);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seasonal_patterns_pkey' AND conrelid = 'public.seasonal_patterns'::regclass) THEN
    ALTER TABLE public.seasonal_patterns
    ADD CONSTRAINT seasonal_patterns_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'serial_numbers_pkey' AND conrelid = 'public.serial_numbers'::regclass) THEN
    ALTER TABLE public.serial_numbers
    ADD CONSTRAINT serial_numbers_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'serial_numbers_serial_no_key' AND conrelid = 'public.serial_numbers'::regclass) THEN
    ALTER TABLE public.serial_numbers
    ADD CONSTRAINT serial_numbers_serial_no_key UNIQUE (serial_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_entries_name_key' AND conrelid = 'public.stock_entries'::regclass) THEN
    ALTER TABLE public.stock_entries
    ADD CONSTRAINT stock_entries_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_entries_pkey' AND conrelid = 'public.stock_entries'::regclass) THEN
    ALTER TABLE public.stock_entries
    ADD CONSTRAINT stock_entries_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_entry_items_pkey' AND conrelid = 'public.stock_entry_items'::regclass) THEN
    ALTER TABLE public.stock_entry_items
    ADD CONSTRAINT stock_entry_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_ledger_entries_pkey' AND conrelid = 'public.stock_ledger_entries'::regclass) THEN
    ALTER TABLE public.stock_ledger_entries
    ADD CONSTRAINT stock_ledger_entries_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reconciliation_items_pkey' AND conrelid = 'public.stock_reconciliation_items'::regclass) THEN
    ALTER TABLE public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reconciliations_name_key' AND conrelid = 'public.stock_reconciliations'::regclass) THEN
    ALTER TABLE public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reconciliations_pkey' AND conrelid = 'public.stock_reconciliations'::regclass) THEN
    ALTER TABLE public.stock_reconciliations
    ADD CONSTRAINT stock_reconciliations_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reservations_pkey' AND conrelid = 'public.stock_reservations'::regclass) THEN
    ALTER TABLE public.stock_reservations
    ADD CONSTRAINT stock_reservations_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplier_performance_pkey' AND conrelid = 'public.supplier_performance'::regclass) THEN
    ALTER TABLE public.supplier_performance
    ADD CONSTRAINT supplier_performance_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_locations_code_key' AND conrelid = 'public.warehouse_locations'::regclass) THEN
    ALTER TABLE public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_code_key UNIQUE (code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_locations_pkey' AND conrelid = 'public.warehouse_locations'::regclass) THEN
    ALTER TABLE public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_metrics_pkey' AND conrelid = 'public.warehouse_metrics'::regclass) THEN
    ALTER TABLE public.warehouse_metrics
    ADD CONSTRAINT warehouse_metrics_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlists_pkey' AND conrelid = 'public.wishlists'::regclass) THEN
    ALTER TABLE public.wishlists
    ADD CONSTRAINT wishlists_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_definitions_name_key' AND conrelid = 'public.workflow_definitions'::regclass) THEN
    ALTER TABLE public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_name_key UNIQUE (name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_definitions_pkey' AND conrelid = 'public.workflow_definitions'::regclass) THEN
    ALTER TABLE public.workflow_definitions
    ADD CONSTRAINT workflow_definitions_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_instances_pkey' AND conrelid = 'public.workflow_instances'::regclass) THEN
    ALTER TABLE public.workflow_instances
    ADD CONSTRAINT workflow_instances_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON public.attachments USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log USING btree (actor_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_backorders_status ON public.backorders USING btree (status);

CREATE INDEX IF NOT EXISTS idx_bins_actual_qty ON public.bins USING btree (actual_qty);

CREATE INDEX IF NOT EXISTS idx_bins_item_warehouse ON public.bins USING btree (item_code, warehouse);

CREATE INDEX IF NOT EXISTS idx_comments_entity ON public.comments USING btree (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_customer_metrics_customer ON public.customer_metrics USING btree (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_metrics_ranking ON public.customer_metrics USING btree (ranking);

CREATE INDEX IF NOT EXISTS idx_cycle_count_sheets_status ON public.cycle_count_sheets USING btree (status);

CREATE INDEX IF NOT EXISTS idx_demand_forecast_date ON public.demand_forecast USING btree (forecast_date);

CREATE INDEX IF NOT EXISTS idx_demand_forecast_item ON public.demand_forecast USING btree (item_code);

CREATE INDEX IF NOT EXISTS idx_item_movement_classification ON public.item_movement_classifications USING btree (classification);

CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications USING btree (is_read);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_order_fulfillment_status ON public.order_fulfillment_log USING btree (status);

CREATE INDEX IF NOT EXISTS idx_pick_scan_logs_picklist ON public.pick_scan_logs USING btree (pick_list_id);

CREATE INDEX IF NOT EXISTS idx_putaway_rules_item ON public.putaway_rules USING btree (item_code);

CREATE INDEX IF NOT EXISTS idx_putaway_rules_priority ON public.putaway_rules USING btree (item_code, priority);

CREATE INDEX IF NOT EXISTS idx_qi_reference ON public.quality_inspections USING btree (reference_type, reference_name);

CREATE INDEX IF NOT EXISTS idx_request_logs_created ON public.request_logs USING btree (created_at);

CREATE INDEX IF NOT EXISTS idx_seasonal_patterns_item ON public.seasonal_patterns USING btree (item_code);

CREATE INDEX IF NOT EXISTS idx_serial_item ON public.serial_numbers USING btree (item_code);

CREATE INDEX IF NOT EXISTS idx_serial_status ON public.serial_numbers USING btree (status);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_date ON public.stock_ledger_entries USING btree (posting_date);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON public.stock_ledger_entries USING btree (item_code);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_warehouse ON public.stock_ledger_entries USING btree (warehouse);

CREATE INDEX IF NOT EXISTS idx_supplier_performance_supplier ON public.supplier_performance USING btree (supplier_name);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity ON public.workflow_instances USING btree (entity_type, entity_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_uploaded_by_fkey' AND conrelid = 'public.attachments'::regclass) THEN
    ALTER TABLE public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_actor_id_fkey' AND conrelid = 'public.audit_log'::regclass) THEN
    ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backorder_lines_backorder_id_fkey' AND conrelid = 'public.backorder_lines'::regclass) THEN
    ALTER TABLE public.backorder_lines
    ADD CONSTRAINT backorder_lines_backorder_id_fkey FOREIGN KEY (backorder_id) REFERENCES public.backorders(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'batches_parent_batch_id_fkey' AND conrelid = 'public.batches'::regclass) THEN
    ALTER TABLE public.batches
    ADD CONSTRAINT batches_parent_batch_id_fkey FOREIGN KEY (parent_batch_id) REFERENCES public.batches(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_load_logs_box_id_fkey' AND conrelid = 'public.box_load_logs'::regclass) THEN
    ALTER TABLE public.box_load_logs
    ADD CONSTRAINT box_load_logs_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_load_logs_loaded_by_fkey' AND conrelid = 'public.box_load_logs'::regclass) THEN
    ALTER TABLE public.box_load_logs
    ADD CONSTRAINT box_load_logs_loaded_by_fkey FOREIGN KEY (loaded_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_load_logs_stop_id_fkey' AND conrelid = 'public.box_load_logs'::regclass) THEN
    ALTER TABLE public.box_load_logs
    ADD CONSTRAINT box_load_logs_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.delivery_stops(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'box_load_logs_trip_id_fkey' AND conrelid = 'public.box_load_logs'::regclass) THEN
    ALTER TABLE public.box_load_logs
    ADD CONSTRAINT box_load_logs_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.delivery_trips(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_user_id_fkey' AND conrelid = 'public.comments'::regclass) THEN
    ALTER TABLE public.comments
    ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_metrics_customer_id_fkey' AND conrelid = 'public.customer_metrics'::regclass) THEN
    ALTER TABLE public.customer_metrics
    ADD CONSTRAINT customer_metrics_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_count_lines_counted_by_fkey' AND conrelid = 'public.cycle_count_lines'::regclass) THEN
    ALTER TABLE public.cycle_count_lines
    ADD CONSTRAINT cycle_count_lines_counted_by_fkey FOREIGN KEY (counted_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_count_lines_sheet_id_fkey' AND conrelid = 'public.cycle_count_lines'::regclass) THEN
    ALTER TABLE public.cycle_count_lines
    ADD CONSTRAINT cycle_count_lines_sheet_id_fkey FOREIGN KEY (sheet_id) REFERENCES public.cycle_count_sheets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_count_sheets_warehouse_id_fkey' AND conrelid = 'public.cycle_count_sheets'::regclass) THEN
    ALTER TABLE public.cycle_count_sheets
    ADD CONSTRAINT cycle_count_sheets_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_note_items_delivery_note_id_fkey' AND conrelid = 'public.delivery_note_items'::regclass) THEN
    ALTER TABLE public.delivery_note_items
    ADD CONSTRAINT delivery_note_items_delivery_note_id_fkey FOREIGN KEY (delivery_note_id) REFERENCES public.delivery_notes(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_photos_captured_by_fkey' AND conrelid = 'public.delivery_photos'::regclass) THEN
    ALTER TABLE public.delivery_photos
    ADD CONSTRAINT delivery_photos_captured_by_fkey FOREIGN KEY (captured_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_photos_stop_id_fkey' AND conrelid = 'public.delivery_photos'::regclass) THEN
    ALTER TABLE public.delivery_photos
    ADD CONSTRAINT delivery_photos_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.delivery_stops(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_signatures_captured_by_fkey' AND conrelid = 'public.delivery_signatures'::regclass) THEN
    ALTER TABLE public.delivery_signatures
    ADD CONSTRAINT delivery_signatures_captured_by_fkey FOREIGN KEY (captured_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_signatures_stop_id_fkey' AND conrelid = 'public.delivery_signatures'::regclass) THEN
    ALTER TABLE public.delivery_signatures
    ADD CONSTRAINT delivery_signatures_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.delivery_stops(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_hierarchy_nodes_parent_id_fkey' AND conrelid = 'public.item_hierarchy_nodes'::regclass) THEN
    ALTER TABLE public.item_hierarchy_nodes
    ADD CONSTRAINT item_hierarchy_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.item_hierarchy_nodes(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_model_fitment_item_id_fkey' AND conrelid = 'public.item_model_fitment'::regclass) THEN
    ALTER TABLE public.item_model_fitment
    ADD CONSTRAINT item_model_fitment_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_model_fitment_model_id_fkey' AND conrelid = 'public.item_model_fitment'::regclass) THEN
    ALTER TABLE public.item_model_fitment
    ADD CONSTRAINT item_model_fitment_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.motorcycle_models(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entry_accounts_journal_entry_id_fkey' AND conrelid = 'public.journal_entry_accounts'::regclass) THEN
    ALTER TABLE public.journal_entry_accounts
    ADD CONSTRAINT journal_entry_accounts_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manual_pick_records_pick_list_id_fkey' AND conrelid = 'public.manual_pick_records'::regclass) THEN
    ALTER TABLE public.manual_pick_records
    ADD CONSTRAINT manual_pick_records_pick_list_id_fkey FOREIGN KEY (pick_list_id) REFERENCES public.pick_lists(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_request_items_request_id_fkey' AND conrelid = 'public.material_request_items'::regclass) THEN
    ALTER TABLE public.material_request_items
    ADD CONSTRAINT material_request_items_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.material_requests(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fkey' AND conrelid = 'public.notifications'::regclass) THEN
    ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_logs_actor_id_fkey' AND conrelid = 'public.order_status_logs'::regclass) THEN
    ALTER TABLE public.order_status_logs
    ADD CONSTRAINT order_status_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_template_lines_template_id_fkey' AND conrelid = 'public.order_template_lines'::regclass) THEN
    ALTER TABLE public.order_template_lines
    ADD CONSTRAINT order_template_lines_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.order_templates(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_templates_customer_id_fkey' AND conrelid = 'public.order_templates'::regclass) THEN
    ALTER TABLE public.order_templates
    ADD CONSTRAINT order_templates_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pack_reversals_box_id_fkey' AND conrelid = 'public.pack_reversals'::regclass) THEN
    ALTER TABLE public.pack_reversals
    ADD CONSTRAINT pack_reversals_box_id_fkey FOREIGN KEY (box_id) REFERENCES public.boxes(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pack_reversals_box_item_id_fkey' AND conrelid = 'public.pack_reversals'::regclass) THEN
    ALTER TABLE public.pack_reversals
    ADD CONSTRAINT pack_reversals_box_item_id_fkey FOREIGN KEY (box_item_id) REFERENCES public.box_items(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pack_reversals_reversed_by_fkey' AND conrelid = 'public.pack_reversals'::regclass) THEN
    ALTER TABLE public.pack_reversals
    ADD CONSTRAINT pack_reversals_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packing_slip_items_packing_slip_id_fkey' AND conrelid = 'public.packing_slip_items'::regclass) THEN
    ALTER TABLE public.packing_slip_items
    ADD CONSTRAINT packing_slip_items_packing_slip_id_fkey FOREIGN KEY (packing_slip_id) REFERENCES public.packing_slips(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_scan_logs_pick_list_id_fkey' AND conrelid = 'public.pick_scan_logs'::regclass) THEN
    ALTER TABLE public.pick_scan_logs
    ADD CONSTRAINT pick_scan_logs_pick_list_id_fkey FOREIGN KEY (pick_list_id) REFERENCES public.pick_lists(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_scan_logs_pick_list_item_id_fkey' AND conrelid = 'public.pick_scan_logs'::regclass) THEN
    ALTER TABLE public.pick_scan_logs
    ADD CONSTRAINT pick_scan_logs_pick_list_item_id_fkey FOREIGN KEY (pick_list_item_id) REFERENCES public.pick_list_items(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pick_scan_logs_scanned_by_fkey' AND conrelid = 'public.pick_scan_logs'::regclass) THEN
    ALTER TABLE public.pick_scan_logs
    ADD CONSTRAINT pick_scan_logs_scanned_by_fkey FOREIGN KEY (scanned_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoice_items_purchase_invoice_id_fkey' AND conrelid = 'public.purchase_invoice_items'::regclass) THEN
    ALTER TABLE public.purchase_invoice_items
    ADD CONSTRAINT purchase_invoice_items_purchase_invoice_id_fkey FOREIGN KEY (purchase_invoice_id) REFERENCES public.purchase_invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'putaway_logs_grn_line_id_fkey' AND conrelid = 'public.putaway_logs'::regclass) THEN
    ALTER TABLE public.putaway_logs
    ADD CONSTRAINT putaway_logs_grn_line_id_fkey FOREIGN KEY (grn_line_id) REFERENCES public.grn_lines(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'putaway_logs_placed_by_fkey' AND conrelid = 'public.putaway_logs'::regclass) THEN
    ALTER TABLE public.putaway_logs
    ADD CONSTRAINT putaway_logs_placed_by_fkey FOREIGN KEY (placed_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_inspection_readings_inspection_id_fkey' AND conrelid = 'public.quality_inspection_readings'::regclass) THEN
    ALTER TABLE public.quality_inspection_readings
    ADD CONSTRAINT quality_inspection_readings_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.quality_inspections(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quality_inspections_inspected_by_fkey' AND conrelid = 'public.quality_inspections'::regclass) THEN
    ALTER TABLE public.quality_inspections
    ADD CONSTRAINT quality_inspections_inspected_by_fkey FOREIGN KEY (inspected_by) REFERENCES public.users(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_claim_photos_claim_id_fkey' AND conrelid = 'public.return_claim_photos'::regclass) THEN
    ALTER TABLE public.return_claim_photos
    ADD CONSTRAINT return_claim_photos_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.return_claims(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'return_claims_customer_id_fkey' AND conrelid = 'public.return_claims'::regclass) THEN
    ALTER TABLE public.return_claims
    ADD CONSTRAINT return_claims_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoice_items_sales_invoice_id_fkey' AND conrelid = 'public.sales_invoice_items'::regclass) THEN
    ALTER TABLE public.sales_invoice_items
    ADD CONSTRAINT sales_invoice_items_sales_invoice_id_fkey FOREIGN KEY (sales_invoice_id) REFERENCES public.sales_invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_items_sales_order_id_fkey' AND conrelid = 'public.sales_order_items'::regclass) THEN
    ALTER TABLE public.sales_order_items
    ADD CONSTRAINT sales_order_items_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_kit_lines_kit_id_fkey' AND conrelid = 'public.saved_kit_lines'::regclass) THEN
    ALTER TABLE public.saved_kit_lines
    ADD CONSTRAINT saved_kit_lines_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES public.saved_kits(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_kits_customer_id_fkey' AND conrelid = 'public.saved_kits'::regclass) THEN
    ALTER TABLE public.saved_kits
    ADD CONSTRAINT saved_kits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_entry_items_stock_entry_id_fkey' AND conrelid = 'public.stock_entry_items'::regclass) THEN
    ALTER TABLE public.stock_entry_items
    ADD CONSTRAINT stock_entry_items_stock_entry_id_fkey FOREIGN KEY (stock_entry_id) REFERENCES public.stock_entries(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reconciliation_items_stock_reconciliation_id_fkey' AND conrelid = 'public.stock_reconciliation_items'::regclass) THEN
    ALTER TABLE public.stock_reconciliation_items
    ADD CONSTRAINT stock_reconciliation_items_stock_reconciliation_id_fkey FOREIGN KEY (stock_reconciliation_id) REFERENCES public.stock_reconciliations(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_locations_warehouse_id_fkey' AND conrelid = 'public.warehouse_locations'::regclass) THEN
    ALTER TABLE public.warehouse_locations
    ADD CONSTRAINT warehouse_locations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_metrics_warehouse_id_fkey' AND conrelid = 'public.warehouse_metrics'::regclass) THEN
    ALTER TABLE public.warehouse_metrics
    ADD CONSTRAINT warehouse_metrics_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlists_customer_id_fkey' AND conrelid = 'public.wishlists'::regclass) THEN
    ALTER TABLE public.wishlists
    ADD CONSTRAINT wishlists_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_instances_workflow_id_fkey' AND conrelid = 'public.workflow_instances'::regclass) THEN
    ALTER TABLE public.workflow_instances
    ADD CONSTRAINT workflow_instances_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflow_definitions(id);
  END IF;
END $$;

ALTER TABLE public.attachments OWNER TO gowms;

ALTER TABLE public.audit_log OWNER TO gowms;

ALTER TABLE public.backorder_lines OWNER TO gowms;

ALTER TABLE public.backorders OWNER TO gowms;

ALTER TABLE public.batches OWNER TO gowms;

ALTER TABLE public.bins OWNER TO gowms;

ALTER TABLE public.box_load_logs OWNER TO gowms;

ALTER TABLE public.comments OWNER TO gowms;

ALTER TABLE public.currency_exchange OWNER TO gowms;

ALTER TABLE public.customer_metrics OWNER TO gowms;

ALTER TABLE public.cycle_count_lines OWNER TO gowms;

ALTER TABLE public.cycle_count_sheets OWNER TO gowms;

ALTER TABLE public.delivery_note_items OWNER TO gowms;

ALTER TABLE public.delivery_photos OWNER TO gowms;

ALTER TABLE public.delivery_signatures OWNER TO gowms;

ALTER TABLE public.demand_forecast OWNER TO gowms;

ALTER TABLE public.discount_rules OWNER TO gowms;

ALTER TABLE public.error_logs OWNER TO gowms;

ALTER TABLE public.gst_invoices OWNER TO gowms;

ALTER TABLE public.item_hierarchy_nodes OWNER TO gowms;

ALTER TABLE public.item_model_fitment OWNER TO gowms;

ALTER TABLE public.item_movement_classifications OWNER TO gowms;

ALTER TABLE public.item_variants OWNER TO gowms;

ALTER TABLE public.journal_entries OWNER TO gowms;

ALTER TABLE public.journal_entry_accounts OWNER TO gowms;

ALTER TABLE public.manual_pick_records OWNER TO gowms;

ALTER TABLE public.material_request_items OWNER TO gowms;

ALTER TABLE public.material_requests OWNER TO gowms;

ALTER TABLE public.notifications OWNER TO gowms;

ALTER TABLE public.order_fulfillment_log OWNER TO gowms;

ALTER TABLE public.order_status_logs OWNER TO gowms;

ALTER TABLE public.order_template_lines OWNER TO gowms;

ALTER TABLE public.order_templates OWNER TO gowms;

ALTER TABLE public.pack_reversals OWNER TO gowms;

ALTER TABLE public.packing_slip_items OWNER TO gowms;

ALTER TABLE public.payment_entries OWNER TO gowms;

ALTER TABLE public.pick_scan_logs OWNER TO gowms;

ALTER TABLE public.price_observations OWNER TO gowms;

ALTER TABLE public.purchase_invoice_items OWNER TO gowms;

ALTER TABLE public.putaway_logs OWNER TO gowms;

ALTER TABLE public.putaway_rules OWNER TO gowms;

ALTER TABLE public.quality_inspection_readings OWNER TO gowms;

ALTER TABLE public.quality_inspections OWNER TO gowms;

ALTER TABLE public.request_logs OWNER TO gowms;

ALTER TABLE public.return_claim_photos OWNER TO gowms;

ALTER TABLE public.return_claims OWNER TO gowms;

ALTER TABLE public.sales_invoice_items OWNER TO gowms;

ALTER TABLE public.sales_order_items OWNER TO gowms;

ALTER TABLE public.saved_kit_lines OWNER TO gowms;

ALTER TABLE public.saved_kits OWNER TO gowms;

ALTER TABLE public.scheduler_logs OWNER TO gowms;

ALTER TABLE public.seasonal_patterns OWNER TO gowms;

ALTER TABLE public.serial_numbers OWNER TO gowms;

ALTER TABLE public.stock_entries OWNER TO gowms;

ALTER TABLE public.stock_entry_items OWNER TO gowms;

ALTER TABLE public.stock_ledger_entries OWNER TO gowms;

ALTER TABLE public.stock_reconciliation_items OWNER TO gowms;

ALTER TABLE public.stock_reconciliations OWNER TO gowms;

ALTER TABLE public.stock_reservations OWNER TO gowms;

ALTER TABLE public.supplier_performance OWNER TO gowms;

ALTER TABLE public.warehouse_locations OWNER TO gowms;

ALTER TABLE public.warehouse_metrics OWNER TO gowms;

ALTER TABLE public.wishlists OWNER TO gowms;

ALTER TABLE public.workflow_definitions OWNER TO gowms;

ALTER TABLE public.workflow_instances OWNER TO gowms;
