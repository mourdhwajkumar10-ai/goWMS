# Feature 05 — QC Templates

**Spec References:** SPEC_02_INBOUND.md §5, SPEC.md §3.4
**Status:** PARTIAL (inspection + templates work; GRN auto-select by category still TODO)
**Priority:** MEDIUM

---

## Current Implementation

### Database
- `quality_inspections`: id, inspection_no, reference_type, reference_name, item_code, sample_size, batch_no, warehouse_id, location_id, qty, status, quality_inspection_template, inspected_by, inspected_at
- `quality_inspection_readings`: id, inspection_id, specification, value, status, notes, acceptance_formula, formula_based_criteria, min_value, max_value, parameter_group
- `qc_templates` (migration 010): id, name, category_id, sample_size, checklist JSONB, auto_approve, status

### Backend (`api/modules/qi/`)
- `POST /qi/` — create inspection
- `GET /qi/list` — list
- `GET /qi/:id` — get with readings
- `POST /qi/:id/reading` — add reading
- `POST /qi/:id/submit` — body `{ status: "accepted"|"rejected", reason? }`
  - accept → move HOLD → INCOMING
  - reject → move HOLD → DAMAGED
- `POST /qi/:id/accept` — alias for submit accepted
- `POST /qi/:id/reject` — alias for submit rejected
- `GET|POST /qi/templates`, `GET|PUT /qi/templates/:id`, `POST /qi/from-template`

### Frontend (`Qi.tsx`)
- Inspection list, create form, Accept/Reject buttons wired to `/submit`
- Template dropdown + create template

---

## Gaps

### 1. GRN auto-select template by item category
- When `requires_qi=true`, should auto-pick template from item category
- **Effort:** 0.5–1 day

### 2. No QC in Outbound Flow
- Optional; skip for v1 unless returns rate is high

---

## Doc corrections (was wrong)

| Old doc claim | Actual |
|---------------|--------|
| Reject button `onClick={() => {}}` | Fixed — calls `rejectInspection()` → `/qi/:id/submit` with `status: rejected` |
| No separate reject endpoint | Now also has `POST /qi/:id/reject` alias |
| Templates don't exist | Templates CRUD + from-template exist (migration 010) |

---

## Acceptance Criteria

- [x] Create inspection for item
- [x] Add readings (specification, value, pass/fail)
- [x] Accept: move stock HOLD → INCOMING
- [x] Reject: move stock HOLD → DAMAGED
- [x] Reject button works
- [x] Template CRUD (create, list, update)
- [x] Template checklist pre-populates readings (via from-template)
- [ ] GRN auto-selects template by item category (TODO)
