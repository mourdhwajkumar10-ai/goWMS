# GRN Random Audit E2E Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the desk random-audit loop: resume, required physical qty, complete only when all items are checked, FAIL → exception, pass/fail summary.

**Architecture:** Pure helpers in `api/modules/grn/audit.go`; harden existing handlers in `verify.go` / `completion.go`; wire resume + gates in `GRNAudit.tsx`. No schema migration.

**Tech Stack:** Go 1.22, Fiber, pgx, React 18.

**Spec:** `docs/superpowers/specs/2026-08-30-grn-random-audit-e2e-design.md`

## Global Constraints

- Desk only (`/grn-audit`); no RF, PDF, add-part, or GRN Audit tab.
- Exception type: `audit_discrepancy`.
- One open audit per GRN.
- Exact qty match for PASS.

## Files

- Create: `api/modules/grn/audit.go`
- Create: `api/modules/grn/audit_test.go`
- Modify: `api/modules/grn/verify.go` (start/check/complete/list)
- Modify: `api/modules/grn/completion.go` (`listAllAudits`)
- Modify: `api/modules/grn/discrepancy.go` (`allowedGRNException`)
- Modify: `api/modules/grn/grn_test.go` (`TestAllowedGRNException`)
- Modify: `web/src/pages/GRNAudit.tsx`

---

### Task 1: Helpers + tests

**Files:** `api/modules/grn/audit.go`, `api/modules/grn/audit_test.go`

```go
func clampAuditSampleSize(n int) int
func sessionAuditable(status string) bool
func auditItemResult(systemQty, physicalQty float64) string
func auditReadyToComplete(itemCount, checked int) error
```

- [ ] Write tests in `audit_test.go`
- [ ] Implement helpers
- [ ] `go test ./api/modules/grn/ -count=1`

---

### Task 2: API handlers

- start: auditable session; resume open audit; no insert if zero SKUs
- check: required `*float64`; reject re-check / completed; FAIL → `writeException`
- complete: all items have result; return passed/failed
- list session + list all: `passed`, `failed`, `checked`

---

### Task 3: UI

- `useSearchParams` `session`
- Click recent row → select GRN + load
- Summary + Complete/Check gates
- Resume notify; FAIL mentions exception; link `/exceptions`

---

### Task 4: Verify

- `go test ./api/modules/grn/ -count=1`
- `npx tsc --noEmit` in `web/`
