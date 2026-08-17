package shared

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OnIncomingStock is called by AdjustLocationQty when stock arrives in incoming.
// Set by putaway package to avoid import cycle.
var OnIncomingStock func(ctx context.Context, db *pgxpool.Pool, itemCode string, warehouseID, locationID int, batchArg any, delta float64)

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

// EnsureDefaultWarehouse returns an existing warehouse or creates WH-01 so
// receiving can post stock on a fresh database.
func EnsureDefaultWarehouse(ctx context.Context, db *pgxpool.Pool) (int, error) {
	var id int
	err := db.QueryRow(ctx, `
		SELECT id FROM warehouses WHERE COALESCE(disabled,false)=false ORDER BY id LIMIT 1`).Scan(&id)
	if err == nil && id > 0 {
		_ = EnsureDefaultPickBins(ctx, db, id)
		return id, nil
	}
	err = db.QueryRow(ctx, `
		INSERT INTO warehouses (code, name, warehouse_type, picking_mode)
		VALUES ('WH-01', 'Main warehouse', 'storage', 'scan')
		ON CONFLICT (code) DO UPDATE SET name = warehouses.name
		RETURNING id`).Scan(&id)
	if err != nil {
		return 0, err
	}
	_ = EnsureDefaultPickBins(ctx, db, id)
	return id, nil
}

// EnsureDefaultPickBins creates a small A-aisle pick-face grid when a warehouse
// has only staging locations (incoming/hold/damaged). Putaway needs somewhere to go.
func EnsureDefaultPickBins(ctx context.Context, db *pgxpool.Pool, warehouseID int) error {
	if warehouseID < 1 {
		return nil
	}
	var n int
	_ = db.QueryRow(ctx, `
		SELECT COUNT(*) FROM warehouse_locations
		WHERE warehouse_id=$1 AND COALESCE(disabled,false)=false
		  AND location_type IN ('pick_face','storage')`, warehouseID).Scan(&n)
	if n > 0 {
		return nil
	}
	for bay := 1; bay <= 2; bay++ {
		for level := 1; level <= 2; level++ {
			for bin := 1; bin <= 4; bin++ {
				bayS := fmt.Sprintf("%02d", bay)
				lvlS := fmt.Sprintf("%02d", level)
				binS := fmt.Sprintf("%02d", bin)
				code := fmt.Sprintf("A-%s-%s-%s", bayS, lvlS, binS)
				_, _ = db.Exec(ctx, `
					INSERT INTO warehouse_locations (
						code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
						location_type, allow_mixed_items, disabled, is_occupied, putaway_priority
					) VALUES ($1,$2,'A','A',$3,$4,$3,$5,$4,'pick_face',true,false,false,5)
					ON CONFLICT (warehouse_id, code) DO NOTHING`,
					code, warehouseID, bayS, binS, lvlS)
			}
		}
	}
	return nil
}

// EnsureItemStub inserts a usable item-master row so received stock can be put away.
func EnsureItemStub(ctx context.Context, db *pgxpool.Pool, itemCode string) {
	itemCode = strings.TrimSpace(itemCode)
	if itemCode == "" {
		return
	}
	var id int
	if db.QueryRow(ctx, `SELECT id FROM items WHERE UPPER(code)=UPPER($1)`, itemCode).Scan(&id) == nil {
		return
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO items (code, name, pack_type, control_mode, master_complete, uom, is_stock)
		VALUES ($1,$1,'loose','item_controlled',true,'Nos',true)
		ON CONFLICT (code) DO NOTHING`, itemCode)
}

// ResolveWarehouseID returns warehouse id from pointer or a default warehouse.
func ResolveWarehouseID(ctx context.Context, db *pgxpool.Pool, warehouseID *int) (int, error) {
	if warehouseID != nil && *warehouseID > 0 {
		return *warehouseID, nil
	}
	return EnsureDefaultWarehouse(ctx, db)
}

// AdjustLocationQty upserts a location balance by delta.
// Staging locations (incoming/hold/damaged/staging) are marked unallocatable.
func AdjustLocationQty(ctx context.Context, db *pgxpool.Pool, itemCode string, warehouseID, locationID int, batch string, delta float64) error {
	itemCode = strings.TrimSpace(itemCode)
	var batchArg any
	if strings.TrimSpace(batch) == "" {
		batchArg = nil
	} else {
		batchArg = strings.TrimSpace(batch)
	}

	var locType string
	_ = db.QueryRow(ctx, `SELECT COALESCE(location_type,'storage') FROM warehouse_locations WHERE id=$1`, locationID).Scan(&locType)
	alloc := "allocatable"
	switch strings.ToLower(locType) {
	case "incoming", "hold", "damaged", "staging":
		alloc = "unallocatable"
	}

	var existingID int
	err := db.QueryRow(ctx, `
		SELECT id FROM stock_location_balances
		WHERE item_code=$1 AND location_id=$2 AND COALESCE(batch_no,'')=COALESCE($3,'')`,
		itemCode, locationID, batchArg).Scan(&existingID)
	if err == pgx.ErrNoRows {
		_, err = db.Exec(ctx, `
			INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty, allocation_status)
			VALUES ($1,$2,$3,$4,$5,0,$6)`,
			itemCode, warehouseID, locationID, batchArg, delta, alloc)
		if err != nil {
			// Pre-021 without allocation_status
			_, err = db.Exec(ctx, `
				INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty)
				VALUES ($1,$2,$3,$4,$5,0)`,
				itemCode, warehouseID, locationID, batchArg, delta)
			if err != nil {
				return err
			}
		}
	} else if err != nil {
		return err
	} else {
		_, err = db.Exec(ctx, `
			UPDATE stock_location_balances
			SET actual_qty = actual_qty + $1,
			    allocation_status = COALESCE($3, allocation_status),
			    updated_at=now()
			WHERE id=$2`, delta, existingID, alloc)
		if err != nil {
			_, err = db.Exec(ctx, `
				UPDATE stock_location_balances
				SET actual_qty = actual_qty + $1, updated_at=now()
				WHERE id=$2`, delta, existingID)
			if err != nil {
				return err
			}
		}
	}

	if strings.ToLower(locType) == "incoming" && delta > 0 {
		if OnIncomingStock != nil {
			OnIncomingStock(ctx, db, itemCode, warehouseID, locationID, batchArg, delta)
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
