# Outbound Phase 1 — Fulfillment Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land migrations 042–049 and a shared `api/modules/fulfillment` engine that moves stock on pick confirm and ships from the packing location, without yet shipping the three new UIs.

**Architecture:** New fulfillment package owns stock movements for pick lists with `fulfillment_type` set. Legacy lists (`fulfillment_type IS NULL`) keep consume-on-load. Create-pick paths stamp `fulfillment_type='single'` and a packing location so new work uses the engine immediately.

**Tech Stack:** Go 1.22, Fiber v2, pgx v5, PostgreSQL 16, `api/internal/testdb`.

**Spec:** `docs/superpowers/specs/2026-08-26-outbound-fulfillment-engine-and-modes-design.md` §§5–6, §15 Phase 1.

## Global Constraints

- Migrations are idempotent; next free number is `042`.
- Engine primitives take `context.Context` + `shared.DBTX` (tx or pool).
- Typed errors: `ErrWrongLocation`, `ErrWrongItem`, `ErrOverPick`, `ErrLineNotPickable`.
- Packing locations are non-allocatable (`allocation_status='unallocatable'`).
- Tests use `testdb.Tx` / `testdb.Seed`; skip when `GOWMS_TEST_DSN` unset.
- Do not build counter-sale UI, wave consolidation UI, or GST invoice API in this phase (schemas only).

---

## File Structure

| File | Action |
|------|--------|
| `migrations/042_packing_location.sql` … `049_fulfillment_permissions.sql` | Create |
| `api/modules/fulfillment/errors.go` | Create |
| `api/modules/fulfillment/allocate.go` | Create |
| `api/modules/fulfillment/confirm_pick.go` | Create |
| `api/modules/fulfillment/assign_box.go` | Create |
| `api/modules/fulfillment/consolidate.go` | Create |
| `api/modules/fulfillment/ship_box.go` | Create |
| `api/modules/fulfillment/release.go` | Create |
| `api/modules/fulfillment/engine_test.go` | Create |
| `api/modules/shared/stockloc.go` | Modify — packing → unallocatable; DBTX adjust helper |
| `api/modules/picking/handler.go` | Modify — ConfirmPick when typed |
| `api/modules/salesorder/handler.go` | Modify — stamp fulfillment_type + packing loc |
| `api/modules/packing/handler.go` | Modify — ShipBox when typed |
| `api/modules/dispatch/handler.go` | Modify — ShipBox when typed |
| `api/modules/rbac/catalog.go` | Modify — new permissions |

---

### Task 1: Migrations 042–049

- [ ] Create each migration file per spec §5.3.
- [ ] Apply with `psql` against local DB; re-run for idempotency.
- [ ] Commit.

### Task 2: Stock helper for packing moves

- [ ] Add `AdjustLocationQtyTx(ctx, db DBTX, ...)` mirroring `AdjustLocationQty`.
- [ ] Treat `packing` like staging for `allocation_status`.
- [ ] Commit.

### Task 3: Engine package + tests

- [ ] Implement primitives + typed errors.
- [ ] Test: allocate → confirm pick → packing balance rises, source falls; assign box; ship; invariants hold.
- [ ] Test: wrong location/item → typed error + rejected scan log.
- [ ] Commit.

### Task 4: Wire create-pick and scan

- [ ] On create-pick / free-form create: set `fulfillment_type='single'`, resolve/create packing location, set `packing_location_id`.
- [ ] `logPickScan`: if typed, call `ConfirmPick`; else legacy.
- [ ] Commit.

### Task 5: Wire pack load and dispatch load

- [ ] When pick list is typed, call `ShipBox` (or consume from packing) instead of `ConsumePickListStock` on source.
- [ ] Legacy unchanged.
- [ ] Commit.

### Task 6: Permissions + verify

- [ ] Catalog + migration grants for `counter_sale.access`, `picking.override`.
- [ ] Full `go test` with DSN on fulfillment/picking/packing/salesorder.
- [ ] Commit baseline.
