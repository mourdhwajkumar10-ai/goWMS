# Feature 05 — QC Templates

**Spec References:** SPEC_02_INBOUND.md §5, SPEC.md §3.4
**Status:** PARTIAL (inspection works, templates don't)
**Priority:** MEDIUM

---

## Current Implementation

### Database
- `quality_inspections`: id, inspection_no, reference_type, reference_name, item_code, sample_size, batch_no, warehouse_id, location_id, qty, status, quality_inspection_template (UNUSED), inspected_by, inspected_at
- `quality_inspection_readings`: id, inspection_id, specification, value, status, notes, acceptance_formula, formula_based_criteria, min_value, max_value, parameter_group

### Backend (api/modules/qi/handler.go — 273 lines)
- `POST /qi/` — create inspection
- `GET /qi/list` — list
- `GET /qi/:id` — get with readings
- `POST /qi/:id/reading` — add reading (specification, value, status)
- `POST /qi/:id/submit` — accept (move HOLD → INCOMING) or reject (move HOLD → DAMAGED)

### Frontend (Qi.tsx — 224 lines)
- Inspection list, create form, active inspection with Accept/Reject buttons
- **BUG:** Reject button onClick is `() => {}` — does nothing

---

## Gaps

### 1. No QC Template Definitions
- SPEC_02 §5.1-5.2 defines configurable templates per item/category
- `quality_inspection_template` column on inspections is unused
- `acceptance_formula`, `min_value`, `max_value` on readings are unused
- No template CRUD handler or UI
- **Plan:**
  1. Create `qc_templates` table:
     - id, name, category_id (FK to item_groups), sample_size, checklist (JSONB), auto_approve, status
  2. Create `api/modules/qi/templates.go`:
     - `GET /qi/templates` — list
     - `POST /qi/templates` — create
     - `PUT /qi/templates/:id` — update
  3. Update Qi.tsx: when creating inspection, show template dropdown (filtered by item category)
  4. When template selected, pre-populate readings from checklist
  5. Wire to GRN: when requires_qi=true, auto-select template based on item category
- **Files:** Migration, new handler, Qi.tsx, grn/handler.go
- **Effort:** 2-3 days

### 2. Reject Button Bug
- Qi.tsx line 206: Reject button onClick is `() => {}` instead of calling rejectInspection
- **Plan:** Fix onClick to call `rejectInspection(inspection.id)`
- **Effort:** 5 minutes

### 3. No QC in Outbound Flow
- SPEC_03 doesn't define outbound QC, but goWMS_Outbound_Analysis.md suggests optional QC between packing and dispatch
- **Impact:** Low — skip for v1
- **Recommendation:** Add only if returns rate is high

---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 04 GRN | requires_qi creates generic QI records | Wire template selection to GRN auto-QI |
| 13 Returns | Returns may need QC | Template system supports this naturally |
| 02 Item Master | Templates linked to item category | Uses item_groups FK |

---

## Acceptance Criteria

- [x] Create inspection for item
- [x] Add readings (specification, value, pass/fail)
- [x] Accept: move stock HOLD → INCOMING
- [x] Reject: move stock HOLD → DAMAGED
- [ ] Template CRUD (create, list, update) (TODO)
- [ ] Template checklist pre-populates readings (TODO)
- [ ] GRN auto-selects template by item category (TODO)
- [ ] Reject button works (BUG FIX)

---

## Implementation Plan

### Phase 1 — Bug Fix (5 min)
1. Fix Qi.tsx line 206: change `() => {}` to `() => rejectInspection(inspection.id)`

### Phase 2 — Template System (2-3 days)
1. Migration: create qc_templates table
2. Create template handler (CRUD)
3. Update Qi.tsx: template dropdown on create, pre-populate readings
4. Update grn/handler.go: auto-select template when creating QI from GRN
5. Add template management to Settings or as separate page
