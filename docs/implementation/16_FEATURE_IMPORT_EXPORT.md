# Feature 16 — Import / Export

**Spec References:** SPEC_01_WAREHOUSE_SETUP.md §2.3, SPEC_03_OUTBOUND.md §2.5
**Status:** NOT DONE (CSVTools component exists but unused for import)
**Priority:** MEDIUM

---

## Current Implementation

### Frontend
- `CSVTools.tsx` — generic CSV parser component (parse, preview, upload)
- Only used by `PurchaseOrders.tsx` for PO import

### Backend
- No import endpoints for items, SOs, or employees
- No export endpoints anywhere

---

## Gaps

### 1. Item CSV Import
- SPEC_01 §2.3 defines import matching supplier packing list format
- **Plan:**
  1. `POST /masterdata/items/import` — accepts CSV/Excel
  2. Column mapping: sku, part_code, name, category, brand, uom, pack_mode, control_mode, weight, dimensions, min_stock, max_stock, barcode
  3. Validate each row: required fields, unique sku
  4. Skip duplicates (by sku), return import summary
  5. Add "Import" button + CSVTools to Items.tsx
- **Effort:** 1 day

### 2. Sales Order CSV Import
- SPEC_03 §2.5 defines import format
- **Plan:**
  1. `POST /sales-orders/import` — accepts CSV/Excel
  2. Column mapping: so_number, customer_code, delivery_address, delivery_date, priority, item_code, qty, unit_price
  3. Group rows by so_number (multiple lines = one order)
  4. Auto-assign priority if empty
  5. Add "Import" button + CSVTools to SalesOrders.tsx
- **Effort:** 1-2 days
- **Depends on:** Feature 08 (Sales Orders CRUD)

### 3. Employee CSV Import
- SPEC_01 §3.4 shows import option
- **Plan:**
  1. `POST /employees/import` — accepts CSV/Excel
  2. Column mapping: emp_id, name, phone, role, warehouse_id, pin
  3. Add "Import" button + CSVTools to Employees.tsx
- **Effort:** 0.5 day
- **Depends on:** Feature 03 (Employees CRUD)

### 4. Data Export
- No export functionality anywhere
- **Plan (optional for v1):**
  1. Add `GET /masterdata/items/export` — CSV download
  2. Add `GET /sales-orders/export` — CSV download
  3. Add export buttons to list pages
- **Effort:** 1 day

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 02 Item Master | Items import | Add to Items.tsx |
| 03 Employee/Roles | Employee import | Add to Employees.tsx |
| 08 Sales Orders | SO import | Add to SalesOrders.tsx |

---

## Acceptance Criteria

- [ ] Import items from CSV (with validation)
- [ ] Import sales orders from CSV (grouped by SO number)
- [ ] Import employees from CSV
- [ ] Import summary (X created, Y skipped, Z errors)
- [ ] Export items to CSV (optional)
- [ ] Export sales orders to CSV (optional)

---

## Implementation Plan

### Phase 1 — Items Import (1 day)
1. Add POST /masterdata/items/import endpoint
2. Add CSVTools + Import button to Items.tsx
3. Validate and skip duplicates

### Phase 2 — SO Import (1-2 days)
1. Add POST /sales-orders/import endpoint
2. Group by SO number, auto-create order + lines
3. Add CSVTools + Import button to SalesOrders.tsx

### Phase 3 — Employee Import (0.5 day)
1. Add POST /employees/import endpoint
2. Add CSVTools + Import button to Employees.tsx

### Phase 4 — Export (1 day, optional)
1. Add export endpoints for items, SOs
2. Add export buttons to list pages
