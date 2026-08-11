# Feature 10 — Packing

**Spec References:** SPEC_03_OUTBOUND.md §5
**Status:** PARTIAL (no print, no outbound QC)
**Priority:** MEDIUM

---

## Current Implementation

### Database
- `boxes`: id, box_no, label, pick_list_id, delivery_note, weight_kg, loaded, stock_consumed, packed_by
- `box_items`: id, box_id, item_code, quantity, batch_no
- `pack_reversals`: audit trail for removed items

### Backend (api/modules/packing/handler.go — 289 lines)
- `POST /packing/` — create box (label + pick_list_id)
- `POST /packing/:id/item` — pack item (item_code, qty, batch)
- `POST /packing/:id/reverse` — remove item from box
- `POST /packing/:id/load` — mark loaded (consumes reserved stock via ConsumePickListStock)
- `GET /packing/` and `/packing/sessions` — list boxes
- `GET /packing/:id` — get box with items

### Frontend (Pack.tsx — 235 lines)
- Box list, create box, active box with pack item form + items table

---

## Gaps

### 1. No Box Label Printing
- No PDF generation
- Box label spec (SPEC_03 §5.5) defines format: Box ID, Customer, SO, Contents, Weight, Barcode
- **Plan:**
  1. Add `GET /packing/:id/label` endpoint returning PDF
  2. Label template: Box No, Customer, SO, Items list, Weight, Packed by, Date, Barcode
  3. Support thermal printer (4x6 inch)
  4. Add "Print Label" button to Pack.tsx
- **Effort:** 1-2 days
- **Conflict:** None — additive

### 2. No Delivery Note Auto-Generation
- `delivery_notes` table exists but no handler creates them
- `boxes.delivery_note` is free-text set at box creation
- **Plan:** See Feature 11 (Dispatch) — DN generated from trip
- **Effort:** Covered in Feature 11

### 3. No Pack QC
- goWMS_Outbound_Analysis.md suggests optional QC between packing and dispatch
- **Impact:** Low — skip for v1 unless returns rate is high
- **Recommendation:** Add after returns module is built

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 09 Picking | Pack consumes picked stock | Already works via ConsumePickListStock |
| 11 Dispatch | Dispatch loads packed boxes | Boxes must be packed before loading |

---

## Acceptance Criteria

- [x] Create box with label
- [x] Pack items into box
- [x] Reverse (remove) items from box
- [x] Mark loaded — consumes reserved stock
- [ ] Box label printing (TODO)
- [ ] Delivery note auto-generation (TODO — see Feature 11)

---

## Implementation Plan

### Phase 1 — Box Label Printing (1-2 days)
1. Add Go PDF utility (shared with pick list printing)
2. Create box label template
3. Add `GET /packing/:id/label` endpoint
4. Add "Print Label" button to Pack.tsx
