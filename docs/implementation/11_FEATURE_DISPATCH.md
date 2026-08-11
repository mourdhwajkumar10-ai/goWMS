# Feature 11 — Dispatch

**Spec References:** SPEC_03_OUTBOUND.md §6-7
**Status:** PARTIAL (DN auto-gen on complete done; POD canvas + delivery date TODO)
**Priority:** MEDIUM

---

## Current Implementation

### Database
- `delivery_trips`: id, trip_no, vehicle_no, driver_name, status (draft/in_transit/completed), departure_time
- `box_load_logs`: trip_id, box_id, loaded_at
- `delivery_stops`: trip_id, delivery_note_no, customer, address, stop_order, visited, visited_time
- `delivery_notes`: id, dn_no, so_id, customer_name, delivery_address, status
- `delivery_signatures`: stop_id, order_no, signature_data
- `delivery_photos`: stop_id, photo_url

### Backend (api/modules/dispatch/handler.go)
- `POST /dispatch/` and `/dispatch/trip` — create trip
- `GET /dispatch/trips` — list
- `GET /dispatch/trip/:id` — get with stops + loaded boxes
- `POST /dispatch/trip/:id/load` — load box (consumes stock if not yet consumed)
- `POST /dispatch/trip/:id/start` — draft/scheduled → in_transit
- `POST /dispatch/trip/:id/complete` — in_transit → completed **and auto-generates delivery notes**
- `POST /dispatch/trip/:id/complete-gated` — same, but requires all stops visited
- `POST /dispatch/trip/:id/generate-dn` — manual DN create (still available)
- `POST /dispatch/signature` — capture signature (backend only)
- `POST /dispatch/trip/:id/stop/:stopId/visit` — mark stop visited + optional POD

### Frontend (Dispatch.tsx)
- Trip list, create trip, active trip with load box + stops table
- Manual "Generate DN + Stop" + POD visit
- Complete shows created DN numbers in toast

---

## Gaps

### 1. Delivery Note Auto-Generation — DONE
- On `POST /dispatch/trip/:id/complete` (and gated):
  - For each stop missing `delivery_note_no` → create `delivery_notes` + items from loaded boxes
  - If no stops but boxes loaded → create one trip-level DN
- Manual `generate-dn` still available for pre-complete DN creation

### 2. No POD (Proof of Delivery) UI polish
- Backend signature + visit endpoints exist; Dispatch has basic POD text capture
- Full canvas signature + photo still TODO
- **Effort:** 1–2 days

### 3. No Delivery Date/Route on Trip
- Trip only has vehicle + driver
- SPEC_03 §6.2 defines delivery_date, route
- **Effort:** 0.5 day

### 4. No Trip Status Workflow
- Currently: draft → in_transit → completed (3 states)
- SPEC defines: created → loading → loaded → in_transit → delivered → completed
- **Recommendation:** Keep current 3-state flow for v1

---

## Doc corrections (was wrong)

| Old doc claim | Actual |
|---------------|--------|
| Nothing creates delivery notes | `generate-dn` existed; complete now auto-generates |
| DN only on complete (planned) | Also explicit `POST .../generate-dn` |
---

## Conflict Analysis

| Feature | Conflict | Resolution |
|---------|----------|------------|
| 10 Packing | Loads packed boxes | Boxes must be packed first |
| 13 Returns | Returns reference DN | DN must exist before returns |
| 14 Analytics | Trip metrics | Read-only, no conflict |

---

## Acceptance Criteria

- [x] Create trip with vehicle + driver
- [x] Load boxes onto trip
- [x] Start trip (→ in_transit)
- [x] Complete trip (→ completed)
- [x] Signature capture (backend)
- [x] Delivery note auto-generation on trip complete
- [ ] POD capture UI (signature canvas + photo) (TODO)
- [ ] Delivery date/route on trip (TODO)
- [ ] Delivery Notes detail/print page polish (TODO — list exists via masterdata)

---

## Implementation Plan

### Phase 1 — Delivery Notes (2 days)
1. Auto-generate DN on trip complete
2. Create delivery notes handler (list, get, print)
3. Create DeliveryNotes.tsx page
4. Add route + sidebar nav

### Phase 2 — POD UI (2-3 days)
1. Create signature capture component (HTML canvas)
2. Add photo capture (navigator.mediaDevices)
3. Delivery confirmation modal per stop
4. Wire to dispatch/signature endpoint

### Phase 3 — Trip Enhancements (0.5 day)
1. Add delivery_date + route fields to trip form
2. Show in trip list and detail
