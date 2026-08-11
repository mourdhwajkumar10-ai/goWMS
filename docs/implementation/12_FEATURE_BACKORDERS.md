# Feature 12 — Backorders

**Spec References:** SPEC_03_OUTBOUND.md §8, goWMS_Outbound_Analysis.md §11
**Status:** PARTIAL (stub handler, no UI, no auto-creation)
**Priority:** MEDIUM

---

## Current Implementation

### Database
- `backorders`: id, backorder_no, sales_order_no, status (pending/partially_fulfilled/fulfilled), created_at, resolved_at
- `backorder_lines`: id, backorder_id, item_code, qty_ordered, qty_fulfilled (exists in schema but unused by handler)

### Backend (api/modules/backorder/handler.go — 102 lines)
- `POST /backorder/` — create (requires sales_order_no, auto-generates BO-YYYY-NNNNN)
- `GET /backorder/` — list pending/partially_fulfilled
- `POST /backorder/:id/fulfill` — set status=fulfilled

### Frontend
- **No Backorders.tsx page**
- API client has `backorderList` and `backorderCreate` but no UI consumes them

---

## Gaps

### 1. No Auto-Creation from Pick Shortage
- When picking creates shortage lines, no backorder is auto-created
- **Plan:**
  1. In picking handler, after creating shortage lines:
     - Create backorder with sales_order_no from pick list
     - Create backorder_lines for each shortage item
  2. Or: add webhook/event that triggers backorder creation
- **Files:** picking/handler.go (after create pick list)
- **Effort:** 1 day
- **Conflict:** Depends on Feature 08 (Sales Orders for SO reference)

### 2. No Line-Level Detail
- Handler only works at backorder level, not per-item
- `backorder_lines` table exists but unused
- **Plan:**
  1. Update create handler to accept items[] array
  2. Insert into backorder_lines for each item
  3. Update list handler to return line details
  4. Update fulfill handler to accept per-line fulfillment
- **Effort:** 1-2 days

### 3. No Backorder Fulfillment from GRN
- When stock arrives via GRN, pending backorders should be alerted
- SPEC_03 §8.2: "When stock arrives via GRN → System auto-alerts for pending backorders"
- **Plan:**
  1. In grn/handler.go close session: query pending backorders for received items
  2. Create notification for each matching backorder
  3. Optionally: auto-allocate stock to backorder
- **Effort:** 1 day

### 4. No React Page
- **Plan:**
  1. Create Backorders.tsx: list pending backorders with aging
  2. Detail view: items, quantities, status
  3. Fulfill button (manual or auto from GRN)
  4. Add route + sidebar nav
- **Effort:** 1-2 days

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 08 Sales Orders | Backorders linked to SO lines | Depends on SO module |
| 09 Picking | Shortage triggers backorder | Auto-create on pick creation |
| 04 GRN | GRN fulfills backorders | Alert on GRN close |

---

## Acceptance Criteria

- [ ] Backorder created automatically on pick shortage
- [ ] Backorder has line-level detail (item, qty)
- [ ] GRN close alerts for pending backorders matching received items
- [ ] Backorder list page with aging
- [ ] Manual fulfill endpoint
- [ ] Auto-fulfill when stock arrives (optional)

---

## Implementation Plan

### Phase 1 — Auto-Creation (1 day)
1. Update picking handler to create backorder on shortage
2. Use backorder_lines for per-item detail

### Phase 2 — GRN Fulfillment (1 day)
1. In GRN close, query pending backorders for received items
2. Create notifications for matching backorders
3. Optional: auto-allocate stock

### Phase 3 — React Page (1-2 days)
1. Create Backorders.tsx with list + detail
2. Add fulfill functionality
3. Add route + sidebar nav
