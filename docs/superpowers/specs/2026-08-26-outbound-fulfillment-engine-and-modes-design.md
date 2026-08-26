# Outbound Fulfillment — Engine and Three Modes

**Date:** 2026-08-26
**Status:** Proposed (awaiting user review)

**Supersedes:** `docs/superpowers/specs/2026-08-26-outbound-three-fulfillment-modes-design.md`
**Prerequisite:** `docs/superpowers/specs/2026-08-26-outbound-p0-correctness-fixes-design.md` (B1–B6)
**Background:** `docs/superpowers/specs/2026-08-25-outbound-sales-order-fulfillment.md`, `docs/spec/SPEC_03_OUTBOUND.md`

---

## 1. Purpose

Define three first-class outbound fulfillment modes for goWMS, built on one shared stock engine:

| Mode | Name | Trigger | Operators |
|------|------|---------|-----------|
| **F1** | Quick counter sale | Walk-up customer at the warehouse counter | Counter clerk (one person, one session) |
| **F2** | Single-order fulfillment | One confirmed sales order | Picker → packer → dispatcher |
| **F3** | Wave fulfillment | Many orders released together | Picker → consolidator → dispatcher |

---

## 2. Operating constraints

These shaped every decision below and should be re-read before changing any of them.

- **Business:** spare-parts distributor, ~₹20 Cr annual turnover. High SKU count, small units, frequent walk-in counter trade, frequent wrong-part returns.
- **Operators:** approximately 8th-standard education. Low reading load, one primary action per screen, scan-driven rather than type-driven, errors prevented rather than warned about.
- **Complexity budget:** deliberately tight. Anything that does not directly serve order accuracy or throughput is cut (see §14).
- **Legal:** at this turnover, counter sales to trade customers require a GST-compliant tax invoice with GSTIN, HSN and tax breakup.

### Design principles

1. **One stock engine.** Exactly one code path moves stock. Three flows, one implementation.
2. **Stock is always at a scannable location.** Never in an invisible in-between state.
3. **Prevent, don't warn.** A dismissible warning will be dismissed.
4. **Reuse before build.** FEFO allocation, boxes, trips, delivery notes are shared.
5. **Minimise concepts per operator.** Counter clerk learns one screen; picker learns one screen that behaves identically for single orders and waves; packer learns two.

---

## 3. Verified current state

Every row below was confirmed against code, not inferred from documentation.

| Fact | Evidence |
|------|----------|
| Location types are `storage, pick_face, staging, hold, damaged, incoming, quarantine, returns` — no packing location | `migrations/013_location_putaway_priority.sql:24–28` |
| FEFO allocation filters to `location_type IN ('storage','pick_face')` | `api/modules/shared/allocation.go:34–50` |
| Stock is reserved at pick creation and consumed on first box load; nothing moves in between | `api/modules/shared/allocation.go:72,138,202` |
| If a picker never scans, the full allocated quantity is consumed on load anyway | `api/modules/shared/allocation.go:236–271` |
| Location mismatch is logged as `location_drift` and the pick still succeeds | `api/modules/picking/handler.go:408–418` |
| Item codes are accepted as text; no barcode lookup exists | `api/modules/picking/handler.go` |
| `packItem` validates only that the SKU exists in the item master — never against the pick list | `api/modules/packing/handler.go:148` |
| Wave picking exists but collapses order identity into a CSV of SO names | `api/modules/picking/wave_handler.go` |
| No sales invoicing anywhere; `billing` handles purchase invoices only | `api/modules/billing/handler.go` |
| `sales_invoices` is a thin mirror table; `sales_invoice_items` is fully ERPNext-shaped | `migrations/002_operations.sql:472–480`, `migrations/003_extras.sql:1180–1220` |
| `sales_order_items.picked_qty` and `sales_orders.per_picked` are never written | zero `UPDATE sales_order_items` in `api/` |
| `stock_ledger_entries.warehouse` is a warehouse name with no location column | `migrations/003_extras.sql:1355–1383` |
| Outbound posts no ledger entries at all; only GRN does | `api/modules/grn/handler.go` |
| `warehouse_locations` already has `zone`, `aisle`, `rack`, `bin`, `shelf`, `level` | `migrations/003_extras.sql:1444–1455`, `migrations/004_locations_inventory.sql:132–149` |
| `items` already has `mrp`, `hsn_no`, `gst_percentage`, `max_rate_discount` | `migrations/017_item_commercial_fields.sql` |
| `sales_orders.order_type` exists, defaulting to `'Sales'` | `migrations/002_operations.sql:492` |
| `boxes` has no `warehouse_id`; label is free text with no uniqueness | `migrations/002_operations.sql:150–158` |
| **B7 (new):** the auto-complete query in `logPickScan` passes no argument for its `$1`, the error is discarded, so `remaining` stays 0 and **every pick list is marked `completed` on the first item scan** | `api/modules/picking/handler.go:474–481` |
| Zero test coverage across all outbound modules | no `*_test.go` under `salesorder`, `picking`, `packing`, `dispatch` |
| No database test harness exists anywhere; all 19 test files are pure unit tests | `api/**/*_test.go` |
| `offlineQueue.flushScans` exists but is never called | `web/src/utils/offlineQueue.ts` |

**Consequence:** F2 is roughly 80% built, F3 roughly 20%, F1 does not exist, and sales invoicing does not exist.

---

## 4. Decisions and rationale

Decisions marked **[reversed]** overrule the superseded draft.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Counter sale silently creates a sales order (`order_type='Counter'`), a pick list, and a GST sales invoice. No `quick_sales` tables. **[reversed]** | Returns already key off `sales_invoice_no`, and wrong-part returns are constant in spare parts — a real invoice makes returns work with no extra code. One sales table keeps reporting to a single query. Most importantly, dedicated tables would need their own reserve-and-consume path, which is exactly the triplication that corrupts inventory. The superseded draft's objection was click-count, but the operator screen is identical either way; only the server-side writes differ. |
| D2 | Counter sale issues a proper GST invoice, not an operational receipt. **[reversed]** | At ~₹20 Cr, trade customers need a tax invoice with GSTIN and HSN to claim input credit. The item master already carries `hsn_no` and `gst_percentage`, so the cost is low. |
| D3 | Record payment mode as a single tap (Cash / UPI / Card / Credit). No amounts, no receivables. | Gives an end-of-day tally by mode at the cost of one button. Full AR would conflict with the accounting package. |
| D4 | Packing location is a real location (`location_type='packing'`), non-allocatable. | Stock stays physically accounted for between pick and ship, makes the picker→packer handoff real rather than a status flag, and gives wave consolidation somewhere to live. |
| D5 | Stock moves from the source bin to the packing location on **each confirmed scan**, not at pick-list completion. **[reversed]** | A picker who does 8 of 11 lines and leaves produces a correct, recoverable state. A wave worked by several people has no single completion moment. Invisible in the UI either way. |
| D6 | Wrong location and wrong item are hard-blocked, with a supervisor override that records a reason. **[reversed]** | Spare parts are the worst case for wrong-item picks: near-identical castings, different fitment. A dismissible warning will be dismissed. The override needs a supervisor PIN, not a tap, or it becomes the default gesture. |
| D7 | Over-pick is hard-blocked with **no** override. | An override here silently corrupts the balance. The correct fix is to correct the allocation. |
| D8 | One shared `fulfillment` engine owns every stock movement and status transition. **[reversed]** | Reduces net complexity: one place to reason about and fix stock, instead of three. |
| D9 | Invoicing lives outside the engine in its own module. | It touches no stock. Keeps the engine contract purely "where is the stock, what state is the line in". |
| D10 | Wave picking is bulk — no order identity during the pick — followed by a separate put-to-order consolidation step. | Shortest walk path, one FEFO pass. Matches the physical reality of a wave. |
| D11 | Consolidation is **item-led**: the packer scans an item from the bulk pool and the system says which order and box it belongs to. | One pass through the pool. Order-led means re-walking the pool per order. |
| D12 | Wave shortages are attributed by **order priority**, not proportionally. | A dealer order shipping complete is worth more than spreading the shortfall across every order. |
| D13 | Box labels are unique per warehouse, enforced by constraint. Scanning an existing open label resumes that box. | Assumes consumable sequential label stock. If totes are relabelled and reused, narrow the constraint to open boxes only. |
| D14 | Box capacity warns but never blocks; the packer decides when to open a new box. | Cartonization is not worth building here. |
| D15 | Counter sale creates no backorder. | The customer is standing there. The clerk reduces the quantity or drops the line. F2 and F3 keep the existing backorder path. |
| D16 | Counter sale has no separate pack-scan step; the box is created implicitly. | The item was scanned at the bin seconds earlier. Re-scanning costs counter throughput and buys nothing. This is the one deliberate divergence between the modes, and the reason a single unified state machine was rejected. |
| D17 | Delivery order: engine → F2 → F1 → F3. | F2 is the only mode that exists end-to-end today, so new behaviour can be diffed against known-good behaviour. F3 is most complex and benefits from an engine two modes have hardened. |

### Rejected alternatives

- **Dedicated `quick_sales` / `counter_invoices` tables** (the superseded draft's §5.3) — see D1.
- **A single unified fulfillment state machine** with a counter/single/wave mode flag — the three modes differ in ways that would make it mostly conditionals: F3 has a consolidation phase the others lack, F1 has an invoice phase and no pack-scan, and F1 is one operator in one session while F2 and F3 hand off between roles.
- **Extending existing handlers in place** with no service layer — fastest to first screen, but triplicates the stock-movement logic at exactly the moment its semantics change.
- **Modelling the picker's cart as a third location** — truthful, since stock between bin and packing bench is really in a cart, but outside the complexity budget.

---

## 5. Shared foundation

### 5.1 The stage model

Every pick line moves through four quantities:

```
allocated  →  picked  →  packed  →  shipped
```

- **allocated** — FEFO reserved. `reserved_qty` rises; physical stock untouched.
- **picked** — scanned at the source bin. Stock has moved to the packing location.
- **packed** — assigned to a box. **No stock movement**: the box sits in the packing location, so `box_items` is an assignment record and `packed` is a sub-state of `picked`. A mis-pack is therefore a cheap correction, not a stock reversal.
- **shipped** — left the warehouse. Ledger entry posts here.

There is deliberately **no separate `staged` quantity.** Because stock moves on every confirmed scan (D5), staged would always equal picked. Dropping it removes a column and a class of drift bug.

### 5.2 Ledger granularity

`stock_ledger_entries.warehouse` is a warehouse name with no location column, so moving stock between two locations inside one warehouse is invisible to the ledger by construction. `stock_location_balances` carries the bin-level truth. **Outbound therefore posts exactly one ledger entry, at ship.**

### 5.3 Migrations

Migration `041` is claimed by the P0 fix set (pick-list `cancelled` status). This design starts at `042`. All migrations follow the repo's idempotent `IF NOT EXISTS` / `DO $$` convention.

| # | Change |
|---|--------|
| 042 | Add `'packing'` to the `warehouse_locations_location_type_check` constraint. Seed one `PACK-01` location per warehouse with `allow_mixed_items = true`. |
| 043 | `pick_lists`: add `fulfillment_type` (`'counter'`/`'single'`/`'wave'`, backfilled from `picking_mode`) and `packing_location_id`. |
| 044 | `pick_list_items`: add `packed_qty numeric(18,6) NOT NULL DEFAULT 0`. |
| 045 | Create `wave_order_lines`. |
| 046 | `boxes`: add `warehouse_id`, `sales_order_id`, `packing_location_id`; unique index on `(warehouse_id, label)`. |
| 047 | `sales_invoices`: add GST header fields, `payment_mode`, `against_sales_order`, unique `name`; counter-sale and invoice number sequences. |
| 048 | `pick_scan_logs`: add `rejected`, `override_by`, `override_reason`. |
| 049 | Permission catalog: `counter_sale.access`, `picking.override`. |

**042 — packing location**

```sql
ALTER TABLE warehouse_locations DROP CONSTRAINT IF EXISTS warehouse_locations_location_type_check;
ALTER TABLE warehouse_locations ADD CONSTRAINT warehouse_locations_location_type_check
CHECK (location_type IS NULL OR location_type IN (
  'storage','pick_face','staging','hold','damaged','incoming','quarantine','returns','packing'));
```

Packing locations hold `actual_qty` and are never reserved. `ListFEFOCandidates` already restricts to `storage`/`pick_face`, so they are excluded from allocation with no code change. They remain visible to cycle counts and stock-scan lookups.

**045 — wave order lines**

This is the table that fixes wave identity collapse. Today a wave stores a CSV of SO names in `pick_lists.sales_order_no`, so per-order quantities are unrecoverable.

```sql
CREATE TABLE IF NOT EXISTS wave_order_lines (
  id                  serial PRIMARY KEY,
  pick_list_id        integer NOT NULL REFERENCES pick_lists(id),
  sales_order_id      integer NOT NULL REFERENCES sales_orders(id),
  sales_order_item_id integer REFERENCES sales_order_items(id),
  item_code           varchar(100) NOT NULL,
  required_qty        numeric(18,6) NOT NULL,
  consolidated_qty    numeric(18,6) NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (pick_list_id, sales_order_id, item_code)
);
```

`required_qty` is the order's **allocated share of the wave**, not its original ordered quantity. When stock is short, the shortfall is attributed by priority (D12) and becomes a backorder; it never appears in this table. This keeps the §6.2 invariant exact and means the consolidation screen can never ask a packer to place stock that was not picked.

Box assignment is not stored here — it is derivable from `box_items` joined to `boxes.sales_order_id`, which correctly supports one order's line spanning several boxes.

---

## 6. The fulfillment engine

New package `api/modules/fulfillment/`. Nothing outside it writes `stock_location_balances`, pick-line progress, or sales-order progress columns. The three modes are route modules that call into it. Invoicing sits outside (D9).

### 6.1 Primitives

Each takes a `pgx.Tx`; the existing `shared.DBTX` interface already supports both a pool and a transaction.

| Primitive | Responsibility |
|-----------|----------------|
| `Allocate` | Wraps today's FEFO search and reservation. Returns allocated lines and shortages. |
| `ConfirmPick` | Verifies location and item, moves stock source → packing location, advances `picked_qty`, writes the scan log, syncs sales-order progress. |
| `AssignToBox` | Validates against picked quantity, records the box assignment, advances `packed_qty`. No stock movement. |
| `Consolidate` | Wave put-to-order. Draws down a `wave_order_lines` row and calls `AssignToBox`. |
| `ShipBox` | Removes stock from the packing location, posts the ledger entry, advances `delivered_qty` and `per_delivered`. |
| `ReleaseReservations` | Existing cancel path, unchanged. |

### 6.2 Invariants

Asserted directly by the engine test suite after every primitive:

```
allocated ≥ picked ≥ packed ≥ shipped
packing_location_balance(item, batch) = Σ picked − Σ shipped
Σ box_items(line)                     = packed_qty(line)
Σ wave_order_lines.required_qty(item) = Σ pick_list_items.allocated_qty(item)
```

### 6.3 Errors and override

`ConfirmPick` returns typed errors so all three UIs render consistent messages:

| Error | HTTP | Override |
|-------|------|----------|
| `ErrWrongLocation` | 409 | Supervisor, with reason |
| `ErrWrongItem` | 409 | Supervisor, with reason |
| `ErrOverPick` | 409 | None (D7) |
| `ErrLineNotPickable` | 409 | None |

An override still records `location_drift`, plus `override_by` and `override_reason`. **Rejected scans are logged as well as successful ones** — without that, pick-accuracy reporting only counts the picks that worked.

### 6.4 Concurrency

Every primitive locks affected `stock_location_balances` rows with `SELECT … FOR UPDATE` ordered by `id`, since a wave has several pickers hitting overlapping bins. Consistent lock ordering avoids deadlock.

### 6.5 Sales-order progress

`ConfirmPick` writes `sales_order_items.picked_qty` and recomputes `sales_orders.per_picked`; `ShipBox` does the same for `delivered_qty` and `per_delivered`.

This is P0 fix B1's logic **relocated** into the engine. B1 still ships in Phase 0 as a bridge fix to the existing scan handler, because today's system is wrong until it lands and B2's net-open demand arithmetic depends on it. When Phase 1 replaces that handler, the engine absorbs the responsibility and the bridge is deleted. The recompute SQL is written once in Phase 0 and moved, not written twice.

### 6.6 Legacy compatibility

Pick lists created before cutover have `fulfillment_type IS NULL` and no packing location. The engine routes those through the existing consume-on-load path. No backfill, nothing in flight breaks.

---

## 7. F1 — Quick counter sale

**Shape:** one operator, one screen, one continuous session, three visible steps.

### 7.1 Flow

```
/counter-sale
 [1] Cart
     Customer defaults to the standing "Walk-in" record; searchable for trade customers.
     Add items by type-ahead (itemSuggest) or barcode; qty per line.
     Live price from items.mrp, GST% and running total shown.
     Shortages surface HERE, before any walking — clerk reduces qty or drops the line.
 [2] "Find stock"
     Creates sales_order (order_type='Counter', name CS-YYYY-NNNNN)
     Creates pick_list (fulfillment_type='counter')
     Allocate → returns the walk list grouped by location, sorted by location code
 [3] Guided pick
     "Location 1 of N — go to C-A01-02"  → scan location
     "SCAN ITEM X — 3 needed"            → scan item ×3 (repeat scan increments; keypad for bulk)
     Each scan = ConfirmPick → stock moves to the packing location
     Wrong scan blocked; supervisor PIN override records a reason
 [4] Finish (one call)
     Create box → assign everything picked → ShipBox
     Issue GST invoice → tap payment mode → print thermal receipt
```

### 7.2 Invoicing

Rate from `items.mrp`, discount capped at `items.max_rate_discount`, tax from `items.gst_percentage`, `hsn_no` per line. Header carries customer GSTIN and place of supply. Payment mode is a single tap recorded on the invoice with no amount and no receivable (D3).

### 7.3 API — new module `api/modules/countersale/`

| Endpoint | Purpose |
|----------|---------|
| `POST /api/counter-sale/` | Create session: SO + pick list + allocation; returns walk list, shortages, pricing |
| `GET /api/counter-sale/:id` | Session state |
| `POST /api/counter-sale/:id/scan` | `ConfirmPick` |
| `POST /api/counter-sale/:id/complete` | Box, ship, invoice, receipt |
| `POST /api/counter-sale/:id/cancel` | Release reservations |

### 7.4 Edge cases

Abandoned sessions are auto-cancelled after an idle threshold so reserved stock is not stranded. Price override requires a supervisor permission. Returns use the existing returns flow against the sales invoice number. The sales-order desk list filters out `order_type='Counter'` by default so counter traffic does not bury real orders.

---

## 8. F2 — Single-order fulfillment

**Shape:** three jobs, two handoffs, matching the existing `picker` / `packer` / `dispatcher` role homes.

### 8.1 Sequence

```
Desk: Sales Order → "Create pick list"  ──redirect──▶  RF: pick job
RF pick job (one line at a time, "line 4 of 11"):
     prompt location → scan location → prompt item + qty → scan item ×q → auto-advance
     each scan = ConfirmPick → stock moves to the packing location
Last line picked → job appears in the packer's queue (stock is physically at the bench)
RF pack job:
     scan box label (unique per warehouse; rescanning an open label resumes it)
     scan each item into the box = AssignToBox, validated against picked qty
     running weight vs boxes.max_weight → warn only; packer taps "+ Box" when they choose
Desk/RF dispatch:
     create trip → load boxes = ShipBox → start → POD → complete → delivery note
```

### 8.2 Changes from today

| Step | Today | Change |
|------|-------|--------|
| Create pick | `POST /sales-orders/:id/create-pick` | Keep; add P0 B2 guard; assign `packing_location_id`; set `fulfillment_type='single'` |
| Redirect | Manual navigation | Response returns `pick_list_id`; UI deep-links to the pick job |
| Pick screen | Form with item, bin and qty all editable at once | Prompt-driven, one line at a time, scan-count |
| Pick verification | Drift warned, pick succeeds | Hard block with supervisor override (D6) |
| Pick completion | Status flag only | Stock physically in the packing location |
| Pack | Accepts any SKU and quantity | Validated against picked qty; box label unique |
| Ship | Consume from source-bin reserves | `ShipBox` consumes from the packing location |

Shortages create a backorder through the existing `backorder/v2/auto-from-pick` path — unlike F1, no customer is waiting.

---

## 9. F3 — Wave fulfillment

### 9.1 Wave creation

Replaces the current CSV-of-SO-IDs text box with a desk queue of confirmed orders filterable by priority, delivery date and customer, with multi-select and a size estimate before creation.

On create: aggregate demand per SKU across the selected orders, run **one** `Allocate` over the aggregate, and write `wave_order_lines` recording each order's required quantity per SKU. Shortfalls are attributed by order priority (D12); each order's remainder becomes a backorder.

### 9.2 Bulk pick

The picker uses the **same screen as F2** — this is the point of the shared `useScanJob` loop. Quantities are wave totals and no customer or order is shown. Lines are sorted either by location code (walk order) or by item code, chosen at wave creation. Stock lands in the packing location as one undifferentiated pool.

Zone-parallel picking is explicitly out of scope (§14).

### 9.3 Consolidation — item-led put-to-order

New RF screen `/consolidate`:

```
Packer scans an item from the bulk pool
  → "ITEM X — put 4 in BOX B-101 (Acme, SO-2026-0031)"
     resolved from wave_order_lines where required_qty > consolidated_qty,
     ordered by order priority
  → scan the box label to confirm placement
  → Consolidate() draws down the wave_order_lines row and calls AssignToBox
Box full → packer taps "+ Box"; a sibling box opens for the same order
All placed → per-order completeness board turns green → boxes staged for dispatch
```

### 9.4 Reconciliation

When the wave closes, picked minus consolidated at the packing location must be zero. Anything left over is a real exception — an over-pick, a miscount, or a skipped order — and gets an explicit reconcile screen rather than being silently absorbed. Unreconciled leftovers are the failure mode that makes wave picking distrusted, so they are made loud.

### 9.5 API

| Endpoint | Purpose |
|----------|---------|
| `POST /api/picking/wave` (v2 body) | `{sales_order_ids[], sort:'location'\|'item', packing_location_id}`; writes `wave_order_lines` |
| `GET /api/picking/:id/lines?sort=` | Ordered walk sequence |
| `POST /api/consolidate/scan-item` | Item scanned at the station → next placement instruction |
| `POST /api/consolidate/place` | `{box_id, item_code, qty}` → validate and record |
| `GET /api/consolidate/:waveId/status` | Per-order completeness board |
| `POST /api/consolidate/:waveId/reconcile` | Close out leftovers |

---

## 10. Stock lifecycle across modes

| Event | F1 counter | F2 single | F3 wave |
|-------|-----------|-----------|---------|
| Session / pick created | reserve at bins | reserve at bins | reserve at bins, per-order shares recorded |
| Each confirmed scan | bin → packing location | bin → packing location | bin → packing location (bulk pool) |
| Box assignment | implicit, automatic | scan each item into box | item-led put-to-order |
| Shipped | immediately at finish | trip load | trip load, per order |
| Ledger entry | at finish | at trip load | at trip load |
| Cancel before ship | release reserve; restock from packing location | same | same, plus wave reconcile |

Physical rule throughout: **actual stock is always at exactly one scannable location — a bin or a packing location — never invisible.**

---

## 11. Frontend architecture

| Surface | Route | Shell | Status |
|---------|-------|-------|--------|
| Counter sale | `/counter-sale` | Desk-first, tablet-capable | New |
| Pick job | RF branch of `/pick` | RF | Rewritten |
| Pack job | RF branch of `/pack` | RF | Rewritten |
| Wave management | `/wave` | Desk only | New |
| Consolidation | `/consolidate` | RF | New |

Desk branches of `/pick` and `/pack` remain management views (list, search, print, cancel). The existing `useRfUi()` split and `?rf=1` escape hatch are unchanged.

**Shared scan loop.** Pick job, pack job, consolidation and F1's pick step are the same interaction: show a prompt, wait for a scan, verify, show a verdict, advance. A `useScanJob` hook plus a `ScanPrompt` component, built on the existing `components/scan/` kit that `ReceivingWizard` already uses, implements it once. Each job supplies only its step sequence and verify call. This is the frontend counterpart to the engine.

**Roles and gating.** Two new permissions: `counter_sale.access` (admin, warehouse manager, supervisor, billing) and `picking.override` (supervisor and above). No new role is created — inventing a role nobody occupies is how role tables rot; if a dedicated counter operator emerges, that is a small follow-up migration.

In `navCatalog.ts`: counter sale and wave under the Outbound section; `/consolidate` added to `HANDHELD_BY_ROLE.packer`; the picker allowlist unchanged. Route guarding uses the existing `canOpenPermissionedPath`.

**Data fetching** stays plain `fetch` through `api.ts`. React Query is not introduced. The wave and consolidation screens poll lightly, since several people work one wave concurrently.

---

## 12. Exceptions

| Situation | Behaviour |
|-----------|-----------|
| Wrong location scanned | Blocked; supervisor PIN override with reason |
| Wrong item scanned | Blocked; supervisor PIN override with reason |
| Over-pick | Blocked, no override; correct the allocation instead |
| Stock not found at the bin | First-class "can't find it" action → line goes short → backorder (F2/F3) or cart adjustment (F1) |
| Damaged stock found | Move to a `damaged` location (type already exists) |
| Item not picked but scanned at pack | Rejected |
| Box over capacity | Warn only |
| Wave leftovers | Explicit reconcile step |
| Abandoned counter session | Auto-cancelled after idle threshold; reservations released |

---

## 13. Testing

Outbound currently has **zero tests**, so this establishes coverage rather than maintaining it. Effort concentrates on the engine, since all three modes inherit its correctness.

**There is no database test harness in this repo.** All 19 existing `*_test.go` files are pure unit tests over pure functions — including `putaway/velocity_integration_test.go`, which despite its name only asserts string mapping. Stock invariants cannot be verified without a real database, so building the harness is the first task of Phase 1, not an assumed capability.

The harness takes the lightest form that fits this codebase: a `GOWMS_TEST_DSN` environment variable pointing at the compose Postgres, `t.Skip` when it is unset so `go test ./...` still passes on a bare checkout, and each test wrapped in a transaction that is rolled back on completion. No new dependencies, no Docker requirement in the default path.

- **Engine** — integration tests against real Postgres using that harness. Assert the §6.2 invariants after every primitive. Two cases matter most: concurrent picks against one balance must not oversell, and cancel/restock must round-trip exactly.
- **Handlers** — Fiber `httptest` per endpoint: happy path, boundary (±ε qty), conflict, and repeat request.
- **RBAC** — extend the `api/modules/rbac/route_enforcement_test.go` table with the two new permissions.
- **Attribution** — property test that `Σ wave_order_lines.required_qty` equals the wave's total allocated quantity per SKU, and that every shortfall unit appears in exactly one backorder.
- **Frontend** — Vitest and Testing Library, mocking `api` and `CameraScanner` as `PutawayWizard.test.tsx` does. Test the `useScanJob` loop thoroughly, plus one happy path per screen.

---

## 14. Explicitly out of scope

Cut to stay inside the complexity budget (§2). Each is a deliberate omission, not an oversight.

| Cut | Reason |
|-----|--------|
| Zone-parallel wave picking (`assigned_to` and `zone` on pick lines) | With a handful of pickers, a wave sorted by location or item and worked by one picker is enough. Revisit if wave size grows. |
| Offline scan replay | `offlineQueue.flushScans` is already inert. Wiring it needs idempotency plumbing that is not yet earned. |
| Auto-flagging a bin for cycle count on "can't find it" | Stays a plain shortage reason. |
| Cartonization / box-type master | Capacity warns; the packer decides. |
| Payment amounts, tender detail, receivables | One-tap mode only (D3). |
| Modelling the picker's cart as a location | Truthful but outside the budget. |
| A dedicated counter-operator role | Permission only until a real user needs it. |

---

## 15. Rollout

Migrations are idempotent and run through the existing `migrate` compose service. **Every warehouse needs a seeded packing location before anything works** — migration 042 handles this.

The material risk is the stock-semantics change: consume-at-load becomes move-at-pick plus consume-at-ship. Mitigations: legacy pick lists keep the old path (§6.6), and new behaviour sits behind an environment flag in the style of the existing `GOWMS_RBAC`, so it can be enabled per deployment.

| Phase | Scope | Rationale |
|-------|-------|-----------|
| **0** | P0 fixes B1–B6 (prerequisite doc) plus **B7**, discovered while planning | All three modes read `picked_qty` and depend on honest allocation state. B7 marks every pick list complete on the first scan and is the most severe of the set. |
| **1** | Migrations 042–049 + the engine, no user-visible change | Everything else sits on it |
| **2** | F2 single-order | The only mode that exists end-to-end today, so new behaviour can be diffed against known-good behaviour |
| **3** | F1 counter sale + sales invoicing | High business value, no coupling to wave complexity, engine already proven |
| **4** | F3 wave + consolidation | Largest surface; safest once two modes have hardened the engine. Supervisor-only until per-order identity is proven end-to-end. |

Each phase ships independently usable software.

---

## 16. Next step

On approval, invoke the **writing-plans** skill to produce phased implementation plans at `docs/superpowers/plans/2026-08-26-outbound-phase-{1,2,3,4}-*.md`, starting with Phase 1.
