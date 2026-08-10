package shared

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnsureLocation ensures a staging location exists for a warehouse and returns its id+code.
func EnsureLocation(ctx context.Context, db *pgxpool.Pool, warehouseID int, code, locType string) (int, string, error) {
	var id int
	err := db.QueryRow(ctx, `
		SELECT id FROM warehouse_locations
		WHERE warehouse_id=$1 AND code=$2`, warehouseID, code).Scan(&id)
	if err == nil {
		return id, code, nil
	}
	if err != pgx.ErrNoRows {
		return 0, "", err
	}

	aisle := "IN"
	if locType == "hold" || locType == "damaged" {
		aisle = strings.ToUpper(locType)
		if len(aisle) > 4 {
			aisle = aisle[:4]
		}
	}
	err = db.QueryRow(ctx, `
		INSERT INTO warehouse_locations (
			code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
			location_type, allow_mixed_items, disabled, is_occupied
		) VALUES ($1,$2,$3,$4,'01','01','01','low','01',$5,true,false,false)
		RETURNING id`,
		code, warehouseID, aisle, aisle, locType,
	).Scan(&id)
	if err != nil {
		_ = db.QueryRow(ctx, `
			SELECT id FROM warehouse_locations WHERE warehouse_id=$1 AND code=$2`,
			warehouseID, code).Scan(&id)
		if id == 0 {
			return 0, "", err
		}
	}
	return id, code, nil
}

// ResolveWarehouseID returns warehouse id from pointer or first available warehouse.
func ResolveWarehouseID(ctx context.Context, db *pgxpool.Pool, warehouseID *int) (int, error) {
	if warehouseID != nil && *warehouseID > 0 {
		return *warehouseID, nil
	}
	var id int
	err := db.QueryRow(ctx, `SELECT id FROM warehouses WHERE COALESCE(disabled,false)=false ORDER BY id LIMIT 1`).Scan(&id)
	return id, err
}

// AdjustLocationQty upserts a location balance by delta.
func AdjustLocationQty(ctx context.Context, db *pgxpool.Pool, itemCode string, warehouseID, locationID int, batch string, delta float64) error {
	itemCode = strings.TrimSpace(itemCode)
	var batchArg any
	if strings.TrimSpace(batch) == "" {
		batchArg = nil
	} else {
		batchArg = strings.TrimSpace(batch)
	}

	var existingID int
	err := db.QueryRow(ctx, `
		SELECT id FROM stock_location_balances
		WHERE item_code=$1 AND location_id=$2 AND COALESCE(batch_no,'')=COALESCE($3,'')`,
		itemCode, locationID, batchArg).Scan(&existingID)
	if err == pgx.ErrNoRows {
		_, err = db.Exec(ctx, `
			INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty)
			VALUES ($1,$2,$3,$4,$5,0)`,
			itemCode, warehouseID, locationID, batchArg, delta)
		if err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else {
		_, err = db.Exec(ctx, `
			UPDATE stock_location_balances
			SET actual_qty = actual_qty + $1, updated_at=now()
			WHERE id=$2`, delta, existingID)
		if err != nil {
			return err
		}
	}

	_, _ = db.Exec(ctx, `
		UPDATE warehouse_locations SET is_occupied = (
			EXISTS (SELECT 1 FROM stock_location_balances s WHERE s.location_id=$1 AND s.actual_qty > 0)
		), current_item=$2, updated_at=now() WHERE id=$1`, locationID, itemCode)
	return nil
}

// ItemMasterComplete returns whether the item exists and master_complete is true.
func ItemMasterComplete(ctx context.Context, db *pgxpool.Pool, itemCode string) (exists bool, complete bool, err error) {
	err = db.QueryRow(ctx, `
		SELECT COALESCE(master_complete,false) FROM items WHERE code=$1 AND disabled=false`,
		strings.TrimSpace(itemCode)).Scan(&complete)
	if err == pgx.ErrNoRows {
		return false, false, nil
	}
	if err != nil {
		return false, false, err
	}
	return true, complete, nil
}
