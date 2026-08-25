# Putaway Rules with Velocity Tiers + UI Redesign

**Date:** 2026-08-16
**Status:** Approved
**Scope:** Putaway rules engine, velocity-based placement, guided putaway UI
**Related:** `PUTAWAY_STRATEGY_50K_SKUS.md` (HSN zone foundation)

---

## 1. Problem Statement

- 21,096+ spare parts SKUs, no item dimensions (L×W×H)
- All storage bins are identical size (40×30×20 cm)
- Items arrive at staging (INCOMING-01) and need to be put away into storage
- Current putaway UI is a flat form — no guided workflow, no batch mode
- Need velocity-based placement (fast items near dispatch, slow items on upper shelves)
- Need ergonomic shelf assignment (fast items at chest height, not top shelves)
- Must support partial allocation (sell 5 from a bin of 10) in future order allocation phase

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Velocity tier source | Manual column on `items` table | No historical sales data; team sets tier when creating/editing items |
| Velocity × zone interaction | HSN zones primary, velocity sub-sort within zone | Keeps product families together; fast oils go near dispatch within Zone A |
| Ergonomic shelf mapping | Fast→middle, Medium→lower, Slow→upper | Middle shelves are golden zone (chest height, no bending/reaching) |
| Putaway routing | Reuse existing `putaway_priority` on `warehouse_locations` | Smallest diff; no new tables for routing |
| Tote workflow | Optional session tracking, not a location type | Simpler than managing tote locations; worker physically carries items |
| Capacity estimation | Pack qty × estimated piece volume | No item dimensions; empirical fallback via putaway exceptions |
| Partial allocation | Already supported by `stock_location_balances` | `available_qty = actual_qty - reserved_qty` enables partial picks |

---

## 3. Item Master Changes

### 3.1 Add velocity_tier Column

```sql
ALTER TABLE items ADD COLUMN velocity_tier VARCHAR(10) DEFAULT 'medium';
-- Values: 'fast', 'medium', 'slow'
```

### 3.2 UI: Item Form Dropdown

On the item create/edit form, add a dropdown:

```
Velocity Tier: [ Fast ▾ ]
               Fast   — High-demand, place near dispatch
               Medium — Normal demand, standard placement
               Slow   — Low-demand, upper shelves / far aisles
```

### 3.3 Bulk Update via Import

Add `velocity_tier` to the item import template so the team can bulk-classify existing SKUs from the Excel sheet.

---

## 4. Ergonomic Shelf Mapping

| Velocity | Shelf Band | Level Values | Ergonomic Zone | Putaway Priority Range |
|----------|-----------|--------------|----------------|------------------------|
| **Fast** | Middle | `middle`, `3`, `4` | Golden zone — no bending, no reaching | 1-3 |
| **Medium** | Lower | `lower`, `1`, `2` | Slight bend OK | 4-6 |
| **Slow** | Upper | `upper`, `5`, `6`, `7+` | Requires reaching/ladder | 7-10 |

### 4.1 Existing Level Values

From migration 013, levels are normalized to: `lower`, `middle`, `upper`. Numeric levels (`1`-`7`) are also supported. The putaway query maps velocity tiers to these level values.

---

## 5. Putaway Algorithm

### 5.1 Updated Suggestion Flow

```
Item arrives at staging
        │
        ▼
┌─────────────────────────┐
│ 1. Get item properties  │
│    - HSN code           │
│    - velocity_tier      │
│    - pack_qty           │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 2. Determine HSN zone   │
│    - Zone A-G mapping   │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 3. Map velocity → shelf │
│    fast  → middle       │
│    medium → lower       │
│    slow  → upper        │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 4. Find best bin        │
│    Filter:              │
│    - Same HSN zone      │
│    - Correct shelf band │
│    - Same item? → add   │
│    - Empty? → new bin   │
│    - Has capacity?      │
└─────────────────────────┘
        │
   ┌────┴────┐
   │         │
  YES        NO
   │         │
   ▼         ▼
Add to     Fallback:
existing   - Any empty in zone
bin        - Any empty anywhere
   │
   ▼
┌─────────────────────────┐
│ 5. Validate capacity    │
│    - current_qty + new  │
│    - max_qty_per_bin    │
│    - Reject if over     │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ 6. Execute putaway      │
│    - Update stock       │
│    - Log movement       │
└─────────────────────────┘
```

### 5.2 Priority Order

1. **Home bin** (if bin_controlled mode) — only if in correct shelf band
2. **Consolidate same item** — same item already in a bin with capacity, in correct shelf band
3. **Empty bin in zone + correct shelf band** — dedicated bay preferred
4. **Empty bin in zone** — any shelf (fallback)
5. **Any empty bin anywhere** — last resort

Each step filters by the velocity→shelf mapping before falling through.

---

## 6. Database Schema Changes

### 6.1 Migration: velocity_tier on items

```sql
-- 032: Add velocity tier for putaway placement
ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS velocity_tier character varying(10) DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'items_velocity_tier_check'
      AND conrelid = 'public.items'::regclass
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_velocity_tier_check
      CHECK (
        velocity_tier IS NULL OR velocity_tier IN ('fast', 'medium', 'slow')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_velocity_tier
    ON public.items (velocity_tier)
    WHERE velocity_tier IS NOT NULL;

COMMENT ON COLUMN public.items.velocity_tier IS
  'Putaway placement tier: fast=golden zone, medium=lower shelves, slow=upper shelves.';
```

### 6.2 Migration: putaway sessions (tote workflow)

```sql
-- 032b: Putaway sessions for batch tote workflow
CREATE TABLE IF NOT EXISTS public.putaway_sessions (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id integer NOT NULL,
    warehouse_id integer NOT NULL,
    zone character varying(10),
    status character varying(20) DEFAULT 'picking' NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);

COMMENT ON TABLE public.putaway_sessions IS
  'Batch putaway session: worker picks items into tote, then distributes to storage.';

CREATE TABLE IF NOT EXISTS public.putaway_session_items (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    session_id integer NOT NULL REFERENCES public.putaway_sessions(id),
    item_code character varying(100) NOT NULL,
    source_location_id integer NOT NULL REFERENCES public.warehouse_locations(id),
    qty numeric(18,6) NOT NULL,
    status character varying(20) DEFAULT 'picked' NOT NULL,
    target_location_id integer REFERENCES public.warehouse_locations(id),
    putaway_log_id integer,
    created_at timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE public.putaway_session_items IS
  'Items picked into tote during a putaway session, awaiting placement into storage.';

CREATE INDEX IF NOT EXISTS idx_psi_session
    ON public.putaway_session_items (session_id, status);

CREATE INDEX IF NOT EXISTS idx_ps_user
    ON public.putaway_sessions (user_id, status);
```

### 6.3 Migration: session timeout job

```sql
-- 032c: Session timeout tracking
ALTER TABLE public.putaway_sessions
    ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Function to cancel stale sessions
CREATE OR REPLACE FUNCTION cancel_stale_putaway_sessions()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.putaway_sessions
    SET status = 'cancelled', completed_at = now()
    WHERE status = 'picking'
      AND updated_at < now() - interval '2 hours';
END $$;
```

---

## 7. Go Backend Changes

### 7.1 Velocity Shelf Mapping

```go
func velocityShelfBand(velocityTier string) string {
    switch velocityTier {
    case "fast":
        return "middle"
    case "slow":
        return "upper"
    default: // "medium" or ""
        return "lower"
    }
}

func shelfBandFilter(band string) string {
    switch band {
    case "middle":
        return ` AND (
            lower(wl.level) IN ('middle', 'mid', 'm')
            OR (wl.level ~ '^[0-9]+$' AND wl.level::int BETWEEN 3 AND 4)
        )`
    case "lower":
        return ` AND (
            lower(wl.level) IN ('lower', 'low', 'l', 'bottom')
            OR (wl.level ~ '^[0-9]+$' AND wl.level::int BETWEEN 1 AND 2)
        )`
    case "upper":
        return ` AND (
            lower(wl.level) IN ('upper', 'up', 'u', 'high', 'top')
            OR (wl.level ~ '^[0-9]+$' AND wl.level::int >= 5)
        )`
    default:
        return ""
    }
}
```

### 7.2 Updated Suggest Handler

Modify `suggest()` in `api/modules/putaway/handler.go`:

1. After resolving zone, get `velocity_tier` from items table
2. Add `shelfBandFilter(velocityTier)` to the SQL query
3. If no bin found in correct shelf band, retry without shelf filter (fallback)

### 7.3 Putaway Session Endpoints

```
POST   /putaway/sessions           — Create session (user picks zone)
POST   /putaway/sessions/:id/pick  — Scan item into session (mark as picked)
GET    /putaway/sessions/:id       — Get session status + next item to place
POST   /putaway/sessions/:id/place — Confirm placement of item at location
DELETE /putaway/sessions/:id/items/:itemId — Remove item from tote
DELETE /putaway/sessions/:id       — Cancel session
```

### 7.4 Auto-Suggest Alternative Bin

When placement fails (bin full/too small), handler calls `suggest()` excluding the failed bin and returns new suggestion.

### 7.5 Fit Exception Integration

Use existing `POST /putaway/fit-exception` endpoint for partial qty placement + override.

---

## 8. React Frontend Changes

### 8.1 New Page: PutawayWizard

Replace current `Putaway.tsx` with a wizard-style component:

**State machine:**
```
IDLE → SELECT_MODE → (BY_ZONE: SELECT_ZONE → PICK_ITEMS → PUTAWAY)
                    → (BY_ITEM: PICK_ITEMS → PUTAWAY)
PUTAWAY → FIT_EXCEPTION → PUTAWAY (loop)
PUTAWAY → COMPLETE → (BY_ZONE: PICK_ITEMS) or (BY_ITEM: SELECT_MODE)
```

### 8.2 Screens

| Screen | Component | Description |
|--------|-----------|-------------|
| Mode Selection | `PutawayModeSelect` | Two big buttons: By Zone / By Item |
| Zone Selection | `PutawayZoneSelect` | List zones with item counts |
| Item Picking | `PutawayItemPick` | Scan items from staging into tote, **remove button per item** |
| Putaway Action | `PutawayAction` | Barcode scanner, validates location, confirms placement |
| Fit Exception | `PutawayFitException` | Real API call, handles partial qty + override + auto-suggest alt bin |
| Complete | `PutawayComplete` | Summary, "Next Item" or "Done" |

### 8.3 Professional UI Requirements

| Requirement | Implementation |
|-------------|----------------|
| Design system | 8px spacing grid, typography scale, color tokens, elevation |
| Scanner UX | Camera overlay with torch, haptic feedback, scan sound, error toast |
| Loading states | Skeleton screens, optimistic updates, retry buttons |
| Empty/error states | Illustrated, actionable, not just "no data" |
| Accessibility | ARIA labels, focus management, keyboard nav, screen reader support |
| Responsive | Works on handheld scanner (480px), tablet, desktop |
| Animations | 150ms transitions, micro-interactions (button press, card expand) |
| Toast system | Success/error/warning with auto-dismiss + action buttons |

### 8.4 API Integration

- `GET /putaway/queue` — pending items (top 5 for initial view)
- `GET /putaway/queue?zone=A` — items filtered by zone
- `GET /putaway/queue/zones` — aggregate counts by zone
- `GET /putaway/suggest?item_code=X&qty=Y` — get suggested location (returns velocity_tier + shelf_band)
- `POST /putaway/` — confirm putaway (existing endpoint)
- `POST /putaway/sessions` — create batch session
- `POST /putaway/sessions/:id/pick` — scan item into session
- `DELETE /putaway/sessions/:id/items/:itemId` — remove from tote
- `POST /putaway/sessions/:id/place/:itemId` — confirm placement + auto-suggest alt
- `DELETE /putaway/sessions/:id` — cancel session
- `POST /putaway/fit-exception` — existing, used by fit exception screen

---

## 9. Capacity Rules (Unchanged)

| Source | Scope | Priority |
|--------|-------|----------|
| `item_bin_capacities.max_qty` | Specific SKU in specific bin | Tightest (1) |
| `items.max_qty_per_bin` | SKU default across all bins | Medium (2) |
| `warehouse_locations.max_capacity_qty` | Any item in this bin | Loosest (3) |

The tightest of the three wins. Putaway exceptions learn actual capacities over time.

---

## 10. One-Item-Per-Bin Rule

Already enforced via `allow_mixed_items` on `warehouse_locations`:

- Set `allow_mixed_items = false` on all storage bins
- Putaway suggestion already filters out bins with different items when `allow_mixed_items = false`
- `RejectMixedPutaway()` in `putaway_policy.go` enforces this at write time

No changes needed — this is already implemented.

---

## 11. Partial Allocation Support

The putaway rules as designed already support partial allocation (sell 5 from a bin of 10):

| Scenario | What Happens | Putaway Impact |
|----------|--------------|----------------|
| Bin has 10, order for 5 | Allocate 5 from one bin | None |
| Bin has 10, order for 15 | Allocate 10 from bin A + 5 from bin B | None |
| Bin has 5, order for 10 | Allocate 5 from bin A + 5 from bin B | None |
| Bin has 10, two orders for 5 each | First order reserves 5, second reserves remaining 5 | None |

The `stock_location_balances` table tracks `actual_qty` and `reserved_qty`, enabling `available_qty = actual_qty - reserved_qty`. The allocation system (future phase) queries `available_qty` and allocates from bins with sufficient stock. No putaway changes needed.

---

## 12. Implementation Phases

| Phase | Duration | Tasks |
|-------|----------|-------|
| **Phase 1** | Day 1-2 | Migrations (032, 032b, 032c), velocity shelf mapping |
| **Phase 2** | Day 3-4 | Updated suggest handler, session CRUD endpoints |
| **Phase 3** | Day 5-7 | Queue filter by zone, fit exception integration, auto-suggest alt bin |
| **Phase 4** | Day 8-14 | Frontend: PutawayWizard with all screens + professional UI |
| **Phase 5** | Day 15-16 | Integration tests, manual E2E testing |

---

## 13. Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Putaway time per item | 2-3 min | <1 min |
| Items per trip | 1 | 10-20 (batch by zone) |
| Mis-picks | 5% | <1% |
| Ergonomic strain | High | Low (golden zone for fast items) |
| Item mixing | Occasional | Zero (enforced) |
| Correction time | N/A | <10 sec (remove from tote) |

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Staff don't set velocity_tier | Default to 'medium'; prompt on item creation |
| Tote items lost if worker drops tote | Session timeout; items remain in staging until confirmed |
| Wrong shelf band has no empty bins | Fallback: any empty bin in zone, then any empty bin |
| Putaway priority not set correctly | Audit: query bins without putaway_priority, set defaults |
| Session abandoned | 2hr timeout job cancels stale sessions |

---

## 15. Out of Scope

- Automatic velocity classification from sales data
- Multi-tote workflows
- Wave-based putaway
- Integration with external WMS/ERP for ABC classification
- Pack splitting logic (separate feature in order allocation phase)