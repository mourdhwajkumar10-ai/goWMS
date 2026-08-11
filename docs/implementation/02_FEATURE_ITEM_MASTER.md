# Feature 02 — Item Master

**Spec References:** SPEC.md §2.3, SPEC_01_WAREHOUSE_SETUP.md §2
**Status:** DONE (minor gaps)
**Priority:** Foundation

---

## Current Implementation

### Database
- `items` table: code, name, brand, item_group, pack_type (loose/packed), control_mode (item_controlled/bin_controlled), home_location_id, master_complete, barcode, has_serial, has_batch, has_expiry_date, shelf_life_in_days, carton_qty, safety_stock
- `item_groups` table: id, name, parent_id, is_group (hierarchical categories)
- Constraints: pack_type IN, control_mode IN

### Backend (api/modules/masterdata/handler.go)
- `POST /masterdata/items` — create (validates pack_type, control_mode, home_location if bin_controlled)
- `PATCH /masterdata/items/:id` — update
- `GET /masterdata/items` — list with search
- `POST /masterdata/items/complete` — upsert for unknown SKU completion (validates master_complete)
- `GET /masterdata/items/check/:code` — check if item exists + master_complete status
- `GET /masterdata/items/:code/inventory` — inventory by item across locations

### Frontend (Items.tsx)
- Two-panel: items list with search + item detail with stock locations
- Create form with all required fields (code, name, pack_type, control_mode, home_location, serial/batch/expiry flags)
- "Complete Master" flow for unknown SKUs (used by GRN)

---

## Gaps

### 1. No Edit Form in UI
- `PATCH /masterdata/items/:id` exists in backend but Items.tsx has no edit modal
- Only create form exists
- **Impact:** Users can't modify items after creation without DB access
- **Plan:** Add edit modal (reuse create form with pre-filled values)
- **Files:** `web/src/pages/Items.tsx` — add edit button per row, open modal with item data
- **Effort:** Small (0.5 day)

### 2. Item Groups Not Wired
- `item_groups` table exists with hierarchy (parent_id, is_group)
- Items.tsx has `ItemGroup` text input, not a dropdown linked to item_groups
- No CRUD handler for item_groups
- **Impact:** Item grouping is free-text, no hierarchical browsing
- **Plan:** Create item_groups CRUD handler + hierarchical dropdown in Items form
- **Files:** New handler `api/modules/masterdata/item_groups.go`, update Items.tsx
- **Effort:** Medium (1-2 days)
- **Conflict:** None — item_groups is additive

### 3. No CSV Import for Items
- `CSVTools.tsx` component exists but only used by PurchaseOrders.tsx
- No import endpoint for items
- **Impact:** Manual entry only for 2,000-5,000 SKUs
- **Plan:** Add `POST /masterdata/items/import` endpoint + import button in Items.tsx
- **Files:** Add handler in masterdata, add CSVTools to Items.tsx
- **Effort:** Medium (1 day)
- **Conflict:** None

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 04 GRN | Unknown SKU → completeItemMaster | Already works — GRN calls checkItem then completeItemMaster |
| 07 Stock Balances | item_code FK | No conflict |
| 08 Sales Orders | item reference | No conflict — sales_order_items references items |
| 16 Import | CSV import needed | Item import is part of this feature |

---

## Acceptance Criteria

- [x] Item can be created with pack_type, control_mode, home_location
- [x] Unknown SKU triggers complete master flow in GRN
- [x] bin_controlled requires home_location_id
- [x] has_expiry requires shelf_life_in_days
- [ ] User can edit items after creation (TODO)
- [ ] Item groups browsable as hierarchy (TODO)
- [ ] CSV import for items (TODO)

---

## Implementation Plan

### Phase 1 — Edit Modal (0.5 day)
1. Add edit button per row in Items.tsx items table
2. Open create form pre-filled with item data
3. On save, call `PATCH /masterdata/items/:id`
4. Refresh list

### Phase 2 — Item Groups (1-2 days)
1. Create `GET/POST/PUT /masterdata/item-groups` handler
2. Create `item_groups` tree endpoint (children of parent)
3. Replace text input with TreeSelect dropdown in Items form
4. Add item_groups management page (or inline in Settings)

### Phase 3 — CSV Import (1 day)
1. Add `POST /masterdata/items/import` accepting CSV/Excel
2. Map columns: sku, part_code, name, brand, category, pack_mode, control_mode, etc.
3. Validate each row, skip duplicates, return import summary
4. Add "Import" button + CSVTools component to Items.tsx
