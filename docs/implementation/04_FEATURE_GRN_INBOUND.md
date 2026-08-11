# Feature 04 — GRN / Inbound Operations

**Spec References:** SPEC.md §3.4, §5, SPEC_02_INBOUND.md
**Status:** DONE (minor gap)
**Priority:** Foundation

---

## Current Implementation

### Database
- `grn_sessions`: id, session_no, warehouse_id, purchase_receipt_no, supplier_name, purchase_order_id, status
- `grn_cartons`: id, grn_session_id, carton_no, status (accounted)
- `grn_lines`: id, grn_carton_id, item_code, expected_qty, scanned_qty, damaged_qty, batch_no, expiry_date, requires_qi, notes, status

### Backend (api/modules/grn/handler.go — 839 lines)
- `POST /grn/` — create session (links to PO if provided)
- `GET /grn/sessions` — list
- `GET /grn/session/:id` — get with cartons + lines
- `POST /grn/carton` — scan carton (idempotent)
- `POST /grn/line` — scan line (validates item master complete, computes status: full_match/damage/shortage/excess, over-receipt check)
- `POST /grn/close` — close session:
  1. Ensures staging locations (INCOMING-01, HOLD-01, DAMAGED-01)
  2. Posts damaged qty → DAMAGED-01
  3. Posts good qty (requires_qi? → HOLD-01 : → INCOMING-01)
  4. Creates QI records for requires_qi items
  5. Updates PO received_qty
  6. Writes stock ledger entries
- `POST /grn/putaway` — inline putaway (decrements source, increments target)

### Frontend (GRN.tsx — 684 lines)
- PO selection → Start Receiving → Active session with:
  - Carton scan, line scan (with Fill from PO)
  - Complete Item Master modal for unknown SKUs
  - Close Session with stats modal
  - Inline putaway quick form

---

## Gap

### 1. No Packing List CSV/Excel Import
- SPEC_02 §2.1 Option C defines importing supplier packing list
- `CSVTools.tsx` component exists but not used by GRN
- `docs/spares_packing_list.xlsx` is the sample format
- **Impact:** Manual entry for every line; at 15 boxes x N items per box, this is tedious
- **Plan:**
  1. Add "Import Packing List" button to GRN.tsx session view
  2. Use CSVTools to parse uploaded file
  3. Map supplier columns to grn_lines:
     - Part Code → item_code
     - Qty → expected_qty
     - Weight → (optional, not stored currently)
     - Box Number → auto-create cartons
  4. Call `POST /grn/line` for each row (or batch insert endpoint)
  5. Auto-create cartons from unique Box Numbers
- **Files:** GRN.tsx, possibly new batch endpoint in grn/handler.go
- **Effort:** 1-2 days
- **Conflict:** None — additive to existing flow

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 02 Item Master | Unknown SKU blocks line scan | Already handled — completeItemMaster modal |
| 05 QC Templates | requires_qi creates QI records | Currently creates generic QI, could link to templates |
| 06 Putaway | GRN close posts to incoming | Putaway moves from incoming to storage |
| 07 Stock Balances | Creates stock on close | Uses AdjustLocationQty — consistent |
| 12 Backorders | GRN could fulfill backorders | Not currently wired — see Feature 12 |

---

## Acceptance Criteria

- [x] Create GRN session from PO or blank
- [x] Scan cartons (idempotent)
- [x] Scan lines with expected vs scanned qty
- [x] Damaged qty tracking
- [x] Unknown SKU triggers complete master modal
- [x] Close session posts to correct locations
- [x] QI items go to HOLD-01
- [ ] Import packing list from CSV/Excel (TODO)

---

## Implementation Plan

### Phase 1 — CSV Import (1-2 days)
1. Add "Import Packing List" button to GRN.tsx (next to "Scan Carton")
2. On upload, parse CSV/Excel with CSVTools component
3. Map columns (Part Code, Qty, Box Number, etc.)
4. For each unique Box Number: create grn_carton
5. For each row: create grn_line with expected_qty
6. Show import summary (X cartons, Y lines, Z items matched)
7. Optionally: add `POST /grn/{id}/import` batch endpoint for efficiency

---

## Updated: Packing List Import Integration

**Cross-reference:** Feature 18 (Packing List Import)

### How Import Fits into GRN Flow

```
1. User opens GRN session (from PO or blank)
2. Clicks "Import Packing List"
3. Selects supplier → auto-loads default template
4. Uploads CSV/Excel
5. System parses with template column mapping
6. Shows preview (boxes, lines, items matched, unknowns)
7. User confirms → GRN cartons + lines created
8. Continue with normal box check → item check → close flow
```

### Mapping to Actual Packing List (spares_packing_list.xlsx)

| Excel Column | GRN Field | GRN Table |
|--------------|-----------|-----------|
| Dealer Code | (customer lookup) | — |
| InvoiceNo | invoice_no | grn_sessions |
| InvoiceDate | invoice_date | grn_sessions |
| Delivery No | delivery_no | grn_sessions |
| Delivery date | delivery_date | grn_sessions |
| Plant | plant | grn_sessions |
| Part Code | item_code | grn_lines |
| Part Name | part_name | grn_lines |
| Qty | expected_qty | grn_lines |
| Calculated Part Weight | (weight tracking) | grn_lines |
| Box Number | carton_no | grn_cartons |

### Import Endpoint

`POST /api/grn/:id/import-packing-list`
- Accepts: file (CSV/Excel), template_id (optional)
- Creates: grn_cartons (from Box Number), grn_lines (from each row)
- Returns: summary with counts + unknown items

### Items Not in Master

When Part Code doesn't match any item in the `items` table:
- Import still creates the grn_line (with item_code = supplier part code)
- GRN scan flow will trigger "Complete Item Master" modal
- User maps supplier part code → internal SKU

### Weight Verification

The packing list includes weight per part. During box check:
- Sum weight of all items in box from packing list
- Compare to actual weighed weight
- Flag mismatch > 5% tolerance
