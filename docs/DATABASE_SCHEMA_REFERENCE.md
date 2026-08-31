# goWMS Database Schema Reference

> Complete documentation of every table, column, constraint, and relationship in the goWMS Warehouse Management System.

---

## Table of Contents

1. [Master Data Tables](#1-master-data-tables)
2. [Inbound (Purchase/Receiving) Tables](#2-inbound-purchasereceiving-tables)
3. [Outbound (Sales/Delivery) Tables](#3-outbound-salesdelivery-tables)
4. [Inventory & Stock Tables](#4-inventory--stock-tables)
5. [Financial & Accounting Tables](#5-financial--accounting-tables)
6. [Quality Control Tables](#6-quality-control-tables)
7. [Transport & Logistics Tables](#7-transport--logistics-tables)
8. [Workflow & Configuration Tables](#8-workflow--configuration-tables)
9. [Analytics & Forecasting Tables](#9-analytics--forecasting-tables)
10. [Audit & Logging Tables](#10-audit--logging-tables)

---

## 1. Master Data Tables

These tables store reference data that other tables depend on. They rarely change and serve as the foundation for the entire system.

---

### 1.1 companies

**Purpose:** Organization/company master. Each company has its own chart of accounts, currency, and warehouse defaults.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Company name (UNIQUE) |
| `abbr` | VARCHAR(10) | YES | - | Short abbreviation |
| `currency` | VARCHAR(10) | YES | 'INR' | Default currency |
| `country` | VARCHAR(200) | YES | - | Country |
| `tax_id` | VARCHAR(100) | YES | - | Tax registration ID |
| `default_warehouse` | VARCHAR(200) | YES | - | Default warehouse name |
| `default_receivable_account` | VARCHAR(200) | YES | - | AR account |
| `default_payable_account` | VARCHAR(200) | YES | - | AP account |
| `default_expense_account` | VARCHAR(200) | YES | - | Expense GL |
| `default_income_account` | VARCHAR(200) | YES | - | Income GL |
| `default_bank_account` | VARCHAR(200) | YES | - | Bank GL |
| `default_cash_account` | VARCHAR(200) | YES | - | Cash GL |
| `write_off_account` | VARCHAR(200) | YES | - | Write-off GL |
| `round_off_account` | VARCHAR(200) | YES | - | Rounding GL |
| `round_off_cost_center` | VARCHAR(200) | YES | - | Rounding CC |
| `cost_center` | VARCHAR(200) | YES | - | Default CC |
| `stock_adjustment_account` | VARCHAR(200) | YES | - | Stock adjustment GL |
| `valuation_method` | VARCHAR(50) | YES | 'FIFO' | FIFO / LIFO |
| `enable_perpetual_inventory` | BOOLEAN | YES | true | Real-time inventory |
| `credit_limit` | NUMERIC(18,6) | YES | 0 | Customer credit limit |
| `domain` | VARCHAR(100) | YES | - | Industry domain |
| `phone_no` | VARCHAR(50) | YES | - | Phone |
| `email` | VARCHAR(200) | YES | - | Email |
| `website` | VARCHAR(200) | YES | - | Website |
| `date_of_establishment` | DATE | YES | - | Founding date |
| `company_logo` | VARCHAR(500) | YES | - | Logo URL |
| `company_description` | TEXT | YES | - | Description |

**Constraints:** PK `id`, UNIQUE `name`

---

### 1.2 warehouses

**Purpose:** Warehouse locations with type (hub/satellite), picking mode, and hierarchical structure.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(255) | NO | - | Warehouse name |
| `code` | VARCHAR(50) | NO | - | Short code (UNIQUE) |
| `parent_id` | INTEGER | YES | - | Parent warehouse (self-ref) |
| `company_id` | INTEGER | YES | - | Company FK |
| `is_group` | BOOLEAN | YES | false | Group header? |
| `warehouse_type` | VARCHAR(20) | YES | - | hub, satellite, storage, incoming, returns, transit, warehouse, stores, distribution |
| `picking_mode` | VARCHAR(20) | YES | 'scan' | scan, manual, fifo, lifo |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `account` | VARCHAR(200) | YES | - | GL account |
| `is_rejected_warehouse` | BOOLEAN | YES | false | Rejected goods area? |
| `customer` | VARCHAR(200) | YES | - | Customer (bonded) |
| `default_in_transit_warehouse` | VARCHAR(200) | YES | - | Transit WH |
| `email_id` | VARCHAR(200) | YES | - | Email |
| `phone_no` | VARCHAR(50) | YES | - | Phone |
| `mobile_no` | VARCHAR(50) | YES | - | Mobile |
| `address_line_1` | VARCHAR(200) | YES | - | Address line 1 |
| `address_line_2` | VARCHAR(200) | YES | - | Address line 2 |
| `city` | VARCHAR(100) | YES | - | City |
| `state` | VARCHAR(100) | YES | - | State |
| `pin` | VARCHAR(20) | YES | - | PIN/ZIP code |

**Constraints:** PK `id`, UNIQUE `code`, FK `parent_id → warehouses(id)`, FK `company_id → companies(id)`, CHECK `warehouse_type`, CHECK `picking_mode`

---

### 1.3 items

**Purpose:** Product master with inventory control, valuation, and physical properties.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `code` | VARCHAR(100) | NO | - | Item code (UNIQUE) |
| `name` | VARCHAR(255) | NO | - | Item name |
| `item_group_id` | INTEGER | YES | - | Group FK |
| `stock_uom_id` | INTEGER | YES | - | UOM FK |
| `has_serial` | BOOLEAN | YES | false | Serial tracking |
| `has_batch` | BOOLEAN | YES | false | Batch tracking |
| `is_stock` | BOOLEAN | YES | true | Inventory item? |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `abc_tier` | VARCHAR(5) | YES | - | AF, AS, BF, BS, CF, CS |
| `carton_qty` | INTEGER | YES | 0 | Items per carton |
| `safety_stock` | NUMERIC(18,6) | YES | 0 | Safety stock |
| `lead_time_days` | INTEGER | YES | 15 | Supplier lead time |
| `reorder_level` | NUMERIC(18,6) | YES | 0 | Reorder point |
| `reorder_qty` | NUMERIC(18,6) | YES | 0 | EOQ |
| `max_stock` | NUMERIC(18,6) | YES | 0 | Maximum stock |
| `last_synced_at` | TIMESTAMPTZ | YES | - | Last ERP sync |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `description` | TEXT | YES | - | Description |
| `brand` | VARCHAR(200) | YES | - | Brand |
| `valuation_method` | VARCHAR(50) | YES | - | FIFO/LIFO override |
| `valuation_rate` | NUMERIC(18,6) | YES | 0 | Valuation rate |
| `standard_rate` | NUMERIC(18,6) | YES | 0 | Standard cost |
| `opening_stock` | NUMERIC(18,6) | YES | 0 | Opening balance |
| `is_sales_item` | BOOLEAN | YES | true | Sellable? |
| `is_purchase_item` | BOOLEAN | YES | true | Purchasable? |
| `has_variants` | BOOLEAN | YES | false | Has variants? |
| `variant_of` | VARCHAR(100) | YES | - | Parent variant |
| `min_order_qty` | NUMERIC(18,6) | YES | 0 | Minimum order |
| `last_purchase_rate` | NUMERIC(18,6) | YES | 0 | Last purchase price |
| `warranty_period` | VARCHAR(50) | YES | - | Warranty |
| `weight_per_unit` | NUMERIC(18,6) | YES | 0 | Weight |
| `weight_uom` | VARCHAR(50) | YES | - | Weight UOM |
| `end_of_life` | DATE | YES | '2099-12-31' | Discontinuation |
| `allow_negative_stock` | BOOLEAN | YES | false | Allow negatives? |
| `over_delivery_receipt_allowance` | NUMERIC(18,6) | YES | 0 | Over-receipt % |
| `over_billing_allowance` | NUMERIC(18,6) | YES | 0 | Over-billing % |
| `image` | VARCHAR(500) | YES | - | Image URL |
| `shelf_life_in_days` | INTEGER | YES | - | Shelf life |
| `has_expiry_date` | BOOLEAN | YES | false | Track expiry? |
| `batch_number_series` | VARCHAR(100) | YES | - | Batch numbering |
| `serial_no_series` | VARCHAR(100) | YES | - | Serial numbering |
| `total_projected_qty` | NUMERIC(18,6) | YES | 0 | Projected qty |
| `is_sub_contracted_item` | BOOLEAN | YES | false | Sub-contract? |
| `default_bom` | VARCHAR(100) | YES | - | Default BOM |
| `country_of_origin` | VARCHAR(100) | YES | - | Origin country |
| `customs_tariff_number` | VARCHAR(100) | YES | - | HS code |
| `pack_type` | VARCHAR(20) | YES | 'loose' | loose, packed |
| `control_mode` | VARCHAR(30) | YES | 'item_controlled' | item_controlled, bin_controlled |
| `home_location_id` | INTEGER | YES | - | Default location FK |
| `master_complete` | BOOLEAN | YES | false | Master data complete? |
| `barcode` | VARCHAR(100) | YES | - | Primary barcode |

**Constraints:** PK `id`, UNIQUE `code`, FK `item_group_id → item_groups(id)`, FK `stock_uom_id → uoms(id)`, FK `home_location_id → warehouse_locations(id)`, CHECK `abc_tier`, CHECK `pack_type`, CHECK `control_mode`

**Indexes:** `idx_items_abc_tier`, `idx_items_code`

---

### 1.4 item_groups

**Purpose:** Hierarchical item categorization (Category → Subcategory → Brand).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Group name (UNIQUE) |
| `parent_id` | INTEGER | YES | - | Parent group (self-ref) |
| `is_group` | BOOLEAN | YES | false | Header? |
| `image` | VARCHAR(500) | YES | - | Image |

**Constraints:** PK `id`, UNIQUE `name`, FK `parent_id → item_groups(id)`

---

### 1.5 suppliers

**Purpose:** Vendor master with contact, transport, and hold/freeze status.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `erp_id` | VARCHAR(100) | YES | - | ERP reference (UNIQUE) |
| `name` | VARCHAR(255) | NO | - | Supplier name |
| `supplier_group` | VARCHAR(100) | YES | - | Group |
| `gstin` | VARCHAR(20) | YES | - | GST number |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `supplier_type` | VARCHAR(50) | YES | 'Company' | Company, Individual |
| `country` | VARCHAR(200) | YES | - | Country |
| `default_currency` | VARCHAR(10) | YES | 'INR' | Currency |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `is_internal_supplier` | BOOLEAN | YES | false | Internal? |
| `payment_terms_template` | VARCHAR(100) | YES | - | Payment terms |
| `tax_category` | VARCHAR(100) | YES | - | Tax category |
| `default_price_list` | VARCHAR(100) | YES | - | Price list |
| `is_transporter` | BOOLEAN | YES | false | Carrier? |
| `on_hold` | BOOLEAN | YES | false | Purchasing hold? |
| `hold_type` | VARCHAR(50) | YES | - | Hold reason |
| `release_date` | DATE | YES | - | Hold release |
| `is_frozen` | BOOLEAN | YES | false | Frozen? |
| `website` | VARCHAR(200) | YES | - | Website |
| `language` | VARCHAR(50) | YES | - | Language |
| `supplier_details` | TEXT | YES | - | Details |
| `supplier_primary_address` | VARCHAR(200) | YES | - | Address |
| `supplier_primary_contact` | VARCHAR(200) | YES | - | Contact |
| `tax_withholding_group` | VARCHAR(100) | YES | - | TDS group |
| `carrier_code` | VARCHAR(50) | YES | - | Carrier code |
| `contact_phone` | VARCHAR(50) | YES | - | Phone |
| `contact_email` | VARCHAR(200) | YES | - | Email |
| `vehicle_fleet` | TEXT | YES | - | Fleet details |
| `vehicles` | JSONB | YES | '[]' | Structured vehicles |
| `default_service_level` | VARCHAR(50) | YES | - | SLA tier |

**Constraints:** PK `id`, UNIQUE `erp_id`

---

### 1.6 customers

**Purpose:** Customer master with billing, territory, and loyalty settings.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `erp_id` | VARCHAR(100) | YES | - | ERP reference (UNIQUE) |
| `name` | VARCHAR(255) | NO | - | Customer name |
| `customer_group` | VARCHAR(100) | YES | - | Group |
| `gstin` | VARCHAR(20) | YES | - | GST number |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `customer_type` | VARCHAR(50) | YES | 'Company' | Company, Individual |
| `territory` | VARCHAR(200) | YES | - | Territory |
| `default_currency` | VARCHAR(10) | YES | 'INR' | Currency |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `is_internal_customer` | BOOLEAN | YES | false | Internal? |
| `payment_terms_template` | VARCHAR(100) | YES | - | Payment terms |
| `tax_category` | VARCHAR(100) | YES | - | Tax category |
| `default_price_list` | VARCHAR(100) | YES | - | Price list |
| `loyalty_program` | VARCHAR(100) | YES | - | Loyalty |
| `website` | VARCHAR(200) | YES | - | Website |
| `language` | VARCHAR(50) | YES | - | Language |
| `market_segment` | VARCHAR(200) | YES | - | Segment |
| `industry` | VARCHAR(200) | YES | - | Industry |
| `customer_details` | TEXT | YES | - | Details |
| `customer_primary_address` | VARCHAR(200) | YES | - | Address |
| `customer_primary_contact` | VARCHAR(200) | YES | - | Contact |
| `tax_withholding_category` | VARCHAR(100) | YES | - | TDS category |
| `lead_name` | VARCHAR(200) | YES | - | Sales lead |

**Constraints:** PK `id`, UNIQUE `erp_id`

---

### 1.7 employees

**Purpose:** Employee records with PIN auth, role, and warehouse assignment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `employee_name` | VARCHAR(200) | NO | - | Full name |
| `first_name` | VARCHAR(100) | YES | - | First name |
| `middle_name` | VARCHAR(100) | YES | - | Middle name |
| `last_name` | VARCHAR(100) | YES | - | Last name |
| `company` | VARCHAR(200) | NO | - | Company |
| `status` | VARCHAR(50) | YES | 'Active' | Active, Inactive |
| `gender` | VARCHAR(20) | YES | - | Gender |
| `date_of_birth` | DATE | YES | - | DOB |
| `date_of_joining` | DATE | YES | - | Joining date |
| `department` | VARCHAR(200) | YES | - | Department |
| `designation` | VARCHAR(200) | YES | - | Job title |
| `reports_to` | INTEGER | YES | - | Manager (self-ref) |
| `branch` | VARCHAR(200) | YES | - | Branch |
| `employee_number` | VARCHAR(50) | YES | - | Employee ID |
| `user_id` | INTEGER | YES | - | Linked user FK |
| `cell_number` | VARCHAR(50) | YES | - | Mobile |
| `company_email` | VARCHAR(200) | YES | - | Work email |
| `personal_email` | VARCHAR(200) | YES | - | Personal email |
| `salary_mode` | VARCHAR(50) | YES | - | Salary mode |
| `bank_name` | VARCHAR(200) | YES | - | Bank |
| `bank_ac_no` | VARCHAR(100) | YES | - | Account |
| `ctc` | NUMERIC(18,6) | YES | 0 | Cost to company |
| `salary_currency` | VARCHAR(10) | YES | 'INR' | Currency |
| `current_address` | TEXT | YES | - | Address |
| `permanent_address` | TEXT | YES | - | Permanent address |
| `passport_number` | VARCHAR(100) | YES | - | Passport |
| `marital_status` | VARCHAR(50) | YES | - | Marital status |
| `blood_group` | VARCHAR(10) | YES | - | Blood group |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `pin_hash` | VARCHAR(255) | YES | - | PIN for mobile auth |
| `warehouse_id` | INTEGER | YES | - | Assigned warehouse FK |
| `badge_code` | VARCHAR(100) | YES | - | Badge barcode |
| `wms_role` | VARCHAR(50) | YES | 'picker' | WMS role |
| `token_version` | INTEGER | YES | 1 | JWT version |

**Constraints:** PK `id`, FK `reports_to → employees(id)`, INDEX `idx_employees_badge` on badge_code

---

### 1.8 users

**Purpose:** System user accounts for WMS login.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `username` | VARCHAR(50) | NO | - | Username (UNIQUE) |
| `password_hash` | VARCHAR(255) | NO | - | Hashed password |
| `role` | VARCHAR(50) | NO | - | Role code (FK to roles) |
| `is_active` | BOOLEAN | YES | true | Enabled? |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, UNIQUE `username`

---

### 1.9 uoms

**Purpose:** Units of measure with conversion factors.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(50) | NO | - | UOM name (UNIQUE) |
| `conversion_factor` | NUMERIC(10,4) | YES | 1 | Conversion to base |
| `symbol` | VARCHAR(20) | YES | - | Symbol |
| `common_code` | VARCHAR(50) | YES | - | ISO code |
| `description` | TEXT | YES | - | Description |
| `category` | VARCHAR(100) | YES | - | Weight, Volume, etc. |
| `enabled` | BOOLEAN | YES | true | Active? |
| `must_be_whole_number` | BOOLEAN | YES | false | Integer only? |

**Constraints:** PK `id`, UNIQUE `name`

---

### 1.10 currencies

**Purpose:** Currency definitions with formatting rules.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `currency_name` | VARCHAR(10) | NO | - | Code: INR, USD (UNIQUE) |
| `enabled` | BOOLEAN | YES | true | Active? |
| `fraction` | VARCHAR(50) | YES | - | Fraction name |
| `fraction_units` | INTEGER | YES | 100 | Units per main |
| `symbol` | VARCHAR(10) | YES | - | Symbol |
| `smallest_currency_fraction_value` | NUMERIC(18,6) | YES | 0.01 | Min fraction |
| `number_format` | VARCHAR(20) | YES | '#,###.##' | Format |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, UNIQUE `currency_name`

---

### 1.11 payment_terms

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Term name (UNIQUE) |

---

### 1.12 cost_centers

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Name (UNIQUE) |
| `company_id` | INTEGER | YES | - | Company FK |
| `is_group` | BOOLEAN | YES | false | Group header? |
| `parent_id` | INTEGER | YES | - | Parent (self-ref) |
| `cost_center_number` | VARCHAR(50) | YES | - | Code |
| `disabled` | BOOLEAN | YES | false | Soft delete |

**Constraints:** PK `id`, UNIQUE `name`, FK `company_id → companies(id)`

---

### 1.13 fiscal_years

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `year` | VARCHAR(10) | NO | - | Year label (UNIQUE) |
| `year_start_date` | DATE | NO | - | Start date |
| `year_end_date` | DATE | NO | - | End date |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `is_short_year` | BOOLEAN | YES | false | Partial year? |
| `auto_created` | BOOLEAN | YES | false | System generated? |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, UNIQUE `year`

---

### 1.14 business_units

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | BU name (UNIQUE) |
| `gstin` | VARCHAR(20) | YES | - | GST number |
| `default_warehouse_id` | INTEGER | YES | - | Default warehouse FK |

**Constraints:** PK `id`, UNIQUE `name`, FK `default_warehouse_id → warehouses(id)`

---

### 1.15 customer_groups / supplier_groups

Both follow the same pattern: `id (PK)`, `name (UNIQUE)`, `parent_id (self-ref FK)`, `is_group`, `created_at`.

---

### 1.16 motorcycle_models

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Model name (UNIQUE) |
| `manufacturer` | VARCHAR(100) | YES | - | Manufacturer |
| `active` | BOOLEAN | YES | true | Active? |

---

## 2. Inbound (Purchase/Receiving) Tables

---

### 2.1 purchase_orders

**Purpose:** Purchase orders from ERP.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | PO number (UNIQUE) |
| `supplier_name` | VARCHAR(255) | YES | - | Supplier name |
| `status` | VARCHAR(50) | YES | - | PO status |
| `per_received` | NUMERIC(5,2) | YES | 0 | % received |
| `last_synced_at` | TIMESTAMPTZ | YES | - | Last sync |
| `company` | VARCHAR(200) | YES | - | Company |
| `transaction_date` | DATE | YES | CURRENT_DATE | PO date |
| `schedule_date` | DATE | YES | - | Required date |
| `currency` | VARCHAR(10) | YES | 'INR' | Currency |
| `conversion_rate` | NUMERIC(18,6) | YES | 1 | FX rate |
| `total_qty` | NUMERIC(18,6) | YES | 0 | Total qty |
| `grand_total` | NUMERIC(18,6) | YES | 0 | Grand total |
| `net_total` | NUMERIC(18,6) | YES | 0 | Net total |
| `set_warehouse` | VARCHAR(200) | YES | - | Target warehouse |
| `cost_center` | VARCHAR(200) | YES | - | Cost center |
| `project` | VARCHAR(100) | YES | - | Project |
| `payment_terms_template` | VARCHAR(100) | YES | - | Payment terms |
| `taxes_and_charges` | VARCHAR(100) | YES | - | Tax template |
| `per_billed` | NUMERIC(5,2) | YES | 0 | % billed |
| `is_subcontracted` | BOOLEAN | YES | false | Sub-contract? |
| `scan_barcode` | VARCHAR(200) | YES | - | Barcode field |
| *(+ 20 more financial/tax columns)* | | | | |

**Constraints:** PK `id`, UNIQUE `name`

---

### 2.2 purchase_order_items

**Purpose:** PO line items.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `purchase_order_id` | INTEGER | YES | - | PO FK (CASCADE) |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `item_name` | VARCHAR(255) | YES | - | Item name |
| `qty` | NUMERIC(18,6) | NO | 0 | Ordered qty |
| `rate` | NUMERIC(18,6) | YES | 0 | Unit price |
| `amount` | NUMERIC(18,6) | YES | 0 | Line total |
| `warehouse` | VARCHAR(255) | YES | - | Target warehouse |
| `uom` | VARCHAR(50) | YES | 'Nos' | UOM |
| `received_qty` | NUMERIC(18,6) | YES | 0 | Received qty |
| `rejected_qty` | NUMERIC(18,6) | YES | 0 | Rejected qty |
| `billed_qty` | NUMERIC(18,6) | YES | 0 | Billed qty |
| `max_overreceipt_pct` | NUMERIC(5,2) | YES | 0 | Max over-receipt % |
| *(+ 15 more pricing/tax columns)* | | | | |

**Constraints:** PK `id`, FK `purchase_order_id → purchase_orders(id)` CASCADE, INDEX `idx_po_items_order`

**⚠️ Deduplication Gap:** No unique constraint on `(purchase_order_id, item_code)`.

---

### 2.3 purchase_receipts

**Purpose:** Goods receipt notes synced from ERP.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | PR number (UNIQUE) |
| `supplier_name` | VARCHAR(255) | YES | - | Supplier |
| `status` | VARCHAR(50) | YES | - | Status |
| `posting_date` | DATE | YES | - | Receipt date |
| `last_synced_at` | TIMESTAMPTZ | YES | - | Last sync |

---

### 2.4 grn_sessions

**Purpose:** GRN scanning sessions — the core inbound receiving workflow container.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `session_no` | VARCHAR(30) | NO | - | Session number (UNIQUE) |
| `warehouse_id` | INTEGER | YES | - | Warehouse FK |
| `purchase_receipt_no` | VARCHAR(100) | YES | - | Linked PR |
| `supplier_name` | VARCHAR(255) | YES | - | Supplier |
| `status` | VARCHAR(20) | YES | 'open' | Status |
| `created_by` | INTEGER | YES | - | Creator FK |
| `closed_at` | TIMESTAMPTZ | YES | - | Close time |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `receiving_mode` | VARCHAR(30) | YES | 'packing_list' | packing_list, direct |
| `truck_no` | VARCHAR(100) | YES | - | Truck plate |
| `driver_name` | VARCHAR(200) | YES | - | Driver name |
| `driver_phone` | VARCHAR(50) | YES | - | Driver phone |
| `arrival_at` | TIMESTAMPTZ | YES | - | Arrival time |
| `expected_boxes` | INTEGER | YES | 0 | Expected cartons |
| `notes` | TEXT | YES | - | Notes |
| `plant` | VARCHAR(100) | YES | - | Plant code |
| `dock` | VARCHAR(100) | YES | - | Dock bay |
| `invoice_nos` | TEXT | YES | - | Invoice numbers |
| `pod_attachment_id` | INTEGER | YES | - | POD file FK |
| `updated_at` | TIMESTAMPTZ | YES | now() | Last update |

**Status Flow:**
```
draft → open → receiving → box_reconciliation → item_verification → 
exception_pending → item_verification_complete → putaway_pending → 
putaway_in_progress → completed → closed
```

**Constraints:** PK `id`, UNIQUE `session_no`, FK `warehouse_id → warehouses(id)`, FK `created_by → users(id)`, CHECK status

---

### 2.5 grn_cartons

**Purpose:** Individual cartons scanned during GRN.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `grn_session_id` | INTEGER | YES | - | Session FK (CASCADE) |
| `carton_no` | VARCHAR(50) | NO | - | Carton ID |
| `status` | VARCHAR(20) | YES | 'pending' | Status |
| `scanned_at` | TIMESTAMPTZ | YES | - | Scan time |
| `scanned_by` | INTEGER | YES | - | Scanner FK |
| `is_expected` | BOOLEAN | YES | false | Expected? |
| `invoice_no` | VARCHAR(100) | YES | - | Invoice ref |
| `condition` | VARCHAR(30) | YES | 'ok' | ok, damaged |
| `seal_status` | VARCHAR(30) | YES | 'sealed' | sealed, broken |
| `expected_weight_kg` | NUMERIC(18,6) | YES | - | Expected weight |
| `actual_weight_kg` | NUMERIC(18,6) | YES | - | Actual weight |
| `notes` | TEXT | YES | - | Notes |
| `verified_at` | TIMESTAMPTZ | YES | - | Verify time |
| `verified_by` | INTEGER | YES | - | Verifier FK |

**Status Flow:**
```
pending → expected → received → accounted → verified
(exception: unmatched, excess, missing, exception)
```

**Constraints:** PK `id`, FK `grn_session_id → grn_sessions(id)` CASCADE, INDEX `idx_grn_cartons_session`

---

### 2.6 grn_lines

**Purpose:** Item-level details within each GRN carton.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `grn_carton_id` | INTEGER | YES | - | Carton FK (CASCADE) |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `expected_qty` | NUMERIC(18,6) | YES | - | Expected qty |
| `scanned_qty` | NUMERIC(18,6) | YES | - | Actual scanned qty |
| `status` | VARCHAR(20) | YES | 'pending' | Status |
| `verification_method` | VARCHAR(20) | YES | - | scan, manual, count |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `expiry_date` | DATE | YES | - | Expiry |
| `manufacturing_date` | DATE | YES | - | Mfg date |
| `shelf_life_days` | INTEGER | YES | - | Shelf life |
| `damaged_qty` | NUMERIC(18,6) | YES | 0 | Damaged qty |
| `notes` | TEXT | YES | - | Notes |
| `requires_qi` | BOOLEAN | YES | false | Needs QC? |
| `supplier_sku` | VARCHAR(100) | YES | - | Supplier part # |
| `grn_session_id` | INTEGER | YES | - | Direct session link |
| `invoice_no` | VARCHAR(100) | YES | - | Invoice ref |
| `qty_short` | NUMERIC(18,6) | YES | 0 | Shortage qty |
| `qty_excess` | NUMERIC(18,6) | YES | 0 | Excess qty |

**Status:** `pending → full_match | shortage | damage | excess | unknown`

**Constraints:** PK `id`, FK `grn_carton_id → grn_cartons(id)` CASCADE, INDEX `idx_grn_lines_carton`, INDEX `idx_grn_lines_session_item`

---

### 2.7 grn_invoices

**Purpose:** Invoices linked to a GRN session.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `grn_session_id` | INTEGER | NO | - | Session FK (CASCADE) |
| `invoice_no` | VARCHAR(100) | NO | - | Invoice number |
| `invoice_date` | DATE | YES | - | Invoice date |
| `delivery_no` | VARCHAR(100) | YES | - | Delivery note |
| `delivery_date` | DATE | YES | - | Delivery date |
| `notes` | TEXT | YES | - | Notes |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, FK `grn_session_id → grn_sessions(id)` CASCADE, UNIQUE `(grn_session_id, invoice_no)`

---

### 2.8 grn_events

**Purpose:** Immutable event log for GRN session audit trail.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | BIGINT | NO | auto | Primary key |
| `grn_session_id` | INTEGER | NO | - | Session FK (CASCADE) |
| `event_type` | VARCHAR(80) | NO | - | Event type |
| `invoice_no` | VARCHAR(100) | YES | - | Related invoice |
| `box_no` | VARCHAR(100) | YES | - | Related box |
| `part_no` | VARCHAR(100) | YES | - | Related part |
| `quantity` | NUMERIC(18,6) | YES | - | Quantity |
| `result` | VARCHAR(50) | YES | - | Result |
| `reason` | TEXT | YES | - | Reason |
| `actor_id` | INTEGER | YES | - | Actor FK |
| `device` | VARCHAR(100) | YES | - | Device ID |
| `payload` | JSONB | YES | - | Additional data |
| `created_at` | TIMESTAMPTZ | YES | now() | Event time |

**Constraints:** PK `id`, FK `grn_session_id → grn_sessions(id)` CASCADE, FK `actor_id → users(id)`, INDEX `idx_grn_events_session`, INDEX `idx_grn_events_type`

---

### 2.9 grn_exceptions

**Purpose:** Exception queue for GRN variances requiring resolution.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `grn_session_id` | INTEGER | NO | - | Session FK (CASCADE) |
| `exception_type` | VARCHAR(50) | NO | - | Exception type |
| `invoice_no` | VARCHAR(100) | YES | - | Invoice |
| `box_no` | VARCHAR(100) | YES | - | Box |
| `part_no` | VARCHAR(100) | YES | - | Part |
| `expected_qty` | NUMERIC(18,6) | YES | - | Expected |
| `scanned_qty` | NUMERIC(18,6) | YES | - | Actual |
| `variance` | NUMERIC(18,6) | YES | - | Difference |
| `status` | VARCHAR(30) | YES | 'open' | open, resolved |
| `resolution` | TEXT | YES | - | Resolution |
| `resolved_by` | INTEGER | YES | - | Resolver FK |
| `resolved_at` | TIMESTAMPTZ | YES | - | Resolve time |
| `actor_id` | INTEGER | YES | - | Actor FK |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, FK `grn_session_id → grn_sessions(id)` CASCADE, INDEX `idx_grn_exceptions_session`

---

### 2.10 purchase_invoices

**Purpose:** Supplier invoices for accounts payable. (60+ columns covering amounts, taxes, payments, addresses)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Invoice number (UNIQUE) |
| `supplier` | VARCHAR(200) | NO | - | Supplier |
| `company` | VARCHAR(200) | NO | - | Company |
| `posting_date` | DATE | YES | CURRENT_DATE | Date |
| `due_date` | DATE | YES | - | Payment due |
| `is_paid` | BOOLEAN | YES | false | Paid? |
| `is_return` | BOOLEAN | YES | false | Debit note? |
| `grand_total` | NUMERIC(18,6) | YES | 0 | Grand total |
| `outstanding_amount` | NUMERIC(18,6) | YES | 0 | Balance due |
| `status` | VARCHAR(50) | YES | 'draft' | Status |
| `created_by` | INTEGER | YES | - | Creator FK |
| *(+ 50 more financial columns)* | | | | |

**Constraints:** PK `id`, UNIQUE `name`

---

### 2.11 purchase_invoice_items

**Purpose:** Line items for purchase invoices. (40+ columns)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `purchase_invoice_id` | INTEGER | NO | - | Invoice FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `qty` | NUMERIC(18,6) | NO | 0 | Invoiced qty |
| `rate` | NUMERIC(18,6) | YES | 0 | Unit price |
| `amount` | NUMERIC(18,6) | YES | 0 | Line total |
| `purchase_order` | VARCHAR(100) | YES | - | Source PO |
| `purchase_receipt` | VARCHAR(100) | YES | - | Source PR |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `warehouse` | VARCHAR(200) | YES | - | Warehouse |
| *(+ 30 more pricing/tax columns)* | | | | |

**Constraints:** PK `id`, FK `purchase_invoice_id → purchase_invoices(id)`

---

### 2.12 material_requests / material_request_items

**Purpose:** Internal material requests (auto-created or manual). Simple structure with `name (UNIQUE)`, `request_type`, `status`.

**Items:** `request_id` FK, `item_code`, `qty`, `schedule_date`

---

### 2.13 putaway_rules

**Purpose:** Rules for automatic putaway location assignment.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `company` | VARCHAR(100) | YES | - | Company |
| `warehouse` | VARCHAR(255) | NO | - | Warehouse |
| `priority` | INTEGER | YES | 1 | Rule priority |
| `stock_capacity` | NUMERIC(18,6) | YES | 0 | Max capacity |
| `current_stock` | NUMERIC(18,6) | YES | 0 | Current qty |
| `active` | BOOLEAN | YES | true | Enabled? |
| `item_name` | VARCHAR(200) | YES | - | Item name |
| `stock_uom` | VARCHAR(50) | YES | - | Stock UOM |

---

### 2.14 putaway_logs

**Purpose:** Records of actual putaway actions.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `log_no` | VARCHAR(30) | NO | - | Log number |
| `grn_line_id` | INTEGER | YES | - | GRN line FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `source_warehouse` | VARCHAR(255) | YES | - | Source WH |
| `target_location` | VARCHAR(100) | YES | - | Target location |
| `quantity` | NUMERIC(18,6) | YES | - | Qty put away |
| `verification_method` | VARCHAR(20) | YES | - | Verification |
| `placed_at` | TIMESTAMPTZ | YES | - | Time |
| `placed_by` | INTEGER | YES | - | Actor FK |

---

### 2.15 batches

**Purpose:** Batch tracking for batch-controlled items.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `batch_id` | VARCHAR(100) | NO | - | Batch identifier (UNIQUE) |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `item_name` | VARCHAR(200) | YES | - | Item name |
| `manufacturing_date` | DATE | YES | CURRENT_DATE | Mfg date |
| `expiry_date` | DATE | YES | - | Expiry |
| `batch_qty` | NUMERIC(18,6) | YES | 0 | Current qty |
| `stock_uom` | VARCHAR(50) | YES | - | UOM |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `supplier` | VARCHAR(200) | YES | - | Supplier |
| `reference_doctype` | VARCHAR(100) | YES | - | Source doc type |
| `reference_name` | VARCHAR(100) | YES | - | Source doc no |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, UNIQUE `batch_id`

---

### 2.16 serial_numbers

**Purpose:** Individual serial number tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `serial_no` | VARCHAR(100) | NO | - | Serial number (UNIQUE) |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `warehouse` | VARCHAR(255) | YES | - | Current warehouse |
| `status` | VARCHAR(20) | YES | 'available' | Status |
| `purchase_receipt` | VARCHAR(100) | YES | - | Source PR |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `warranty_expiry_date` | DATE | YES | - | Warranty end |
| `customer` | VARCHAR(200) | YES | - | Sold to |
| `company` | VARCHAR(200) | YES | - | Company |
| *(+ 10 more columns)* | | | | |

**Constraints:** PK `id`, UNIQUE `serial_no`

---

## 3. Outbound (Sales/Delivery) Tables

---

### 3.1 sales_orders

**Purpose:** Customer sales orders with priority queue and WMS status tracking.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | SO number (UNIQUE) |
| `customer_name` | VARCHAR(255) | YES | - | Customer |
| `status` | VARCHAR(50) | YES | - | ERP status |
| `grand_total` | NUMERIC(18,6) | YES | - | Grand total |
| `currency` | VARCHAR(20) | YES | 'INR' | Currency |
| `delivery_date` | DATE | YES | - | Required delivery |
| `wms_status` | VARCHAR(50) | YES | 'draft' | WMS status |
| `last_synced_at` | TIMESTAMPTZ | YES | - | Last sync |
| `order_type` | VARCHAR(50) | YES | 'Sales' | Sales, Return |
| `transaction_date` | DATE | YES | CURRENT_DATE | Order date |
| `company` | VARCHAR(200) | YES | - | Company |
| `po_no` | VARCHAR(100) | YES | - | Customer PO |
| `per_delivered` | NUMERIC(5,2) | YES | 0 | % delivered |
| `per_billed` | NUMERIC(5,2) | YES | 0 | % billed |
| `per_picked` | NUMERIC(5,2) | YES | 0 | % picked |
| `set_warehouse` | VARCHAR(200) | YES | - | Source warehouse |
| `priority` | INTEGER | YES | 4 | Priority (1=highest) |
| `priority_label` | VARCHAR(50) | YES | 'Normal' | Priority label |
| `priority_reason` | TEXT | YES | - | Reason |
| `priority_set_by` | INTEGER | YES | - | Set by FK |
| `priority_set_at` | TIMESTAMPTZ | YES | - | Set at |
| `warehouse_id` | INTEGER | YES | - | Warehouse FK |
| `notes` | TEXT | YES | - | Notes |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `updated_at` | TIMESTAMPTZ | YES | now() | Last update |
| `priority_sla_hours` | INTEGER | YES | - | SLA hours |
| *(+ 15 more address/tax columns)* | | | | |

**Constraints:** PK `id`, UNIQUE `name`, INDEX `idx_sales_orders_priority_date`, INDEX `idx_sales_orders_status_wms`

---

### 3.2 sales_order_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `sales_order_id` | INTEGER | YES | - | SO FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `qty` | NUMERIC(18,6) | YES | - | Ordered qty |
| `rate` | NUMERIC(18,6) | YES | - | Unit price |
| `warehouse` | VARCHAR(255) | YES | - | Warehouse |
| `delivered_qty` | NUMERIC(18,6) | YES | 0 | Delivered |
| `picked_qty` | NUMERIC(18,6) | YES | 0 | Picked |
| `allocated_qty` | NUMERIC(18,6) | YES | 0 | Allocated |
| `backordered_qty` | NUMERIC(18,6) | YES | 0 | Backordered |
| `status` | VARCHAR(50) | YES | 'open' | Line status |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `serial_no` | TEXT | YES | - | Serial nos |
| *(+ 10 more columns)* | | | | |

**Constraints:** PK `id`, FK `sales_order_id → sales_orders(id)`, INDEX `idx_sales_order_items_so`

**⚠️ Deduplication Gap:** No unique constraint on `(sales_order_id, item_code)`.

---

### 3.3 pick_lists

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Pick list number (UNIQUE) |
| `sales_order_no` | VARCHAR(100) | YES | - | Source SO |
| `customer` | VARCHAR(255) | YES | - | Customer |
| `warehouse_id` | INTEGER | YES | - | Warehouse FK |
| `status` | VARCHAR(20) | YES | 'draft' | Status |
| `picking_mode` | VARCHAR(20) | YES | 'scan' | scan, manual |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `stock_consumed` | BOOLEAN | YES | false | Stock deducted? |

**Status:** `draft → open → partially_delivered → completed`

---

### 3.4 pick_list_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `pick_list_id` | INTEGER | YES | - | Pick list FK (CASCADE) |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `warehouse` | VARCHAR(255) | NO | - | Warehouse |
| `ordered_qty` | NUMERIC(18,6) | YES | - | Ordered qty |
| `picked_qty` | NUMERIC(18,6) | YES | 0 | Picked qty |
| `shortage_qty` | NUMERIC(18,6) | YES | 0 | Short qty |
| `overage_qty` | NUMERIC(18,6) | YES | 0 | Over qty |
| `allocated_qty` | NUMERIC(18,6) | YES | 0 | Allocated |
| `delivered_qty` | NUMERIC(18,6) | YES | 0 | Delivered |
| `status` | VARCHAR(20) | YES | 'pending' | Status |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `location_id` | INTEGER | YES | - | Pick location FK |
| `location_code` | VARCHAR(100) | YES | - | Location code |
| `balance_id` | INTEGER | YES | - | Stock balance FK |
| `expiry_date` | DATE | YES | - | FEFO expiry |
| `consumed_qty` | NUMERIC(18,6) | NO | 0 | Consumed qty |

**Constraints:** PK `id`, FK `pick_list_id → pick_lists(id)` CASCADE, FK `location_id → warehouse_locations(id)`, FK `balance_id → stock_location_balances(id)`, INDEXes

---

### 3.5 delivery_notes

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | DN number (UNIQUE) |
| `customer_name` | VARCHAR(255) | YES | - | Customer |
| `status` | VARCHAR(50) | YES | - | Status |
| `posting_date` | DATE | YES | - | DN date |
| `grand_total` | NUMERIC(18,6) | YES | 0 | Grand total |
| `set_warehouse` | VARCHAR(200) | YES | - | Source warehouse |
| `transporter` | VARCHAR(200) | YES | - | Carrier |
| `driver` | VARCHAR(200) | YES | - | Driver |
| `lr_no` | VARCHAR(100) | YES | - | LR number |
| `vehicle_no` | VARCHAR(50) | YES | - | Vehicle |
| `against_sales_order` | VARCHAR(100) | YES | - | Source SO |
| `trip_id` | INTEGER | YES | - | Delivery trip FK |
| `pod_signature_id` | INTEGER | YES | - | POD signature FK |
| `delivered_at` | TIMESTAMPTZ | YES | - | Delivery time |
| *(+ 15 more columns)* | | | | |

---

### 3.6 delivery_note_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `delivery_note_id` | INTEGER | NO | - | DN FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `qty` | NUMERIC(18,6) | NO | 0 | Dispatch qty |
| `rate` | NUMERIC(18,6) | YES | 0 | Unit price |
| `warehouse` | VARCHAR(200) | YES | - | Warehouse |
| `against_sales_order` | VARCHAR(100) | YES | - | Source SO |
| `against_pick_list` | VARCHAR(100) | YES | - | Source PL |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `delivered_qty` | NUMERIC(18,6) | YES | 0 | Delivered qty |
| *(+ 10 more columns)* | | | | |

---

### 3.7 boxes

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `label` | VARCHAR(50) | NO | - | Box label (UNIQUE) |
| `pick_list_id` | INTEGER | YES | - | Pick list FK |
| `delivery_note` | VARCHAR(100) | YES | - | Delivery note |
| `loaded` | BOOLEAN | YES | false | Loaded on truck? |
| `loaded_at` | TIMESTAMPTZ | YES | - | Load time |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `stock_consumed` | BOOLEAN | NO | false | Stock deducted? |
| `max_weight` | NUMERIC(18,6) | YES | - | Max weight |
| `max_volume` | NUMERIC(18,6) | YES | - | Max volume |
| `declared_weight` | NUMERIC(18,6) | YES | 0 | Actual weight |

---

### 3.8 box_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `box_id` | INTEGER | YES | - | Box FK (CASCADE) |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `quantity` | NUMERIC(18,6) | YES | - | Packed qty |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `scanned_at` | TIMESTAMPTZ | YES | - | Scan time |
| `scanned_by` | INTEGER | YES | - | Scanner FK |

---

### 3.9 packing_slips / packing_slip_items

**Slip:** `id (PK)`, `name (UNIQUE)`, `delivery_note`, `status`

**Items:** `id (PK)`, `packing_slip_id (FK)`, `item_code`, `qty`, `batch_no`, `net_weight`, `dn_detail`, `pi_detail`

---

### 3.10 delivery_trips

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `trip_no` | VARCHAR(30) | NO | - | Trip number (UNIQUE) |
| `driver_id` | INTEGER | YES | - | Driver FK |
| `vehicle_no` | VARCHAR(50) | YES | - | Vehicle plate |
| `departure_time` | TIMESTAMPTZ | YES | - | Departure |
| `status` | VARCHAR(20) | YES | 'draft' | Status |
| `total_distance` | NUMERIC(10,2) | YES | - | Distance km |
| `driver_name` | VARCHAR(200) | YES | - | Driver name |
| `carrier_id` | INTEGER | YES | - | Carrier FK |
| `carrier_name` | VARCHAR(255) | YES | - | Carrier name |

**Status:** `draft → scheduled → in_transit → completed`

---

### 3.11 delivery_stops

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `trip_id` | INTEGER | YES | - | Trip FK (CASCADE) |
| `delivery_note_no` | VARCHAR(100) | YES | - | DN number |
| `customer` | VARCHAR(255) | YES | - | Customer |
| `address` | TEXT | YES | - | Address |
| `stop_order` | INTEGER | YES | - | Sequence |
| `visited` | BOOLEAN | YES | false | Delivered? |
| `visited_time` | TIMESTAMPTZ | YES | - | Delivery time |

---

### 3.12 delivery_photos / delivery_signatures

**Photos:** `id (PK)`, `stop_id (FK)`, `photo_data (base64)`, `issue_reason`, `captured_by (FK)`

**Signatures:** `id (PK)`, `stop_id (FK)`, `order_no`, `signature_data (base64)`, `captured_by (FK)`

---

### 3.13 sales_invoices / sales_invoice_items

**Invoice:** `id (PK)`, `name (UNIQUE)`, `customer_name`, `status`, `grand_total`, `posting_date`

**Items:** `id (PK)`, `sales_invoice_id (FK)`, `item_code`, `qty`, `rate`, `amount`, `delivered_qty`, `sales_order`, `delivery_note`

---

### 3.14 backorders / backorder_lines (v1 - legacy)

**Backorder:** `id (PK)`, `backorder_no (UNIQUE)`, `sales_order_no`, `status`

**Lines:** `id (PK)`, `backorder_id (FK)`, `item_code`, `ordered_qty`, `backorder_qty`, `fulfilled_qty`

---

### 3.15 backorders_v / backorder_lines_v (current)

**Backorder:** `id (PK)`, `backorder_no (UNIQUE)`, `sales_order_no`, `status`, `source_pick_list_id`

**Lines:** `id (PK)`, `backorder_id (FK CASCADE)`, `item_code`, `qty`, `warehouse`, `status`

**Unique Dedup Index:** `idx_backorder_lines_v_open_dedup` on `(item_code, COALESCE(warehouse, '')) WHERE status = 'pending'`

---

### 3.16 stock_reservations

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `order_no` | VARCHAR(100) | NO | - | Order number |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `warehouse` | VARCHAR(255) | NO | - | Warehouse |
| `reserved_qty` | NUMERIC(18,6) | YES | - | Reserved qty |
| `delivered_qty` | NUMERIC(18,6) | YES | 0 | Delivered qty |
| `status` | VARCHAR(20) | YES | 'reserved' | Status |
| `sales_order` | VARCHAR(100) | YES | - | Source SO |
| `is_cancelled` | BOOLEAN | YES | false | Cancelled? |

---

### 3.17 return_claims / return_claim_lines / return_claim_photos

**Claim:** `id (PK)`, `claim_no (UNIQUE)`, `customer_id (FK)`, `sales_invoice_no`, `reason`, `status`, `warehouse_id (FK)`, `decided_at`

**Lines:** `id (PK)`, `return_claim_id (FK CASCADE)`, `item_code`, `qty`, `condition`, `decision` (restock|scrap|rts|pending), `location_id (FK)`

**Photos:** `id (PK)`, `claim_id (FK)`, `photo_data`, `caption`

---

### 3.18 order_fulfillment_log / order_status_logs

**Fulfillment:** `id (PK)`, `sales_order_no`, `total_items`, `fulfilled_items`, `fill_rate`, `backordered_items`, `status`

**Status Logs:** `id (PK)`, `sales_order_no`, `from_status`, `to_status`, `actor_id (FK)`, `notes`

---

## 4. Inventory & Stock Tables

---

### 4.1 bins

**Purpose:** ERP-synced bin-level inventory balances.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `warehouse` | VARCHAR(255) | NO | - | Warehouse |
| `actual_qty` | NUMERIC(18,6) | YES | 0 | Physical qty |
| `ordered_qty` | NUMERIC(18,6) | YES | 0 | On-order qty |
| `reserved_qty` | NUMERIC(18,6) | YES | 0 | Reserved qty |
| `projected_qty` | NUMERIC(18,6) | YES | 0 | Projected qty |
| `stock_value` | NUMERIC(18,2) | YES | 0 | Stock value |
| `valuation_rate` | NUMERIC(18,6) | YES | 0 | Valuation rate |
| `last_synced_at` | TIMESTAMPTZ | YES | - | Last sync |
| `stock_uom` | VARCHAR(50) | YES | - | UOM |
| `company` | VARCHAR(200) | YES | - | Company |
| *(+ 6 more reservation columns)* | | | | |

**⚠️ Deduplication Gap:** No unique constraint on `(item_code, warehouse)`.

---

### 4.2 stock_location_balances

**Purpose:** Operational inventory truth — bin-level balances used by WMS screens.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `warehouse_id` | INTEGER | NO | - | Warehouse FK |
| `location_id` | INTEGER | NO | - | Location FK |
| `batch_no` | VARCHAR(100) | YES | - | Batch (NULL→'') |
| `actual_qty` | NUMERIC(18,6) | NO | 0 | Physical qty |
| `reserved_qty` | NUMERIC(18,6) | NO | 0 | Reserved qty |
| `updated_at` | TIMESTAMPTZ | YES | now() | Last update |

**Constraints:** PK `id`, UNIQUE INDEX on `(item_code, location_id, COALESCE(batch_no, ''))`, FK `warehouse_id → warehouses(id)`, FK `location_id → warehouse_locations(id)`, INDEXes on item_code, location_id, warehouse_id

---

### 4.3 stock_entries / stock_entry_items

**Entry:** `id (PK)`, `name (UNIQUE)`, `stock_entry_type`, `company`, `from_warehouse`, `to_warehouse`, `from_warehouse_id (FK)`, `to_warehouse_id (FK)`, `status`

**Items:** `id (PK)`, `stock_entry_id (FK)`, `item_code`, `s_warehouse`, `t_warehouse`, `qty`, `uom`, `s_location_id (FK)`, `t_location_id (FK)`, `batch_no`

---

### 4.4 stock_ledger_entries

**Purpose:** Immutable FIFO/valuation ledger — the financial truth of inventory.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `warehouse` | VARCHAR(255) | NO | - | Warehouse |
| `actual_qty` | NUMERIC(18,6) | YES | - | Qty change (+/-) |
| `qty_after_transaction` | NUMERIC(18,6) | YES | - | Running balance |
| `incoming_rate` | NUMERIC(18,6) | YES | - | Inward rate |
| `stock_value` | NUMERIC(18,2) | YES | - | Stock value |
| `voucher_type` | VARCHAR(100) | YES | - | Source doc type |
| `voucher_no` | VARCHAR(100) | YES | - | Source doc no |
| `posting_date` | DATE | YES | - | Date |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `outgoing_rate` | NUMERIC(18,6) | YES | 0 | Outward rate |
| `valuation_rate` | NUMERIC(18,6) | YES | 0 | Valuation rate |
| `stock_value_difference` | NUMERIC(18,6) | YES | 0 | Value change |
| `stock_queue` | TEXT | YES | - | FIFO queue |
| `company` | VARCHAR(200) | YES | - | Company |
| `is_cancelled` | BOOLEAN | YES | false | Cancelled? |
| `is_adjustment_entry` | BOOLEAN | YES | false | Adjustment? |
| *(+ 5 more columns)* | | | | |

**⚠️ Append-only table** — no UPDATE/DELETE expected.

---

### 4.5 stock_reconciliations / stock_reconciliation_items

**Recon:** `id (PK)`, `name (UNIQUE)`, `company`, `purpose`, `set_warehouse`, `difference_amount`, `status`

**Items:** `id (PK)`, `stock_reconciliation_id (FK)`, `item_code`, `warehouse`, `qty`, `valuation_rate`, `current_qty`, `quantity_difference`, `amount_difference`

---

### 4.6 cycle_count_sheets / cycle_count_lines

**Sheet:** `id (PK)`, `sheet_no (UNIQUE)`, `warehouse_id (FK)`, `tier`, `zone`, `aisle`, `scheduled_date`, `status`

**Lines:** `id (PK)`, `sheet_id (FK)`, `item_code`, `location_id (FK)`, `system_qty`, `counted_qty`, `discrepancy_status`, `counted_by (FK)`

---

### 4.7 warehouse_locations

**Purpose:** Physical storage locations (Zone-Aisle-Rack-Bin model).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `code` | VARCHAR(100) | NO | - | Location code |
| `warehouse_id` | INTEGER | NO | - | Warehouse FK |
| `zone` | VARCHAR(20) | YES | - | Zone |
| `aisle` | VARCHAR(10) | YES | - | Aisle |
| `rack` | VARCHAR(10) | YES | - | Rack |
| `bin` | VARCHAR(10) | YES | - | Bin |
| `shelf` | VARCHAR(20) | YES | - | Shelf |
| `level` | VARCHAR(20) | YES | - | Level |
| `number` | VARCHAR(20) | YES | - | Number |
| `is_occupied` | BOOLEAN | YES | false | Has stock? |
| `current_item` | VARCHAR(100) | YES | - | Current item |
| `location_type` | VARCHAR(30) | YES | 'storage' | storage, pick_face, staging, hold, damaged, incoming |
| `max_capacity_qty` | NUMERIC(18,6) | YES | - | Max capacity |
| `allow_mixed_items` | BOOLEAN | YES | true | Mixed items? |
| `disabled` | BOOLEAN | YES | false | Soft delete |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, UNIQUE `(warehouse_id, code)`, FK `warehouse_id → warehouses(id)`, CHECK `location_type`

**Auto-created per warehouse:** `INCOMING-01` (incoming), `HOLD-01` (hold), `DAMAGED-01` (damaged)

---

## 5. Financial & Accounting Tables

---

### 5.1 journal_entries / journal_entry_accounts

**JE:** `id (PK)`, `name (UNIQUE)`, `company`, `total_debit`, `total_credit`, `posting_date`, `status`

**Accounts:** `id (PK)`, `journal_entry_id (FK)`, `account`, `debit`, `credit`, `party`, `cost_center`, `reference_type`, `reference_name`

---

### 5.2 payment_entries

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Payment number (UNIQUE) |
| `payment_type` | VARCHAR(50) | NO | - | Pay, Receive |
| `company` | VARCHAR(200) | NO | - | Company |
| `party` | VARCHAR(200) | YES | - | Party |
| `paid_amount` | NUMERIC(18,6) | YES | 0 | Paid amount |
| `received_amount` | NUMERIC(18,6) | YES | 0 | Received amt |
| `total_allocated_amount` | NUMERIC(18,6) | YES | 0 | Allocated |
| `status` | VARCHAR(50) | YES | 'draft' | Status |
| *(+ 30 more columns)* | | | | |

---

### 5.3 gst_invoices

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `invoice_no` | VARCHAR(100) | NO | - | Invoice number (UNIQUE) |
| `sales_order_no` | VARCHAR(100) | YES | - | Source SO |
| `customer` | VARCHAR(255) | YES | - | Customer |
| `gst_amount` | NUMERIC(18,6) | YES | - | GST amount |
| `status` | VARCHAR(20) | YES | 'draft' | Status |

---

### 5.4 currency_exchange

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `date` | DATE | NO | - | Rate date |
| `from_currency` | VARCHAR(10) | NO | - | From |
| `to_currency` | VARCHAR(10) | NO | - | To |
| `exchange_rate` | NUMERIC(18,6) | NO | - | Rate |
| `for_buying` | BOOLEAN | YES | true | Buying? |
| `for_selling` | BOOLEAN | YES | true | Selling? |

**⚠️ Deduplication Gap:** No unique on `(date, from_currency, to_currency)`.

---

## 6. Quality Control Tables

---

### 6.1 quality_inspections

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `inspection_no` | VARCHAR(30) | NO | - | Inspection number (UNIQUE) |
| `reference_type` | VARCHAR(50) | YES | - | Source type |
| `reference_name` | VARCHAR(100) | YES | - | Source document |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `inspection_type` | VARCHAR(20) | YES | 'incoming' | incoming, outbound |
| `sample_size` | NUMERIC(18,6) | YES | 0 | Sample qty |
| `status` | VARCHAR(20) | YES | 'pending' | Status |
| `inspected_by` | INTEGER | YES | - | Inspector FK |
| `inspected_at` | TIMESTAMPTZ | YES | - | Inspection time |
| `warehouse_id` | INTEGER | YES | - | Warehouse FK |
| `location_id` | INTEGER | YES | - | Location FK |
| `qty` | NUMERIC(18,6) | YES | 0 | Inspection qty |
| `grn_session_id` | INTEGER | YES | - | GRN session FK |
| *(+ 10 more columns)* | | | | |

**Constraints:** PK `id`, UNIQUE `inspection_no`, FK `warehouse_id`, FK `location_id`, FK `grn_session_id`

---

### 6.2 quality_inspection_readings

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `inspection_id` | INTEGER | YES | - | Inspection FK |
| `specification` | VARCHAR(255) | YES | - | Spec name |
| `value` | VARCHAR(255) | YES | - | Measured value |
| `status` | VARCHAR(20) | YES | 'pending' | Pass/Fail |
| `reading_1` to `reading_10` | VARCHAR(200) | YES | - | Individual readings |
| `min_value` | NUMERIC(18,6) | YES | - | Min acceptable |
| `max_value` | NUMERIC(18,6) | YES | - | Max acceptable |
| `formula_based_criteria` | BOOLEAN | YES | false | Use formula? |
| `acceptance_formula` | TEXT | YES | - | Formula |

---

### 6.3 qc_templates

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Template name |
| `category` | VARCHAR(200) | YES | - | Category |
| `sample_size` | INTEGER | YES | 1 | Default sample |
| `checklist` | JSONB | NO | '[]' | Checklist items |
| `auto_approve` | BOOLEAN | YES | false | Auto-approve? |
| `is_active` | BOOLEAN | YES | true | Active? |

---

## 7. Transport & Logistics Tables

---

### 7.1 transports

**Purpose:** Inbound truck/vehicle master for GRN arrival autocomplete.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `truck_no` | VARCHAR(100) | NO | - | Truck plate (UNIQUE, case-insensitive) |
| `name` | VARCHAR(255) | YES | - | Vehicle name |
| `transporter` | VARCHAR(255) | YES | - | Transporter |
| `driver_name` | VARCHAR(255) | YES | - | Default driver |
| `driver_phone` | VARCHAR(50) | YES | - | Phone |
| `notes` | TEXT | YES | - | Notes |
| `disabled` | BOOLEAN | NO | false | Soft delete |
| `created_at` | TIMESTAMPTZ | NO | now() | Creation |
| `updated_at` | TIMESTAMPTZ | NO | now() | Last update |

**Constraints:** PK `id`, UNIQUE INDEX `lower(btrim(truck_no))`

---

### 7.2 box_load_logs

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `box_id` | INTEGER | YES | - | Box FK |
| `trip_id` | INTEGER | YES | - | Trip FK |
| `stop_id` | INTEGER | YES | - | Stop FK |
| `loaded_at` | TIMESTAMPTZ | YES | now() | Load time |
| `loaded_by` | INTEGER | YES | - | User FK |

---

### 7.3 pack_reversals

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `box_id` | INTEGER | YES | - | Box FK |
| `box_item_id` | INTEGER | YES | - | Box item FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `qty_removed` | NUMERIC(18,6) | YES | - | Qty removed |
| `reason` | VARCHAR(255) | YES | - | Reason |
| `reversed_at` | TIMESTAMPTZ | YES | now() | Time |
| `reversed_by` | INTEGER | YES | - | User FK |

---

## 8. Workflow & Configuration Tables

---

### 8.1 workflow_definitions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Name (UNIQUE) |
| `entity_type` | VARCHAR(50) | NO | - | Entity type |
| `states` | JSONB | NO | - | Allowed states |
| `transitions` | JSONB | NO | - | Allowed transitions |
| `active` | BOOLEAN | YES | true | Active? |

---

### 8.2 workflow_instances

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `workflow_id` | INTEGER | YES | - | Definition FK |
| `entity_type` | VARCHAR(50) | NO | - | Entity type |
| `entity_id` | INTEGER | NO | - | Entity ID |
| `current_state` | VARCHAR(50) | NO | - | Current state |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |
| `updated_at` | TIMESTAMPTZ | YES | now() | Last update |

---

### 8.3 roles

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `code` | VARCHAR(50) | NO | - | Role code (UNIQUE) |
| `name` | VARCHAR(100) | NO | - | Display name |
| `description` | TEXT | YES | - | Description |
| `is_system` | BOOLEAN | NO | false | System role? |
| `created_at` | TIMESTAMPTZ | NO | now() | Creation |
| `access_profile` | JSONB | NO | '{}' | {inbound, outbound, admin} × none|view|edit |

**Seeded Roles:** admin, supervisor, picker, packer, qi, dispatcher, wm, driver, billing

---

### 8.4 role_permissions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `role_id` | INTEGER | NO | - | Role FK (CASCADE) |
| `permission_code` | VARCHAR(80) | NO | - | Permission code |

**Constraints:** PK `(role_id, permission_code)`, INDEX on permission_code

---

### 8.5 packing_list_templates

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `name` | VARCHAR(100) | NO | - | Template name |
| `supplier_id` | INTEGER | YES | - | Supplier FK |
| `header_row` | INTEGER | YES | 1 | Header row |
| `column_map` | JSONB | NO | '{}' | Column mapping |
| `skip_summary_row` | BOOLEAN | YES | true | Skip summary? |
| `is_active` | BOOLEAN | YES | true | Active? |

---

### 8.6 priority_history

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `sales_order_id` | INTEGER | NO | - | SO FK |
| `old_priority` | INTEGER | YES | - | Previous |
| `new_priority` | INTEGER | NO | - | New |
| `reason` | TEXT | YES | - | Reason |
| `set_by` | INTEGER | YES | - | User FK |
| `set_at` | TIMESTAMPTZ | YES | now() | Time |

---

### 8.7 discount_rules

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `customer_group` | VARCHAR(100) | YES | - | Customer group |
| `item_hierarchy_node` | VARCHAR(100) | YES | - | Item hierarchy |
| `discount_pct` | NUMERIC(5,2) | YES | - | Discount % |
| `active` | BOOLEAN | YES | true | Active? |
| `valid_from` | DATE | YES | - | Valid from |
| `valid_to` | DATE | YES | - | Valid to |

---

### 8.8 order_templates / order_template_lines

**Template:** `id (PK)`, `customer_id (FK)`, `name`, `frequency`, `next_run`

**Lines:** `id (PK)`, `template_id (FK)`, `item_code`, `quantity`

---

### 8.9 saved_kits

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| customer_id | integer | YES | - | FK → customers.id |
| name | varchar(100) | NO | - | Kit name |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** id

---

### 8.10 saved_kit_lines

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| kit_id | integer | YES | - | FK → saved_kits.id |
| item_code | varchar(100) | NO | - | Item code |
| quantity | numeric(18,6) | YES | - | Kit quantity |

**Primary Key:** id
**Foreign Keys:** kit_id → saved_kits(id)

---


| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `type` | VARCHAR(20) | YES | 'info' | info, warning, error, success |
| `title` | VARCHAR(255) | NO | - | Title |
| `message` | TEXT | YES | - | Body |
| `is_read` | BOOLEAN | YES | false | Read? |
| `user_id` | INTEGER | YES | - | Recipient FK |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, INDEX `idx_notifications_user_unread` on (user_id, is_read) WHERE is_read = false

---

## 9. Analytics & Forecasting Tables

---

### 9.1 demand_forecast

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `warehouse` | VARCHAR(255) | YES | - | Warehouse |
| `forecast_date` | DATE | NO | - | Forecast date |
| `forecast_qty` | NUMERIC(18,6) | YES | - | Predicted qty |
| `actual_qty` | NUMERIC(18,6) | YES | - | Actual qty |
| `forecast_error` | NUMERIC(10,4) | YES | - | Error metric |
| `method` | VARCHAR(20) | YES | 'moving_avg' | Method |

---

### 9.2 seasonal_patterns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `month` | INTEGER | NO | - | Month (1-12) |
| `avg_qty` | NUMERIC(18,6) | YES | - | Average |
| `peak_qty` | NUMERIC(18,6) | YES | - | Peak |
| `trough_qty` | NUMERIC(18,6) | YES | - | Low |
| `seasonality_index` | NUMERIC(5,2) | YES | - | Index |

---

### 9.3 customer_metrics

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `customer_id` | INTEGER | YES | - | Customer FK |
| `total_orders` | INTEGER | YES | 0 | Order count |
| `total_revenue` | NUMERIC(18,2) | YES | 0 | Revenue |
| `total_returns` | INTEGER | YES | 0 | Returns |
| `return_rate` | NUMERIC(5,2) | YES | 0 | Return % |
| `avg_order_value` | NUMERIC(12,2) | YES | 0 | AOV |
| `backorder_count` | INTEGER | YES | 0 | BO count |
| `backorder_rate` | NUMERIC(5,2) | YES | 0 | BO rate |
| `last_order_date` | DATE | YES | - | Last order |
| `ranking` | INTEGER | YES | - | Rank |

---

### 9.4 warehouse_metrics

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `warehouse_id` | INTEGER | YES | - | Warehouse FK |
| `total_bins` | INTEGER | YES | 0 | Total locations |
| `occupied_bins` | INTEGER | YES | 0 | Occupied |
| `utilization_pct` | NUMERIC(5,2) | YES | - | Utilization % |
| `avg_dock_to_stock_hours` | NUMERIC(5,1) | YES | - | D2S hours |
| `pick_accuracy_pct` | NUMERIC(5,2) | YES | - | Pick accuracy |

---

### 9.5 supplier_performance

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `supplier_name` | VARCHAR(255) | NO | - | Supplier |
| `total_grn` | INTEGER | YES | 0 | Receipts |
| `full_match_count` | INTEGER | YES | 0 | Full matches |
| `shortage_count` | INTEGER | YES | 0 | Shortages |
| `overage_count` | INTEGER | YES | 0 | Overages |
| `avg_lead_time_days` | NUMERIC(5,1) | YES | - | Lead time |
| `accuracy_pct` | NUMERIC(5,2) | YES | - | Accuracy % |

---

### 9.6 item_movement_classifications

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `classification` | VARCHAR(20) | YES | - | fast, slow, dead |
| `turnover_ratio` | NUMERIC(10,4) | YES | - | Turnover |
| `days_since_last_sale` | INTEGER | YES | - | Days idle |
| `avg_daily_sales` | NUMERIC(12,4) | YES | - | ADS |

---

### 9.7 price_observations

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `batch_no` | VARCHAR(100) | YES | - | Batch |
| `observed_mrp` | NUMERIC(18,6) | YES | - | MRP |
| `observed_at_stage` | VARCHAR(50) | YES | - | Stage |
| `flagged` | BOOLEAN | YES | false | Anomaly? |

---

### 9.8 item_hierarchy_nodes / item_variants / item_model_fitment / wishlists

**Hierarchy:** `id (PK)`, `name (UNIQUE)`, `level` (group|category|subcategory|brand), `parent_id (self-ref)`

**Variants:** `id (PK)`, `item_code`, `variant_of`, `item_attribute`, `item_attribute_value`

**Fitment:** `id (PK)`, `item_id (FK)`, `model_id (FK)`

**Wishlists:** `id (PK)`, `customer_id (FK)`, `item_code`

---

## 10. Audit & Logging Tables

---

### 10.1 audit_log

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `operation` | VARCHAR(50) | NO | - | INSERT, UPDATE, DELETE |
| `entity_type` | VARCHAR(50) | YES | - | Table name |
| `entity_id` | INTEGER | YES | - | Record ID |
| `old_value` | JSONB | YES | - | Previous state |
| `new_value` | JSONB | YES | - | New state |
| `actor_id` | INTEGER | YES | - | User FK |
| `created_at` | TIMESTAMPTZ | YES | now() | Timestamp |

**Append-only**

---

### 10.2 request_logs

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `method` | VARCHAR(10) | YES | - | GET, POST, etc. |
| `path` | VARCHAR(255) | YES | - | Request path |
| `status_code` | INTEGER | YES | - | HTTP status |
| `user_id` | INTEGER | YES | - | User FK |
| `ip_address` | VARCHAR(45) | YES | - | Client IP |
| `duration_ms` | INTEGER | YES | - | Response time |

**Append-only**

---

### 10.3 error_logs

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `method` | VARCHAR(100) | YES | - | Handler |
| `error` | TEXT | YES | - | Error message |
| `traceback` | TEXT | YES | - | Stack trace |
| `created_at` | TIMESTAMPTZ | YES | now() | Timestamp |

**Append-only**

---

### 10.4 scheduler_logs

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `job_name` | VARCHAR(100) | YES | - | Job name |
| `status` | VARCHAR(20) | YES | - | success, error |
| `started_at` | TIMESTAMPTZ | YES | - | Start |
| `completed_at` | TIMESTAMPTZ | YES | - | End |
| `error` | TEXT | YES | - | Error |

**Append-only**

---

### 10.5 pick_scan_logs

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `log_no` | VARCHAR(30) | NO | - | Log number |
| `pick_list_id` | INTEGER | YES | - | Pick list FK |
| `pick_list_item_id` | INTEGER | YES | - | PL item FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `scanned_bin` | VARCHAR(100) | YES | - | Scanned location |
| `expected_bin` | VARCHAR(100) | YES | - | Expected location |
| `location_drift` | BOOLEAN | YES | false | Wrong location? |
| `quantity` | NUMERIC(18,6) | YES | - | Qty |
| `scanned_at` | TIMESTAMPTZ | YES | now() | Scan time |
| `scanned_by` | INTEGER | YES | - | User FK |

---

### 10.6 manual_pick_records

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `log_no` | VARCHAR(30) | NO | - | Log number |
| `pick_list_id` | INTEGER | YES | - | Pick list FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `qty_picked` | NUMERIC(18,6) | YES | - | Qty picked |
| `bin_location` | VARCHAR(100) | YES | - | Location |
| `picker_name` | VARCHAR(100) | YES | - | Picker |
| `picked_at` | TIMESTAMPTZ | YES | now() | Pick time |

---

## 11. Attachment & Comment Tables

---

### 11.1 attachments

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `entity_type` | VARCHAR(50) | NO | - | Table name |
| `entity_id` | INTEGER | NO | - | Record ID |
| `filename` | VARCHAR(255) | NO | - | Original filename |
| `stored_name` | VARCHAR(255) | NO | - | Stored filename |
| `mime_type` | VARCHAR(100) | YES | - | MIME type |
| `size_bytes` | INTEGER | YES | - | File size |
| `uploaded_by` | INTEGER | YES | - | User FK |
| `created_at` | TIMESTAMPTZ | YES | now() | Upload time |

---

### 11.2 comments

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `entity_type` | VARCHAR(50) | NO | - | Table name |
| `entity_id` | INTEGER | NO | - | Record ID |
| `user_id` | INTEGER | YES | - | Author FK |
| `text` | TEXT | NO | - | Comment text |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

---

## ER Diagram (Simplified)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MASTER DATA                                        │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│  companies   │  warehouses  │    items     │  suppliers   │   customers     │
│  ──────────  │  ──────────  │  ──────────  │  ──────────  │   ──────────    │
│  id (PK)     │  id (PK)     │  id (PK)     │  id (PK)     │   id (PK)       │
│  name (UQ)   │  code (UQ)   │  code (UQ)   │  erp_id (UQ) │   erp_id (UQ)   │
│              │  company_id ─┼─► companies  │              │                 │
│              │  parent_id ──┤  item_group_id┼─► item_groups│                 │
│              │              │  stock_uom_id┼─► uoms       │                 │
│              │              │  home_location_id┼► wh_locs  │                 │
└──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           INBOUND FLOW                                       │
│  purchase_orders ──► purchase_order_items                                    │
│       │                                                                      │
│       ▼                                                                      │
│  grn_sessions ──► grn_cartons ──► grn_lines                                 │
│       │              │               ├──► quality_inspections                │
│       │              │               │        └──► qi_readings              │
│       │              │               └──► putaway_logs                       │
│       │              ├──► grn_invoices                                       │
│       │              ├──► grn_events (audit)                                │
│       │              └──► grn_exceptions                                    │
│       │                                                                      │
│  purchase_invoices ──► purchase_invoice_items                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          OUTBOUND FLOW                                       │
│  sales_orders ──► sales_order_items                                          │
│       │                                                                      │
│       ▼                                                                      │
│  pick_lists ──► pick_list_items ──► stock_location_balances (reserve)       │
│       │                                                                      │
│       ▼                                                                      │
│  boxes ──► box_items ──► (stock consumed)                                    │
│       │                                                                      │
│       ▼                                                                      │
│  delivery_notes ──► delivery_note_items                                      │
│       │                                                                      │
│       ▼                                                                      │
│  delivery_trips ──► delivery_stops                                           │
│       │              ├──► delivery_photos                                    │
│       │              └──► delivery_signatures                                │
│       │                                                                      │
│       ▼                                                                      │
│  sales_invoices ──► sales_invoice_items                                      │
│                                                                              │
│  backorders_v ──► backorder_lines_v                                       │
│  return_claims ──► return_claim_lines ──► return_claim_photos               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         INVENTORY LAYER                                      │
│  warehouse_locations ──► stock_location_balances (operational truth)         │
│  bins (ERP-synced)                                                           │
│  stock_entries ──► stock_entry_items (transfers)                            │
│  stock_ledger_entries (FIFO valuation - append-only)                        │
│  stock_reconciliations ──► stock_reconciliation_items                       │
│  cycle_count_sheets ──► cycle_count_lines                                   │
│  batches, serial_numbers                                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        FINANCIAL LAYER                                       │
│  journal_entries ──► journal_entry_accounts                                 │
│  payment_entries                                                             │
│  gst_invoices                                                               │
│  currency_exchange                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Relationships Summary

| Parent Table | Child Table | FK Column | Cascade? |
|-------------|-------------|-----------|----------|
| warehouses | warehouse_locations | warehouse_id | No |
| warehouses | grn_sessions | warehouse_id | No |
| warehouses | pick_lists | warehouse_id | No |
| grn_sessions | grn_cartons | grn_session_id | YES |
| grn_sessions | grn_events | grn_session_id | YES |
| grn_sessions | grn_exceptions | grn_session_id | YES |
| grn_sessions | grn_invoices | grn_session_id | YES |
| grn_cartons | grn_lines | grn_carton_id | YES |
| pick_lists | pick_list_items | pick_list_id | YES |
| pick_lists | boxes | pick_list_id | No |
| boxes | box_items | box_id | YES |
| delivery_trips | delivery_stops | trip_id | YES |
| sales_orders | sales_order_items | sales_order_id | No |
| purchase_orders | purchase_order_items | purchase_order_id | YES |
| return_claims | return_claim_lines | return_claim_id | YES |
| quality_inspections | quality_inspection_readings | inspection_id | No |
| roles | role_permissions | role_id | YES |

---

*Document generated from 53 migration files. Last updated: 2026-08-28*

---

## 12. Missing Tables (Added)

These tables were found in migrations but were not documented in the original sections.

---

### 12.1 grn_presence

**Purpose:** Concurrent operator presence tracking on GRN sessions (heartbeat).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `grn_session_id` | INTEGER | NO | - | GRN session FK (CASCADE) |
| `user_id` | INTEGER | NO | - | User FK |
| `device` | TEXT | YES | - | Device identifier |
| `last_seen` | TIMESTAMPTZ | NO | now() | Last heartbeat |

**Constraints:** PK `(grn_session_id, user_id)`, FK `grn_session_id → grn_sessions(id)` CASCADE, INDEX `idx_grn_presence_seen`

---

### 12.2 grn_audits

**Purpose:** GRN verification audit sessions — sample-based double-check of received items.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `grn_session_id` | INTEGER | NO | - | GRN session FK (CASCADE) |
| `sample_size` | INTEGER | NO | 5 | Items to audit |
| `status` | VARCHAR(30) | YES | 'open' | open, completed |
| `started_by` | INTEGER | YES | - | Starter FK |
| `started_at` | TIMESTAMPTZ | YES | now() | Start time |
| `completed_at` | TIMESTAMPTZ | YES | - | End time |
| `notes` | TEXT | YES | - | Notes |

**Constraints:** PK `id`, FK `grn_session_id → grn_sessions(id)` CASCADE, INDEX `idx_grn_audits_session`

---

### 12.3 grn_audit_items

**Purpose:** Individual items checked during a GRN audit session.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `audit_id` | INTEGER | NO | - | Audit FK (CASCADE) |
| `part_no` | VARCHAR(100) | NO | - | Item/part number |
| `system_qty` | NUMERIC(18,6) | NO | 0 | System expected qty |
| `physical_qty` | NUMERIC(18,6) | YES | - | Physical count |
| `result` | VARCHAR(20) | YES | - | match, mismatch |
| `checked_by` | INTEGER | YES | - | Checker FK |
| `checked_at` | TIMESTAMPTZ | YES | - | Check time |
| `notes` | TEXT | YES | - | Notes |

**Constraints:** PK `id`, FK `audit_id → grn_audits(id)` CASCADE

---

### 12.4 grn_invoice_lines

**Purpose:** Expected invoice line items for invoice-only GRN mode.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `grn_session_id` | INTEGER | NO | - | GRN session FK (CASCADE) |
| `invoice_no` | VARCHAR(100) | NO | - | Invoice number |
| `part_no` | VARCHAR(100) | NO | - | Part number |
| `expected_qty` | NUMERIC(18,6) | NO | 0 | Expected quantity |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, FK `grn_session_id → grn_sessions(id)` CASCADE, UNIQUE `(grn_session_id, invoice_no, part_no)`, INDEX `idx_grn_invoice_lines_session`

---

### 12.5 item_bin_capacities

**Purpose:** Per-SKU bin capacity overrides — learned from putaway fit exceptions or set in master data.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `location_id` | INTEGER | NO | - | Location FK |
| `max_qty` | NUMERIC(18,6) | NO | - | Max qty that fits (CHECK > 0) |
| `updated_at` | TIMESTAMPTZ | YES | now() | Last update |

**Constraints:** PK `id`, UNIQUE `(item_code, location_id)`, FK `location_id → warehouse_locations(id)`, INDEX `idx_item_bin_capacities_item`

---

### 12.6 putaway_sessions

**Purpose:** Batch putaway sessions — worker picks items into tote, then distributes to storage locations.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `user_id` | INTEGER | NO | - | Worker FK |
| `warehouse_id` | INTEGER | NO | - | Warehouse FK |
| `zone` | VARCHAR(10) | YES | - | Target zone |
| `status` | VARCHAR(20) | NO | 'picking' | picking, placing, completed, cancelled |
| `started_at` | TIMESTAMPTZ | YES | now() | Start time |
| `updated_at` | TIMESTAMPTZ | YES | now() | Last update |
| `completed_at` | TIMESTAMPTZ | YES | - | End time |

**Constraints:** PK `id`, INDEX `idx_ps_user` on `(user_id, status)`

**Note:** Stale sessions (>2 hours) are auto-cancelled by `cancel_stale_putaway_sessions()`.

---

### 12.7 putaway_session_items

**Purpose:** Items picked into tote during a putaway session, awaiting placement into storage.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `session_id` | INTEGER | NO | - | Session FK (CASCADE) |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `source_location_id` | INTEGER | NO | - | Source location FK |
| `qty` | NUMERIC(18,6) | NO | - | Quantity |
| `status` | VARCHAR(20) | NO | 'picked' | picked, placed, exception |
| `target_location_id` | INTEGER | YES | - | Target location FK |
| `putaway_log_id` | INTEGER | YES | - | Linked putaway log |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, FK `session_id → putaway_sessions(id)` CASCADE, FK `source_location_id → warehouse_locations(id)`, FK `target_location_id → warehouse_locations(id)`, INDEX `idx_psi_session`

---

### 12.8 putaway_exceptions

**Purpose:** Worker-reported putaway exceptions (bin too small/large during placement).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `rejected_location` | VARCHAR(100) | YES | - | Rejected location code |
| `rejected_location_id` | INTEGER | YES | - | Rejected location FK |
| `reason` | VARCHAR(30) | NO | - | too_small, too_large, etc. |
| `requested_qty` | NUMERIC(18,6) | YES | - | Qty requested |
| `fits_qty` | NUMERIC(18,6) | YES | - | Qty that actually fits |
| `override_location` | VARCHAR(100) | YES | - | Override location |
| `notes` | TEXT | YES | - | Notes |
| `created_by` | INTEGER | YES | - | Worker FK |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`

---

### 12.9 wave_order_lines

**Purpose:** Per-order attribution for wave put-to-order consolidation.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `pick_list_id` | INTEGER | NO | - | Pick list FK |
| `sales_order_id` | INTEGER | NO | - | Sales order FK |
| `sales_order_item_id` | INTEGER | YES | - | SO line FK |
| `item_code` | VARCHAR(100) | NO | - | Item code |
| `required_qty` | NUMERIC(18,6) | NO | - | Required qty |
| `consolidated_qty` | NUMERIC(18,6) | NO | 0 | Consolidated qty |
| `created_at` | TIMESTAMPTZ | YES | now() | Creation |

**Constraints:** PK `id`, UNIQUE `(pick_list_id, sales_order_id, item_code)`, FK `pick_list_id → pick_lists(id)`, FK `sales_order_id → sales_orders(id)`, FK `sales_order_item_id → sales_order_items(id)`, INDEX `idx_wave_order_lines_pick`, INDEX `idx_wave_order_lines_so`

---

### 12.10 pick_shortage_flags

**Purpose:** Picker-reported shortage flags — when a picker can't find an item, they flag it; supervisor reviews and either approves (creates backorder) or rejects.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `flag_no` | VARCHAR(32) | NO | - | Flag number (UNIQUE) |
| `pick_list_id` | INTEGER | NO | - | Pick list FK (CASCADE) |
| `pick_list_item_id` | INTEGER | YES | - | PL item FK (CASCADE) |
| `sales_order_no` | VARCHAR(140) | YES | - | Source SO |
| `item_code` | VARCHAR(140) | NO | - | Item code |
| `item_name` | VARCHAR(255) | YES | - | Item name |
| `location_code` | VARCHAR(64) | YES | - | Expected location |
| `qty` | NUMERIC(18,6) | NO | 0 | Shortage qty |
| `reason` | TEXT | YES | - | Picker's reason |
| `status` | VARCHAR(24) | NO | 'pending' | pending, approved, rejected |
| `flagged_by` | INTEGER | YES | - | Picker FK |
| `flagged_at` | TIMESTAMPTZ | NO | now() | Flag time |
| `reviewed_by` | INTEGER | YES | - | Supervisor FK |
| `reviewed_at` | TIMESTAMPTZ | YES | - | Review time |
| `review_note` | TEXT | YES | - | Review note |
| `backorder_no` | VARCHAR(32) | YES | - | Created backorder (if approved) |
| `created_at` | TIMESTAMPTZ | NO | now() | Creation |

**Status Flow:**
```
pending → approved (creates backorder) | rejected (re-reserves stock)
```

**Constraints:** PK `id`, UNIQUE `flag_no`, FK `pick_list_id → pick_lists(id)` CASCADE, FK `pick_list_item_id → pick_list_items(id)` CASCADE, INDEX `idx_shortage_flags_status`, INDEX `idx_shortage_flags_pick_list`

---

### 12.11 wave_reconciliations

**Purpose:** Wave close-out audit trail — records leftover qty, shrinkage, and resolution for every wave completion.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | INTEGER | NO | auto | Primary key |
| `pick_list_id` | INTEGER | NO | - | Pick list FK (CASCADE) |
| `leftover_qty` | NUMERIC(18,6) | NO | 0 | Remaining qty |
| `leftover_breakdown` | JSONB | YES | - | Per-item breakdown |
| `incomplete_orders` | JSONB | YES | - | Unfulfilled orders |
| `resolution` | VARCHAR(24) | NO | 'none' | none, return_to_stock, write_off |
| `forced` | BOOLEAN | NO | false | Forced close (has leftovers)? |
| `reason` | TEXT | YES | - | Reason |
| `resolved_by` | INTEGER | YES | - | Resolver FK |
| `resolved_at` | TIMESTAMPTZ | NO | now() | Resolution time |

**Constraints:** PK `id`, FK `pick_list_id → pick_lists(id)` CASCADE, INDEX `idx_wave_reconciliations_pick_list`

---

## Updated Key Relationships

| Parent Table | Child Table | FK Column | Cascade? |
|-------------|-------------|-----------|----------|
| grn_sessions | grn_presence | grn_session_id | YES |
| grn_sessions | grn_audits | grn_session_id | YES |
| grn_sessions | grn_invoice_lines | grn_session_id | YES |
| grn_audits | grn_audit_items | audit_id | YES |
| putaway_sessions | putaway_session_items | session_id | YES |
| pick_lists | pick_shortage_flags | pick_list_id | YES |
| pick_lists | wave_reconciliations | pick_list_id | YES |
| pick_lists | wave_order_lines | pick_list_id | No |
| sales_orders | wave_order_lines | sales_order_id | No |
| warehouse_locations | item_bin_capacities | location_id | No |

---

*Document updated: 2026-08-28 — Added 10 missing tables (12.1–12.11)*
*Total documented tables: 123 (matching all CREATE TABLE statements in 53 migration files)*

---

## 12. APPENDIX: ADDITIONAL TABLES

### 12.1 backorders

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| backorder_no | varchar(30) | NO | - | Backorder reference number |
| sales_order_no | varchar(100) | NO | - | Reference to sales order |
| customer | varchar(255) | YES | - | Customer name |
| warehouse | varchar(255) | YES | - | Warehouse identifier |
| status | varchar(20) | YES | 'pending' | Status: pending, partially_fulfilled, fulfilled |
| notes | text | YES | - | Additional notes |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Unique Constraints:** `backorders_no` on `backorder_no`
**Status Flow:** pending → partially_fulfilled → fulfilled

---

### 12.2 backorder_lines

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| backorder_id | integer | YES | - | FK → backorders.id |
| item_code | varchar(100) | NO | - | Item code |
| ordered_qty | numeric(18,6) | YES | - | Original ordered quantity |
| available_qty | numeric(18,6) | YES | - | Available quantity |
| backorder_qty | numeric(18,6) | YES | - | Remaining backorder quantity |
| fulfilled_qty | numeric(18,6) | YES | 0 | Quantity fulfilled |
| status | varchar(20) | YES | 'pending' | Status: pending, fulfilled |

**Primary Key:** `id`
**Foreign Keys:** `backorder_id` → `backorders(id)`
**Note:** ⚠️ No composite unique constraint on (backorder_id, item_code)

---

### 12.3 backorders_v2

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| backorder_no | varchar(30) | NO | UNIQUE | Backorder reference number |
| sales_order_no | varchar(100) | NO | - | Reference to sales order |
| customer | varchar(255) | YES | - | Customer name |
| warehouse | varchar(255) | YES | - | Warehouse identifier |
| notes | text | YES | - | Additional notes |
| status | varchar(50) | YES | 'pending' | Status |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Unique Constraints:** UNIQUE on `backorder_no`
**Note:** Proposed redesign - not yet active in production

---

### 12.4 backorder_lines_v2

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| backorder_id | integer | YES | - | FK → backorders_v2.id |
| item_code | varchar(100) | NO | - | Item code |
| qty | numeric(18,6) | NO | - | Backorder quantity |
| warehouse | varchar(255) | YES | - | Warehouse identifier |
| status | varchar(50) | YES | 'pending' | Status |

**Primary Key:** `id`
**Foreign Keys:** `backorder_id` → `backorders_v(id)`
**Unique Index:** `idx_backorder_lines_v_open_dedup` on (item_code, warehouse) WHERE status = 'pending'

---

### 12.5 customer_groups

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Group name |
| parent_id | integer | YES | - | FK → customer_groups.id (hierarchy) |

**Primary Key:** `id`
**Unique Constraints:** None
**Note:** Hierarchical structure via parent_id

---

### 12.6 supplier_groups

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Group name |
| parent_id | integer | YES | - | FK → supplier_groups.id (hierarchy) |

**Primary Key:** `id`
**Unique Constraints:** None
**Note:** Hierarchical structure via parent_id

---

### 12.7 journal_entries

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Journal entry reference |
| voucher_type | varchar(100) | YES | 'Journal Entry' | Voucher type |
| posting_date | date | YES | CURRENT_DATE | Posting date |
| company | varchar(200) | NO | - | Company name |
| multi_currency | boolean | YES | false | Multi-currency flag |
| total_debit | numeric(18,6) | YES | 0 | Total debit amount |
| total_credit | numeric(18,6) | YES | 0 | Total credit amount |
| difference | numeric(18,6) | YES | 0 | Balance difference |
| cheque_no | varchar(100) | YES | - | Cheque number |
| cheque_date | date | YES | - | Cheque date |
| clearance_date | date | YES | - | Bank clearance date |
| user_remark | text | YES | - | User remark |
| remark | text | YES | - | System remark |
| bill_no | varchar(100) | YES | - | Bill number |
| bill_date | date | YES | - | Bill date |
| due_date | date | YES | - | Due date |
| reversal_of | varchar(100) | YES | - | Reversal reference |
| is_system_generated | boolean | YES | false | System-generated flag |
| pay_to_recd_from | varchar(200) | YES | - | Payee/recipient |
| total_amount | numeric(18,6) | YES | 0 | Total amount |
| total_amount_currency | varchar(10) | YES | - | Currency code |
| total_amount_in_words | varchar(200) | YES | - | Amount in words |
| is_opening | varchar(20) | YES | 'No' | Opening entry flag |
| mode_of_payment | varchar(200) | YES | - | Payment mode |
| status | varchar(50) | YES | 'draft' | Status |
| title | varchar(200) | YES | - | Journal entry title |
| created_by | integer | YES | - | User ID |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Unique Constraints:** None
**Status Flow:** draft → submitted

---

### 12.8 journal_entry_accounts

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| journal_entry_id | integer | NO | - | FK → journal_entries.id |
| account | varchar(200) | NO | - | Account name |
| account_type | varchar(100) | YES | - | Account type |
| bank_account | varchar(200) | YES | - | Bank account |
| party_type | varchar(100) | YES | - | Party type |
| party | varchar(200) | YES | - | Party name |
| cost_center | varchar(200) | YES | - | Cost center |
| project | varchar(100) | YES | - | Project code |
| account_currency | varchar(10) | YES | - | Account currency |
| exchange_rate | numeric(18,6) | YES | 1 | Exchange rate |
| debit_in_account_currency | numeric(18,6) | YES | 0 | Debit in account currency |
| debit | numeric(18,6) | YES | 0 | Debit amount |
| credit_in_account_currency | numeric(18,6) | YES | 0 | Credit in account currency |
| credit | numeric(18,6) | YES | 0 | Credit amount |
| reference_type | varchar(100) | YES | - | Reference type |
| reference_name | varchar(100) | YES | - | Reference name |
| reference_due_date | date | YES | - | Reference due date |
| user_remark | text | YES | - | User remark |
| against_account | text | YES | - | Against account |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `journal_entry_id` → `journal_entries(id)`
**Note:** Double-entry accounting - debit and credit lines

---

### 12.9 material_requests

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Request reference |
| request_type | varchar(50) | YES | - | Type: Purchase, Material Transfer, etc. |
| status | varchar(50) | YES | - | Status: Draft, Submitted, etc. |
| schedule_date | date | YES | - | Scheduled date |
| auto_created | boolean | YES | false | Auto-created flag |
| last_synced_at | timestamptz | YES | - | Last sync timestamp |

**Primary Key:** `id`
**Unique Constraints:** None

---

### 12.10 material_request_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| request_id | integer | YES | - | FK → material_requests.id |
| item_code | varchar(100) | NO | - | Item code |
| qty | numeric(18,6) | YES | - | Requested quantity |
| schedule_date | date | YES | - | Scheduled date |

**Primary Key:** `id`
**Foreign Keys:** `request_id` → `material_requests(id)`

---

### 12.11 order_fulfillment_log

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| sales_order_no | varchar(100) | NO | - | Sales order reference |
| customer | varchar(255) | YES | - | Customer name |
| total_items | integer | YES | - | Total items in order |
| fulfilled_items | integer | YES | 0 | Items fulfilled |
| fill_rate | numeric(5,2) | YES | - | Fill rate percentage |
| backordered_items | integer | YES | 0 | Items backordered |
| status | varchar(20) | YES | 'pending' | Status: pending, completed |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`

---

### 12.12 order_status_logs

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| sales_order_no | varchar(100) | NO | - | Sales order reference |
| from_status | varchar(50) | YES | - | Previous status |
| to_status | varchar(50) | YES | - | New status |
| actor_id | integer | YES | - | User who made the change |
| notes | text | YES | - | Change notes |
| created_at | timestamptz | YES | now() | Change timestamp |

**Primary Key:** `id`

---

### 12.13 order_templates

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| customer_id | integer | YES | - | FK → customers.id |
| name | varchar(100) | NO | - | Template name |
| frequency | varchar(20) | YES | - | Order frequency |
| next_run | date | YES | - | Next scheduled run |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`

---

### 12.14 order_template_lines

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| template_id | integer | YES | - | FK → order_templates.id |
| item_code | varchar(100) | NO | - | Item code |
| quantity | numeric(18,6) | YES | - | Order quantity |

**Primary Key:** `id`
**Foreign Keys:** `template_id` → `order_templates(id)`

---

### 12.15 cycle_count_sheets

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| sheet_no | varchar(30) | NO | - | Sheet reference number |
| warehouse_id | integer | YES | - | FK → warehouses.id |
| tier | varchar(5) | YES | - | ABC tier filter |
| scheduled_date | date | YES | - | Scheduled count date |
| status | varchar(20) | YES | 'pending' | Status: pending, in_progress, completed |
| completed_at | timestamptz | YES | - | Completion timestamp |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Status Flow:** pending → in_progress → completed

---

### 12.16 cycle_count_lines

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| sheet_id | integer | YES | - | FK → cycle_count_sheets.id |
| item_code | varchar(100) | NO | - | Item code |
| system_qty | numeric(18,6) | YES | - | System quantity |
| counted_qty | numeric(18,6) | YES | 0 | Physically counted quantity |
| discrepancy_status | varchar(20) | YES | - | Status: match, variance |
| counted_by | integer | YES | - | User who counted |
| counted_at | timestamptz | YES | - | Count timestamp |

**Primary Key:** `id`
**Foreign Keys:** `sheet_id` → `cycle_count_sheets(id)`

---

### 12.17 delivery_photos

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| stop_id | integer | YES | - | FK → delivery_stops.id |
| photo_data | text | YES | - | Base64 encoded photo |
| issue_reason | varchar(255) | YES | - | Reason for photo |
| captured_by | integer | YES | - | User who captured |
| captured_at | timestamptz | YES | now() | Capture timestamp |

**Primary Key:** `id`

---

### 12.18 delivery_signatures

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| stop_id | integer | YES | - | FK → delivery_stops.id |
| order_no | varchar(100) | YES | - | Order reference |
| signature_data | text | YES | - | Base64 encoded signature |
| captured_by | integer | YES | - | User who captured |
| captured_at | timestamptz | YES | now() | Capture timestamp |

**Primary Key:** `id`

---

### 12.19 item_hierarchy_nodes

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Node name |
| level | varchar(20) | YES | - | Level: group, category, subcategory, brand |
| parent_id | integer | YES | - | FK → item_hierarchy_nodes.id |

**Primary Key:** `id`
**CHECK Constraint:** level IN ('group', 'category', 'subcategory', 'brand')

---

### 12.20 item_variants

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| item_code | varchar(100) | NO | - | Variant item code |
| variant_of | varchar(100) | YES | - | Parent item code |
| item_attribute | varchar(100) | NO | - | Attribute name (e.g., color, size) |
| item_attribute_value | varchar(200) | NO | - | Attribute value |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`

---

### 12.21 item_model_fitment

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| item_id | integer | YES | - | FK → items.id |
| model_id | integer | YES | - | FK → motorcycle_models.id |

**Primary Key:** `id`
**Note:** Junction table for item-vehicle compatibility

---

### 12.22 wishlists

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| customer_id | integer | YES | - | FK → customers.id |
| item_code | varchar(100) | NO | - | Item code |
| added_at | timestamptz | YES | now() | Addition timestamp |

**Primary Key:** `id`

---

### 12.23 packing_slips

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Packing slip reference |
| customer | varchar(255) | YES | - | Customer name |
| status | varchar(20) | YES | 'draft' | Status |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`

---

### 12.24 packing_slip_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| packing_slip_id | integer | NO | - | FK → packing_slips.id |
| item_code | varchar(100) | NO | - | Item code |
| item_name | varchar(200) | YES | - | Item name |
| batch_no | varchar(100) | YES | - | Batch number |
| description | text | YES | - | Description |
| qty | numeric(18,6) | NO | 0 | Quantity |
| net_weight | numeric(18,6) | YES | 0 | Net weight |
| stock_uom | varchar(50) | YES | - | Stock unit of measure |
| weight_uom | varchar(50) | YES | - | Weight unit of measure |
| dn_detail | varchar(100) | YES | - | Delivery note detail |
| pi_detail | varchar(100) | YES | - | Packing instruction detail |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `packing_slip_id` → `packing_slips(id)`

---

### 12.25 sales_invoices

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Invoice reference |
| customer | varchar(255) | YES | - | Customer name |
| grand_total | numeric(18,6) | YES | 0 | Grand total amount |
| status | varchar(20) | YES | 'draft' | Status |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`

---

### 12.26 sales_invoice_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| sales_invoice_id | integer | NO | - | FK → sales_invoices.id |
| item_code | varchar(100) | NO | - | Item code |
| item_name | varchar(200) | YES | - | Item name |
| description | text | YES | - | Description |
| item_group | varchar(200) | YES | - | Item group |
| qty | numeric(18,6) | NO | 0 | Quantity |
| uom | varchar(50) | YES | - | Unit of measure |
| stock_uom | varchar(50) | YES | - | Stock unit of measure |
| conversion_factor | numeric(18,6) | YES | 1 | UOM conversion factor |
| stock_qty | numeric(18,6) | YES | 0 | Stock quantity |
| price_list_rate | numeric(18,6) | YES | 0 | Price list rate |
| discount_percentage | numeric(18,6) | YES | 0 | Discount percentage |
| discount_amount | numeric(18,6) | YES | 0 | Discount amount |
| rate | numeric(18,6) | YES | 0 | Rate |
| amount | numeric(18,6) | YES | 0 | Amount |
| base_rate | numeric(18,6) | YES | 0 | Base rate |
| base_amount | numeric(18,6) | YES | 0 | Base amount |
| net_rate | numeric(18,6) | YES | 0 | Net rate |
| net_amount | numeric(18,6) | YES | 0 | Net amount |
| income_account | varchar(200) | YES | - | Income account |
| expense_account | varchar(200) | YES | - | Expense account |
| cost_center | varchar(200) | YES | - | Cost center |
| warehouse | varchar(200) | YES | - | Warehouse |
| target_warehouse | varchar(200) | YES | - | Target warehouse |
| batch_no | varchar(100) | YES | - | Batch number |
| serial_no | text | YES | - | Serial numbers |
| quality_inspection | varchar(100) | YES | - | QC reference |
| sales_order | varchar(100) | YES | - | Sales order reference |
| so_detail | varchar(100) | YES | - | Sales order detail |
| delivery_note | varchar(100) | YES | - | Delivery note reference |
| dn_detail | varchar(100) | YES | - | Delivery note detail |
| delivered_qty | numeric(18,6) | YES | 0 | Delivered quantity |
| weight_per_unit | numeric(18,6) | YES | 0 | Weight per unit |
| total_weight | numeric(18,6) | YES | 0 | Total weight |
| weight_uom | varchar(50) | YES | - | Weight unit of measure |
| is_free_item | boolean | YES | false | Free item flag |
| page_break | boolean | YES | false | Page break flag |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `sales_invoice_id` → `sales_invoices(id)`

---

### 12.27 return_claims

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| claim_no | varchar(30) | NO | - | Claim reference number |
| customer_id | integer | YES | - | FK → customers.id |
| sales_invoice_no | varchar(100) | YES | - | Sales invoice reference |
| reason | text | YES | - | Return reason |
| status | varchar(20) | YES | 'pending' | Status: pending, approved, rejected |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Status Flow:** pending → approved/rejected

---

### 12.28 return_claim_lines

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| return_claim_id | integer | NO | - | FK → return_claims.id |
| item_code | varchar(100) | NO | - | Item code |
| qty | numeric(18,6) | NO | 0 | Return quantity |
| condition | varchar(50) | YES | 'good' | Item condition |
| decision | varchar(50) | YES | - | Decision: restock, scrap, rts, pending |
| location_id | integer | YES | - | FK → warehouse_locations.id |
| notes | text | YES | - | Notes |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `return_claim_id` → `return_claims(id)`, `location_id` → `warehouse_locations(id)`

---

### 12.29 return_claim_photos

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| claim_id | integer | YES | - | FK → return_claims.id |
| photo_data | text | YES | - | Base64 encoded photo |
| caption | varchar(255) | YES | - | Photo caption |

**Primary Key:** `id`
**Foreign Keys:** `claim_id` → `return_claims(id)`

---

### 12.30 stock_entries

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Stock entry reference |
| stock_entry_type | varchar(100) | YES | - | Type: Material Transfer, Manufacture, etc. |
| purpose | varchar(100) | YES | - | Purpose |
| company | varchar(200) | NO | - | Company name |
| posting_date | date | YES | CURRENT_DATE | Posting date |
| posting_time | time | YES | CURRENT_TIME | Posting time |
| from_warehouse | varchar(200) | YES | - | Source warehouse |
| to_warehouse | varchar(200) | YES | - | Destination warehouse |
| work_order | varchar(100) | YES | - | Work order reference |
| bom_no | varchar(100) | YES | - | BOM reference |
| fg_completed_qty | numeric(18,6) | YES | 0 | Finished goods quantity |
| total_incoming_value | numeric(18,6) | YES | 0 | Total incoming value |
| total_outgoing_value | numeric(18,6) | YES | 0 | Total outgoing value |
| remarks | text | YES | - | Remarks |
| supplier | varchar(200) | YES | - | Supplier name |
| status | varchar(50) | YES | 'draft' | Status: draft, submitted |
| created_by | integer | YES | - | User ID |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Status Flow:** draft → submitted

---

### 12.31 stock_entry_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| stock_entry_id | integer | NO | - | FK → stock_entries.id |
| item_code | varchar(100) | NO | - | Item code |
| s_warehouse | varchar(200) | YES | - | Source warehouse |
| t_warehouse | varchar(200) | YES | - | Target warehouse |
| qty | numeric(18,6) | NO | 0 | Quantity |
| uom | varchar(50) | NO | - | Unit of measure |
| stock_uom | varchar(50) | YES | - | Stock unit of measure |
| conversion_factor | numeric(18,6) | YES | 1 | UOM conversion factor |
| transfer_qty | numeric(18,6) | YES | 0 | Transfer quantity |
| basic_rate | numeric(18,6) | YES | 0 | Basic rate |
| amount | numeric(18,6) | YES | 0 | Amount |
| serial_no | text | YES | - | Serial numbers |
| batch_no | varchar(100) | YES | - | Batch number |
| actual_qty | numeric(18,6) | YES | 0 | Actual quantity |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `stock_entry_id` → `stock_entries(id)`

---

### 12.32 stock_reconciliations

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| name | varchar(100) | NO | - | Reconciliation reference |
| company | varchar(200) | NO | - | Company name |
| purpose | varchar(100) | NO | - | Purpose |
| posting_date | date | YES | CURRENT_DATE | Posting date |
| posting_time | time | YES | CURRENT_TIME | Posting time |
| set_warehouse | varchar(200) | YES | - | Warehouse |
| expense_account | varchar(200) | YES | - | Expense account |
| cost_center | varchar(200) | YES | - | Cost center |
| difference_amount | numeric(18,6) | YES | 0 | Difference amount |
| status | varchar(50) | YES | 'draft' | Status: draft, submitted |
| created_by | integer | YES | - | User ID |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Status Flow:** draft → submitted

---

### 12.33 stock_reconciliation_items

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| stock_reconciliation_id | integer | NO | - | FK → stock_reconciliations.id |
| item_code | varchar(100) | NO | - | Item code |
| warehouse | varchar(200) | NO | - | Warehouse |
| qty | numeric(18,6) | YES | - | New quantity |
| valuation_rate | numeric(18,6) | YES | - | Valuation rate |
| amount | numeric(18,6) | YES | - | Amount |
| serial_no | text | YES | - | Serial numbers |
| batch_no | varchar(100) | YES | - | Batch number |
| current_qty | numeric(18,6) | YES | 0 | Current system quantity |
| current_valuation_rate | numeric(18,6) | YES | 0 | Current valuation rate |
| current_amount | numeric(18,6) | YES | 0 | Current amount |
| quantity_difference | numeric(18,6) | YES | 0 | Quantity difference |
| amount_difference | numeric(18,6) | YES | 0 | Amount difference |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `stock_reconciliation_id` → `stock_reconciliations(id)`

---

### 12.34 discount_rules

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| customer_group | varchar(100) | YES | - | Customer group |
| item_hierarchy_node | varchar(100) | YES | - | Item hierarchy node |
| discount_pct | numeric(5,2) | YES | - | Discount percentage |
| active | boolean | YES | true | Active flag |
| valid_from | date | YES | - | Valid from date |
| valid_to | date | YES | - | Valid to date |

**Primary Key:** `id`

---

### 12.35 price_observations

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| item_code | varchar(100) | NO | - | Item code |
| batch_no | varchar(100) | YES | - | Batch number |
| observed_mrp | numeric(18,6) | YES | - | Observed MRP |
| observed_at_stage | varchar(50) | YES | - | Stage where observed |
| flagged | boolean | YES | false | Flagged for review |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id`

---

### 12.36 notifications

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| type | varchar(20) | YES | 'info' | Type: info, warning, error, success |
| title | varchar(255) | NO | - | Notification title |
| message | text | YES | - | Notification message |
| is_read | boolean | YES | false | Read status |
| user_id | integer | YES | - | FK → users.id |
| created_at | timestamptz | YES | now() | Creation timestamp |

**Primary Key:** `id**
**CHECK Constraint:** type IN ('info', 'warning', 'error', 'success')

---

### 12.37 seasonal_patterns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | integer | NO | nextval | Primary key |
| item_code | varchar(100) | NO | - | Item code |
| month | integer | NO | - | Month (1-12) |
| avg_qty | numeric(18,6) | YES | - | Average quantity |
| peak_qty | numeric(18,6) | YES | - | Peak quantity |
| trough_qty | numeric(18,6) | YES | - | Trough quantity |
| seasonality_index | numeric(5,2) | YES | - | Seasonality index |
| calculated_at | timestamptz | YES | now() | Calculation timestamp |

**Primary Key:** `id`
**CHECK Constraint:** month BETWEEN 1 AND 12

---

## RELATIONSHIPS SUMMARY

| Parent Table | Child Table | Relationship |
|--------------|-------------|--------------|
| backorders | backorder_lines | One-to-Many |
| backorders_v | backorder_lines_v | One-to-Many |
| customers | order_templates | One-to-Many |
| order_templates | order_template_lines | One-to-Many |
| warehouses | cycle_count_sheets | One-to-Many |
| cycle_count_sheets | cycle_count_lines | One-to-Many |
| material_requests | material_request_items | One-to-Many |
| journal_entries | journal_entry_accounts | One-to-Many |
| packing_slips | packing_slip_items | One-to-Many |
| sales_invoices | sales_invoice_items | One-to-Many |
| return_claims | return_claim_lines | One-to-Many |
| return_claims | return_claim_photos | One-to-Many |
| stock_entries | stock_entry_items | One-to-Many |
| stock_reconciliations | stock_reconciliation_items | One-to-Many |
| items | item_variants | One-to-Many |
| items | item_model_fitment | One-to-Many |
| motorcycle_models | item_model_fitment | One-to-Many |
| items | wishlists | One-to-Many |
| customers | wishlists | One-to-Many |
| customer_groups | customer_groups | Self-referential (parent_id) |
| supplier_groups | supplier_groups | Self-referential (parent_id) |
| item_hierarchy_nodes | item_hierarchy_nodes | Self-referential (parent_id) |
