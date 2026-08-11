# Feature 01 — Warehouse Master

**Spec References:** SPEC.md §2.1-2.2, SPEC_01_WAREHOUSE_SETUP.md §1
**Status:** DONE (minor gaps)
**Priority:** Foundation — no changes needed

---

## Current Implementation

### Database
- `warehouses` table: id, code, name, warehouse_type, picking_mode, parent_id, is_group
- `warehouse_locations` table: id, code, warehouse_id, zone, aisle, shelf, level, number, location_type, max_capacity_qty, allow_mixed_items, disabled
- Constraints: location_type CHECK, UNIQUE (warehouse_id, code)

### Backend (api/modules/masterdata/handler.go)
- `POST /masterdata/warehouses` — create (auto-creates INCOMING-01, HOLD-01, DAMAGED-01 staging locations)
- `GET /masterdata/warehouses` — list with location_count
- `POST /masterdata/warehouses/:id/locations` — create single location
- `POST /masterdata/warehouses/:id/locations/bulk` — bulk generate (aisle x shelf x bins)
- `PATCH /masterdata/locations/:id` — update location properties
- `GET /masterdata/locations` — list all locations
- `GET /masterdata/locations/:id/inventory` — inventory at location

### Frontend
- `Warehouses.tsx` — Two-panel: warehouse list + location management (create, bulk generate, view locations)
- `Locations.tsx` — Read-only inventory-by-bin viewer

---

## Gaps (Low Priority — Skip for v1)

### 1. No Warehouse Hierarchy UI
- Schema supports parent_id/is_group but createWarehouse handler doesn't accept these fields
- No tree view in Warehouses.tsx
- **Impact:** Flat warehouse list is fine for ₹20Cr distributor with 1-3 warehouses
- **Recommendation:** Skip. Add only if multi-level warehouse structure needed.

### 2. No Location Edit in Locations.tsx
- Location editing only available in Warehouses.tsx panel
- Locations.tsx is read-only viewer
- **Impact:** Minor UX inconvenience
- **Recommendation:** Skip. Current flow works.

### 3. No Zone Management UI
- Zone is a free-text field on location, no dedicated zone CRUD
- SPEC_01 defines zone types (Fast-Moving, Slow-Moving, etc.) with colors
- **Impact:** Zones work as text labels, just no color coding or management UI
- **Recommendation:** Skip. Text zones are sufficient.

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 04 GRN | Uses INCOMING-01, HOLD-01, DAMAGED-01 locations | Already auto-created per warehouse |
| 06 Putaway | Moves stock between locations | Uses AdjustLocationQty, no conflict |
| 07 Stock Balances | location_id FK | No conflict |

---

## Acceptance Criteria (Already Met)

- [x] User can create warehouses with code, name, type
- [x] Auto-creates staging locations (INCOMING, HOLD, DAMAGED)
- [x] User can add locations with aisle/shelf/level/number
- [x] Bulk generate locations from ranges
- [x] Locations show inventory contents
- [x] Location types enforced (storage, pick_face, staging, hold, damaged, incoming)

---

## Implementation Plan

**No work needed.** Feature is complete for v1 scope.
