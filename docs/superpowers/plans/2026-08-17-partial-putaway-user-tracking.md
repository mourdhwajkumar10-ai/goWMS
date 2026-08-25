# Iterative Partial Putaway + User Tracking + Logs UI Plan

**Date:** 2026-08-17
**Status:** In Progress

---

## Overview

Implement iterative partial putaway (split across bins), location user tracking, override capacity button, and putaway logs UI.

---

## Task 1: Migration 034 — used_location_ids

**File:** `migrations/034_used_locations.sql`

```sql
-- Add used_location_ids to track bins used during iterative putaway
ALTER TABLE putaway_session_items
    ADD COLUMN IF NOT EXISTS used_location_ids integer[] DEFAULT '{}';

COMMENT ON COLUMN putaway_session_items.used_location_ids
    IS 'Location IDs already used for this session item (for iterative putaway exclusion)';
```

---

## Task 2: Migration 035 — User Tracking + Logs

**File:** `migrations/035_location_user_tracking.sql`

```sql
-- Add picked_by_user_id to session items
ALTER TABLE putaway_session_items
    ADD COLUMN IF NOT EXISTS picked_by_user_id integer REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_psi_picked_by 
    ON putaway_session_items (picked_by_user_id);

-- Add source_location_id to putaway_logs
ALTER TABLE putaway_logs
    ADD COLUMN IF NOT EXISTS source_location_id integer REFERENCES warehouse_locations(id);

CREATE INDEX IF NOT EXISTS idx_pl_source_loc ON putaway_logs (source_location_id);

-- Add last_picked_by_user_id to locations
ALTER TABLE warehouse_locations
    ADD COLUMN IF NOT EXISTS last_picked_by_user_id integer REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS last_picked_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_wl_last_picker 
    ON warehouse_locations (last_picked_by_user_id) 
    WHERE last_picked_by_user_id IS NOT NULL;
```

---

## Task 3: Backend — Suggest Endpoint Rewrite

**File:** `api/modules/putaway/handler.go`

**Changes:**
1. Remove hard `fits` filter (line ~190)
2. Compute `max_fit_qty = LEAST(free_capacity, requested_qty)`
3. Add `requires_split` flag when no single bin fits remaining
4. Add proximity ORDER BY:
   ```sql
   ORDER BY
     CASE WHEN wl.aisle = $pref_aisle AND wl.shelf = $pref_bay 
          AND wl.level::int BETWEEN $pref_level-1 AND $pref_level+1 THEN 0 ELSE 1 END,
     CASE WHEN wl.aisle = $pref_aisle AND wl.shelf = $pref_bay THEN 0 ELSE 1 END,
     CASE WHEN wl.aisle = $pref_aisle THEN 0 ELSE 1 END,
     COALESCE(wl.putaway_priority, 5) ASC,
     wl.code ASC
   ```
5. Accept `placed_qty` and `exclude_location_ids` params
6. Add new response fields: `max_fit_qty`, `requires_split`, `remaining_after_fit`

---

## Task 4: Backend — FindBestLocation Update

**File:** `api/modules/putaway/suggest.go`

**Changes:**
- Remove hard capacity check
- Return `max_fit_qty` and `requires_split` for auto-putaway job
- Update `OnIncomingStock` callback to handle partial capacity

---

## Task 5: Backend — Session Handler Updates

**File:** `api/modules/putaway/session_handler.go`

**pickSessionItem:**
- Set `picked_by_user_id` on insert
- Update `last_picked_by_user_id` on source location

**placeSessionItem:**
- Append `target_location_id` to `used_location_ids`
- Update `source_location_id` on putaway_logs
- Set `last_picked_by_user_id` on target location

**cancelSession:**
- Mark session cancelled (keep items for resume)
- Do NOT delete session items

---

## Task 6: Backend — Logs Endpoint

**File:** `api/modules/putaway/handler.go`

**New endpoint:** `GET /putaway/logs`

**Query params:** user_id, item_code, date_from, date_to, exception_type, page, limit

**Response:**
```json
{
  "data": [{
    "log_no": "PA-2026-00001",
    "item_code": "ABC-123",
    "quantity": 50,
    "source_location_code": "INCOMING-01",
    "target_location_code": "A-01-02-M",
    "placed_by": "admin",
    "placed_at": "2026-08-17T10:00:00Z",
    "exception_reason": null,
    "is_override": false
  }],
  "pagination": { "page": 1, "limit": 50, "total": 100, "total_pages": 2 }
}
```

---

## Task 7: Frontend — PutawayWizard Auto-Advance + Split

**File:** `web/src/pages/PutawayWizard.tsx`

**Changes:**
- Add `remainingQty`, `usedLocationIds[]` state
- Show `max_fit_qty` badge and "Split required" indicator
- Qty input pre-filled with `max_fit_qty`
- Auto-advance after placement:
  ```typescript
  if (newRemaining > 0) {
    const r = await api.putawaySuggest(itemCode, newRemaining, warehouseId, {
      exclude_location_ids: [...usedLocationIds, suggestion.location_id].join(','),
      placed_qty: originalQty - newRemaining
    })
    setSuggestion(r.data)
  }
  ```
- Add "Override capacity (place all X)" button in exception panel

---

## Task 8: Frontend — PutawayLogs Page

**File:** `web/src/pages/PutawayLogs.tsx` (new)

**Features:**
- Filters: User (dropdown), Item Code (search), Date Range, Exception Type
- Table: Log#, Item, Qty, From (location_1), To (location_2), User, Time, Exception
- Pagination
- Row click → detail modal

---

## Task 9: Frontend — Location Badges + Cancel

**File:** `web/src/pages/PutawayWizard.tsx`

**Changes:**
- Show "Last picked by {username}" badge on locations
- Cancel session handling (items preserved for resume)

---

## Task 10: Frontend — CSS + Routes

**Files:** `web/src/styles/putaway-wizard.css`, `web/src/App.tsx`, `web/src/components/Layout.tsx`

**Changes:**
- CSS: Split badge, remaining qty progress bar, override button styles
- App.tsx: Route `/putaway/logs` → `PutawayLogs`
- Layout: Nav link "Putaway Logs"

---

## Task 11: Build + Integration Tests

- Run `go build ./...` and `cd web && npm run build`
- Run `cd web && npx vitest run`
- Manual E2E verification

---

## Success Criteria

- [ ] 100 pcs → splits across 2 bins automatically
- [ ] UI auto-advances to next bin
- [ ] Override capacity button works
- [ ] Location tracking with picked_by_user_id
- [ ] Logs UI with filters and location_1/location_2
- [ ] Session cancel preserves items for resume
- [ ] Build + tests pass