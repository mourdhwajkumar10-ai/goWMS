# Outbound / Sales Order / Order Fulfillment

**Date:** 2026-08-25  
**Status:** Current-state map + optimized target design  
**Related:**  
- `docs/spec/SPEC_03_OUTBOUND.md` (original product intent)  
- `docs/goWMS_Outbound_Analysis.md` (2026-08-11 QA; partially superseded by code below)  
- `docs/implementation/08_FEATURE_SALES_ORDERS.md` … `12_FEATURE_BACKORDERS.md` (status notes often stale — prefer this doc + code)  
- Floor/desk: `docs/superpowers/specs/2026-08-25-floor-desk-shell-views.md`, `2026-08-24-role-aware-desktop-mobile-design.md`  
- Key code: `web/src/pages/{SalesOrders,Pick,Pack,Dispatch,Backorders,DeliveryNotes,Returns,Customers}.tsx`, `api/modules/{salesorder,picking,packing,dispatch,backorder,returns}/`, `api/modules/shared/allocation.go`

---

## 1. Purpose & scope

Document **what goWMS actually does today** for outbound fulfillment (sales order → allocate/reserve → pick → pack → trip dispatch → delivery note / POD → backorders / returns), then propose **practical optimized flows** that build on existing APIs and UI rather than inventing a greenfield WMS.

**In scope**

- Sales orders (create, confirm, priority, create pick)
- FEFO stock allocation / reservation
- Pick lists (single SO, free-form, wave)
- Box packing and stock consume
- Delivery trips, load, DN, POD signatures
- Backorders (v1/v2), returns (high level)
- Desk vs floor (RF) roles and screens

**Out of scope (explicit)**

- Inbound packing-list import (`/packing-list` — supplier ASN/GRN path, not outbound pack)
- Full ERPNext sync / billing invoices as system of record (WMS creates DNs; purchase invoices are inbound)
- Route optimization / carrier EDI (not implemented)

**Legend**

| Marker | Meaning |
|--------|---------|
| **Exists** | Wired in API + usable from UI (or API-only if noted) |
| **Partial** | Exists but incomplete, inconsistent, or desk-only |
| **Recommended** | Target design; not claimed as current |

---

## 2. Outbound entities

### 2.1 Sales order

| Entity | Table / fields (current) | Notes |
|--------|--------------------------|-------|
| Header | `sales_orders` | `name` (SO-YYYY-NNNNN), `customer_name`, ERP-style `status`, WMS `wms_status` (`draft` → `confirmed` → `picking` …), `priority` 1–10 + label/reason, `warehouse_id`, `delivery_date`, `grand_total`, `per_picked` / `per_delivered` / `per_billed` |
| Lines | `sales_order_items` | `item_code`, `qty`, `rate`, `amount`, `picked_qty`, `delivered_qty`, `allocated_qty`, `backordered_qty`, `status` |
| Priority audit | `priority_history` | Overrides + SLA decay |

**Exists:** CRUD + confirm/cancel/priority/import/create-pick under `/sales-orders`.  
**Gap:** Line `picked_qty` / header `per_picked` are **not updated** when floor pick scans complete (no `UPDATE sales_order_items` in pick/pack/dispatch handlers). Create-pick/wave still *read* `qty - picked_qty`, so progress tracking is mostly stale unless set elsewhere.

### 2.2 Allocations (location reserve)

Not a separate “allocation” document — allocations are **pick list lines** bound to `stock_location_balances`:

| On create pick / wave / create-pick-from-SO | Effect |
|--------------------------------------------|--------|
| `ListFEFOCandidates` | `storage` / `pick_face` balances, FEFO by batch expiry |
| `ReserveBalance` | `reserved_qty += take` (available = actual − reserved) |
| Line fields | `location_id`, `location_code`, `balance_id`, `batch_no`, `expiry_date`, `allocated_qty` |
| Shortage | Line `status='shortage'`, `shortage_qty`; may auto-create `backorders_v2` (manual pick create path) |

### 2.3 Pick lists / waves

| Entity | Table | Notes |
|--------|-------|-------|
| Header | `pick_lists` | `name` PL-…, `sales_order_no` (text; wave = CSV of SO names), `customer`, `warehouse_id`, `status` (`draft`/`open`/`partially_delivered`/`completed`; cancel sets `cancelled`), `picking_mode` (`scan` \| `wave`), `stock_consumed` |
| Lines | `pick_list_items` | ordered/allocated/picked/consumed/delivered qty, location + FEFO, statuses `pending` → `in_progress` → `picked` / `shortage` / `cancelled` / delivered variants |
| Scan audit | `pick_scan_logs` | item, bins, qty, location_drift |
| Wave | Same tables | `picking_mode='wave'`; demand aggregated across SO IDs |

### 2.4 Packs (boxes)

| Entity | Table | Notes |
|--------|-------|-------|
| Box | `boxes` | `label`, optional `pick_list_id`, optional free-text `delivery_note`, `loaded`, `stock_consumed`, weight fields |
| Contents | `box_items` | item_code, quantity, batch_no |
| Reversals | `pack_reversals` | qty removed + reason |

**Exists:** Create box → pack items → label HTML/ZPL stub → **load** consumes reserved pick stock.  
**Gap:** Pack does **not** validate qty against pick list picked/allocated lines; any item master code can be packed into a box.

### 2.5 Consignments / dispatch

| Entity | Table | Notes |
|--------|-------|-------|
| Trip | `delivery_trips` | `trip_no` DT-…, vehicle, driver, carrier, `status` draft/scheduled → in_transit → completed |
| Load | `box_load_logs` | box ↔ trip; load also consumes stock if not yet consumed |
| Stops | `delivery_stops` | customer, address, stop_order, visited, DN no |
| POD | `delivery_signatures` | signature_data on stop |
| Delivery note | `delivery_notes` | Created from trip generate-DN / complete; listed read-only under `/delivery-notes` via masterdata |

### 2.6 Invoices

- **Outbound sales invoices:** not a first-class WMS fulfillment step. Billing role sees `/sales-orders` + `/delivery-notes` + purchase invoices.
- **Delivery note** is the operational ship document generated from dispatch.
- Returns may reference `sales_invoice_no` / `delivery_note_no` as free text.

### 2.7 Backorders & returns

| | |
|--|--|
| **Backorders v1** | `backorders` — UNIQUE(`sales_order_no`) |
| **Backorders v2** | `backorders_v2` + `backorder_lines_v2` — multi-SO, auto-from-pick, open-by-item |
| **Returns** | Claims: create → receive → inspect → decide (restock/scrap/rts) |

---

## 3. Current end-to-end process

Happy path as implemented:

```
SO draft → Confirm → Create Pick (FEFO reserve)
       → Pick scans (floor/desk)
       → Create Box(es) linked to pick_list_id → Pack items
       → Pack Load and/or Trip Load  →  reserved stock CONSUMED (actual ↓)
       → Trip start → (optional DN / stops / POD) → Trip complete → DN(s)
```

Shortages may create **backorders_v2** at pick create (or via “BO from shortage”).

### 3.1 Step-by-step (screens + APIs)

| # | Step | Screen / route | Key APIs | Stock |
|---|------|----------------|----------|-------|
| 1 | Create SO | `/sales-orders` (desk) | `POST /sales-orders/` | None |
| 2 | Optional CSV import | same | `POST /sales-orders/import` | None |
| 3 | Set / override priority | same | `POST /sales-orders/:id/priority`; batch `POST /sales-orders/decay-priorities` | None |
| 4 | Confirm | same | `POST /sales-orders/:id/confirm` → `wms_status=confirmed` | None |
| 5a | Create pick from SO | SO detail → **Create Pick** | `POST /sales-orders/:id/create-pick` | FEFO **reserve** |
| 5b | Or free-form pick | `/pick` New | `POST /picking/` | FEFO **reserve**; auto BO v2 on shortage |
| 5c | Or wave | `/pick` Wave UI | `POST /picking/wave` | FEFO **reserve**; sets SOs `wms_status=picking` |
| 6 | Pick on floor | `/pick` RF (`useRfUi`) | `POST /picking/scan` | Reserve held; **no** location move; **no** SO line pick update |
| 7 | Print slip | desk pick detail | `GET /picking/:id/print` (HTML) | — |
| 8 | Cancel pick | desk | `POST /picking/:id/cancel` | **Release** reserved |
| 9 | Pack | `/pack?pick_list_id=` | `POST /packing/`, `POST /packing/:id/item` | Still reserved |
| 10 | Consume (pack path) | Pack **Load** | `POST /packing/:id/load` → `ConsumePickListStock` | **actual −=**, reserved −= |
| 11 | Trip | `/dispatch` | `POST /dispatch/`, `POST /dispatch/trip/:id/load` | Consume if not already |
| 12 | Depart / deliver | same | `…/start`, `…/generate-dn`, `…/signature`, `…/complete` or `…/complete-gated` | Already consumed on load |
| 13 | View DNs | `/delivery-notes` | `GET /masterdata/delivery-notes` | Read-only list |
| 14 | Backorders | `/backorders` | `/backorder/*`, `/backorder/v2/*` | Fulfill is status flip only (no auto re-pick) |
| 15 | Returns | `/returns` | `/returns/*` | Restock can put qty back to a location |

### 3.2 Nav & wiring

Outbound section in `web/src/utils/navCatalog.ts`:

| Path | Label | Floor? |
|------|-------|--------|
| `/pick` | Picking | yes |
| `/pack` | Packing | yes |
| `/dispatch` | Dispatch | yes |
| `/sales-orders` | Sales Order | desk |
| `/delivery-notes` | Delivery Note | desk |
| `/backorders` | Backorders | desk |
| `/returns` | Returns | desk |
| `/customers` | Customer | desk |

Registered in `cmd/server/main.go`: `salesorder`, `picking` + `RegisterWave`, `packing`, `dispatch`, `backorder` + v2, `returns`.

### 3.3 Wave pick (current behavior)

- Aggregates open SO lines (`qty - picked_qty`) by item across selected confirmed SOs.
- One pick list; `sales_order_no` = comma-separated SO names; `customer` = wave label.
- **No** order-level sort/tote separation after pick — batch pick only.
- API response notes “review before enabling in production UI”; UI already exposes wave create on `/pick`.

### 3.4 What packing-list module is *not*

`api/modules/packinglist` + `/packing-list` is **inbound** supplier packing-list import for receiving/GRN. Do not confuse with outbound `/pack` boxes.

---

## 4. Roles (desk vs floor RF)

### 4.1 Shell

- Floor vs desk: `useRfUi()` → floor shell **or** viewport ≤768px.
- Pick / Pack / Dispatch render **ScannerLayout / RfShell** on RF; tables + forms on desk.

### 4.2 Role path defaults (`navCatalog` / `roleAccess`)

| Role | Typical outbound paths |
|------|------------------------|
| `picker` | `/pick` (+ stock scan, cycle count) |
| `packer` | `/pack` |
| `dispatcher` / `driver` | `/dispatch` (+ delivery-notes on some path lists) |
| `billing` | `/sales-orders`, `/delivery-notes`, `/customers` |
| `admin` / `wm` / `supervisor` | Full outbound section (permission-gated) |

Floor tiles emphasize operational pick/pack/dispatch; SO create/confirm stays desk/billing.

### 4.3 Practical split today

| Work | Who | Device |
|------|-----|--------|
| Enter/confirm SO, priority, create pick, wave IDs, cancel & release, print | Desk / WM / billing | Desktop |
| Scan item + bin, confirm qty | Picker | RF `/pick` |
| Create box, scan pack, load | Packer | RF `/pack` |
| Create trip, load boxes, start/complete, POD text | Dispatcher/driver | RF `/dispatch` |

---

## 5. Stock impact

```
available = actual_qty - reserved_qty   (storage / pick_face only)
```

| Event | `reserved_qty` | `actual_qty` | Notes |
|-------|----------------|--------------|-------|
| Pick list / wave / create-pick created | ↑ | unchanged | Soft allocation; FEFO slices |
| Pick scan | unchanged | unchanged | Progress + audit only; stock stays on bin |
| Pack item / reverse | unchanged | unchanged | Box content bookkeeping |
| First of: pack **load** or trip **load** | ↓ (consume + release unused) | ↓ by shipped qty | `ConsumePickListStock`; idempotent via `consumed_qty` / `stock_consumed` |
| Pick cancel (before consume) | ↓ release | unchanged | |
| Pick cancel after consume | blocked | — | |
| Backorder create/fulfill | none by itself | none | Shortage bookkeeping |
| Return restock | — | ↑ at chosen location | Separate path |

**Consume rule (important):** If picker never scanned, consume ships **`allocated_qty`** (auto-pick). If scanned, ships **`picked_qty`** and releases unused reserve.

**UI copy on pick detail:** “reserved until pack/dispatch” — accurate.

---

## 6. Gaps / friction vs a clean optimized flow

| Area | Friction |
|------|----------|
| SO ↔ pick linkage | Free-form pick uses text SO no; create-pick is better but SO `picked_qty`/`per_picked` not updated from scans |
| Double allocate | Creating multiple picks for same SO can re-allocate same open qty if line `picked_qty` never advances |
| Wave | No sort/pack by order; no zone path; wave UI is ID-string, not checkbox queue |
| Pack validation | No check vs pick lines / picked qty; weight warn only |
| Stock timing | No staging/cart location; stock jumps from bin to “gone” at load |
| Short pick | Over-pick blocked; under-pick then consume uses picked qty — OK; incomplete UX for “close short & BO” |
| create-pick-from-SO | Does **not** auto-create backorders (manual `POST /picking/` does) |
| DN list | Read-only; creation is dispatch-side |
| Cancelled pick status | Cancel writes `cancelled`; DB check constraint historically may omit that value (risk) |
| Zone / path pick | Locations ordered by `location_code` on get/print — no aisle graph or zone wave |
| Pick-to-tote | No tote entity as inventory location on outbound |
| Invoicing | No WMS sales invoice step tied to DN |
| Docs drift | Early QA said “no SO module”; **code now has full SO module** |

---

## 7. Recommended optimized flows

All recommendations build on **existing** reserve → pick → box → consume-on-load → trip. Marked **Recommended** where new behavior is needed.

### 7.1 ★ Recommended default — Single-order pick → pack → dispatch

Best fit for goWMS spare-parts volume, current roles, and FEFO model.

```
Confirm SO (desk)
  → Create Pick from SO (FEFO reserve + shortage lines)
  → RF pick by location_code order (scan bin optional, scan item, qty)
  → Close pick (all allocated lines picked or short-closed)
  → RF pack into 1..N boxes linked to pick_list_id (validate vs picked)
  → Pack Load OR Trip Load (consume) — prefer Pack Load when packer finishes station
  → Dispatcher loads boxes to trip → start → DN/POD → complete
  → Shortages → backorders_v2 → later new SO pick or fulfill+re-pick
```

**Why default:** Matches nav roles (picker / packer / dispatcher), keeps one SO identity on the pick list, uses existing APIs, minimizes sort labor.

**Small hardening (Recommended, not all present):**

1. On pick scan / pick complete: update `sales_order_items.picked_qty` and `per_picked`.
2. On create-pick-from-SO: same auto-BO path as `POST /picking/`.
3. Pack `/:id/item`: reject qty above remaining picked−packed for that pick list.
4. Prefer consume at **pack load** so dispatch only moves boxes.

### 7.2 Batch / wave pick by zone — secondary for multi-order days

**Exists (partial):** `POST /picking/wave` aggregates demand + FEFO.

**Recommended enhancements:**

- Desk: select confirmed SOs from priority-sorted queue (not raw ID CSV).
- After allocate: sort lines by warehouse zone / aisle prefix of `location_code`.
- After pick: **sort station** — either pack-per-SO boxes during pack, or pick into order totes (requires tote model — see 7.3).
- Do **not** make wave the default until order identity is preserved through pack (today wave collapses SOs into one list).

Use when: many small orders, same SKU clusters, enough pack labor to sort.

### 7.3 Pick-to-pack / pick-to-tote — optional stretch

**Recommended** only after single-order path is solid:

| Mode | Idea | Dependency |
|------|------|------------|
| Pick-to-pack | Picker packs into ship carton at last zone | Box create at pick start; pack APIs already exist |
| Pick-to-tote | Cart/tote holds stock mid-pick | New location type + move on scan (same class of work as putaway cart) — **not in outbound today** |

Do not block go-live on tote inventory; single-order + optional wave is enough.

### 7.4 Exception paths

| Exception | Current | Recommended |
|-----------|---------|-------------|
| Short pick | Can leave lines unpicked; consume uses picked; shortage lines at allocate | Explicit “Close short” → BO v2 + release unused reserve + update SO |
| Cancel before ship | Cancel & release | Keep; block if any box stock_consumed |
| Partial ship | Partial pick + consume picked; leftover need new pick | Formal partial: ship packed boxes; remaining SO lines stay open |
| Location drift | Logged, pick still allowed | Soft warn RF; hard block optional per warehouse setting (**Recommended** flag) |
| Overpack / wrong SKU | Allowed today | Validate against pick (**Recommended**) |
| Trip without all POD | `complete` vs `complete-gated` | Default gated for customer delivery; simple complete for carrier handoff |

### 7.5 Ranking for goWMS

| Rank | Flow | Role |
|------|------|------|
| **1 — Recommended default** | Single-order pick → pack → dispatch | Primary SOP |
| **2** | Wave/batch by zone + sort/pack | Peak / multi-order same day |
| **3** | Pick-to-pack | Small warehouse, same person pick+pack |
| **4** | Pick-to-tote | Later; needs inventory cart model |

---

## 8. Comparison table: Current vs Optimized

| Topic | Current | Optimized (recommended) |
|-------|---------|-------------------------|
| Order entry | Full SO module + CSV + priority | Keep; tighten customer master FK later |
| Allocation timing | On pick create (FEFO reserve) | Keep (good); optionally soft-allocate on confirm later |
| Default pick unit | One pick list / SO (or free-form / wave) | **Default = create-pick-from-SO** |
| Wave | Aggregated SKU pick, weak order identity | Zone-sorted wave + sort-to-order at pack |
| Floor pick | Scan item/bin; reserve held on bin | Same; add SO progress sync |
| Pack | Box + optional pick_list_id; no qty gate | Gate pack to picked qty; multi-box OK |
| Stock leave warehouse | Pack load **or** trip load | Prefer pack load; trip load only if skipped |
| DN | From trip generate/complete; list read-only | Keep; optional print from DN row |
| Backorders | v2 + auto on free-form pick create | Auto on all allocate paths; fulfill → queue re-pick |
| SO progress fields | Stale | Update on pick/pack/ship |
| Cart/tote | None outbound | Optional phase 2 |
| Roles | picker/packer/dispatcher/billing | Keep; SOP = desk confirm+create pick, floor execute |

---

## 9. Key file references

| Area | Path |
|------|------|
| Nav / roles | `web/src/utils/navCatalog.ts`, `web/src/utils/roleAccess.ts`, `web/src/hooks/useRfUi.ts` |
| Routes | `web/src/App.tsx` |
| UI | `web/src/pages/SalesOrders.tsx`, `Pick.tsx`, `Pack.tsx`, `Dispatch.tsx`, `Backorders.tsx`, `DeliveryNotes.tsx`, `Returns.tsx`, `Customers.tsx` |
| API client | `web/src/services/api.ts` (so*, pick*, pack*, dispatch*, backorder*) |
| SO | `api/modules/salesorder/handler.go` |
| Pick / wave | `api/modules/picking/handler.go`, `wave_handler.go` |
| Allocation | `api/modules/shared/allocation.go` |
| Pack | `api/modules/packing/handler.go` |
| Dispatch | `api/modules/dispatch/handler.go` |
| Backorder | `api/modules/backorder/handler.go`, `handler_v2.go` |
| Returns | `api/modules/returns/` |
| Wire-up | `cmd/server/main.go` |
| Migrations | `002_operations.sql` (core tables), `007_pick_allocation.sql`, `008_sales_orders_priority_indexes.sql`, `009`/`010` backorders v2 |
| Prior specs | `docs/spec/SPEC_03_OUTBOUND.md`, `docs/goWMS_Outbound_Analysis.md`, `docs/implementation/08`–`12` |

---

## 10. Open questions / next implementation priorities

**Open questions**

1. Should stock consume be **only** at pack load (recommended) or remain dual-path pack/dispatch for carrier-direct ships?
2. Is wave needed in production before order-level sort exists, or keep it supervisor-only?
3. Customer master: free-text `customer_name` on SO vs mandatory `/customers` FK?
4. Should location drift be warn-only or hard-fail per warehouse?

**Priorities (brief, code-aligned)**

1. **P0 — Correctness:** Sync SO line/header pick/ship progress from pick consume/dispatch; prevent double create-pick on same open qty.  
2. **P0 — Pack gate:** Validate pack qty against pick list remaining.  
3. **P1 — SOP default:** Desk “Create Pick” + RF pick + pack load consume; document as standard.  
4. **P1 — Backorder parity:** Auto-BO on create-pick-from-SO; fulfill → “create pick for BO lines.”  
5. **P2 — Wave UX:** Priority SO multi-select + zone sort; defer tote model.  
6. **P2 — DN print / POD canvas polish** (APIs largely exist).  
7. **P3 — Pick-to-tote / cart locations** (align with putaway cart design if pursued).

---

## Bottom line

**Current:** goWMS has a real outbound pipeline — sales orders with priority, FEFO reserve on pick/wave, RF pick/pack/dispatch, consume-on-load, trips/DNs/POD hooks, and backorders v2. Stock stays on the bin until pack or trip load.

**Optimized default:** Keep that pipeline; make **single-order create-pick → RF pick → validated pack → consume at pack load → trip** the standard SOP; treat wave as an optional multi-order accelerator only after sort/pack identity is fixed; defer tote inventory until putaway/outbound share a cart model.
