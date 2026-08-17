# Auto-Putaway Job Design

**Date:** 2026-08-17
**Status:** Approved

## Problem

When stock arrives in INCOMING-01 (via GRN completion), operators must manually trigger the suggest endpoint to find the best storage location. This adds friction and delays putaway.

## Solution

Automatically compute the best storage location when stock lands in INCOMING-01. Save the suggestion so the putaway UI shows it immediately.

## Flow

```
Stock arrives in INCOMING-01 (GRN completion)
        ↓
AdjustLocationQty called
        ↓
Fire goroutine (non-blocking, best-effort)
        ↓
Compute best location (velocity tier + HSN zone + consolidation)
        ↓
Save suggested_location_id to stock_location_balances
        ↓
Worker opens putaway UI → sees pre-computed suggestion
        ↓
Worker physically moves stock → allocatable
```

## Changes

### 1. Migration: Add suggested_location_id

```sql
ALTER TABLE stock_location_balances
ADD COLUMN suggested_location_id INT REFERENCES warehouse_locations(id);

CREATE INDEX idx_slb_suggested ON stock_location_balances(suggested_location_id)
WHERE suggested_location_id IS NOT NULL;
```

### 2. Extract suggestion logic (putaway/suggest.go)

Extract the core suggestion algorithm from `handler.go:60` into a reusable function:

```go
func FindBestLocation(ctx context.Context, db *pgxpool.Pool, itemCode string, qty float64, warehouseID int) (locationID int, locationCode string, err error)
```

This function:
- Gets item velocity_tier
- Finds preferred aisle/bay from item home or last stock balance
- Applies shelf band filter (fast→middle, medium→lower, slow→upper)
- Checks capacity and mixed-item constraints
- Returns the best empty/consolidated location

### 3. Hook into AdjustLocationQty (shared/stockloc.go)

After the upsert, if the target location is `incoming`:

```go
// After balance upsert...
if locType == "incoming" {
    go func() {
        ctx := context.Background()
        locID, _, err := putaway.FindBestLocation(ctx, db, itemCode, delta, warehouseID)
        if err == nil && locID > 0 {
            _, _ = db.Exec(ctx,
                `UPDATE stock_location_balances
                 SET suggested_location_id=$1, updated_at=now()
                 WHERE item_code=$2 AND location_id=$3`,
                locID, itemCode, locationID)
        }
    }()
}
```

### 4. Queue response includes suggestion (putaway/handler.go)

Add `suggested_location_id` and `suggested_location_code` to the queue response so the wizard can display it.

### 5. PutawayWizard shows suggestion (web/src/pages/PutawayWizard.tsx)

In the item_pick step, show the pre-computed suggestion next to each item:
- "Suggested: A-02-03-01 (fast → middle shelf)"

## Allocation Rule

Already handled by `AdjustLocationQty`:
- `allocation_status = 'unallocatable'` for incoming/hold/damaged/staging
- `allocation_status = 'allocatable'` for storage/pick_face

No change needed.

## Scope

- Best-effort goroutine (no retry, no error handling)
- Only triggers for incoming location type
- Suggestion is a hint, worker still confirms via scan
- No UI changes to the suggest endpoint itself
