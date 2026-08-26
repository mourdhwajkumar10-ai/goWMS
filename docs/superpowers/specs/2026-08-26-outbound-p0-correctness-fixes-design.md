# Outbound P0 Correctness Fixes — Design

**Date:** 2026-08-26
**Status:** Proposed (design review pending approval)
**Related:**
- `docs/superpowers/specs/2026-08-25-outbound-sales-order-fulfillment.md` (current-state map; §10 priorities P0/P1)
- `docs/goWMS_Outbound_Analysis.md`, `docs/spec/SPEC_03_OUTBOUND.md` (background)

---

## 1. Purpose

Design the concrete fixes for the correctness bugs blocking production readiness of the outbound flow
(sales order → FEFO allocate/reserve → RF pick → pack → consume-on-load → trip/DN). Each bug below was
**verified against code**, not inferred from docs. The pipeline architecture itself is sound; these are
targeted fixes, not a redesign.

## 2. Verdict summary

| # | Severity | Bug | Root location | Status |
|---|----------|-----|---------------|--------|
| B1 | **P0** | Sales-order progress (`sales_order_items.picked_qty`, `sales_orders.per_picked`) never updates | No `UPDATE sales_order_items` anywhere in `api/` | Confirmed |
| B2 | **P0** | Double stock allocation — repeated `create-pick` on the same SO re-reserves the same open qty | `api/modules/salesorder/handler.go:560` | Confirmed |
| B3 | **P0** | Packing accepts any SKU/qty — no validation against the pick list | `api/modules/packing/handler.go:148` (`packItem`) | Confirmed |
| B4 | **P0** | Cancel pick never persists `status='cancelled'`; DB check constraint would reject it if it tried | `api/modules/picking/handler.go:557`; `migrations/002_operations.sql:294` | Confirmed (**worse than spec claimed**) |
| B5 | **P1** | Backorder parity — create-pick-from-SO does not auto-create backorders on shortage | `api/modules/salesorder/handler.go:525` | Confirmed |
| B6 | **P1** | Zero test coverage on outbound modules | no `*_test.go` under `api/modules/{salesorder,picking,packing,dispatch,backorder,returns}` | Confirmed |

---

## 3. B1 — Sales-order progress never syncs

### 3.1 Evidence

- `rg "UPDATE sales_order_items"` across `api/` → **0 matches**.
- The scan handler (`api/modules/picking/handler.go:464`) writes only:
  ```sql
  UPDATE pick_list_items SET picked_qty=$1, status=$2 WHERE id=$3
  ```
- `sales_orders.per_picked` exists (`migrations/002_operations.sql:500`) and the UI renders it
  (`web/src/pages/SalesOrders.tsx:406,448`) — always stale at its default.
- Both `createPickFromSO` (`api/modules/salesorder/handler.go:561`) and the wave aggregator
  (`api/modules/picking/wave_handler.go:66`) compute demand as `qty - picked_qty` from those dead fields.

### 3.2 Impact

- Order progress UI lies (always 0%).
- Directly causes B2 (double allocation).
- Analytics KPIs built on `per_picked` (e.g. `/analytics/fulfillment-rate`,
  `docs/implementation/14_FEATURE_ANALYTICS.md:45`) are meaningless.

### 3.3 Fix design

Sync **at pick-scan time**, inside the existing scan transaction, and make it **idempotent by
recomputation** (safer than increments because scans can be retried/partial):

After the `UPDATE pick_list_items …` in the scan handler, add:

```sql
-- 1) advance the SO line (only for single-order pick lists; wave/free-form skip this)
UPDATE sales_order_items soi
SET    picked_qty = GREATEST(COALESCE(soi.picked_qty,0),
                             (SELECT SUM(pli.picked_qty)
                              FROM pick_list_items pli
                              JOIN pick_lists pl ON pl.id = pli.pick_list_id
                              WHERE pl.sales_order_no = $so_name
                                AND pli.item_code   = soi.item_code))
FROM   sales_orders so
WHERE  so.id = soi.sales_order_id AND so.name = $so_name AND soi.item_code = $item_code;

-- 2) recompute header % (idempotent, clamped)
UPDATE sales_orders so
SET    per_picked = COALESCE((
        SELECT ROUND(100 * SUM(LEAST(COALESCE(picked_qty,0), COALESCE(qty,0)))
                     / NULLIF(SUM(COALESCE(qty,0)),0), 2)
        FROM sales_order_items WHERE sales_order_id = so.id), 0),
       wms_status = CASE WHEN so.wms_status IN ('draft','confirmed','picking')
                         THEN 'picking' ELSE so.wms_status END
WHERE  so.name = $so_name;
```

**Guard:** run these statements only when `pick_lists.sales_order_no` matches exactly one SO
(no comma ⇒ not a wave label; non-empty ⇒ not free-form). Implementation detail: resolve
`soID := SELECT id FROM sales_orders WHERE name = $1` first; if no single row, skip silently.

**Same call site on consume:** `ConsumePickListStock` (`api/modules/shared/allocation.go:202`) is the
single choke point for shipment consumption (pack load + trip load). After consuming, recompute
`per_picked`/`per_delivered`-equivalent progress for the linked SO using the same guarded recompute.
This keeps dispatch-only flows (skip pack) correct too.

### 3.4 Tests (B1)

- Scan to full allocation ⇒ SO line `picked_qty == allocated_qty`, `per_picked == 100`.
- Partial scan (50%) ⇒ `per_picked ≈ expected` fraction; rescan same qty (idempotent retry) ⇒ unchanged values.
- Wave pick list ⇒ SO rows untouched (no crash, no wrong attribution).

---

## 4. B2 — Double allocation on repeated create-pick

### 4.1 Evidence

`createPickFromSO` opens demand as:

```sql
SELECT item_code, COALESCE(qty,0) - COALESCE(picked_qty,0)
FROM   sales_order_items
WHERE  sales_order_id=$1 AND COALESCE(qty,0) > COALESCE(picked_qty,0)
```

(`api/modules/salesorder/handler.go:560`). Because `picked_qty` is frozen (B1), every invocation sees
the full original qty. There is no existence check for an already-open pick list for the SO. Each run
calls `shared.ReserveBalance` (`api/modules/shared/allocation.go:72`) again ⇒ `reserved_qty` doubles
against the same physical bins; available stock for other orders silently evaporates; consume later
ships more reserve than exists.

### 4.2 Fix design (two layers)

**(a) Hard guard — one open pick per SO.** At the top of the create-pick transaction:

```sql
SELECT pl.id, pl.name FROM pick_lists pl
WHERE  pl.sales_order_no = $so_name
  AND  pl.status IN ('draft','open')
LIMIT 1 FOR UPDATE;
-- row found ⇒ 409 Conflict: "open pick list PL-… already exists for SO-…"
```

**(b) Net-open demand.** Change the demand query to subtract live reservations so partial/replacement
picks stay correct even after (a) ships or cancels:

```sql
SELECT soi.item_code,
       COALESCE(soi.qty,0) - COALESCE(soi.picked_qty,0)
       - COALESCE((SELECT SUM(GREATEST(
              COALESCE(pli.allocated_qty,0) - COALESCE(pli.picked_qty,0)
            - COALESCE(pli.consumed_qty,0), 0))
         FROM pick_list_items pli
         JOIN pick_lists pl ON pl.id = pli.pick_list_id
         WHERE pl.sales_order_no = $so_name
           AND pl.status IN ('draft','open')
           AND pli.item_code = soi.item_code), 0) AS open_qty
FROM   sales_order_items soi
WHERE  soi.sales_order_id = $so_id;
```

Apply the identical change to the wave aggregator loop (`wave_handler.go:66`) — waves aggregate the
same stale expression today.

### 4.3 Tests (B2)

- Create pick A for SO (full qty) ⇒ second create-pick returns **409** naming PL-A.
- After cancel of PL-A ⇒ create-pick succeeds (guard releases).
- With B1 fixed: pick half, ship, then create-pick ⇒ demand equals remainder only.

---

## 5. B3 — Packing accepts any SKU / quantity

### 5.1 Evidence

`packItem` (`api/modules/packing/handler.go:148–237`) validates only that the item exists in the item
master and warns on soft weight limits. It inserts into `box_items` unconditionally. The module's only
link to picking is the optional `boxes.pick_list_id` column — `pick_list_items` is never queried
(verified: no reference in `api/modules/packing/`).

### 5.2 Impact

Wrong-SKU and over-qty shipments pass through pack; the consume step then drains reserve based on
whatever was boxed, corrupting both inventory and order history. This is the last unchecked gate before
stock leaves the building.

### 5.3 Fix design

Gate **only when `box.pick_list_id` is set** (keeps ad-hoc boxes usable). Inside a transaction:

```sql
SELECT COALESCE(stock_consumed,false) FROM pick_lists WHERE id=$pl FOR UPDATE;

-- allowed ceiling for this SKU on the pick list
SELECT COALESCE(SUM(pli.picked_qty),0)          -- fall back below if 0
       + CASE WHEN COALESCE(SUM(pli.picked_qty),0)=0 THEN COALESCE(SUM(pli.allocated_qty),0) ELSE 0 END
FROM   pick_list_items pli
WHERE  pli.pick_list_id=$pl AND pli.item_code=$ic;

-- already packed across all boxes of this pick list
SELECT COALESCE(SUM(bi.quantity),0)
FROM   box_items bi JOIN boxes b ON b.id = bi.box_id
WHERE  b.pick_list_id=$pl AND bi.item_code=$ic;
```

Rules:
- `packed_total + new_qty > ceiling + 0.0001` ⇒ **409** `"over-pack: X of Y picked already packed"`.
- Item absent from the pick list (ceiling 0) ⇒ **400** `"SKU not on pick list <name>"`.
- Batch mismatch vs the allocated batch ⇒ warning field first (soft), hard-block behind a warehouse
  setting later (out of scope here; see §9 open questions).
- Mirror check in `reverseItem` so reversals can't push totals negative relative to packed history.

### 5.4 Tests (B3)

- Pack ≤ picked qty ⇒ OK; pack 1 more ⇒ 409 with counts in message.
- Pack unknown-to-picklist SKU while `pick_list_id` set ⇒ 400.
- Box **without** `pick_list_id` ⇒ behavior unchanged (regression guard).

---

## 6. B4 — Cancel pick: status never persisted + constraint would reject it

### 6.1 Evidence (refined vs. prior spec)

The 2026-08-25 spec listed this as a *risk* ("constraint may omit that value"). Code shows it is worse:

- `cancelPickList` (`api/modules/picking/handler.go:557–589`) begins a tx, calls
  `shared.ReleasePickListReservations` (`allocation.go:138`), commits — and **never executes any
  `UPDATE pick_lists SET status='cancelled'`**. The JSON response claims
  `{"status":"cancelled","reservations_released":true}` regardless.
- Result: reservations are freed but the list still displays `open`/`draft` everywhere, operators can
  re-pick against it, and the early-return idempotency check (`status == "cancelled"`, line 571) can
  never trigger — so a double-cancel re-releases nothing but reports success twice.
- Even if an UPDATE were added today, `pick_lists_status_check`
  (`migrations/002_operations.sql:294`) admits only `draft|open|partially_delivered|completed` ⇒ the
  write would abort the whole transaction, rolling back the reservation release too. No later migration
  alters this constraint (verified across all 41 migration files).

### 6.2 Fix design

**Migration `041_pick_list_cancelled_status.sql`** (next free number; current max is `040`):

```sql
ALTER TABLE pick_lists DROP CONSTRAINT IF EXISTS pick_lists_status_check;
ALTER TABLE pick_lists ADD  CONSTRAINT pick_lists_status_check
CHECK (status::text = ANY (ARRAY[
  'draft','open','partially_delivered','completed','cancelled']::text[]));
```

**Handler** — inside the existing tx, after a successful release:

```go
tag, err := tx.Exec(c.Context(),
    `UPDATE pick_lists SET status='cancelled', updated_at=NOW() WHERE id=$1`, id)
// treat RowsAffected()==0 as 404
```

Keep the pre-check that refuses cancel when `stock_consumed=true` (already enforced by
`ReleasePickListReservations` reading `stock_consumed FOR UPDATE` — preserve that ordering so release
and status flip commit atomically). Also emit the existing notification hook used elsewhere for state
changes, if trivially available.

### 6.3 Tests (B4)

- Cancel open pick ⇒ row `status='cancelled'` **and** balances released (single tx).
- Cancel again ⇒ idempotent early-return path now actually reachable.
- Consume then cancel ⇒ conflict error; status unchanged.

---

## 7. B5 — Backorder parity (P1)

Free-form `POST /picking/` auto-creates `backorders_v2` + lines from shortage lines and emits shortage/
BO notifications (`api/modules/picking/handler.go:~200–232`). `createPickFromSO` inserts shortage lines
but creates no backorder. Extract the existing block into a helper, e.g.:

```go
// package notifications-adjacent or shared: returns boNo, created
func CreateBackorderFromShortages(ctx, db, pickListID int, soName, customer string,
                                  shortages []ShortageLine) (string, bool, error)
```

and call it from both handlers. Fulfill flow ("create pick for BO lines") stays out of scope for this
fix set (spec §7.4 ranks it separately).

## 8. B6 — Test coverage strategy (P1)

Follow the existing Go test conventions visible in `api/modules/putaway/*_test.go` /
`api/modules/shared/*_test.go`. Minimum matrix per fix: happy path, boundary (±ε qty), conflict path,
idempotency (repeat request), and cross-module effect (scan ⇒ SO row). Every task in §3–§7 above lists
its specific cases; they land together with each fix (TDD).

## 9. Interaction order & rollout

Implementation order matters:

1. **B1** first (progress sync) — B2(b)'s arithmetic assumes `picked_qty` moves.
2. **B2** guard + net-open demand (wave included).
3. **B4** migration + cancel persistence (small, independent; may ship anytime).
4. **B3** pack gate (depends on trustworthy `picked_qty` semantics from B1 fallback rule).
5. **B5**, then close gaps surfaced by tests (**B6** throughout).

Rollout notes:
- Migration `041` is backward-compatible (widens a CHECK; no data rewrite).
- All API changes are additive validations; clients get clearer 4xx payloads. Frontend needs no forced
  change, though `SalesOrders.tsx` progress columns start showing real data once B1 lands.
- Deploy note: run migration before/with the API deploy; old binaries tolerate the widened constraint.

## 10. Open questions (need owner decisions)

1. Over-pack should be **hard 409** (recommended) or warn-first during a transition week?
2. Should `per_delivered` also be recomputed at trip complete in the same B1 consume hook, or tracked
   as its own ticket?
3. Free-form picks referencing a valid single SO number — apply the same SO-line sync there? (Recommended:
   yes, via the same guarded helper; wave labels remain excluded.)

## 11. Next step

Per superpowers workflow: on design approval, invoke **writing-plans** to produce
`docs/superpowers/plans/2026-08-26-outbound-p0-correctness-fixes.md` with bite-sized TDD tasks per §3–§8.
