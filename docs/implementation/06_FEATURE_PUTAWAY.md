# Feature 06 — Putaway

**Spec References:** SPEC.md §4, SPEC_02_INBOUND.md §6
**Status:** DONE (minor gap)
**Priority:** Foundation

---

## Current Implementation

### Database
- `putaway_logs`: id, putaway_no, item_code, source_location_id, target_location_id, quantity, batch_no
- `putaway_rules`: id, item_code, warehouse_id, priority, stock_capacity

### Backend (api/modules/putaway/handler.go — 383 lines)
- `POST /putaway/` — confirm putaway (decrements source, increments target, creates log)
- `GET /putaway/suggest` — 3-tier suggestion:
  1. Home location (if bin_controlled + has capacity)
  2. Consolidate same item (existing bin with free capacity)
  3. Empty storage/pick_face location
- `GET /putaway/queue` — items in incoming/hold/staging locations
- `GET /putaway/rules` — list putaway rules

### Backend (api/modules/putawayrules/handler.go — 152 lines)
- CRUD for putaway rules
- `GET /putaway-rules/resolve` — picks highest priority rule with capacity

### Frontend (Putaway.tsx — 270 lines)
- 3-column: pending queue, confirm form, putaway rules

---

## Gap

### 1. Suggest Doesn't Consult putaway_rules
- The suggest endpoint uses home_location, consolidation, and empty-location heuristics
- `putaway_rules` are listed/managed but never consulted by suggest
- **Impact:** Rules define per-item capacity limits but aren't used in location suggestion
- **Plan:** Integrate rules into suggest algorithm as override/filter:
  1. Before suggesting, check if putaway_rule exists for item_code + warehouse_id
  2. If rule exists: filter candidate bins by stock_capacity (existing qty < rule.stock_capacity)
  3. Use rule priority to rank among multiple valid bins
- **Files:** `api/modules/putaway/handler.go` suggest function
- **Effort:** 0.5 day

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 01 Warehouse | Uses location types | Already filters storage/pick_face |
| 04 GRN | GRN close posts to incoming | Putaway moves from incoming |
| 07 Stock Balances | AdjustLocationQty | Consistent |

---

## Acceptance Criteria

- [x] System suggests location for putaway
- [x] 3-tier priority: home → consolidate → empty
- [x] Confirm putaway moves stock
- [x] Queue shows items in incoming/hold/staging
- [x] Putaway rules CRUD
- [ ] Suggest respects putaway_rules capacity (TODO)

---

## Implementation Plan

### Phase 1 — Integrate Rules into Suggest (0.5 day)
1. In suggest handler, query putaway_rules for item_code + warehouse_id
2. If rule exists: add WHERE clause to filter bins where on_hand < rule.stock_capacity
3. Sort by rule.priority (lowest first) among valid bins
4. Return rule priority as part of suggestion reason
