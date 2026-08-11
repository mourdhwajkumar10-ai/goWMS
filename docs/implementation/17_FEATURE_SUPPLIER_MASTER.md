# Feature 17 — Supplier Master (Enhanced)

**Spec References:** SPEC_01_WAREHOUSE_SETUP.md §5
**Status:** PARTIAL (handler uses 3 of 25 columns)
**Priority:** HIGH — blocks packing list import

---

## Current Implementation

### Database (suppliers table — 25 columns)
Most columns exist but are unused: erp_id, name, supplier_group, gstin, supplier_type, country, default_currency, disabled, is_internal_supplier, payment_terms_template, tax_category, default_price_list, is_transporter, on_hold, hold_type, release_date, is_frozen, website, language, supplier_details, supplier_primary_address, supplier_primary_contact, tax_withholding_group

### Backend (masterdata/handler.go)
- `listSuppliers` — returns only: id, name, supplier_group, gstin, disabled
- `createSupplier` — accepts only: name, supplier_group, gstin
- No update, no delete, no detail view

### Frontend (Suppliers.tsx — 120 lines)
- Table: Name, Group, GSTIN, Status
- Create form: Name, Group, GSTIN only
- No edit, no contact/address fields, no carrier config

---

## Gaps

### 1. Supplier CRUD Incomplete
- Only create + list (no update, no detail)
- Only 3 fields used of 25 available
- **Plan:**
  1. Expand `listSuppliers` to return all useful columns
  2. Add `PUT /suppliers/:id` update endpoint
  3. Add `GET /suppliers/:id` detail endpoint
  4. Expand Suppliers.tsx with full create/edit form:
     - **Basic:** Name*, Code, Group, Type (Company/Individual)
     - **Tax:** GSTIN, Tax Category, Default Currency
     - **Contact:** Primary Contact Name, Phone, Email
     - **Address:** Full address, City, State, Pincode
     - **Payment:** Payment Terms, Price List
     - **Flags:** Is Transporter, Is Internal, On Hold, Disabled
     - **Notes:** Free text supplier details
  5. Add edit button per row, detail view on click
- **Files:** masterdata/handler.go, Suppliers.tsx
- **Effort:** 2-3 days

### 2. No Carrier/Transporter Fields
- `is_transporter` flag exists but no carrier-specific fields
- delivery_notes has loose transporter/driver/vehicle_no columns
- **Plan:** See Feature 19 (Carrier/Delivery)
- **Schema addition to suppliers:**
  ```sql
  ALTER TABLE suppliers ADD COLUMN carrier_code varchar(50);
  ALTER TABLE suppliers ADD COLUMN vehicle_types text[];  -- ['truck', 'tempo', 'bike']
  ALTER TABLE suppliers ADD COLUMN max_capacity_kg numeric(10,2);
  ALTER TABLE suppliers ADD COLUMN max_capacity_cbm numeric(10,2);
  ALTER TABLE suppliers ADD COLUMN service_areas text[];  -- ['Aurangabad', 'Pune']
  ALTER TABLE suppliers ADD COLUMN contact_phone varchar(20);
  ALTER TABLE suppliers ADD COLUMN contact_email varchar(100);
  ALTER TABLE suppliers ADD COLUMN address_line_1 varchar(200);
  ALTER TABLE suppliers ADD COLUMN address_line_2 varchar(200);
  ALTER TABLE suppliers ADD COLUMN city varchar(100);
  ALTER TABLE suppliers ADD COLUMN state varchar(100);
  ALTER TABLE suppliers ADD COLUMN pincode varchar(10);
  ```
- **Effort:** Part of Feature 19

### 3. No Packing List Template per Supplier
- Different suppliers send different packing list formats
- Need to configure column mapping per supplier
- **Plan:** See Feature 18 (Packing List Import)

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 18 Packing List Import | Template linked to supplier | Add template_id FK to suppliers |
| 19 Carrier Delivery | Carrier = supplier with is_transporter | Reuse suppliers table |
| 08 Sales Orders | Customer master parallels supplier | Similar UI patterns |

---

## DB Migration Plan

```sql
-- 008_supplier_enhancement.sql

-- Enhanced supplier fields
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS carrier_code varchar(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS vehicle_types text[];
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS max_capacity_kg numeric(10,2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS max_capacity_cbm numeric(10,2);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS service_areas text[];
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person varchar(200);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_phone varchar(20);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_email varchar(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_line_1 varchar(200);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address_line_2 varchar(200);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city varchar(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS state varchar(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS pincode varchar(10);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_pack_list_template_id integer;

-- Packing list templates (see Feature 18)
CREATE TABLE IF NOT EXISTS supplier_pack_list_templates (
    id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(id),
    template_name TEXT NOT NULL,
    column_mapping JSONB NOT NULL,
    -- Example column_mapping:
    -- {
    --   "dealer_code": "Dealer Code",
    --   "dealer_name": "Dealer",
    --   "invoice_no": "InvoiceNo",
    --   "invoice_date": "InvoiceDate",
    --   "delivery_no": "Delivery No",
    --   "delivery_date": "Delivery date",
    --   "plant": "Plant",
    --   "part_code": "Part Code",
    --   "part_name": "Part Name",
    --   "qty": "Qty",
    --   "weight_kg": "Calculated Part Weight(in KG)",
    --   "box_number": "Box Number",
    --   "skip_rows": 1,          -- rows to skip at end (summary)
    --   "header_row": 1          -- which row has headers
    -- }
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Acceptance Criteria

- [ ] List suppliers with all fields
- [ ] Create supplier with full form (basic, tax, contact, address, carrier)
- [ ] Edit supplier
- [ ] Detail view on click
- [ ] Filter by type (supplier/carrier/both)
- [ ] Mark supplier as transporter with carrier details
- [ ] Assign default packing list template to supplier

---

## Implementation Plan

### Phase 1 — Enhanced Supplier CRUD (2-3 days)
1. Migration: add new columns to suppliers
2. Expand listSuppliers to return all columns
3. Add PUT /suppliers/:id endpoint
4. Add GET /suppliers/:id endpoint
5. Redesign Suppliers.tsx: full form with tabs (Basic, Contact, Address, Carrier, Packing)

### Phase 2 — Carrier Fields (1 day, merge with Phase 1)
1. Add carrier-specific columns
2. Show carrier section only when is_transporter=true
3. Vehicle types as multi-select chips
