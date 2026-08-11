# Feature 13 — Returns

**Spec References:** SPEC_03_OUTBOUND.md §9, goWMS_Outbound_Analysis.md §12
**Status:** NOT DONE (schema only)
**Priority:** LOW

---

## Current Implementation

### Database
- `return_claims`: exists in migration 003 (schema only)
- `return_claim_photos`: exists in migration 003
- `delivery_notes.is_return` + `return_against` columns exist

### Backend
- **No handler exists for returns**

### Frontend
- **No Returns.tsx page**

---

## Gaps (All — Full Feature Build)

### 1. Return Request Flow
- SPEC_03 §9.1: Return Request → Receive → QC → Decision → Credit/Replacement
- **Plan:**
  1. Create `api/modules/returns/handler.go`:
     - `POST /returns/` — create return request (dn_id, items[], reason)
     - `GET /returns/` — list
     - `GET /returns/:id` — get with lines
     - `POST /returns/:id/receive` — mark items received at dock
     - `POST /returns/:id/inspect` — QC inspection
     - `POST /returns/:id/decide` — restock / repair / scrap / return to supplier
  2. Return creates stock adjustment (restock → add to returns location, scrap → remove)
  3. Link to original delivery note
- **Effort:** 3-4 days

### 2. Returns React Page
- Create Returns.tsx with list + detail + workflow buttons
- Add route + sidebar nav under "Selling"
- **Effort:** 1-2 days

### 3. QC Integration
- Returns inspection uses QC templates (Feature 05)
- Reuse Qi.tsx or create returns-specific QC flow
- **Effort:** 1 day

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 11 Dispatch | Returns reference DN | DN must exist |
| 05 QC Templates | Returns inspection | Reuse template system |
| 07 Stock Balances | Restock/adjust | Uses AdjustLocationQty |

---

## Acceptance Criteria

- [ ] Create return request linked to DN
- [ ] Receive returned items
- [ ] QC inspection on returned items
- [ ] Decision: restock / scrap / return to supplier
- [ ] Stock adjustment on restock/scrap
- [ ] Return list page with status tracking

---

## Implementation Plan

### Phase 1 — Return Handler (2 days)
1. Migration: ensure return tables are complete
2. Create returns handler (CRUD + receive + inspect + decide)
3. Stock adjustment on restock (add to returns location) and scrap (remove)

### Phase 2 — QC Integration (1 day)
1. Create QC inspection for return items
2. Link to existing QC template system

### Phase 3 — React Page (1-2 days)
1. Create Returns.tsx with list + detail
2. Workflow buttons: Receive → Inspect → Decide
3. Add route + sidebar nav
