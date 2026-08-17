# Auto-Putaway Job Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically compute the best storage location when stock arrives in INCOMING-01, so the putaway UI shows a pre-computed suggestion.

**Architecture:** Hook into `AdjustLocationQty` — when stock lands in incoming, fire a goroutine that calls the existing suggest logic and saves the result to a new `suggested_location_id` column.

**Tech Stack:** Go (Fiber, pgx/v5), PostgreSQL, React + TypeScript

## Global Constraints

- Ponytail mode active — minimal code, shortest working diff
- Existing patterns: `AdjustLocationQty` in `shared/stockloc.go`, suggest logic in `putaway/handler.go`
- No new dependencies — reuse existing code
- Best-effort goroutine — no retry, no error handling

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `migrations/033_suggested_location.sql` | Create | Add `suggested_location_id` column |
| `api/modules/putaway/suggest.go` | Create | Extract `FindBestLocation` from handler |
| `api/modules/shared/stockloc.go` | Modify | Hook goroutine after INCOMING-01 upsert |
| `api/modules/putaway/handler.go` | Modify | Refactor suggest to use `FindBestLocation`, add suggestion to queue response |
| `web/src/pages/PutawayWizard.tsx` | Modify | Show pre-computed suggestion |

---

### Task 1: Migration — Add suggested_location_id

**Files:**
- Create: `migrations/033_suggested_location.sql`

**Interfaces:**
- Consumes: none
- Produces: `stock_location_balances.suggested_location_id` column

- [ ] **Step 1: Write migration**

```sql
-- 033: Add suggested_location_id for auto-putaway suggestions
ALTER TABLE stock_location_balances
ADD COLUMN IF NOT EXISTS suggested_location_id INT REFERENCES warehouse_locations(id);

CREATE INDEX IF NOT EXISTS idx_slb_suggested ON stock_location_balances(suggested_location_id)
WHERE suggested_location_id IS NOT NULL;

COMMENT ON COLUMN stock_location_balances.suggested_location_id IS
  'Pre-computed best storage location for items in incoming/staging. Set by auto-putaway goroutine.';
```

- [ ] **Step 2: Run migration**

```bash
psql -h localhost -p 5432 -U gowms -d gowms -f migrations/033_suggested_location.sql
```

Expected: ALTER TABLE, CREATE INDEX, COMMENT

- [ ] **Step 3: Verify column exists**

```bash
psql -h localhost -p 5432 -U gowms -d gowms -c "\d stock_location_balances" | grep suggested
```

Expected: `suggested_location_id | integer`

- [ ] **Step 4: Commit**

```bash
git add migrations/033_suggested_location.sql
git commit -m "feat: add suggested_location_id column to stock_location_balances"
```

---

### Task 2: Extract FindBestLocation into suggest.go

**Files:**
- Create: `api/modules/putaway/suggest.go`
- Read: `api/modules/putaway/handler.go:60-381` (existing suggest logic)

**Interfaces:**
- Consumes: `pgxpool.Pool`, item code, qty, warehouse ID
- Produces: `FindBestLocation(ctx, db, itemCode, qty, warehouseID) (locationID int, locationCode string, err error)`

- [ ] **Step 1: Create suggest.go with FindBestLocation**

Copy the core candidate-finding logic from `handler.go:60-381` into a new function. The function should:
1. Get item velocity_tier from items table
2. Find preferred aisle/bay from item home or last stock balance
3. Load putaway rules
4. Query candidates with shelf band filter (fast→middle, medium→lower, slow→upper)
5. Check capacity and mixed-item constraints
6. Return the first valid candidate

```go
package putaway

import (
    "context"
    "fmt"
    "strings"

    "github.com/jackc/pgx/v5/pgxpool"
)

// FindBestLocation computes the best storage location for an item.
// Returns locationID, locationCode, error.
func FindBestLocation(ctx context.Context, db *pgxpool.Pool, itemCode string, qty float64, warehouseID int) (int, string, error) {
    // 1. Get item velocity_tier
    var velocityTier string
    _ = db.QueryRow(ctx, `SELECT COALESCE(velocity_tier,'medium') FROM items WHERE code=$1`, itemCode).Scan(&velocityTier)
    if velocityTier == "" {
        velocityTier = "medium"
    }
    band := velocityShelfBand(velocityTier)

    // 2. Find preferred aisle from item home or last stock balance
    var preferredAisle string
    var preferredBay string
    var homeLocID int
    _ = db.QueryRow(ctx, `SELECT COALESCE(home_location_id,0) FROM items WHERE code=$1`, itemCode).Scan(&homeLocID)
    if homeLocID > 0 {
        _ = db.QueryRow(ctx, `SELECT COALESCE(aisle,''), COALESCE(shelf,'') FROM warehouse_locations WHERE id=$1`, homeLocID).Scan(&preferredAisle, &preferredBay)
    }
    if preferredAisle == "" {
        _ = db.QueryRow(ctx, `SELECT COALESCE(wl.aisle,''), COALESCE(wl.shelf,'')
            FROM stock_location_balances slb JOIN warehouse_locations wl ON wl.id=slb.location_id
            WHERE slb.item_code=$1 AND slb.warehouse_id=$2 AND slb.actual_qty > 0
            ORDER BY slb.updated_at DESC LIMIT 1`, itemCode, warehouseID).Scan(&preferredAisle, &preferredBay)
    }

    // 3. Query best candidate: same item consolidation → empty storage, with shelf band filter
    type candidate struct {
        id   int
        code string
    }
    queries := []string{
        // Consolidate: same item, storage, same bay
        fmt.Sprintf(`SELECT wl.id, wl.code FROM warehouse_locations wl
            WHERE wl.warehouse_id=$1 AND wl.location_type IN ('storage','pick_face')
            AND wl.disabled=false AND wl.allow_mixed_items=true
            AND EXISTS (SELECT 1 FROM stock_location_balances slb WHERE slb.location_id=wl.id AND slb.item_code=$2 AND slb.actual_qty>0)
            %s AND ($3='' OR wl.aisle=$3) ORDER BY wl.putaway_priority ASC, wl.code ASC LIMIT 1`, shelfBandFilter(band)),
        // Consolidate: same item, storage, any bay
        fmt.Sprintf(`SELECT wl.id, wl.code FROM warehouse_locations wl
            WHERE wl.warehouse_id=$1 AND wl.location_type IN ('storage','pick_face')
            AND wl.disabled=false AND wl.allow_mixed_items=true
            AND EXISTS (SELECT 1 FROM stock_location_balances slb WHERE slb.location_id=wl.id AND slb.item_code=$2 AND slb.actual_qty>0)
            %s ORDER BY wl.putaway_priority ASC, wl.code ASC LIMIT 1`, shelfBandFilter(band)),
        // Empty storage, same bay
        fmt.Sprintf(`SELECT wl.id, wl.code FROM warehouse_locations wl
            WHERE wl.warehouse_id=$1 AND wl.location_type IN ('storage','pick_face')
            AND wl.disabled=false AND wl.allow_mixed_items=true AND wl.is_occupied=false
            %s AND ($3='' OR wl.aisle=$3) ORDER BY wl.putaway_priority ASC, wl.code ASC LIMIT 1`, shelfBandFilter(band)),
        // Empty storage, any bay
        fmt.Sprintf(`SELECT wl.id, wl.code FROM warehouse_locations wl
            WHERE wl.warehouse_id=$1 AND wl.location_type IN ('storage','pick_face')
            AND wl.disabled=false AND wl.allow_mixed_items=true AND wl.is_occupied=false
            %s ORDER BY wl.putaway_priority ASC, wl.code ASC LIMIT 1`, shelfBandFilter(band)),
    }

    for _, q := range queries {
        var c candidate
        if err := db.QueryRow(ctx, q, warehouseID, itemCode, preferredAisle).Scan(&c.id, &c.code); err == nil {
            return c.id, c.code, nil
        }
    }

    // Fallback: any storage location
    var c candidate
    err := db.QueryRow(ctx, `SELECT wl.id, wl.code FROM warehouse_locations wl
        WHERE wl.warehouse_id=$1 AND wl.location_type IN ('storage','pick_face')
        AND wl.disabled=false AND wl.allow_mixed_items=true
        ORDER BY wl.putaway_priority ASC, wl.code ASC LIMIT 1`, warehouseID).Scan(&c.id, &c.code)
    if err != nil {
        return 0, "", fmt.Errorf("no storage locations available")
    }
    return c.id, c.code, nil
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/yudhistherkumar/Downloads/goWMS && go build ./api/modules/putaway
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/modules/putaway/suggest.go
git commit -m "feat: extract FindBestLocation into reusable putaway/suggest.go"
```

---

### Task 3: Hook goroutine into AdjustLocationQty

**Files:**
- Modify: `api/modules/shared/stockloc.go:131-195`
- Read: `api/modules/putaway/suggest.go` (from Task 2)

**Interfaces:**
- Consumes: `putaway.FindBestLocation` (from Task 2)
- Produces: goroutine that sets `suggested_location_id` on incoming stock

- [ ] **Step 1: Add import and goroutine hook**

In `stockloc.go`, after the balance upsert and before the `is_occupied` update, add:

```go
// After existing balance upsert logic...
// Auto-putaway: compute best location for incoming stock
if strings.ToLower(locType) == "incoming" && delta > 0 {
    go func() {
        bgCtx := context.Background()
        locID, _, err := putaway.FindBestLocation(bgCtx, db, itemCode, delta, warehouseID)
        if err == nil && locID > 0 {
            _, _ = db.Exec(bgCtx,
                `UPDATE stock_location_balances
                 SET suggested_location_id=$1, updated_at=now()
                 WHERE item_code=$2 AND location_id=$3 AND COALESCE(batch_no,'')=COALESCE($4,'')`,
                locID, itemCode, locationID, batchArg)
        }
    }()
}
```

Add import: `"goWMS/api/modules/putaway"`

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/yudhistherkumar/Downloads/goWMS && go build ./api/modules/shared
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/modules/shared/stockloc.go
git commit -m "feat: auto-compute suggested_location_id when stock arrives in incoming"
```

---

### Task 4: Add suggestion to queue response

**Files:**
- Modify: `api/modules/putaway/handler.go:378-428` (queue function)

**Interfaces:**
- Consumes: `stock_location_balances.suggested_location_id`
- Produces: queue response with `suggested_location_id` and `suggested_location_code`

- [ ] **Step 1: Update queue query and struct**

Add `slb.suggested_location_id` and `wl2.code AS suggested_location_code` to the query. LEFT JOIN `warehouse_locations wl2 ON wl2.id = slb.suggested_location_id`.

Add to struct:
```go
SuggestedLocationID   *int    `json:"suggested_location_id"`
SuggestedLocationCode *string `json:"suggested_location_code"`
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/yudhistherkumar/Downloads/goWMS && go build ./api/modules/putaway
```

- [ ] **Step 3: Commit**

```bash
git add api/modules/putaway/handler.go
git commit -m "feat: add suggested_location to putaway queue response"
```

---

### Task 5: Show suggestion in PutawayWizard

**Files:**
- Modify: `web/src/pages/PutawayWizard.tsx`

**Interfaces:**
- Consumes: `suggested_location_id`, `suggested_location_code` from queue response
- Produces: visual suggestion badge on each item

- [ ] **Step 1: Update QueueRow interface**

```typescript
interface QueueRow {
  // ... existing fields ...
  suggested_location_id?: number | null
  suggested_location_code?: string | null
}
```

- [ ] **Step 2: Show suggestion badge in item_pick step**

After the item code and qty, add:
```tsx
{q.suggested_location_code && (
  <div className="text-dim text-xs">
    Suggested: <span style={{ color: 'var(--accent)' }}>{q.suggested_location_code}</span>
  </div>
)}
```

- [ ] **Step 3: Build frontend**

```bash
cd /Users/yudhistherkumar/Downloads/goWMS/web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/PutawayWizard.tsx
git commit -m "feat: show pre-computed putaway suggestion in wizard"
```

---

### Task 6: End-to-end test

- [ ] **Step 1: Restart server**

```bash
lsof -ti:8080 | xargs kill -9 2>/dev/null; sleep 2
cd /Users/yudhistherkumar/Downloads/goWMS && go run cmd/server/main.go &
sleep 3
```

- [ ] **Step 2: Complete a GRN to trigger stock in INCOMING-01**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# Check queue for suggested locations
curl -s http://localhost:8080/api/putaway/queue \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
d = json.load(sys.stdin)
for i in d['data']:
    sug = i.get('suggested_location_code') or 'none'
    print(f\"{i['item_code']:12} suggested: {sug}\")
"
```

Expected: Each item shows a suggested storage location (e.g., A-01-05-01)

- [ ] **Step 3: Verify suggested_location_id is set in DB**

```bash
psql -h localhost -p 5432 -U gowms -d gowms -c "
SELECT item_code, actual_qty, suggested_location_id 
FROM stock_location_balances 
WHERE actual_qty > 0 AND location_id = 1;"
```

Expected: `suggested_location_id` is populated for all incoming items

- [ ] **Step 4: Commit all**

```bash
cd /Users/yudhistherkumar/Downloads/goWMS && git add -A && git commit -m "feat: auto-putaway job — complete implementation"
```
