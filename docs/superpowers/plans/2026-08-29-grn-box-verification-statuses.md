# GRN Box Verification Statuses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GRN box progress explicit and prevent duplicate verification by using `received → box_verified → item_verified`, with `exception` and `rejected` outcomes and session-level `completed`.

**Architecture:** `grn_cartons.status` remains the authoritative per-box state. Receiving changes a box to `received`; opening it for item verification changes it atomically to `box_verified`; successful item completion changes it to `item_verified`; discrepancies move it to `exception`, and explicit rejection uses `rejected`. The GRN session remains responsible for overall completion and becomes `completed` only after all applicable boxes reach a terminal acceptable state and existing finalization rules pass.

**Tech Stack:** Go, Fiber, PostgreSQL migrations, React/TypeScript, existing GRN event and exception logging.

**Spec:** Approved conversation design: `received → box_verified → item_verified`; session `completed`; box/session `rejected` or `exception` for failure paths.

## Global Constraints

- Preserve legacy statuses needed by existing receiving and migration flows (`pending`, `expected`, `accounted`, `unmatched`, `excess`, `missing`, `verified`) during compatibility rollout.
- Do not rely on frontend state to prevent duplicate scans; enforce transitions in PostgreSQL-backed handlers.
- Keep existing GRN event logging and exception audit behavior.
- Do not change stock posting semantics until verification state is complete.
- Use existing Go and frontend test conventions; no new dependencies.

---

### Task 1: Add status-transition helpers and migration coverage

**Files:**
- Create: `migrations/041_grn_box_verification_statuses.sql`
- Modify: `api/modules/grn/workflow.go` or the smallest existing GRN status helper file
- Test: `api/modules/grn/grn_test.go` or a focused new `api/modules/grn/status_test.go` following repository conventions

**Interfaces:**
- Produces a single canonical set of box statuses: `received`, `box_verified`, `item_verified`, `completed`, `rejected`, `exception`, while retaining legacy statuses required by existing code.
- Produces transition predicates/helpers that reject invalid transitions rather than silently overwriting state.

- [ ] **Step 1: Write failing unit tests**

Add table-driven tests for the transition contract:

```go
func TestBoxVerificationTransition(t *testing.T) {
    cases := []struct {
        from, action, want string
        allowed bool
    }{
        {"received", "open", "box_verified", true},
        {"box_verified", "item_complete", "item_verified", true},
        {"item_verified", "open", "", false},
        {"exception", "open", "", false},
        {"rejected", "open", "", false},
    }
    for _, tc := range cases {
        got, ok := nextBoxVerificationStatus(tc.from, tc.action)
        if ok != tc.allowed || got != tc.want {
            t.Fatalf("nextBoxVerificationStatus(%q, %q) = %q, %v; want %q, %v", tc.from, tc.action, got, ok, tc.want, tc.allowed)
        }
    }
}
```

- [ ] **Step 2: Run the focused test and verify it fails because the helper is absent.**

Run: `go test ./api/modules/grn -run TestBoxVerificationTransition -count=1`

Expected: compile failure identifying the missing helper.

- [ ] **Step 3: Implement the minimal transition helper.**

Implement `nextBoxVerificationStatus(from, action string) (string, bool)` with explicit cases for `received/open`, `box_verified/item_complete`, and terminal/error states. Normalize input with `strings.ToLower(strings.TrimSpace(...))`; do not make unknown transitions permissive.

- [ ] **Step 4: Add the idempotent migration.**

Drop and recreate `grn_cartons_status_check` with the approved statuses plus existing compatibility statuses. Add `rejected` and `box_verified`/`item_verified`; retain `verified` temporarily so old rows and old routes can be migrated safely. Add a comment documenting that new writes must use `item_verified`, while `verified` is legacy.

- [ ] **Step 5: Run the focused test and migration/static checks.**

Run: `go test ./api/modules/grn -run TestBoxVerificationTransition -count=1`

Expected: PASS.

### Task 2: Enforce transitions in the box verification backend

**Files:**
- Modify: `api/modules/grn/verify.go`
- Test: `api/modules/grn/status_test.go` and existing GRN integration tests where database fixtures are available

**Interfaces:**
- `POST /grn/session/:id/open-box` accepts only `received` boxes for a new verification start, resumes `box_verified` if an interrupted verification is explicitly supported, and rejects `item_verified`, `completed`, `rejected`, and `exception` with a conflict response.
- Successful opening atomically updates the carton from `received` to `box_verified` and sets the session active carton.

- [ ] **Step 1: Write failing tests for duplicate and transition behavior.**

Cover these cases: opening `received` returns `box_verified`; opening `item_verified` returns HTTP 409 and does not set `active_verify_carton_id`; opening `exception`/`rejected` returns HTTP 409; repeated requests cannot reopen an item-verified box.

- [ ] **Step 2: Run the tests and verify they fail against the current `ok: true, already_verified: true` behavior.**

Run: `go test ./api/modules/grn -run 'Test.*Box.*(Open|Duplicate|Transition)' -count=1`

Expected: FAIL because the current handler returns success for already verified boxes and does not update the carton on open.

- [ ] **Step 3: Implement an atomic database transition.**

Within a transaction, select the carton for the session using `FOR UPDATE`, validate its current status, then execute:

```sql
UPDATE grn_cartons
SET status = 'box_verified'
WHERE id = $1 AND grn_session_id = $2 AND status = 'received'
RETURNING carton_no;
```

If no row is returned, re-read the status and return a conflict explaining that the box is already verified or requires review. Update `active_verify_carton_id` in the same transaction. Preserve event logging for `BOX_OPENED_FOR_VERIFY`.

- [ ] **Step 4: Change successful auto-close to `item_verified`.**

In `tryAutoCloseBox`, replace the new-state write from `verified` to `item_verified`, while retaining legacy-read compatibility. Ensure the active carton is cleared only after the state update succeeds.

- [ ] **Step 5: Route discrepancies consistently.**

When wrong item, excess, shortage, damage, or mixed-item handling occurs, transition any non-terminal carton to `exception`. Do not overwrite `item_verified` or `rejected`. Keep existing exception and event records.

- [ ] **Step 6: Run focused and package tests.**

Run: `go test ./api/modules/grn -run 'Test.*Box.*(Open|Duplicate|Transition)' -count=1` and `go test ./api/modules/grn -count=1`.

Expected: PASS.

### Task 3: Update receiving and session progress aggregation

**Files:**
- Modify: `api/modules/grn/handler.go`
- Modify: relevant GRN list/detail/progress handlers identified by tests or search
- Test: existing GRN handler/integration tests, plus focused aggregation tests if the package supports them

**Interfaces:**
- Receiving still writes `received` for the first physical scan.
- Duplicate receiving scans remain explicitly reported and cannot reset `box_verified`, `item_verified`, `exception`, or `rejected` back to `received`.
- Counts expose total, received, box-verified, item-verified, completed, rejected, and exception boxes for large batches.

- [ ] **Step 1: Write failing tests for progress counts and duplicate receiving behavior.**

Assert that a session with 500 cartons reports separate counts for each state and that a duplicate scan never downgrades a verified carton.

- [ ] **Step 2: Run tests and verify current aggregation conflates `received` and `verified`.**

Run: `go test ./api/modules/grn -run 'Test.*(Progress|Carton|Duplicate)' -count=1`.

Expected: FAIL or expose the old combined count behavior.

- [ ] **Step 3: Update SQL aggregates.**

Replace combined expressions such as `status IN ('verified','received')` with separate filtered counts. Treat legacy `verified` as item-verified only for read compatibility. Use indexed `grn_session_id` filtering and avoid loading all 500 boxes into application memory for summary counts.

- [ ] **Step 4: Preserve duplicate response semantics.**

Return `duplicate: true` and the persisted status for a repeated receive scan, but do not mutate the carton. Log `BOX_DUPLICATE_SCANNED` and the existing duplicate exception behavior according to current policy.

- [ ] **Step 5: Run package tests.**

Run: `go test ./api/modules/grn -count=1`.

Expected: PASS.

### Task 4: Update frontend status presentation and duplicate handling

**Files:**
- Modify: `web/src/pages/ItemVerifier.tsx`
- Modify: the existing receiving/progress page components that render carton status, located by searching for `status === 'verified'` and box-count labels
- Test: existing web test conventions, or add focused component tests only if a test runner is already configured

**Interfaces:**
- The UI displays `received`, `box_verified`, `item_verified`, `completed`, `exception`, and `rejected` distinctly.
- Duplicate/open conflicts show a warning and leave the current active box unchanged.
- Progress displays counts suitable for 500-box sessions.

- [ ] **Step 1: Write a failing UI test or an isolated status-label test using the existing configured runner.**

Verify that `item_verified` is rendered as “Item verified” and that a duplicate open response does not set `activeBox`.

- [ ] **Step 2: Run the focused test and verify the old label/behavior fails.**

Use the repository’s existing web test command discovered from `web/package.json`.

- [ ] **Step 3: Update response handling.**

In `ItemVerifier.tsx`, treat non-OK/conflict responses and `already_scanned`/duplicate responses as warnings, not successful opens. Refresh the active-box state only after a valid `box_verified` response. Do not rely on `cameraKey` or scanner restart to enforce uniqueness.

- [ ] **Step 4: Update status labels and progress rendering.**

Use existing badge/status components and conventions. Add explicit labels for the new states and show aggregate counts from the backend instead of deriving progress only from the visible list.

- [ ] **Step 5: Run web typecheck/build and focused tests.**

Run the project’s existing commands from `web/package.json`, such as `npm run typecheck` or `npm run build`, and the relevant test command.

Expected: PASS.

### Task 5: Define and verify session completion

**Files:**
- Modify: `api/modules/grn/completion.go` and/or the existing GRN workflow finalization file
- Modify: `api/modules/grn/workflow.go` if canonical session status mapping is required
- Test: GRN completion tests

**Interfaces:**
- A session can become `completed` only when all applicable cartons are `item_verified` or an explicitly approved terminal outcome is handled by existing business rules.
- Open `exception` or `rejected` cartons prevent silent completion unless the existing supervisor-resolution flow explicitly resolves them.

- [ ] **Step 1: Write failing completion tests.**

Cover: all item-verified boxes permit completion; any open received/box-verified box blocks completion; an exception/rejected box blocks completion and reports counts; legacy `verified` rows remain readable during migration.

- [ ] **Step 2: Run tests and verify current completion is not based on the new states.**

Run: `go test ./api/modules/grn -run 'Test.*(Complete|Finalize|SessionStatus)' -count=1`.

Expected: FAIL for the new status cases.

- [ ] **Step 3: Implement guarded completion.**

Use one aggregate query with filtered counts, lock or claim the session transition, reject incomplete sessions, and set `grn_sessions.status='completed'` only after the existing stock/QI/finalization prerequisites pass.

- [ ] **Step 4: Run all GRN tests and the repository verification commands.**

Run: `go test ./api/modules/grn -count=1`, the project’s backend test command, and the web typecheck/build command.

Expected: PASS with no new warnings.

- [ ] **Step 5: Review for compatibility and document rollout notes.**

Verify legacy `verified` rows are handled consistently, no query still treats `received` as completed, and no frontend path assumes `verified` is the only successful state.
