# Feature 09 — Picking

**Spec References:** SPEC_03_OUTBOUND.md §3-4, SPEC.md §6 Phase D
**Status:** PARTIAL (single-order only)
**Priority:** HIGH

---

## Current Implementation

### Database
- `pick_lists`: id, pick_no, warehouse_id, status, picking_mode, sales_order_no, customer, total_items, total_picked, stock_consumed
- `pick_list_items`: id, pick_list_id, item_code, part_name, allocated_qty, picked_qty, shortage_qty, location_id, location_code, batch_no, expiry_date, status
- `pick_scan_logs`: audit trail for each scan

### Backend (api/modules/picking/handler.go — 456 lines)
- `POST /picking/` — create pick list:
  1. Accepts item list with qty_ordered
  2. FEFO allocation: ListFEFOCandidates → ReserveBalance per slice
  3. Shortage lines for unfulfilled qty
  4. Auto-create if insufficient stock (409 error)
- `POST /picking/scan` — log pick:
  - Validates not over-picking
  - Detects location drift (scanned != expected)
  - Auto-completes when all lines picked
- `GET /picking/list` and `/picking/lists` — list
- `GET /picking/:id` — detail with FEFO badges

### Frontend (Pick.tsx — 367 lines)
- Pick list list, create form (SO No + items), active pick with scan form

---

## Gaps

### 1. No Wave/Batch Picking
- Currently one pick list per SO
- SPEC_03 §3.1 Method B defines wave picking (multiple SOs in one pick)
- **Impact:** At ₹20Cr with multiple daily orders, single-order picking wastes 30-50% travel time
- **Plan:**
  1. Add `POST /picking/generate-wave` endpoint:
     - Accept: list of SO IDs or min_priority threshold
     - Combine items across SOs, dedup by item_code
     - FEFO allocate combined list
     - Create one pick list with pick_so_map entries
  2. Add wave pick UI to Pick.tsx:
     - "Generate Wave Pick" button
     - Show pending SOs sorted by priority
     - Select multiple → preview combined items → generate
  3. Pick list detail shows which SO each line belongs to
- **Files:** picking/handler.go, Pick.tsx
- **Effort:** 2-3 days

### 2. No Pick List Printing
- No PDF generation anywhere in codebase
- Paper pick slips still needed in Indian warehouses
- **Plan:**
  1. Add `GET /picking/:id/print` endpoint returning PDF
  2. Use a Go PDF library (e.g., go-pdf or wkhtmltopdf)
  3. Pick slip layout: Pick List ID, Customer, Items with bin locations, quantities, barcodes
  4. Add "Print" button to Pick.tsx detail view
  5. Support thermal printer format (4x6 inch)
- **Files:** New PDF utility, picking handler, Pick.tsx
- **Effort:** 2-3 days
- **Conflict:** None — additive

### 3. Sales Order Reference is Free-Text
- Pick.tsx accepts SO No as text input, no FK validation
- Should be a dropdown or lookup against sales_orders table
- **Depends on:** Feature 08 (Sales Orders CRUD)
- **Plan:** After SO module exists, replace text input with dropdown
- **Effort:** 0.5 day

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 07 Stock Balances | FEFO allocation uses ReserveBalance | Consistent |
| 08 Sales Orders | SO reference needed | Depends on Feature 08 |
| 10 Packing | Packing consumes picked stock | Pack.tsx already handles this |
| 12 Backorders | Shortage lines | Currently creates shortage but no backorder auto-creation |

---

## Acceptance Criteria

- [x] Create pick list from item list
- [x] FEFO allocation (earliest expiry first)
- [x] Reserve stock on allocation
- [x] Scan to pick with location drift detection
- [x] Auto-complete when all lines picked
- [x] Shortage lines for unfulfilled qty
- [ ] Wave/batch picking (multiple SOs) (TODO)
- [ ] Pick list PDF printing (TODO)
- [ ] SO dropdown instead of free-text (TODO)

---

## Implementation Plan

### Phase 1 — Wave Picking (2-3 days)
1. Add `POST /picking/generate-wave` endpoint
2. Accept SO IDs or priority threshold
3. Combine + dedup items across SOs
4. FEFO allocate, create pick list with pick_so_map
5. Add wave pick UI to Pick.tsx

### Phase 2 — Pick List Printing (2-3 days)
1. Add Go PDF generation utility
2. Create pick slip template (Pick List ID, SO, Customer, Items, Bins, Qty, Barcode)
3. Add `GET /picking/:id/print` endpoint
4. Add "Print" button to Pick.tsx

### Phase 3 — SO Reference (0.5 day)
1. Replace text input with dropdown (after Feature 08)
2. Validate SO exists and is in confirmed status
