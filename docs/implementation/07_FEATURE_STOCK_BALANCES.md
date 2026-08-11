# Feature 07 — Stock by Location

**Spec References:** SPEC.md §2.4, §5
**Status:** DONE
**Priority:** Foundation

---

## Current Implementation

### Database
- `stock_location_balances`: id, item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty, updated_at
- Unique index: (item_code, location_id, COALESCE(batch_no, ''))
- `stock_ledger_entries`: full movement audit trail

### Backend (api/modules/shared/stockloc.go — 114 lines)
- `AdjustLocationQty` — core stock movement (upsert on balances, update is_occupied)
- `EnsureLocation` — idempotent staging location creation
- `ResolveWarehouseID` — fallback to first active warehouse

### Backend (api/modules/shared/allocation.go — 211 lines)
- `ListFEFOCandidates` — FEFO query: earliest expiry first, from storage/pick_face, available > 0, FOR UPDATE lock
- `ReserveBalance` — lock stock (reserved_qty += qty)
- `ReleaseReserved` — unlock unused reserve
- `ConsumeReserved` — decrease actual + reserved
- `ConsumePickListStock` — batch consume for pick list (used by packing + dispatch)

### Used By
- GRN close: creates balances at incoming/hold/damaged
- Putaway: moves from incoming to storage
- Picking: FEFO allocation + reserve
- Packing: consume reserved stock
- Dispatch: consume on trip load
- Cycle count: adjust balances
- Transfers: move between warehouses

---

## Gaps

None. Feature is complete and used consistently across all modules.

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| ALL modules | Central stock truth | All modules use AdjustLocationQty or allocation.go |

---

## Acceptance Criteria

- [x] Stock tracked by item + location + batch
- [x] actual_qty and reserved_qty maintained
- [x] FEFO allocation orders by expiry
- [x] Reserve/release/consume lifecycle works
- [x] Stock ledger records all movements
- [x] is_occupied auto-updated on balances

---

## Implementation Plan

**No work needed.** Feature is complete.
