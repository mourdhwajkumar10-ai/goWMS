# Feature 11 — Dispatch

**Spec References:** SPEC_03_OUTBOUND.md §6-7
**Status:** PARTIAL (no DN auto-gen, no POD UI, no delivery date)
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

### Backend (api/modules/dispatch/handler.go — 329 lines)
- `POST /dispatch/` and `/dispatch/trip` — create trip
- `GET /dispatch/trips` — list
- `GET /dispatch/trip/:id` — get with stops + loaded boxes
- `POST /dispatch/trip/:id/load` — load box (consumes stock if not yet consumed)
- `POST /dispatch/trip/:id/start` — draft/scheduled → in_transit
- `POST /dispatch/trip/:id/complete` — in_transit → completed
- `POST /dispatch/signature` — capture signature (backend only)

### Frontend (Dispatch.tsx — 258 lines)
- Trip list, create trip, active trip with load box + stops table
- No signature capture UI
- No delivery note generation

---

## Gaps

### 1. No Delivery Note Auto-Generation
- `delivery_notes` table exists but nothing creates them
- SPEC_03 §7 defines DN auto-generated from trip
- **Plan:**
  1. On `POST /dispatch/trip/:id/complete`:
     - For each delivery_stop: create delivery_notes record
     - Link to SO, customer, items from loaded boxes
     - Auto-generate DN number: DN-YYYY-NNNNN
  2. Add `GET /delivery-notes` list endpoint (currently no handler)
  3. Add `GET /delivery-notes/:id` detail endpoint
  4. Add DeliveryNotes.tsx page (list + detail + print)
- **Files:** dispatch/handler.go, new delivery notes handler, DeliveryNotes.tsx
- **Effort:** 2-3 days

### 2. No POD (Proof of Delivery) UI
- Backend signature endpoint exists but no frontend
- Delivery signatures + photos tables exist
- **Plan:**
  1. Add signature capture component (canvas drawing or text input)
  2. Add photo capture (camera API)
  3. On trip complete, show delivery confirmation modal per stop:
     - Received by name + phone
     - Signature capture
     - Photo capture
     - Condition: OK / Partial / Damaged
  4. Call `POST /dispatch/signature` with captured data
- **Files:** Dispatch.tsx (or new DeliveryConfirmation.tsx), signature component
- **Effort:** 2-3 days

### 3. No Delivery Date/Route on Trip
- Trip only has vehicle + driver
- SPEC_03 §6.2 defines delivery_date, route
- **Plan:**
  1. Add `delivery_date`, `route` fields to create trip form
  2. Show delivery_date in trip list
- **Effort:** 0.5 day

### 4. No Trip Status Workflow
- Currently: draft → in_transit → completed (3 states)
- SPEC defines: created → loading → loaded → in_transit → delivered → completed
- **Impact:** Simplified flow works for small warehouses
- **Recommendation:** Keep current 3-state flow for v1

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
- [ ] Delivery note auto-generation on trip complete (TODO)
- [ ] POD capture UI (signature + photo) (TODO)
- [ ] Delivery date/route on trip (TODO)
- [ ] Delivery Notes list page (TODO)

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
