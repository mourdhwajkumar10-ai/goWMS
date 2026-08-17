package putaway

import (
	"context"
	"fmt"

	"goWMS/api/modules/shared"

	"github.com/jackc/pgx/v5/pgxpool"
)

func init() {
	shared.OnIncomingStock = func(ctx context.Context, db *pgxpool.Pool, itemCode string, warehouseID, locationID int, batchArg any, delta float64) {
		go func() {
			bgCtx := context.Background()
			locID, _, err := FindBestLocation(bgCtx, db, itemCode, delta, warehouseID)
			if err == nil && locID > 0 {
				_, _ = db.Exec(bgCtx,
					`UPDATE stock_location_balances
					SET suggested_location_id=$1, updated_at=now()
					WHERE item_code=$2 AND location_id=$3 AND COALESCE(batch_no,'')=COALESCE($4,'')`,
					locID, itemCode, locationID, batchArg)
			}
		}()
	}
}

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
