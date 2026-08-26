# Outbound Fulfillment — Three Modes Design

> ## ⚠️ SUPERSEDED — do not implement from this document
>
> Replaced by **`2026-08-26-outbound-fulfillment-engine-and-modes-design.md`**, which resolves the
> five open questions below and reverses six decisions after a design review against the real
> operating constraints (spare-parts distributor, ~₹20 Cr turnover, 8th-standard operators).
>
> Reversed here: dedicated `quick_sales`/`counter_invoices` tables (§5.3) in favour of a silent
> sales order plus a real GST invoice; the operational-receipt invoicing model (§5.2) in favour of a
> GST-compliant tax invoice; drift-warn scanning in favour of hard-block with supervisor override;
> move-to-packing at pick-list completion (§4.2) in favour of moving on each confirmed scan;
> per-mode modules in favour of one shared fulfillment engine; and `wave_line_orders` (§7.5) in
> favour of `wave_order_lines`, which also tracks consolidation progress.
>
> Retained and carried forward: the `packing` location type, item-led sortation, multi-box per
> order, wave order-identity attribution, and the broad phasing order.
>
> Kept for the record of what was considered and why it was rejected.

**Date:** 2026-08-26
**Status:** Superseded (2026-08-26)
**Related:**
- `docs/superpowers/specs/2026-08-26-outbound-p0-correctness-fixes-design.md` (B1–B6 fixes; **prerequisite**)
- `docs/superpowers/specs/2026-08-25-outbound-sales-order-fulfillment.md` (current-state map)
- `docs/spec/SPEC_03_OUTBOUND.md` (original product intent)

---

## 1. Purpose

Define **three first-class outbound fulfillment modes** for goWMS, matching how work actually arrives
at a spare-parts warehouse counter and floor:

| Mode | Name | Trigger | Who |
|------|------|---------|-----|
| **M1** | Quick Order Fulfillment | Walk-up counter sale at the warehouse | Counter clerk |
| **M2** | Single Order Fulfillment | One confirmed sales order | Picker → packer → dispatcher |
| **M3** | Multi Order Fulfillment (wave) | Many orders same day | Wave picker → sort/pack station → dispatcher |

Each mode reuses the same inventory core (FEFO candidates, reserve/consume, boxes, trips) but gets its
own guided UI thread. This doc maps every step of each mode to what exists today, what changes, and
what is new.

## 2. Grounding — verified current state

| Fact | Evidence |
|------|----------|
| Location types today: `storage, pick_face, staging, hold, damaged, incoming, quarantine, returns` — no packing location | `migrations/013_location_putaway_priority.sql:14–31`; constraint-widening precedent exists |
| Stock model: reserve on pick create; stock stays on bin until pack-load or trip-load consumes (`ConsumePickListStock`) | `api/modules/shared/allocation.go:72,138,202`; 2026‑08‑25 spec §5 |
| Wave exists but collapses order identity (one list, CSV of SO names, no sort-to-order) | `api/modules/picking/wave_handler.go`; 2026‑08‑25 spec §3.3, §6 |
| No outbound sales invoice entity (only `purchase_invoices`; returns reference `sales_invoice_no` as free text) | `api/modules/billing/handler.go`, `api/modules/returns/handler.go:29` |
| RF scan loop prompts location → item, over-pick blocked, typed qty entry | `api/modules/picking/handler.go:420–500` |
| Boxes support multi-box per pick list, label HTML/ZPL stub, weight warn | `api/modules/packing/handler.go` |
| Trips/stops/POD/DN generation exist | `api/modules/dispatch/handler.go` |

**Prerequisite:** the P0 fixes (SO progress sync B1, double-allocation guard B2, pack gate B3,
cancel persistence B4) must land first — all three modes read `picked_qty` and depend on honest
allocation state.

---

## 3. Design principles

1. **Scan-first, phone/tablet ready** — one primary action per screen; system prompts, user confirms.
2. **One identity thread per mode** — M2 keeps SO ↔ pick ↔ box ↔ trip linked end-to-end; M3 restores
   order identity through wave + consolidation (today's biggest gap).
3. **Stock is always somewhere visible** — picked goods move to a real **packing location**, not into an
   invisible reserve.
4. **Reuse before build** — FEFO allocation, boxes, trips, DN/POD are shared by all modes.
5. **YAGNI on accounting** — invoicing in M1 is an operational receipt, not double-entry AR.

---

## 4. Shared foundation (all modes)

### 4.1 New location type `packing`

Migration (next free number after the B4 fix's `041`):

```sql
ALTER TABLE warehouse_locations DROP CONSTRAINT IF EXISTS warehouse_locations_location_type_check;
ALTER TABLE warehouse_locations ADD CONSTRAINT warehouse_locations_location_type_check
CHECK (location_type IS NULL OR location_type IN (
  'storage','pick_face','staging','hold','damaged','incoming','quarantine','returns','packing'));
```

Seed one packing location per pack workstation / sort station: e.g. `PACK-STATION-1`,
`PACK-SORT-1` (`allow_mixed_items = true`). Packing locations:

- Hold **actual_qty** (physical truth: items are on the bench), never long-term reserve.
- Are excluded from customer-order FEFO allocation (`ListFEFOCandidates` already filters to
  `storage/pick_face` — keep that).
- Are included in cycle counts and stock-scan lookups.

### 4.2 New stock movement: "pick complete → move to packing"

Today picked stock stays reserved on its source bin until consume-on-load. Replace with an explicit
transfer when a pick list finishes all lines:

```
For each picked line:
  actual(source bin) -= picked_qty ; release remaining reserve
  actual(packing_location) += picked_qty   -- unreserved, batch/expiry carried over
Record audit row (reuse pattern of pick_scan_logs or the putaway-move ledger).
```

Trigger points per mode: M1/M2 at last line of the single-order pick list; M3 when the wave's zone run
completes (stock lands in the consolidation location `PACK-SORT-*`).

**Consume choke point stays:** shipment out of the building still decrements from the **packing
location** at box→trip load (or immediately at M1 finish). `ConsumePickListStock`
(`allocation.go:202`) gains a mode where it consumes from balances at the packing location instead of
source-bin reserves.

> Why: fixes the 2025‑08‑25 spec §6 friction "stock jumps from bin to 'gone'"; makes partial picks,
> station audits, and mis-picks physically correctable.

### 4.3 Bind pick job ↔ packing location

Add nullable `packing_location_id` to `pick_lists`. create-pick/wave assigns it (round-robin across
active stations, or desk-selected). The RF completion step needs it for the move in §4.2.

### 4.4 Prerequisite fixes

B1 (SO progress sync), B2 (one-open-pick guard + net-open demand), B3 (pack gate), B4 (cancel
persistence) — see the P0 fix design doc. No mode work starts without them.

---

## 5. Mode 1 — Quick Order Fulfillment (counter sale)

### 5.1 Your flow, restated

Open quick-sales UI → enter item name(s) + qty → UI shows pick locations → guided loop: prompt
location → scan location → scan items → picking complete → pack → invoice → finish.

### 5.2 Flow & screens

```
/quick-sale (desk or RF)
  [1] Cart build: type-ahead item search (item master), qty, live price+stock check
      → shows best FEFO bin per line as entered (ListFEFOCandidates top hit)
  [2] "Start picking" → creates quick_sale session, reserves stock (ReserveBalance)
  [3] RF guided pick (reuses picking scan UX):
        "Location 1 of N — go to C-A01-02" → scan location → scan item ×qty
        drift warn; over-pick blocked; shortage → offer remove-line or partial
  [4] Pick complete → stock moves to PACK-STATION-n (§4.2)
  [5] Pack (optional single box; skip for hand-carry)
  [6] Invoice: receipt preview (lines, rates from item master, totals, GST fields if set)
      → payment method recorded (cash/UPI/card — informational) → mark PAID/UNPAID
  [7] Finish → consume from packing location → receipt/invoice printable
```

### 5.3 Data model (new, minimal)

```sql
CREATE TABLE quick_sales (
  id serial PRIMARY KEY,
  sale_no text UNIQUE NOT NULL,          -- QS-YYYY-NNNNN
  warehouse_id int NOT NULL,
  customer_name text,                    -- optional walk-up
  customer_phone text,
  status text NOT NULL DEFAULT 'draft',  -- draft|picking|packing|invoiced|completed|cancelled
  packing_location_id int REFERENCES warehouse_locations(id),
  total numeric(12,2) DEFAULT 0,
  payment_method text, payment_status text DEFAULT 'unpaid',
  sales_order_id int REFERENCES sales_orders(id),  -- nullable back-link
  created_by int, created_at timestamptz DEFAULT now(), completed_at timestamptz
);
CREATE TABLE quick_sale_items (
  id serial PRIMARY KEY,
  quick_sale_id int NOT NULL REFERENCES quick_sales(id),
  item_code text NOT NULL, qty numeric(12,3) NOT NULL,
  rate numeric(12,2) DEFAULT 0,
  picked_qty numeric(12,3) DEFAULT 0,
  balance_id int, location_code text, batch_no text
);
-- minimal operational invoice/receipt (NOT accounting AR):
CREATE TABLE counter_invoices (
  id serial PRIMARY KEY, invoice_no text UNIQUE NOT NULL,   -- CI-YYYY-NNNNN
  quick_sale_id int REFERENCES quick_sales(id),
  lines jsonb NOT NULL, total numeric(12,2), created_at timestamptz DEFAULT now()
);
```

Alternative considered: reuse Sales Orders with an auto-created draft SO. Rejected — SO CRUD, priority,
confirm steps add clicks a counter sale must not have; a dedicated lightweight entity keeps the 60-second
sale fast. Back-link column preserves reporting joins later.

### 5.4 APIs (new module `api/modules/quicksale/`)

| Endpoint | Purpose |
|---|---|
| `POST /quicksale/` | Create session + lines (prices resolved server-side) |
| `POST /quicksale/:id/start` | Reserve FEFO, return ordered location walk list |
| `POST /quicksale/:id/scan` | Location+item scan loop (mirrors `/picking/scan` semantics) |
| `POST /quicksale/:id/complete-pick` | Move stock to packing location |
| `POST /quicksale/:id/invoice` | Generate `counter_invoice`, record payment info |
| `POST /quicksale/:id/finish` | Consume from packing location; status=completed |
| `POST /quicksale/:id/cancel` | Release reservations / restock packing location |

### 5.5 Edge cases

Shortage mid-loop → allow qty reduction with reason; cancel releases everything atomically. Price
overrides → supervisor permission flag. Returns of a counter sale → existing returns flow, referencing
the `CI-` number.

---

## 6. Mode 2 — Single Order Fulfillment

### 6.1 Your flow, restated

Sales UI → click order → create picklist → redirect to picking UI → job prompts location → scan
location → prompted item+qty → scan item x times for x qty → picking complete → pack: scan box, scan
items in one-by-one → stock sits at packing location → ship via transport.

### 6.2 What exists vs. changes

| Step | Today | Change needed |
|------|-------|---------------|
| Confirm SO → Create Pick | `POST /sales-orders/:id/create-pick` (FEFO reserve) | Keep; plus B2 guard; assign `packing_location_id` |
| Redirect to picking UI | None (manual nav) | Response includes `pick_list_id`; UI routes to `/pick?pick_list_id=` deep link |
| Guided RF loop | Prompts location → item; typed qty | Add **scan-count mode**: each item scan = +1 toward target until reached ("scan ×5"), long-press/keypad fallback for large qty |
| Pick complete | Sets list `completed` (reserve still on bin) | Fire §4.2 move to packing location |
| Pack | Scan/create box, add items | Deep link `/pack?pick_list_id=`; enforce B3 gate vs picked qty; box barcode label print |
| Ship via transport | Trip create/load/start/POD/DN | Unchanged; consume now reads packing-location balances (§4.2) |

### 6.3 Sequence

```
Desk: confirm SO → Create Pick ──redirect──▶ RF: /pick?pl=N
RF: loc prompt → scan loc → scan item ×q … repeat … auto-complete
       └─ move to PACK-STATION-n
UI prompt: "Pick done → Start packing" ──▶ RF: /pack?pl=N
RF: scan box label → scan items into box (gate: ≤ picked) → Close box
Desk/RF: /dispatch → create trip → load box(es) → start → POD → complete → DN
```

This is the **default SOP** (matches 2025‑08‑25 spec §7.1 ranking); M1 and M3 branch off it.

---

## 7. Mode 3 — Multi Order Fulfillment (wave + consolidation)

### 7.1 Your flow, restated

Wave order fulfillment with full consolidation → pick by zone or pick by item → items drop to packing
location after picking → order fulfillment: different boxes per order, extra box added when one fills.

### 7.2 Wave creation v2

Replace ID-string wave UI (`wave_handler.go` takes a CSV of SO IDs) with:

- Desk queue of **confirmed SOs sorted by priority/delivery date**, checkbox multi-select, capacity
  estimate (lines + units) shown before create.
- Per-SO allocation preserved: demand no longer pre-aggregated into anonymous rows (fixes identity
  collapse). See schema §7.5.
- Options: sort path `zone | item`; target consolidation station (`PACK-SORT-1…`).

### 7.3 Pick execution

Same RF loop as M2 but over the wave list, lines **pre-sorted**:

- `zone`: group by location-code prefix (zone/aisle parsed from `warehouse_locations.code`;
  config map per warehouse), then aisle → level → bin.
- `item`: group by item_code across bins (fewer SKU touches; better when many orders share SKUs).

Picker sees aggregated quantity per stop (e.g., "SCAN ITEM X ×14") — scans count up regardless of which
orders the units belong to; attribution happens downstream at sort. Short pick → mark shortage; the
shortfall is attributed per-SO at sort time by proportional share.

On wave completion → whole pick moves to the consolidation packing location (`PACK-SORT-*`, mixed items
allowed).

### 7.4 Sortation / order-fulfillment station (new)

New screen `/fulfill` (RF-friendly):

```
Scan item barcode at station
  → screen: "ITEM X — put 4 in BOX B-101 (SO-2026-0031, Acme) · 10 in BOX B-102 (SO-…-0033)"
     [derived from wave_line_orders shares + already-packed counts]
Scan box label → confirms placement; running fill % per box
Box full? (weight ≥ max_weight OR lines ≥ threshold OR operator taps "+ Box")
  → auto-creates sibling box for the same order ("B-102-2"), continues placement
All items placed → per-order completeness check vs SO lines
  → green per order → boxes staged for dispatch (trip load consumes from packing location)
```

Multi-box per order is just more rows in `boxes` sharing `pick_list_id` + `sales_order_no`; the B3
pack gate applies per box against the order's share.

### 7.5 Data model changes

```sql
-- per-wave order attribution (the key fix for identity collapse)
CREATE TABLE wave_line_orders (
  id serial PRIMARY KEY,
  pick_list_item_id int NOT NULL REFERENCES pick_list_items(id),
  sales_order_id int NOT NULL REFERENCES sales_orders(id),
  qty_share numeric(12,3) NOT NULL          -- units of this aggregate line owed to this SO
);
ALTER TABLE pick_lists ADD COLUMN IF NOT EXISTS picking_mode text DEFAULT 'scan'; -- exists; values scan|wave
-- per-order boxes during sort
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS sales_order_no text;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS sort_seq int;         -- B-102-2 ordering
-- station binding (shared foundation §4.3)
ALTER TABLE pick_lists ADD COLUMN IF NOT EXISTS packing_location_id int REFERENCES warehouse_locations(id);
```

### 7.6 APIs

| Endpoint | Purpose |
|---|---|
| `POST /picking/wave` (v2 body) | `{sales_order_ids[], sort:'zone'\|'item', packing_location_id}` + writes `wave_line_orders` |
| `GET /picking/:id/lines?sort=zone\|item` | Ordered walk sequence |
| `POST /fulfill/scan-item` | Item scanned at station → next placement instruction(s) |
| `POST /fulfill/place` | `{box_id, item_code, qty}` → gate + running fills |
| `POST /fulfill/boxes/split` | Add sibling box for an order |
| `GET /fulfill/:waveId/status` | Per-order completeness board |

Dispatch side unchanged: load boxes → consume → trip.

---

## 8. Stock lifecycle across modes

| Event | M1 quick sale | M2 single | M3 wave |
|---|---|---|---|
| Session/order created | reserve @ bins | reserve @ bins (FEFO) | reserve @ bins per SO |
| Each pick scan | progress only | progress only (+SO sync B1) | progress only |
| Pick finished | move → `PACK-STATION-n` | move → `PACK-STATION-n` | move → `PACK-SORT-*` |
| Boxed / placed | n/a or box @ station | box contents gate (B3) | sort placements gate per order share |
| Shipped (trip load / finish) | consume @ packing loc | consume @ packing loc | consume @ packing loc |
| Cancel before ship | release reserve (or restock from packing loc) | release / B4-cancelled persisted | wave cancel = release + restock partials |

Physical rule everywhere: **actual stock is always at exactly one scannable location** — bin or
packing location — never invisible.

## 9. Phasing & rollout

| Phase | Scope | Why first |
|-------|-------|-----------|
| **A** | Foundation (§4): `packing` type, move-on-complete, `packing_location_id` + **P0 fixes B1–B4** + M2 polish (deep links, scan-count mode) | M2 ≈ 80% exists today; foundation unlocks everything; lowest risk |
| **B** | M1 quick sale (new small module, self-contained) | High business value, zero coupling to wave complexity |
| **C** | M3 wave v2 + sort station (`wave_line_orders`, `/fulfill`) | Largest surface; only safe once A makes quantities trustworthy |

Each phase ships independently usable software; M3 explicitly stays supervisor-only until sort-station
identity works end-to-end (same caution as 2025‑08‑25 spec §7.2).

## 10. Testing strategy

Per phase, following existing handler-test conventions (`api/modules/putaway/*_test.go`):
reserve/move/consume balance assertions per event table §8; scan-count boundary tests (±ε, over-scan
blocked); M3 attribution property test (Σ `wave_line_orders.qty_share` == line qty); box-split trigger;
cancel/restock round-trips; RBAC route enforcement for new modules.

## 11. Open questions (need your call before planning)

1. **M1 invoicing formality** — is `counter_invoices` (operational receipt) enough, or must it feed
   accounting/GST filings from day one?
2. **Payment capture** — record method+status only (recommended), or amounts/tender detail too?
3. **Box-full trigger** — weight only, or also volume/item-count threshold? Default proposal: weight +
   manual override.
4. **Zone map source** — parse location code prefixes, or explicit zone field on `warehouse_locations`?
   (Explicit field is cleaner; parsing is zero-migration.)
5. **M3 shortage attribution** — proportional split (recommended) or first-come-first-served by
   priority?

## 12. Next step

On approval: invoke **writing-plans** to produce phased implementation plans
(`docs/superpowers/plans/2026-08-26-outbound-mode-{a,b,c}*.md`), starting with Phase A.
