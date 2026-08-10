# goWMS — Product & Build Spec

**Audience:** Bajaj / two-wheeler spare-parts distributors (first customer ~₹20 Cr turnover), then other SMB distributors.  
**Positioning:** ERPNext-aligned warehouse logic, simplified UX — fewer screens, fewer clicks, mobile-friendly worker flows. Not a full ERP.  
**Stack:** Go (Fiber) + React/Vite + PostgreSQL (existing `goWMS/`).

---

## 0. Summary — What we have vs what we need

### What we have (today)

| Area | Current state |
|------|----------------|
| **Stack** | Go API, React desk UI, Postgres migrations, Docker deploy |
| **Auth / roles** | JWT; roles: picker, packer, driver, wm, billing, admin |
| **Masters** | Items, warehouses, suppliers, customers, batches, UOMs (CRUD-ish UI) |
| **Warehouses** | Flat warehouse list (code, name, type, picking mode). `parent_id` / `is_group` in DB but unused in UI |
| **Locations** | Table `warehouse_locations` (aisle, rack, bin, zone) exists — **no UI, no stock link** |
| **Stock qty** | `bins` = item × warehouse qty (ERPNext-style). **Not** item × location |
| **Inbound** | PO → GRN session → carton scan → line scan → close; QI module shell |
| **Putaway** | Manual target location string + putaway rules (item → warehouse priority/capacity); logs only — **no suggestion engine, no stock update to location** |
| **Outbound** | Pick / pack / dispatch page shells |
| **Inventory ops** | Cycle count, stock entry, stock reconciliation pages (thin) |
| **Tracking** | Batch + expiry fields; serial module; analytics expiry list |
| **Item flags** | `has_serial`, `has_batch`, `has_expiry_date`, `shelf_life_in_days`, ABC tier, reorder fields — **no loose/packed, no item vs bin control** |

### What we need (target for v1 sellable core)

| Need | Why |
|------|-----|
| **Multi-warehouse + location master** | Business → warehouses → bins (aisle / shelf / level / number) with add-location UI |
| **Stock by location** | Same truth on Items screen and Locations screen: item, qty, batch, expiry, allocation |
| **Item master completeness** | New part entering warehouse must capture full master (pack type, control mode, batch/expiry, barcode, etc.) |
| **Pack & control modes** | Loose vs packed; item-controlled vs bin-controlled — drives putaway & picking |
| **Guided putaway** | After GRN, system suggests location; worker confirms (scan optional) |
| **Inbound hold bay** | Received stock not sellable until putaway (or QI pass → putaway) |
| **Expected / ASN receive** | Scan against PO expected qty; shortage/overage/damage in one flow |
| **Min-max / reorder alerts** | Prevent counter stockouts |
| **FEFO for expiry parts** | Oils, rubber, batteries |
| **Simple WH transfer** | Main ↔ branch with same location model |

**Out of scope for this v1 core:** full accounting/GST ERP, customer portal/e-commerce, complex multi-company tax, manufacturing/BOM.

---

## 1. Goal

Ship a **warehouse-first WMS** that a parts distributor can run daily:

1. Configure warehouses and bin locations in minutes.  
2. Receive goods against PO (or blind), complete item master on first sight.  
3. Put away with system-suggested bins.  
4. See inventory by item **and** by location (qty, batch, expiry, allocation).  
5. Pick/pack/dispatch later on the same location truth.

Success for friend/pilot: dock-to-bin in few taps; counter staff trusts on-hand by location; no need for the expensive legacy WMS for core inbound + inventory.

---

## 2. Domain model

```
Business / Company
  └── Warehouse (Main Store, Incoming, Returns, Branch…)
        └── Location (bin)
              aisle · shelf · level (low/upper) · number
              → location_code e.g. A-03-L-12

Item (master)
  └── Stock balance at Location (+ optional Batch/Serial)
        actual_qty · reserved_qty · available_qty
```

### 2.1 Warehouse

| Field | Notes |
|-------|--------|
| code, name | Required |
| warehouse_type | e.g. storage, incoming, returns, transit |
| is_group | Parent only; stock only on leaf warehouses |
| parent_id | Optional tree (keep simple: 1–2 levels) |
| disabled | Soft disable |

### 2.2 Location (bin)

| Field | Notes |
|-------|--------|
| warehouse_id | Required |
| aisle | e.g. A, B, 01 |
| shelf | e.g. 01–99 |
| level | `low` \| `upper` (or free text / numeric) |
| number | bin number within shelf/level |
| location_code | Generated unique per warehouse: `{aisle}-{shelf}-{level}-{number}` |
| location_type | storage \| pick_face \| staging \| hold \| damaged |
| max_capacity_qty | Optional; used by putaway suggestion |
| allow_mixed_items | Default true for item-controlled; false often for bin-controlled home slots |
| disabled | Soft disable |

**UI:** On Warehouse detail → “Locations” → add row / bulk add (aisle range × shelf range).

### 2.3 Item master (required on first warehouse entry)

| Field | Notes |
|-------|--------|
| code, name, brand, item_group, stock_uom | Core |
| barcode(s) | At least one encouraged |
| pack_type | `loose` \| `packed` |
| control_mode | `item_controlled` \| `bin_controlled` |
| has_batch, has_serial, has_expiry_date, shelf_life_in_days | Tracking |
| carton_qty | Units per carton when packed |
| home_location_id | Optional preferred bin (strong for bin_controlled) |
| abc_tier | Optional velocity hint for putaway |
| safety_stock, reorder_level, reorder_qty, lead_time_days | Replenishment |
| is_stock, disabled | Flags |

**Gate:** Creating GRN line / stock for an unknown code opens **Complete Item Master** modal; cannot putaway to sellable stock until master is complete (minimum required fields validated).

#### Control modes (behavior)

| Mode | Meaning | Putaway bias | Picking |
|------|---------|--------------|---------|
| **item_controlled** | Track qty of item; may occupy multiple bins | Consolidate to existing bins with capacity, else nearest empty | Any bin with available qty (FEFO if expiry) |
| **bin_controlled** | Item has a home / primary bin relationship | Prefer `home_location`; avoid scattering | Prefer home / pick-face location |

#### Pack types

| Type | Meaning |
|------|---------|
| **loose** | Sold/stored as loose units (bolts, washers); UOM usually Nos |
| **packed** | Carton/box oriented; `carton_qty` matters for receive & putaway counts |

### 2.4 Stock by location (new truth)

Replace “warehouse-only bin” as the operational truth with:

**`stock_location_balances`** (name flexible):

| Field | Notes |
|-------|--------|
| item_code / item_id | |
| warehouse_id | Denormalized for filters |
| location_id | |
| batch_id / batch_no | Nullable |
| actual_qty | |
| reserved_qty | Allocation lock |
| available_qty | actual − reserved (generated or maintained) |

Optional mirror: keep warehouse-level `bins` as sum of location balances for reports.

**Batch:** manufacturing_date, expiry_date — shown on both inventory screens.

**Allocation status:** `available` \| `partial` \| `fully_allocated` derived from reserved vs actual.

---

## 3. Screens (minimal UX)

Principles: one job per screen; worker path ≤ few taps; no ERP form sprawl.

### 3.1 Warehouses

- List warehouses for the business.  
- Drill-in → location grid (code, aisle, shelf, level, number, type, occupancy).  
- Add location / bulk generate.

### 3.2 Locations (inventory by location)

- Filter by warehouse.  
- Select location → contents: item, qty, batch, expiry, allocation, pack/control badges.  
- Empty / near-capacity indicators.

### 3.3 Items (inventory by item)

- Item list with pack_type, control_mode, tracking flags.  
- Drill-in → all locations holding stock: location, qty, batch, expiry, allocation, warehouse.  
- Edit master (wm/admin).

### 3.4 Inbound (GRN)

1. Open session (PO expected or blind).  
2. Scan carton (optional) → scan/enter lines.  
3. Unknown item → complete item master.  
4. Exceptions: shortage / overage / damage → hold location.  
5. Close receive → stock sits in **Incoming / Hold** (not sellable).  
6. Hand off to Putaway queue.

### 3.5 Putaway

1. Queue of received lines pending putaway.  
2. System **suggests** target location (see §4).  
3. Worker accepts or overrides → confirm (scan location optional).  
4. Stock moves Incoming → storage location; line leaves queue.

### 3.6 Alerts (light)

- Below reorder / safety stock.  
- Expiring within N days.  
- Putaway backlog older than X hours.

---

## 4. Putaway suggestion rules

Priority order (first match wins / score and rank):

1. If **bin_controlled** and `home_location` has capacity → suggest home.  
2. Else existing locations already holding **same item** (and compatible batch rules) with free capacity.  
3. Else empty location in preferred zone (by ABC: fast near pick face).  
4. Else any empty storage location with capacity.  
5. If none → show “no capacity” and allow WM override.

Respect: `allow_mixed_items`, `max_capacity_qty`, location disabled, hold/damaged types excluded from normal putaway.

---

## 5. Inbound & inventory rules

| Rule | Behavior |
|------|----------|
| Sellable stock | Only qty at `location_type = storage` (or pick_face) after putaway complete |
| Hold / damaged | Receives exceptions; not allocatable to sales picks |
| FEFO | For `has_expiry_date`, outbound allocation prefers earliest expiry |
| New item gate | Master must be complete before putaway to storage |
| Expected receive | Compare scanned vs PO expected; record variance |
| Blind receive | Allowed; still requires item master + putaway |

---

## 6. Phased build plan

### Phase A — Foundation (build first) ✅ in progress / implemented in code

1. Extend `items`: `pack_type`, `control_mode`, `home_location_id`; validation helpers.  
2. Harden `warehouse_locations`: shelf/level naming, generated `location_code`, capacity, mixed flag, location_type.  
3. API + UI: warehouse detail → CRUD/bulk locations.  
4. Introduce `stock_location_balances` (+ migration from warehouse-level bins if needed).  
5. Items screen: location breakdown. Locations screen: inventory contents.  
6. Item master completeness gate on GRN unknown SKU / putaway.  
7. Putaway suggest + confirm updates location balances.

### Phase B — Guided inbound & putaway ✅ implemented

1. GRN → Incoming/Hold/Damaged balances on receive close.  
2. Putaway queue + suggestion API + confirm (updates location balances, putaway_log).  
3. QI optional step into hold; accept → Incoming, reject → Damaged.  
4. Expected qty vs scan variances UX + damage qty + complete-master modal.

### Phase C — Inventory health

1. Min/max & reorder notifications.  
2. Expiry / FEFO warnings on item & location views.  
3. Cycle count by location/zone.  
4. Inter-warehouse transfer (ship/receive).

### Phase D — Outbound alignment (after A–B stable)

1. Pick path uses location balances + FEFO + allocation reserve.  
2. Pack/dispatch unchanged conceptually but consume reserved qty.

---

## 7. API sketch (Phase A–B)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/masterdata/warehouses` | Existing |
| GET/POST | `/api/masterdata/warehouses/:id/locations` | List/create locations |
| POST | `/api/masterdata/warehouses/:id/locations/bulk` | Bulk generate |
| PATCH | `/api/masterdata/locations/:id` | Update/disable |
| GET | `/api/masterdata/locations/:id/inventory` | Inventory at location |
| GET/POST/PATCH | `/api/masterdata/items` | Include new fields |
| GET | `/api/masterdata/items/:code/inventory` | Inventory by item across locations |
| POST | `/api/masterdata/items/complete` | First-seen master completion |
| GET | `/api/putaway/queue` | Pending putaway lines |
| GET | `/api/putaway/suggest` | `?item_code=&qty=&warehouse_id=` |
| POST | `/api/putaway/` | Confirm putaway (existing, extend to update balances) |
| POST | `/api/grn/...` | Existing; ensure hold/incoming posting |

---

## 8. Data migrations

New migration file (e.g. `004_locations_inventory.sql`):

- ALTER `items` add `pack_type`, `control_mode`, `home_location_id`.  
- ALTER `warehouse_locations` add/rename columns for shelf, level, number, location_type, capacity, allow_mixed_items; unique `(warehouse_id, location_code)`.  
- CREATE `stock_location_balances` + indexes `(item_code)`, `(location_id)`, `(warehouse_id)`.  
- Backfill: optional open “default” staging location per warehouse for legacy warehouse-level qty.

Idempotent style consistent with existing migrations.

---

## 9. Acceptance criteria (Phase A + B)

- [ ] User can create multiple warehouses and add locations (aisle/shelf/level/number) with auto codes.  
- [ ] Items screen shows locations, qty, batch, expiry, allocation for an item.  
- [ ] Locations screen shows items at that bin with the same fields.  
- [ ] Item can be configured loose/packed and item/bin controlled; home bin for bin-controlled.  
- [ ] First receipt of unknown SKU blocks until item master required fields are saved.  
- [ ] After GRN, putaway queue suggests a location; confirm moves stock to that location and clears incoming qty.  
- [ ] Available/sellable qty excludes hold and not-yet-putaway stock.  
- [ ] Worker can complete receive → putaway without typing free-text location codes when suggestion is accepted.

---

## 10. Explicit non-goals (v1)

- Rebuilding ERPNext Accounting / full GST invoicing inside goWMS.  
- Deep nested warehouse trees beyond practical distributor layouts.  
- Replacing pick/pack/dispatch with a new design before location stock is solid.  
- Multi-tenant SaaS billing/admin (can follow once pilot works).

---

## 11. Open decisions (resolve during Phase A)

1. **Level encoding:** enum `low`/`upper` only vs free numeric level.  
2. **Mixed SKU policy default** for spare-parts bins (recommend: allow mixed for item_controlled, deny for bin_controlled home).  
3. **Whether warehouse-level `bins` table stays** as aggregate cache or is deprecated.  
4. **QI required** for all receipts vs only flagged categories (oil/electrical).

---

## 12. Reference in this monorepo

- ERPNext behavior notes: `/WMS_Features_Guide.md`, `/Order_Fulfillment_Guide.md`  
- Parallel Frappe-oriented spec (do not implement as Frappe in goWMS): `/nirvana_wms/SPEC.md`  
- Current app: `/goWMS/`
