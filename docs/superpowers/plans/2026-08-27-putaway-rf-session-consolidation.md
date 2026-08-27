# Putaway RF Session Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate desktop and RF putaway onto one session-based workflow while preserving the RF skeleton and receiving-wizard animation language.

**Architecture:** `/putaway` is the canonical operational screen; `/putaway-runner` becomes a compatibility redirect. RF and desktop use the same session lifecycle: queue → session → pick/reserve → destination scan → item re-scan → transactional placement → validated completion. Legacy direct movement endpoints are removed from active clients and fail closed for ordinary use.

**Tech Stack:** Go/Fiber, PostgreSQL/pgx, React 18, TypeScript, React Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-27-putaway-rf-session-consolidation-design.md`

## Global Constraints

- Preserve the existing RF visual structure; do not redesign `ScannerLayout`, scanner viewport, bottom scan bar, queue, suggestion card, or receiving-wizard animation conventions.
- Use the session-based putaway API as the only operational stock-movement path.
- Require source item scan, destination-bin scan, and item re-scan before placement.
- Require `putaway.access` for putaway routes and `putaway.override` for manual/non-suggested placement.
- Never trust client-side completion state; completion must be server validated.
- Keep changes incremental and run relevant tests/build after each slice.
- Do not add a dependency.

---

## File map

- Modify `api/modules/putaway/handler.go`: canonical putaway route registration, queue/suggestion, legacy direct-route behavior, authorization.
- Modify `api/modules/putaway/session_handler.go`: session ownership, pick/place validation, completion endpoint, transactional movement.
- Modify `api/modules/putaway/handler_test.go`: route/query and policy regression tests.
- Modify `api/modules/putaway/session_handler_test.go`: session state and authorization regression tests.
- Modify `api/modules/grn/handler.go`: deprecate the legacy GRN inline movement endpoint.
- Modify `api/modules/grn/completion.go`: retain only validated GRN putaway synchronization; prevent false completion.
- Modify `api/modules/grn/workflow.go`: register the canonical session completion integration if required by current route structure.
- Modify `web/src/pages/PutawayRunner.tsx`: keep RF skeleton but replace direct movement with session state machine.
- Modify `web/src/pages/PutawayWizard.tsx`: use the same completion/scan constraints where needed; preserve desk layout and animations.
- Modify `web/src/App.tsx`: redirect `/putaway-runner` to `/putaway` or route it through the shared screen.
- Modify `web/src/services/api.ts`: add typed session/completion helpers; stop active use of direct movement helpers.
- Modify `web/src/__tests__/PutawayWizard.test.tsx`: regression coverage for required sequencing where compatible with existing test setup.
- Modify `web/src/__tests__/navCatalog.test.ts`: update route compatibility expectations.

---

### Task 1: Establish backend policy and state tests

**Files:**
- Modify: `api/modules/putaway/handler_test.go`
- Modify: `api/modules/putaway/session_handler_test.go`

**Interfaces:**
- Produces the test expectations for `putaway.access`, `putaway.override`, owner-only sessions, quantity bounds, and required placement state.

- [ ] **Step 1: Add failing policy tests**

Add tests that assert the intended policy helpers or route behavior:

```go
func TestPutawayPolicyRequiresAccessAndOverride(t *testing.T) {
	if putawayRoutePermission != "putaway.access" {
		t.Fatalf("permission=%q", putawayRoutePermission)
	}
	if putawayOverridePermission != "putaway.override" {
		t.Fatalf("override permission=%q", putawayOverridePermission)
	}
}

func TestPutawayQuantityMustNotExceedPickedQuantity(t *testing.T) {
	if err := validatePlacementQuantity(51, 50); err == nil {
		t.Fatal("expected quantity-over-picked rejection")
	}
	if err := validatePlacementQuantity(0, 50); err == nil {
		t.Fatal("expected non-positive quantity rejection")
	}
	if err := validatePlacementQuantity(25, 50); err != nil {
		t.Fatalf("valid partial placement rejected: %v", err)
	}
}
```

- [ ] **Step 2: Run the focused backend tests and verify expected failure**

Run: `go test ./modules/putaway -run 'TestPutawayPolicy|TestPutawayQuantity' -v`

Expected: FAIL because the policy constants/validation helper do not yet exist.

- [ ] **Step 3: Implement minimal pure policy helpers**

Add small package-level constants/helpers in the owning putaway package:

```go
const (
	putawayRoutePermission   = "putaway.access"
	putawayOverridePermission = "putaway.override"
)

func validatePlacementQuantity(qty, picked float64) error {
	if qty <= 0 {
		return fmt.Errorf("quantity must be greater than zero")
	}
	if qty > picked+1e-9 {
		return fmt.Errorf("quantity exceeds picked quantity")
	}
	return nil
}
```

- [ ] **Step 4: Run the focused tests again**

Run: `go test ./modules/putaway -run 'TestPutawayPolicy|TestPutawayQuantity' -v`

Expected: PASS, assuming Go is available.

- [ ] **Step 5: Commit the policy test slice**

```bash
git add api/modules/putaway/handler_test.go api/modules/putaway/session_handler_test.go api/modules/putaway/handler.go
 git commit -m "test: define putaway session safety policies"
```

---

### Task 2: Harden session placement and add canonical completion

**Files:**
- Modify: `api/modules/putaway/session_handler.go`
- Modify: `api/modules/grn/completion.go`
- Modify: `api/modules/grn/workflow.go`
- Modify: `api/modules/putaway/session_handler_test.go`

**Interfaces:**
- Consumes: `validatePlacementQuantity`, `rbac.HasPermission`, existing session/item tables.
- Produces: `POST /putaway/sessions/:id/complete` with server-side validation.

- [ ] **Step 1: Add failing completion and ownership tests**

Test these behaviors using existing package conventions or pure helpers where database setup is unavailable:

```go
func TestPutawayCompletionRequiresNoPendingQuantity(t *testing.T) {
	if err := validatePutawayCompletion(10, 0); err != nil {
		t.Fatalf("zero pending should complete: %v", err)
	}
	if err := validatePutawayCompletion(10, 2); err == nil {
		t.Fatal("pending quantity must block completion")
	}
}
```

- [ ] **Step 2: Run tests and verify failure**

Run: `go test ./modules/putaway -run 'TestPutawayCompletion' -v`

Expected: FAIL until the completion validator exists.

- [ ] **Step 3: Harden `placeSessionItem`**

Ensure the handler:

- Joins the session owner while loading the item.
- Rejects another operator unless `putaway.override` is present.
- Rejects `is_override=true` without `putaway.override`.
- Rejects zero/negative/over-picked quantities.
- Validates target warehouse against session warehouse.
- Requires active storage/pick-face destination.
- Preserves batch identity when moving stock.
- Performs source decrement, target increment, reservation release, item status update, and log insert in one transaction.

- [ ] **Step 4: Add `POST /putaway/sessions/:id/complete`**

Register a handler that:

1. Locks the session.
2. Confirms the session belongs to the current operator or an authorized supervisor.
3. Rejects if any session item remains `picked` or has positive remaining quantity.
4. Rejects if source reservations remain.
5. Marks the session complete only after all checks pass.
6. Updates the linked GRN `putaway_status` through the existing synchronization path.
7. Writes an audit event.

- [ ] **Step 5: Validate GRN completion semantics**

Keep GRN receiving completion separate from physical putaway completion. Ensure `complete-putaway` cannot mark a GRN complete unless the server verifies no pending incoming/hold/staging quantity remains. If the canonical session completion supersedes it, make the GRN endpoint delegate to or reject in favor of the session completion contract.

- [ ] **Step 6: Run backend tests**

Run: `go test ./modules/putaway ./modules/grn -v`

Expected: PASS where dependencies are available; document environment limitations otherwise.

- [ ] **Step 7: Commit the backend enforcement slice**

```bash
git add api/modules/putaway/session_handler.go api/modules/putaway/session_handler_test.go api/modules/grn/completion.go api/modules/grn/workflow.go
git commit -m "feat: enforce putaway session completion"
```

---

### Task 3: Migrate RF runner to session workflow without changing its skeleton

**Files:**
- Modify: `web/src/pages/PutawayRunner.tsx`
- Modify: `web/src/services/api.ts`
- Modify: `web/src/__tests__/PutawayWizard.test.tsx` or create a focused RF test beside existing tests if required by project conventions.

**Interfaces:**
- Consumes: queue, suggestion, session creation, session pick, session placement, session completion APIs.
- Produces: RF states `mode_select`, `item_scan`, `picked`, `destination_scan`, `item_confirmation_scan`, `ready_to_place`, `complete`.

- [ ] **Step 1: Add failing RF state tests**

Cover these observable rules:

```tsx
it('does not show placement before a destination and item confirmation scan', async () => {
  // render the RF runner with a queued item and suggestion
  // select the item
  // expect no enabled Place action before both scans
})

it('rejects a mismatched item confirmation at the destination', async () => {
  // destination is selected, wrong item is scanned
  // expect warning and no placement request
})
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `npm test -- src/__tests__/PutawayWizard.test.tsx`

Expected: FAIL or be blocked by the known jsdom/undici environment issue; if blocked, keep the test and use build/typecheck plus pure state tests for verification.

- [ ] **Step 3: Add typed API helpers**

Add helpers in `web/src/services/api.ts` for:

```ts
putawaySessionCreate: (warehouseId: number, zone?: string) =>
  post<any>('/putaway/sessions', { warehouse_id: warehouseId, zone: zone || '' }),
putawaySessionGet: (id: number) => get<any>(`/putaway/sessions/${id}`),
putawaySessionPick: (id: number, data: { item_code: string; source_location_id: number; qty: number }) =>
  post<any>(`/putaway/sessions/${id}/pick`, data),
putawaySessionPlace: (id: number, itemId: number, data: { target_location_id: number; qty?: number; is_override?: boolean }) =>
  post<any>(`/putaway/sessions/${id}/place/${itemId}`, data),
putawaySessionComplete: (id: number) => post<any>(`/putaway/sessions/${id}/complete`, {}),
```

- [ ] **Step 4: Replace RF direct movement with session pick/place**

Keep the existing layout and CSS classes. Change only state/action behavior:

- Selecting/scanning a queue item creates or reuses a session, then calls session pick.
- Store returned session/item IDs.
- Store destination scan separately from item confirmation scan.
- Use the existing bottom scan input and camera callback, interpreting codes based on current state.
- Enable placement only when the scanned destination matches a valid location and the re-scanned item matches the picked item.
- Call session placement, never `api.post('/putaway/', ...)`.
- Refresh queue after placement.

- [ ] **Step 5: Remove unsafe RF actions**

Remove/replace:

- One-click placement using the suggestion alone.
- `Try next location` without a physical destination scan.
- Quantity input values greater than the picked quantity.

For a non-suggested destination, require supervisor permission and an explicit exception path.

- [ ] **Step 6: Preserve animation and structure**

Do not alter the RF shell, scanner layout, viewport, bottom bar, queue structure, or receiving-wizard animation classes. Add only state indicators and validation messages inside existing cards/sections.

- [ ] **Step 7: Run frontend typecheck/build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 8: Commit RF migration**

```bash
git add web/src/pages/PutawayRunner.tsx web/src/services/api.ts web/src/__tests__
git commit -m "feat: move RF putaway onto sessions"
```

---

### Task 4: Make `/putaway` canonical and retire duplicate operational UI

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/pages/PutawayWizard.tsx`
- Modify: `web/src/pages/PutawayRunner.tsx`
- Modify: `web/src/__tests__/navCatalog.test.ts`

**Interfaces:**
- Produces one canonical operational route and preserves compatibility for old links.

- [ ] **Step 1: Add route regression expectation**

Update route tests so `/putaway` is the canonical screen and `/putaway-runner` is a compatibility route that does not represent a second implementation.

- [ ] **Step 2: Implement compatibility redirect**

Use the existing device detection in `/putaway` and route `/putaway-runner` to `/putaway` with replace semantics, or render the shared component directly without duplicating state logic.

- [ ] **Step 3: Align desktop with canonical session completion**

Update desktop placement/completion calls only where required so it uses the same server contract. Preserve its existing layout and receiving-wizard-compatible animations.

- [ ] **Step 4: Remove duplicate runner-only logic**

Delete only code made unreachable by the redirect/shared implementation. Do not remove scanner primitives or shared styles still used elsewhere.

- [ ] **Step 5: Run route tests and build**

Run: `npm test -- src/__tests__/navCatalog.test.ts` and `npm run build`.

Expected: route tests and build pass, subject to the known jsdom/undici worker issue for the full suite.

- [ ] **Step 6: Commit route consolidation**

```bash
git add web/src/App.tsx web/src/pages/PutawayWizard.tsx web/src/pages/PutawayRunner.tsx web/src/__tests__/navCatalog.test.ts
git commit -m "refactor: make putaway screen canonical"
```

---

### Task 5: Deprecate direct movement routes and clean API clients

**Files:**
- Modify: `api/modules/putaway/handler.go`
- Modify: `api/modules/grn/handler.go`
- Modify: `web/src/services/api.ts`
- Modify: relevant backend route tests.

- [ ] **Step 1: Add failing legacy-route tests**

Verify ordinary operational requests cannot use direct movement routes and that the canonical session route remains available.

- [ ] **Step 2: Fail closed for direct movement**

Change `POST /putaway/` and `POST /grn/putaway` so they do not perform stock movement for ordinary callers. Return a clear migration response such as `410 Gone` or a structured `400` directing callers to the session workflow. Preserve any explicitly approved migration path only if a real external client requires it.

- [ ] **Step 3: Remove active frontend calls and obsolete client helpers**

Remove `putawayCreate` and `grnPutaway` only after searching confirms no active caller remains. Keep `grnCompletePutaway` only if it delegates safely to canonical completion; otherwise remove it from the client.

- [ ] **Step 4: Run route and client searches**

Run:

```bash
rg "putawayCreate|grnPutaway|post\('/putaway/'|/grn/putaway" web/src api
```

Expected: no active operational caller remains; only deprecation comments/tests may remain.

- [ ] **Step 5: Run build and tests**

Run: `npm run build` and `npm test`.

- [ ] **Step 6: Commit deprecation slice**

```bash
git add api/modules/putaway/handler.go api/modules/grn/handler.go web/src/services/api.ts api/modules/putaway/*_test.go
git commit -m "fix: close putaway movement bypass routes"
```

---

### Task 6: Final verification and operational review

**Files:**
- Modify: documentation only if implementation differs from the approved spec.

- [ ] **Step 1: Run static checks**

```bash
git diff --check
(cd web && npm run build)
```

- [ ] **Step 2: Run frontend tests**

```bash
(cd web && npm test)
```

Record the existing `jsdom/undici` worker failure separately if it persists; do not report the suite as fully clean while that error remains.

- [ ] **Step 3: Run backend tests if Go is available**

```bash
go test ./modules/putaway ./modules/grn ./modules/rbac -v
```

- [ ] **Step 4: Review route inventory**

Confirm:

- Two UI paths at most: canonical `/putaway` and audit `/putaway/logs`.
- `/putaway-runner` is redirect/compatibility only.
- Session workflow is the only active stock movement path.
- Rule CRUD is separate admin configuration.
- No direct route can bypass session controls.

- [ ] **Step 5: Perform manual RF acceptance checks**

Verify:

1. Item scan selects only a queue item.
2. Pick reserves the correct source quantity.
3. Destination must be physically scanned.
4. Wrong destination is rejected.
5. Wrong item re-scan is rejected.
6. Place is disabled before both scans.
7. Partial placement retains remaining quantity.
8. Duplicate submit does not double-move stock.
9. Normal operator cannot override location.
10. Completion fails with pending quantities.
11. Completion succeeds only after all placements.
12. Refresh/reconnect restores the active session.
13. RF skeleton and animations are unchanged.

- [ ] **Step 6: Update the design/spec status**

Document any deliberate deviations from the approved spec and list environment limitations.

- [ ] **Step 7: Final review**

Run a correctness/security/architecture review before claiming completion.
