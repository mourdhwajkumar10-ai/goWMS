# Spec: GRN Random Audit — End-to-End

**Date:** 2026-08-30
**Status:** Approved for implementation (user: define functionality and start implementing)
**Page:** `/grn-audit` (`web/src/pages/GRNAudit.tsx`)
**API:** `api/modules/grn/verify.go` + `completion.go` (`listAllAudits`)

## Objective

A supervisor can pick an open GRN, start a random sample count, enter physical qty for every sampled SKU, see PASS/FAIL, and only then complete the audit. FAILs become GRN exceptions. History rows resume the same audit.

**User:** warehouse manager / supervisor on desk.
**Success:** one operator can start → check all lines → complete without empty audits, phantom zeros, or completing unchecked samples.

## Assumptions

1. Desk `/grn-audit` is the only UI this round (no RF/floor audit, no GRN-page Audit tab).
2. FAIL opens `audit_discrepancy` exception; does **not** auto-create a follow-up receipt.
3. One **open** audit per GRN — Start again resumes it (does not spawn a second open audit).
4. Completed audits stay in history; a new Start after complete creates a new audit.
5. No PDF/report, no “add this part”, no notes field in UI (API may still accept notes).
6. No new tables — use `grn_audits` / `grn_audit_items` / `grn_exceptions`.

## Operator flow

```
Select GRN (receivable only)
  → Sample size 5 / 10 / 20 / Custom (1–100)
  → Start audit
      if open audit exists → resume it
      else sample random distinct SKUs from grn_lines
           (fallback: PO lines; if still empty → error, no row)
  → For each sample line: enter physical qty → Check
      empty qty → reject
      match → PASS
      mismatch → FAIL + exception + AUDIT_DISCREPANCY_FOUND
  → Complete audit (blocked until every sample item has a result)
  → Recent audits: click row to reopen that GRN’s audits
```

## API contract

| Endpoint | Change |
|---|---|
| `POST /grn/session/:id/audit/start` | Clamp sample 1–100 (default 5). Reject closed/completed GRN. Resume existing `status=open`. If no SKUs after line+PO fallback, **delete nothing / insert nothing** and return 400. Return `{ id, sample_size, items[], resumed }`. |
| `GET /grn/session/:id/audits` | Add `passed`, `failed` counts. Items include result/qty. |
| `POST /grn/audit-items/:id/check` | `physical_qty` required (`*float64`). Reject missing / NaN / already-checked / completed audit. PASS/FAIL via exact qty match. FAIL → `writeException(..., "audit_discrepancy", ...)`. |
| `POST /grn/session/:id/audit/:auditId/complete` | Require all items have `result`. Reject already completed. Return `{ id, status, sample_size, passed, failed }`. |
| `GET /grn/audits` | Add `checked`, `passed`, `failed`. |

Exception type `audit_discrepancy` is allowed in `allowedGRNException`. Fields: `part_no`, `expected_qty` = system, `scanned_qty` = physical, `variance` = physical − system.

## UI (`GRNAudit.tsx`)

- Keep current field chrome (40px controls, boxed GRN + Custom).
- `?session=<id>` selects that GRN and loads its audits.
- Clicking a Recent audits row selects that GRN and loads audits.
- Active audit card: `checked/sample · N pass · M fail`.
- Physical qty empty → Check disabled / error “Enter physical qty”.
- Complete disabled until `checked === items.length` and `items.length > 0`.
- Start on existing open audit: notify “Resumed open audit”.
- FAIL notify includes exception created.
- Link to `/exceptions` when any fail exists.

## Testing

- Unit: `clampAuditSampleSize`, `auditItemResult`, `auditReadyToComplete`, `sessionAuditable`.
- Allowed exception: `audit_discrepancy`.
- `go test ./api/modules/grn/ -count=1`

## Out of scope

RF audit, add-specific-part, PDF report, GRN workspace Audit tab, auto follow-up on FAIL, changing stock from audit counts.

## Success criteria

- Cannot complete with unchecked lines.
- Empty physical qty is not stored as 0.
- Empty GRN does not leave an orphan `grn_audits` row.
- FAIL is visible on Exceptions.
- Recent audits resume the same GRN.
- Pass/fail counts shown on the active card and recent table.
