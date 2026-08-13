# GRN Specification vs Implementation — Gap Analysis

**Generated:** August 11, 2026  
**Spec:** `docs/features/grn_specification.md` (694 lines)  
**Implementation:** `api/modules/grn/handler.go` (855 lines) + `web/src/pages/GRN.tsx` (684 lines)

---

## Summary

| Category | Implemented | Partially Implemented | Missing | Total |
|----------|-------------|----------------------|---------|-------|
| **GRN Session** | 5 | 3 | 8 | 16 |
| **Box Check** | 1 | 1 | 5 | 7 |
| **Item Check** | 2 | 2 | 4 | 8 |
| **Quality Inspection** | 1 | 1 | 7 | 9 |
| **Putaway** | 2 | 2 | 4 | 8 |
| **Stock Tracking** | 2 | 1 | 3 | 6 |
| **API Endpoints** | 7 | 2 | 12 | 21 |
| **UI Screens** | 3 | 2 | 5 | 10 |
| **TOTALS** | **23** | **14** | **48** | **85** |

---

## 1. GRN Session

### ✅ Implemented

| Spec Requirement | Implementation | Location |
|------------------|----------------|----------|
| Option A: Create from PO | `createSession()` | handler.go:35-83 |
| Option B: Blank session | `createBlankSession()` | GRN.tsx:84-98 |
| Session number auto-gen (GRN-YYYY-NNNNN) | Auto-generated in INSERT | handler.go:68 |
| List sessions | `listSessions()` | handler.go:85-113 |
| Get session with cartons+lines | `getSession()` | handler.go:115-208 |

### ⚠️ Partially Implemented

| Spec Requirement | Current State | Gap |
|------------------|---------------|-----|
| **Option C: Import Packing List** | CSVTools component exists but NOT wired to GRN | Feature 18 (NOT DONE) |
| **Session status enum** | Only `open` and `closed` | Spec: `open, receiving, qc_pending, qc_done, putaway_pending, completed, closed` |
| **Warehouse/staging auto-create** | `EnsureLocation` creates INCOMING-01, HOLD-01, DAMAGED-01 | No DAMAGED staging with proper seal |

### ❌ Missing

| Spec Requirement | Spec Reference | Priority |
|------------------|----------------|----------|
| `supplier_id` FK (linked to suppliers table) | Section 2.2 | HIGH — currently uses `supplier_name` text only |
| `invoice_no`, `invoice_date` fields | Section 2.2 | HIGH — not stored in session |
| `delivery_no`, `delivery_date` fields | Section 2.2 | HIGH — not stored in session |
| `plant` field | Section 2.2 | MEDIUM — not stored |
| `dock` field | Section 2.2 | LOW — not stored |
| `total_boxes_expected/received` counters | Section 2.2 | HIGH — not tracked at session level |
| `total_items_expected/received` counters | Section 2.2 | HIGH — not tracked at session level |
| `total_weight_expected/received` counters | Section 2.2 | HIGH — weight not tracked |
| `received_by` FK (employee) | Section 2.2 | MEDIUM — stores user_id not employee |
| `PUT /api/grn/{id}` update endpoint | Section 8 | MEDIUM — no update endpoint |

---

## 2. Box Check (Box-Level Verification)

### ✅ Implemented

| Spec Requirement | Implementation | Location |
|------------------|----------------|----------|
| Scan/enter box number | `doScanCarton()` | handler.go:242-273 |

### ⚠️ Partially Implemented

| Spec Requirement | Current State | Gap |
|------------------|---------------|-----|
| Box condition tracking | `grn_cartons.status = 'accounted'` only | No `condition` field (ok/damaged/wet/crushed) |

### ❌ Missing

| Spec Requirement | Spec Reference | Priority |
|------------------|----------------|----------|
| `condition` field (ok/damaged/wet/crushed) | Section 3.2, Schema 3.3 | HIGH |
| `seal_status` field (sealed/opened/tampered) | Section 3.2 | HIGH |
| `expected_weight_kg` field | Section 3.2 | HIGH — weight verification impossible |
| `actual_weight_kg` field | Section 3.2 | HIGH — weight verification impossible |
| `photo_urls` for damaged boxes | Section 3.2 | MEDIUM |
| Box check UI with verification form | Section 3.2 | HIGH — no UI for box check step |

### Box-Level Inventory Tracking (Spec Section 3.3)

The spec defines `grn_boxes` table with rich fields. Current implementation:

```sql
-- CURRENT: grn_cartons
CREATE TABLE grn_cartons (
    id SERIAL PRIMARY KEY,
    grn_session_id INTEGER,
    carton_no TEXT,
    status TEXT DEFAULT 'accounted',
    scanned_at TIMESTAMPTZ,
    scanned_by INTEGER
);

-- SPEC: grn_boxes
CREATE TABLE grn_boxes (
    id UUID PRIMARY KEY,
    grn_id UUID REFERENCES grn_sessions(id),
    box_number TEXT NOT NULL,
    supplier_box_ref TEXT,
    condition TEXT DEFAULT 'ok',
    seal_status TEXT DEFAULT 'sealed',
    expected_weight_kg DECIMAL,
    actual_weight_kg DECIMAL,
    photo_urls TEXT[],
    current_location TEXT DEFAULT 'dock',
    status TEXT DEFAULT 'received',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Missing columns:** `condition`, `seal_status`, `expected_weight_kg`, `actual_weight_kg`, `photo_urls`, `current_location`, `notes`

---

## 3. Item Check (Item-Level Verification)

### ✅ Implemented

| Spec Requirement | Implementation | Location |
|------------------|----------------|----------|
| Scan item code | `doScanLine()` | handler.go:380-459 |
| Auto-detect shortage/excess/damage | Status computation | handler.go:420-433 |

### ⚠️ Partially Implemented

| Spec Requirement | Current State | Gap |
|------------------|---------------|-----|
| Expected qty from packing list | `expected_qty` field exists | Only manual entry, no packing list import |
| Damaged qty tracking | `damaged_qty` field exists | Works but no photo attachment |
| Qty short auto-calculated | Status = `shortage` if scanned < expected | `qty_short` not stored as separate field |

### ❌ Missing

| Spec Requirement | Spec Reference | Priority |
|------------------|----------------|----------|
| `po_line_id` FK to PO line | Section 2.3 | HIGH — no PO line link |
| `item_id` FK to item master | Section 2.3 | MEDIUM — only stores `item_code` text |
| `weight_expected` field | Section 2.3 | HIGH — weight verification |
| `weight_received` field | Section 2.3 | HIGH — weight verification |
| `unit_price` from PO | Section 2.3 | MEDIUM — not stored |
| `qc_status` enum (pending/passed/failed/skipped) | Section 2.3 | HIGH — not on grn_lines |
| `putaway_status` enum (pending/assigned/done) | Section 2.3 | HIGH — not on grn_lines |
| `putaway_location_id` FK | Section 2.3 | MEDIUM — putaway doesn't link back to grn_line |

### Item Check UI (Spec Section 4.2)

The spec shows a rich box-level item check UI. Current implementation has:
- ✅ Carton scan → line scan (GRN.tsx)
- ❌ No "Open Box" step showing expected contents
- ❌ No per-item condition selector (OK/Minor Damage/Reject)
- ❌ No photo capture per item
- ❌ No "Mark Box Complete" button

---

## 4. Quality Inspection (QC)

### ✅ Implemented

| Spec Requirement | Implementation | Location |
|------------------|----------------|----------|
| Create inspection | `POST /qi/` | qi/handler.go |
| Accept/Reject inspection | `POST /qi/:id/submit` | qi/handler.go |

### ⚠️ Partially Implemented

| Spec Requirement | Current State | Gap |
|------------------|---------------|-----|
| QC triggered from GRN | `requires_qi` flag creates QI record | No template selection |

### ❌ Missing

| Spec Requirement | Spec Reference | Priority |
|------------------|----------------|----------|
| QC Configuration per item/category | Section 5.1 | HIGH — not configurable |
| QC Type (Visual/Measurement/Functional/Full) | Section 5.1 | MEDIUM — not implemented |
| Sample Size config (All/10%/20%/Random) | Section 5.1 | MEDIUM — not implemented |
| Auto-Approve setting | Section 5.1 | LOW |
| **QC Checklist Templates** (`qc_templates` table) | Section 5.2 | HIGH — table doesn't exist |
| Checklist per template (JSONB) | Section 5.2 | HIGH — not implemented |
| Checklist results per inspection | Section 5.3 | HIGH — not stored |
| **Reject Button Bug** | Qi.tsx line 206 | CRITICAL — `() => {}` does nothing |
| Failure action (Return/Accept/Scrap) | Section 5.3 | HIGH — not implemented |

### QC Template Table (Spec Section 5.2)

```sql
-- SPEC: qc_templates
CREATE TABLE qc_templates (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    category_id UUID REFERENCES categories(id),
    sample_size TEXT DEFAULT 'all',
    checklist JSONB NOT NULL,  -- [{item: "...", type: "pass_fail"}]
    auto_approve BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'active'
);
```

**Current state:** Table does NOT exist. `quality_inspection_template` column on `quality_inspections` is UNUSED.

---

## 5. Putaway

### ✅ Implemented

| Spec Requirement | Implementation | Location |
|------------------|----------------|----------|
| Suggest location (3-tier) | `GET /putaway/suggest` | putaway/handler.go |
| Confirm putaway (move stock) | `PUT /putaway/` | putaway/handler.go |
| Inline putaway from GRN | `POST /grn/putaway` | handler.go:767-848 |

### ⚠️ Partially Implemented

| Spec Requirement | Current State | Gap |
|------------------|---------------|-----|
| Putaway strategy (zone/proximity/FEFO) | 3-tier: home → consolidate → empty | No zone preference, no proximity calc |
| Putaway rules CRUD | Rules exist but not used in suggest | Section 6.1 rules not integrated |

### ❌ Missing

| Spec Requirement | Spec Reference | Priority |
|------------------|----------------|----------|
| `qc_status` gating (QC must pass before putaway) | Section 5.4 | HIGH — no QC→Putaway gate |
| Per-line putaway tracking on grn_lines | Section 2.3 | MEDIUM — putaway logs exist but not linked to grn_lines |
| `putaway_location_id` on grn_lines | Section 2.3 | MEDIUM — not stored |
| Bulk auto-suggest for all pending items | Section 6.2 | MEDIUM — only single-item suggest |

### Putaway UI (Spec Section 6.2-6.3)

The spec shows:
- ✅ Suggested bin display
- ❌ No "Auto-Suggest All" button
- ❌ No mobile-friendly confirmation UI with scan-to-assign
- ❌ No "Use Suggested" / "Choose Other" quick actions
- ❌ No putaway queue filtered by GRN session

---

## 6. Stock Tracking

### ✅ Implemented

| Spec Requirement | Implementation | Location |
|------------------|----------------|----------|
| Stock by location + batch | `stock_location_balances` | shared/stockloc.go |
| Stock ledger entries | `stock_ledger_entries` | handler.go:641-646 |

### ⚠️ Partially Implemented

| Spec Requirement | Current State | Gap |
|------------------|---------------|-----|
| Stock by batch | Works via `batch_no` column | No batch_mfg_date, batch_exp_date on balance |

### ❌ Missing

| Spec Requirement | Spec Reference | Priority |
|------------------|----------------|----------|
| Stock by Box (supplier reference) | Section 7.1 | HIGH — no `box_ref` on stock_balance |
| `stock` table with `qty_available` generated column | Section 7.2 | MEDIUM — uses `stock_location_balances` instead |
| `stock_ledger` with `doc_type`, `doc_id`, `qty_before`, `qty_after` | Section 7.2 | MEDIUM — current SLE is simpler |
| Multi-view stock UI (by location/batch/box) | Section 7.1 | HIGH — no stock-by-box view |

### Stock Table Schema Comparison

```sql
-- SPEC: stock (Section 7.2)
CREATE TABLE stock (
    id UUID PRIMARY KEY,
    item_id UUID REFERENCES items(id),
    location_id UUID REFERENCES locations(id),
    warehouse_id UUID REFERENCES warehouses(id),
    batch_id UUID,
    box_ref TEXT,                    -- ❌ MISSING
    qty_on_hand INT DEFAULT 0,
    qty_reserved INT DEFAULT 0,
    qty_available INT GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,  -- ❌ MISSING
    last_grn_id UUID,               -- ❌ MISSING
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, location_id, batch_id, box_ref)
);

-- CURRENT: stock_location_balances
CREATE TABLE stock_location_balances (
    id SERIAL PRIMARY KEY,
    item_code TEXT,
    warehouse_id INTEGER,
    location_id INTEGER,
    batch_no TEXT,
    actual_qty NUMERIC,
    reserved_qty NUMERIC,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_code, location_id, batch_no)
);
```

**Missing:** `box_ref`, `qty_available` (generated), `last_grn_id`

---

## 7. API Endpoints (Spec Section 8)

### ✅ Implemented

| Spec Endpoint | Current Endpoint | Notes |
|---------------|------------------|-------|
| `POST /api/grn` | `POST /grn/` | ✅ |
| `GET /api/grn/{id}` | `GET /grn/session/:id` | ✅ |
| `GET /api/grn?status=&supplier_id=` | `GET /grn/sessions` | ⚠️ No filters |
| `POST /api/grn/{id}/lines` | `POST /grn/line` | ✅ |
| `GET /api/grn/{id}/boxes` | `GET /grn/session/:id/cartons` | ✅ |
| `POST /api/grn/{id}/boxes` | `POST /grn/carton` | ✅ |
| `POST /api/putaway/suggest-locations` | `GET /putaway/suggest` | ✅ (GET not POST) |

### ⚠️ Partially Implemented

| Spec Endpoint | Current Endpoint | Gap |
|---------------|------------------|-----|
| `POST /api/grn/{id}/complete` | `POST /grn/close` | Different path, works |
| `GET /api/grn/{id}/lines` | Inline in getSession | Not separate endpoint |

### ❌ Missing

| Spec Endpoint | Priority | Description |
|---------------|----------|-------------|
| `PUT /api/grn/{id}` | MEDIUM | Update session (notes, dock, etc.) |
| `POST /api/grn/{id}/import-packing-list` | **CRITICAL** | Packing list import (Feature 18) |
| `POST /api/grn/{id}/start-receiving` | MEDIUM | Status transition to `receiving` |
| `PUT /api/grn/{id}/lines/{line_id}` | MEDIUM | Update individual line |
| `PUT /api/grn/{id}/boxes/{box_id}` | HIGH | Update box condition/status |
| `POST /api/grn/{id}/boxes/{box_id}/check` | HIGH | Box check verification endpoint |
| `GET /api/qc/pending?grn_id=` | MEDIUM | QC queue filtered by GRN |
| `POST /api/qc/{grn_line_id}/inspect` | HIGH | QC per grn_line |
| `GET /api/qc/templates` | HIGH | QC template list |
| `POST /api/qc/templates` | HIGH | QC template create |
| `GET /api/putaway/pending?grn_id=` | MEDIUM | Putaway queue filtered by GRN |
| `POST /api/putaway/{grn_line_id}/confirm` | MEDIUM | Putaway per grn_line |

---

## 8. UI Screens (Spec Sections 2.4, 3.2, 4.2, 5.3, 6.2)

### ✅ Implemented

| Spec Screen | Implementation | Location |
|-------------|----------------|----------|
| Session list | GRN.tsx list view | GRN.tsx:425-462 |
| Active session with cartons+lines | GRN.tsx session view | GRN.tsx:504-681 |
| PO selection | GRN.tsx PO table | GRN.tsx:384-423 |

### ⚠️ Partially Implemented

| Spec Screen | Current State | Gap |
|-------------|---------------|-----|
| Box summary (expected/received/damaged) | Carton list shows count | No summary stats bar |
| Progress stepper (Receiving→Box Check→Item Check→QC→Putaway) | Status badge only | No visual stepper |

### ❌ Missing

| Spec Screen | Spec Reference | Priority |
|-------------|----------------|----------|
| **5-step progress stepper** | Section 2.4 | HIGH — key UX element |
| **Box Check verification form** (condition, seal, weight, photo) | Section 3.2 | HIGH |
| **Item Check form** (per-item in box) | Section 4.2 | HIGH |
| **QC Inspection checklist** (per template) | Section 5.3 | HIGH |
| **Putaway queue** (filtered by GRN) | Section 6.2 | MEDIUM |
| **Putaway confirmation** (mobile scan-to-assign) | Section 6.3 | MEDIUM |
| **Stock multi-view** (by location/batch/box) | Section 7.1 | HIGH |

---

## 9. Simplified Flow Comparison (Spec Section 9)

### Spec Flow (8 steps)

```
Step 1: Truck arrives → Go to GRN → + New Session
Step 2: Select Supplier → Enter Invoice No, Delivery No
Step 3: Upload supplier packing list (Excel) → System auto-loads expected items
Step 4: Count boxes → Scan each box barcode → Verify against list
Step 5: For each box → Open → Count items → Verify part codes
Step 6: If items need QC → System shows checklist → Check each item → Pass/Fail
Step 7: For each received item → Scan bin barcode → Put item in bin
Step 8: Mark GRN Complete → Stock auto-updated ✅
```

### Current Flow (5 steps — missing 3)

```
Step 1: ✅ Go to GRN → + New Session (or from PO)
Step 2: ✅ Select PO → Session created (no Invoice/Delivery fields)
Step 3: ❌ MISSING: Upload packing list → auto-load items
Step 4: ⚠️ Scan carton → Scan line items (no box check verification)
Step 5: ❌ MISSING: QC checklist (only requires_qi flag, no template)
Step 6: ⚠️ Putaway from GRN (no per-line tracking, no mobile scan)
Step 7: ✅ Close Session → Stock updated
```

### Flow Gap Summary

| Step | Spec | Current | Status |
|------|------|---------|--------|
| 1. Create session | ✅ | ✅ | Implemented |
| 2. Enter supplier + invoice + delivery | ✅ | ❌ | Only PO selection, no invoice/delivery fields |
| 3. Import packing list | ✅ | ❌ | Feature 18 NOT DONE |
| 4. Box check (condition, seal, weight) | ✅ | ❌ | Only carton scan, no verification |
| 5. Item check (per-item in box) | ✅ | ⚠️ | Line scan exists, no box-context UI |
| 6. QC checklist | ✅ | ❌ | No template, no checklist UI |
| 7. Putaway (scan bin) | ✅ | ⚠️ | Single putaway exists, no per-line queue |
| 8. Close session | ✅ | ✅ | Implemented |

---

## 10. Priority Implementation Roadmap

### P0 — Critical (Blocks production use)

| # | Gap | Effort | Files |
|---|-----|--------|-------|
| 1 | **Packing List Import** (Feature 18) | 4-5 days | handler.go, GRN.tsx |
| 2 | **Box Check verification** (condition, seal, weight) | 2-3 days | handler.go, GRN.tsx, migration |
| 3 | **QC Template system** + checklist UI | 2-3 days | qi/handler.go, Qi.tsx, migration |
| 4 | **Session fields** (invoice, delivery, plant, weight counters) | 1 day | handler.go, GRN.tsx, migration |

### P1 — High (Completes inbound flow)

| # | Gap | Effort | Files |
|---|-----|--------|-------|
| 5 | **5-step progress stepper** UI | 1-2 days | GRN.tsx |
| 6 | **Per-line putaway tracking** on grn_lines | 1 day | handler.go, migration |
| 7 | **Stock by box_ref** view | 1 day | items handler, Items.tsx |
| 8 | **Box-level photo capture** | 1 day | handler.go, GRN.tsx |

### P2 — Medium (Polish)

| # | Gap | Effort | Files |
|---|-----|--------|-------|
| 9 | **QC→Putaway gate** (QC must pass) | 1 day | handler.go |
| 10 | **Mobile putaway confirmation** (scan-to-assign) | 1-2 days | Putaway.tsx |
| 11 | **Stock multi-view** (by location/batch/box) | 2 days | Items.tsx |
| 12 | **Session update endpoint** (PUT) | 0.5 day | handler.go |

---

*Document generated from `grn_specification.md` vs `api/modules/grn/handler.go` analysis.*
