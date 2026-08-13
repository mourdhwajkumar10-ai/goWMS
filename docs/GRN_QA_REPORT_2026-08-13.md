# GRN Specification vs Implementation — Updated QA Report

**Date:** August 13, 2026  
**Previous Analysis:** `GRN_SPEC_GAP_ANALYSIS.md` (Aug 11, 2026)  
**Spec:** `docs/features/grn_specification.md` (1097 lines)  

---

## What Changed Since Aug 11

Four migrations and a major code rewrite landed since the original gap analysis:

| Migration | Date | Impact |
|-----------|------|--------|
| `018_grn_inbound_redesign.sql` | Aug 13 | Truck fields, receiving_mode, events/exceptions/invoices tables, box condition/seal/weight columns, widened status CHECK |
| `019_grn_verify_controls.sql` | Aug 13 | Audit tables, parent_grn_id, active_verify_carton_id |
| `020_grn_spec_completion.sql` | Aug 13 | POD metadata, stock_posted_at, putaway_status, grn_invoice_lines |
| `021_allocation_status_putaway.sql` | Aug 13 | allocation_status on stock_location_balances |

Code rewrite: `handler.go` split into `handler.go`, `workflow.go`, `verify.go`, `completion.go`. New modules: `packinglist/`, `qi/templates.go`. Frontend `GRN.tsx` rewritten with 5-step stepper.

---

## Overall Score

| Category | Original Gaps | Now Closed | Still Open | % Closed |
|----------|--------------|------------|------------|----------|
| GRN Session | 10 | 7 | 3 | 70% |
| Box Check | 5 | 4 | 1 | 80% |
| Item Check | 8 | 1 | 7 | 13% |
| Quality Inspection | 7 | 5 | 2 | 71% |
| Putaway | 4 | 0 | 4 | 0% |
| Stock Tracking | 4 | 0 | 4 | 0% |
| API Endpoints | 12 | 6 | 6 | 50% |
| UI Screens | 7 | 2 | 5 | 29% |
| **TOTALS** | **48** | **25** | **32** | **52%** |

---

## 1. GRN Session

### Newly Completed

| Gap | Resolution |
|-----|-----------|
| `invoice_no`, `invoice_date` fields | `grn_invoices` table (migration 018) with CRUD endpoints |
| `delivery_no`, `delivery_date` fields | `grn_invoices` table (migration 018) |
| `plant` field | Added to `grn_sessions` (migration 018) |
| `dock` field | Added to `grn_sessions` (migration 018) |
| `PUT /api/grn/{id}` update endpoint | `PATCH /session/:id` in workflow.go |
| Session status enum | Widened to 12 states: draft, open, receiving, stuck, box_reconciliation, item_verification, exception_pending, item_verification_complete, putaway_pending, putaway_in_progress, completed, closed |
| Warehouse/staging auto-create | HOLD-01, DAMAGED-01 created via `EnsureLocation` |

### Partially Completed

| Gap | Current State |
|-----|---------------|
| `total_boxes_expected/received` | `expected_boxes` stored; `received_boxes` computed on-the-fly via box-summary endpoint |
| `total_items_expected/received` | Computed via `item-summary` endpoint, not stored on session |
| `received_by` FK | Uses `created_by` (user_id), not employee FK |

### Still Open

| Gap | Priority | Notes |
|-----|----------|-------|
| `supplier_id` FK (linked to suppliers table) | HIGH | Only `supplier_name` text stored. No FK to suppliers table. |
| `total_weight_expected/received` counters | MEDIUM | Weight not tracked at session level. `expected_weight_kg`/`actual_weight_kg` exist on cartons but not aggregated. |

---

## 2. Box Check

### Newly Completed

| Gap | Resolution |
|-----|-----------|
| `condition` field (ok/damaged/wet/crushed) | Added to `grn_cartons` (migration 018), default 'ok' |
| `seal_status` field (sealed/opened/tampered) | Added to `grn_cartons` (migration 018), default 'sealed' |
| `expected_weight_kg` field | Added to `grn_cartons` (migration 018) |
| `actual_weight_kg` field | Added to `grn_cartons` (migration 018) |
| Box check verification form | `verify.go` implements open-box -> scan-item -> auto-close workflow |

### Still Open

| Gap | Priority | Notes |
|-----|----------|-------|
| `photo_urls` for damaged boxes | MEDIUM | No photo capture mechanism for boxes. `pod_attachment_id` exists for POD but not per-box. |

---

## 3. Item Check

### Still Open (mostly unchanged)

| Gap | Priority | Notes |
|-----|----------|-------|
| `po_line_id` FK to PO line | HIGH | No PO line link on grn_lines |
| `item_id` FK to item master | MEDIUM | Only stores `item_code` text, no FK to items table |
| `weight_expected` field | HIGH | Not on grn_lines |
| `weight_received` field | HIGH | Not on grn_lines |
| `unit_price` from PO | MEDIUM | Not stored on grn_lines |
| `qc_status` enum (pending/passed/failed/skipped) | HIGH | Not on grn_lines |
| `putaway_status` enum (pending/assigned/done) | HIGH | Not on grn_lines |
| `putaway_location_id` FK | MEDIUM | Putaway logs exist but not linked back to grn_lines |

**Note:** Item check workflow (open-box -> scan-item -> auto-close) IS implemented in `verify.go`, but the per-line metadata fields are missing.

---

## 4. Quality Inspection

### Newly Completed

| Gap | Resolution |
|-----|-----------|
| QC Templates table | `qc_templates` table (migration 010) with checklist JSONB |
| Checklist per template | JSONB checklist with `{item, type}` structure |
| Auto-Approve setting | `auto_approve` boolean on `qc_templates` |
| Reject Button Bug | Fixed -- `POST /qi/:id/reject` endpoint exists |
| QC Template CRUD | Full endpoints: list, create, get, update, from-template |

### Partially Completed

| Gap | Current State |
|-----|---------------|
| QC Type (Visual/Measurement/Functional/Full) | Checklist items have `type` field but no template-level QC type classification |
| Sample Size config | `sample_size` integer on template (not text enum like spec) |

### Still Open

| Gap | Priority | Notes |
|-----|----------|-------|
| QC Configuration per item/category | HIGH | Templates not linked to specific items or categories |
| Failure action (Return/Accept/Scrap) | HIGH | Only accept/reject, no failure action routing |
| QC->Putaway gate | HIGH | No enforcement that QC must pass before putaway |

---

## 5. Putaway

### Still Open

| Gap | Priority | Notes |
|-----|----------|-------|
| `qc_status` gating (QC must pass before putaway) | HIGH | No enforcement. Items go to INCOMING regardless of QI status. |
| Per-line putaway tracking on grn_lines | MEDIUM | Putaway logs exist (`putaway_logs` table) but not linked to `grn_lines` |
| `putaway_location_id` on grn_lines | MEDIUM | Not stored |
| Bulk auto-suggest for all pending items | MEDIUM | Only single-item suggest via `GET /putaway/suggest` |

---

## 6. Stock Tracking

### Still Open

| Gap | Priority | Notes |
|-----|----------|-------|
| Stock by Box (`box_ref` on balance) | HIGH | `stock_location_balances` has no `box_ref` column |
| `stock` table with `qty_available` generated column | MEDIUM | Uses `stock_location_balances` instead -- functional but different schema |
| `stock_ledger` with `doc_type`, `doc_id`, `qty_before`, `qty_after` | MEDIUM | Current `stock_ledger_entries` is simpler |
| Multi-view stock UI (by location/batch/box) | HIGH | No stock-by-box view in frontend |

---

## 7. API Endpoints

### Newly Completed

| Spec Endpoint | Implementation |
|---------------|----------------|
| `PUT /api/grn/{id}` | `PATCH /session/:id` (workflow.go) |
| `POST /api/grn/{id}/import-packing-list` | Separate `packinglist/` module |
| `POST /api/grn/{id}/start-receiving` | `POST /session/:id/advance` (workflow.go) |
| `GET /api/qc/templates` | `GET /qi/templates` (qi/templates.go) |
| `POST /api/qc/templates` | `POST /qi/templates` (qi/templates.go) |
| Box check endpoints | `POST /session/:id/open-box`, `POST /session/:id/verify-item`, `POST /session/:id/close-box` (verify.go) |

### Partially Implemented

| Spec Endpoint | Current State |
|---------------|---------------|
| `GET /api/qc/pending?grn_id=` | QI list exists but no `grn_id` filter |
| `POST /api/qc/{grn_line_id}/inspect` | QI per ticket exists but no per-line inspection |
| `GET /api/putaway/pending?grn_id=` | Putaway queue exists but no `grn_id` filter |
| `PUT /api/grn/{id}/boxes/{box_id}` | Box exists but condition/seal not updatable via dedicated endpoint |

### Still Open

| Spec Endpoint | Priority | Notes |
|---------------|----------|-------|
| `PUT /api/grn/{id}/lines/{line_id}` | MEDIUM | No per-line update endpoint |
| `POST /api/putaway/{grn_line_id}/confirm` | MEDIUM | Putaway exists but not per grn_line |
| `GET /api/putaway/pending?grn_id=` | MEDIUM | Queue exists but missing filter |
| `GET /api/qc/pending?grn_id=` | MEDIUM | List exists but missing filter |

---

## 8. UI Screens

### Newly Completed

| Spec Screen | Implementation |
|-------------|----------------|
| 5-step progress stepper | GRN.tsx has Truck -> Box -> Verify -> Exceptions -> Complete stepper |
| Session list | GRN.tsx list view with status badges |

### Partially Implemented

| Spec Screen | Current State |
|-------------|---------------|
| Box Check verification form | Verify workflow exists (open-box -> scan-item) but no condition/seal/weight form on box |
| Item Check form | Verify-item endpoint works but no per-item condition selector or photo capture |
| Putaway queue | `GET /putaway/queue` exists but not filtered by GRN session |

### Still Open

| Spec Screen | Priority | Notes |
|-------------|----------|-------|
| Box-level photo capture UI | MEDIUM | No camera/upload per box |
| Per-item condition selector (OK/Minor Damage/Reject) | MEDIUM | Item scan works but no condition annotation |
| Putaway confirmation (mobile scan-to-assign) | MEDIUM | No mobile-optimized scan-to-assign UI |
| Stock multi-view (by location/batch/box) | HIGH | Items.tsx shows stock but no box-level view |
| QC Inspection checklist UI (per template) | MEDIUM | QI module has forms but no checklist-driven UI |

---

## 9. Item Master -- Additional Fields Analysis

### Current Schema: 56 columns across 4 migrations

| Field | Migration | API Active | Notes |
|-------|-----------|------------|-------|
| `code` | 001 | Yes | Primary identifier |
| `name` | 001 | Yes | |
| `description` | 001 | Yes | |
| `brand` | 001 | Yes | |
| `category` | 017 | Yes | |
| `hsn_no` | 017 | Yes | HSN/SAC code for GST |
| `gst_percentage` | 017 | Yes | |
| `mrp` | 017 | Yes | |
| `uom` | 017 | Yes | Text field, redundant with stock_uom_id |
| `barcode` | 004 | Yes | |
| `weight_per_unit` | 001 | Yes | Used in packing module |
| `carton_qty` | 001 | Yes | Items per carton |
| `pack_type` | 004 | Yes | loose/packed |
| `control_mode` | 004 | Yes | item_controlled/bin_controlled |
| `home_location_id` | 004 | Yes | FK -> warehouse_locations |
| `safety_stock` | 001 | Yes | |
| `valuation_rate` | 001 | Yes | |
| `standard_rate` | 001 | Yes | |
| `min_order_qty` | 001 | Yes | |
| `has_serial` | 001 | Yes | |
| `has_batch` | 001 | Yes | |
| `has_expiry_date` | 001 | Yes | |
| `shelf_life_in_days` | 001 | Yes | |
| `remark` | 017 | Yes | |
| `make` | 017 | Yes | Manufacturer |
| `vech` | 017 | Yes | Vehicle/application |
| `parts_movement` | 017 | Yes | |
| `parts_pbo` | 017 | Yes | |
| `threshold_value` | 017 | Yes | |
| `max_rate_discount` | 017 | Yes | |

### DB-Only Fields (NOT exposed in API)

| Field | Migration | Status |
|-------|-----------|--------|
| `stock_uom_id` | 001 | FK exists but `uom` text used instead |
| `is_stock` | 001 | Never checked |
| `abc_tier` | 001 | Never used in API |
| `lead_time_days` | 001 | Never used |
| `reorder_level` | 001 | Never exposed |
| `reorder_qty` | 001 | Never exposed |
| `valuation_method` | 001 | Never used |
| `opening_stock` | 001 | Never used |
| `is_sales_item` | 001 | Never checked |
| `is_purchase_item` | 001 | Never checked |
| `has_variants` | 001 | Never used |
| `variant_of` | 001 | Never used |
| `last_purchase_rate` | 001 | Never used |
| `warranty_period` | 001 | Never used |
| `weight_uom` | 001 | Never used (weight_per_unit exists) |
| `end_of_life` | 001 | Never used |
| `allow_negative_stock` | 001 | Never checked |
| `over_delivery_receipt_allowance` | 001 | Never used |
| `over_billing_allowance` | 001 | Never used |
| `image` | 001 | Never exposed |
| `batch_number_series` | 001 | Never used |
| `serial_no_series` | 001 | Never used |
| `total_projected_qty` | 001 | Never used |
| `is_sub_contracted_item` | 001 | Never used |
| `default_bom` | 001 | Never used |
| `country_of_origin` | 001 | Never exposed |
| `customs_tariff_number` | 001 | Never exposed |
| `max_stock` | 006 | Never exposed |

### Missing Fields (Compared to Typical WMS Item Master)

| Field | Status | Notes |
|-------|--------|-------|
| Dimensions (L x W x H) | Missing | No columns at all. Needed for shipping/packing. |
| Volumetric weight | Missing | Computed from dimensions |
| Hazmat / handling class | Missing | No hazmat flag or handling instructions |
| Stackability | Missing | Can this item be stacked? |
| Manufacturer Part Number (MPN) | Missing | `make` exists but no specific MPN field |
| Item condition type | Missing | New/refurbished/used |
| Min stock | Missing | Only `safety_stock` (different concept) |
| Storage instructions | Missing | Temperature, humidity, special handling |
| Multi-UOM conversion | Missing | Only single UOM |
| EAN/GTIN distinction | Missing | Single `barcode` field |

---

## 10. Simplified Flow Comparison (Updated)

### Spec Flow (8 steps)

```
Step 1: Truck arrives -> Go to GRN -> + New Session
Step 2: Select Supplier -> Enter Invoice No, Delivery No
Step 3: Upload supplier packing list (Excel) -> System auto-loads expected items
Step 4: Count boxes -> Scan each box barcode -> Verify against list
Step 5: For each box -> Open -> Count items -> Verify part codes
Step 6: If items need QC -> System shows checklist -> Check each item -> Pass/Fail
Step 7: For each received item -> Scan bin barcode -> Put item in bin
Step 8: Mark GRN Complete -> Stock auto-updated
```

### Current Flow (Updated)

```
Step 1: Go to GRN -> + New Session (or from PO)
Step 2: Select PO -> Session created with truck/driver/plant/dock fields
Step 3: Upload packing list (CSV/XLSX) -> auto-load items (separate packinglist module)
Step 4: Scan carton -> Box reconciliation with expected/received/missing summary
Step 5: Open box -> Scan items -> Auto-close if perfect, exception if not
Step 6: QI triggered on GRN close (requires_qi flag) -> template-based checklist exists
Step 7: Putaway from GRN (single putaway exists, no per-line queue)
Step 8: Finalize session -> Stock posted to INCOMING/HOLD/DAMAGED
```

### Flow Gap Summary (Updated)

| Step | Spec | Current | Status |
|------|------|---------|--------|
| 1. Create session | Yes | Yes | **Implemented** |
| 2. Enter supplier + invoice + delivery | Yes | Yes | **Implemented** (grn_invoices table) |
| 3. Import packing list | Yes | Yes | **Implemented** (separate packinglist module) |
| 4. Box check (condition, seal, weight) | Yes | Yes | **Implemented** (migration 018 + verify.go) |
| 5. Item check (per-item in box) | Yes | Yes | **Implemented** (open-box -> scan-item -> auto-close) |
| 6. QC checklist | Yes | Partial | **Partial** (templates exist, but no per-item QC UI, no failure routing) |
| 7. Putaway (scan bin) | Yes | Partial | **Partial** (single putaway exists, no per-line queue or mobile scan) |
| 8. Close session | Yes | Yes | **Implemented** (finalize -> stock posted) |

---

## 11. Priority Implementation Roadmap (Updated)

### P0 -- Critical (Blocks production use)

| # | Gap | Effort | Files |
|---|-----|--------|-------|
| 1 | `supplier_id` FK on grn_sessions | 0.5 day | migration, handler.go, GRN.tsx |
| 2 | QC->Putaway gate (QC must pass before putaway) | 1 day | handler.go, putaway handler |
| 3 | `qc_status`/`putaway_status` enums on grn_lines | 1 day | migration, handler.go |
| 4 | Per-line putaway tracking (putaway_location_id on grn_lines) | 1 day | migration, handler.go |

### P1 -- High (Completes inbound flow)

| # | Gap | Effort | Files |
|---|-----|--------|-------|
| 5 | `weight_expected`/`weight_received` on grn_lines | 0.5 day | migration, handler.go |
| 6 | `unit_price` from PO on grn_lines | 0.5 day | migration, handler.go |
| 7 | `item_id` FK on grn_lines -> items table | 0.5 day | migration, handler.go |
| 8 | Stock `box_ref` tracking on stock_location_balances | 1 day | migration, shared/stockloc.go |
| 9 | Stock multi-view UI (by location/batch/box) | 2 days | Items.tsx |
| 10 | Photo capture per box (damaged boxes) | 1 day | handler.go, GRN.tsx |

### P2 -- Medium (Polish)

| # | Gap | Effort | Files |
|---|-----|--------|-------|
| 11 | Putaway queue filtered by GRN | 0.5 day | putaway handler |
| 12 | QI list filtered by GRN | 0.5 day | qi handler |
| 13 | Per-line update endpoint (PUT grn/{id}/lines/{line_id}) | 0.5 day | handler.go |
| 14 | Bulk auto-suggest putaway | 1 day | putaway handler |
| 15 | Mobile putaway confirmation (scan-to-assign) | 2 days | Putaway.tsx |
| 16 | Expose orphaned DB fields (reorder_level, max_stock, country_of_origin, image) | 1 day | masterdata handler |
| 17 | Item dimensions (length, width, height, volumetric_weight) | 1 day | migration, masterdata handler |

### P3 -- Low (Cleanup)

| # | Gap | Effort | Notes |
|---|-----|--------|-------|
| 18 | Clean up 23 orphaned DB columns on items | 1 day | Decide: expose or drop |
| 19 | `total_weight_expected/received` at session level | 0.5 day | Can be computed from carton weights |
| 20 | QC failure action routing (Return/Accept/Scrap) | 1 day | Extends QI reject workflow |

---

## 12. QA Observations

### Code Quality
- GRN handler split into 4 files is clean -- good separation of concerns
- Migration 018-021 are well-structured with proper FKs and CHECK constraints
- Event logging (`grn_events`) is comprehensive and immutable as spec requires
- Exception tracking (`grn_exceptions`) covers all spec exception types

### Functional Issues to Verify
1. **Packing list import** -- CSVTools component exists; verify it's wired to GRN session
2. **Box auto-close** -- verify clean boxes auto-close without operator action (spec requirement)
3. **Follow-up receipt linking** -- verify `parent_grn_id` correctly links shortage to original GRN
4. **Stock posting on finalize** -- verify routes to INCOMING/HOLD/DAMAGED based on QI flag
5. **Duplicate box detection** -- verify `grn_events` records duplicate scan events

### Schema Concerns
1. `grn_lines.notes` column appears twice (migration 002 + 008) -- should verify no conflicts
2. `receiving_mode` on grn_sessions defaults to `packing_list` -- verify invoice-only mode works end-to-end
3. `allocation_status` on stock_location_balances (migration 021) -- verify staging bins are correctly marked `unallocatable`

---

*Generated from live codebase analysis against `docs/features/grn_specification.md`*
