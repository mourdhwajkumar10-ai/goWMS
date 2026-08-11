# Feature 08 — Sales Orders

**Spec References:** SPEC_03_OUTBOUND.md §2, PRIORITY_QUEUE_DESIGN.md
**Status:** PARTIAL (schema only — synced from ERP)
**Priority:** HIGH — blocks outbound flow

---

## Current Implementation

### Database
- `sales_orders` table exists with rich fields: name, customer_name, status, grand_total, delivery_date, wms_status, per_delivered, per_picked, per_billed, po_no, etc.
- `sales_order_items` table exists with item references
- Both appear to be ERPNext-synced (last_synced_at pattern)

### Backend
- **NO sales order handler exists**
- No CRUD endpoints for sales orders
- Pick page accepts `sales_order_no` as free-text string (no FK validation)

### Frontend
- **NO SalesOrders.tsx page**
- Pick.tsx has text input for "SO No" — purely a label, no lookup

---

## Gaps (All HIGH Priority)

### 1. No Sales Order CRUD Handler
- Can't create, edit, or list sales orders from WMS
- **Plan:**
  1. Create `api/modules/salesorder/handler.go`:
     - `GET /sales-orders` — list (filter: status, priority, customer, date)
     - `POST /sales-orders` — create (customer, delivery_date, priority, items[])
     - `GET /sales-orders/:id` — get with lines
     - `PUT /sales-orders/:id` — update
     - `POST /sales-orders/:id/confirm` — draft → confirmed
     - `POST /sales-orders/:id/cancel` — cancel
  2. Add priority fields to sales_orders table:
     - `priority` INT (1-10, default 4)
     - `priority_label` TEXT (auto-computed)
     - `priority_reason` TEXT
     - `priority_set_by` FK
     - `priority_set_at` TIMESTAMPTZ
  3. Add route + sidebar nav item under "Selling"
- **Files:** New handler, migration, App.tsx, Layout.tsx
- **Effort:** 3-4 days

### 2. No Sales Order Import
- SPEC_03 §2.5 defines CSV/Excel import format
- **Plan:**
  1. Add `POST /sales-orders/import` accepting CSV
  2. Map columns: so_number, customer_code, delivery_address, delivery_date, priority, item_code, qty, unit_price
  3. Group rows by so_number (multiple lines = one order)
  4. Auto-assign priority if empty (from configurable rules)
  5. Add "Import" button + CSVTools to SalesOrders.tsx
- **Effort:** 1-2 days

### 3. No Priority Queue
- SPEC defines 1-10 priority scale with labels, colors, SLAs
- PRIORITY_QUEUE_DESIGN.md has full spec
- **Plan:**
  1. Add priority columns (see above)
  2. Priority badge component (color-coded)
  3. Priority selector in create/edit form
  4. Sort SO list by priority (default view)
  5. Auto-priority rules on import:
     - Key Account → 7
     - Order value > 50K → 7
     - Order value > 10K → 6
     - Delivery within 1 day → 8
     - Default → 4
  6. Priority override log (audit trail)
- **Effort:** 2-3 days
- **Conflict:** Must be consistent with putaway queue priority ordering

### 4. No Delivery Date Tracking
- sales_orders has delivery_date but no deadline SLA calculation
- **Plan:** Add `delivery_deadline` computed from priority SLA
- **Effort:** 0.5 day

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 09 Picking | Pick lists reference SOs | SOs must exist before pick lists can reference them |
| 12 Backorders | Shortage creates backorders linked to SO lines | SO lines must have stable IDs |
| 02 Item Master | Items referenced by SO lines | FK to items table |
| 03 Employee/Roles | SO creation permission | WM/Admin only |

---

## Acceptance Criteria

- [ ] User can create sales orders with customer, items, quantities, delivery date
- [ ] User can set priority (1-10) with label and color
- [ ] Priority sort is default view
- [ ] CSV import with auto-priority assignment
- [ ] Confirm/cancel workflow
- [ ] SO list filters: status, priority, customer, date
- [ ] SO detail shows fulfillment progress (allocated/picked/shipped %)

---

## Implementation Plan

### Phase 1 — SO CRUD (3 days)
1. Migration: add priority columns to sales_orders
2. Create salesorder handler (CRUD + confirm/cancel)
3. Create SalesOrders.tsx page (list + detail + create form)
4. Add route and sidebar nav

### Phase 2 — Priority Queue (2 days)
1. Add priority selector (1-10) with color coding
2. Default sort by priority DESC
3. Auto-priority rules on create/import
4. Priority override log

### Phase 3 — Import (1-2 days)
1. CSV import endpoint with column mapping
2. Import UI with CSVTools component
3. Auto-assign priorities on import
