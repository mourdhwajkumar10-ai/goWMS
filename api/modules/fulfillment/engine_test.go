package fulfillment

import (
	"context"
	"errors"
	"testing"

	"goWMS/api/internal/testdb"
	"goWMS/api/modules/shared"
)

func TestConfirmPickMovesStockToPacking(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var packLocID int
	if err := tx.QueryRow(ctx, `
		SELECT id FROM warehouse_locations
		WHERE warehouse_id=$1 AND location_type='packing' ORDER BY id LIMIT 1`,
		f.WarehouseID).Scan(&packLocID); err != nil {
		// Create one for this test warehouse
		if err := tx.QueryRow(ctx, `
			INSERT INTO warehouse_locations (
				code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
				location_type, allow_mixed_items, disabled
			) VALUES ('PACK-01',$1,'PK','PK','01','01','01','low','01','packing',true,false)
			RETURNING id`, f.WarehouseID).Scan(&packLocID); err != nil {
			t.Fatalf("packing loc: %v", err)
		}
	}

	// Reserve 10 on the seeded balance (matches SO qty).
	if err := shared.ReserveBalance(ctx, tx, f.BalanceID, 10); err != nil {
		t.Fatalf("reserve: %v", err)
	}

	var pickID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-ENG-1', $1, $2, 'open', 'scan', 'single', $3) RETURNING id`,
		f.SalesOrderNo, f.WarehouseID, packLocID).Scan(&pickID); err != nil {
		t.Fatalf("pick list: %v", err)
	}
	var lineID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,10,10,0,'pending',$4,$5,$6) RETURNING id`,
		pickID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID).Scan(&lineID); err != nil {
		t.Fatalf("pick line: %v", err)
	}

	res, err := ConfirmPick(ctx, tx, ConfirmPickInput{
		PickListID:     pickID,
		PickListItemID: lineID,
		ItemCode:       f.ItemCode,
		ScannedBin:     f.LocationCode,
		Quantity:       4,
		ScannedBy:      1,
	})
	if err != nil {
		t.Fatalf("ConfirmPick: %v", err)
	}
	if res.PickedQty != 4 || res.Status != "in_progress" {
		t.Errorf("result = %+v", res)
	}

	var srcActual, srcReserved, packActual float64
	if err := tx.QueryRow(ctx, `SELECT actual_qty, reserved_qty FROM stock_location_balances WHERE id=$1`, f.BalanceID).
		Scan(&srcActual, &srcReserved); err != nil {
		t.Fatalf("source bal: %v", err)
	}
	if srcActual != 96 || srcReserved != 6 {
		t.Errorf("source actual/reserved = %.0f/%.0f, want 96/6", srcActual, srcReserved)
	}
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
		WHERE location_id=$1 AND item_code=$2`, packLocID, f.ItemCode).Scan(&packActual); err != nil {
		t.Fatalf("pack bal: %v", err)
	}
	if packActual != 4 {
		t.Errorf("packing actual = %.0f, want 4", packActual)
	}

	var soPicked float64
	_ = tx.QueryRow(ctx, `SELECT picked_qty FROM sales_order_items WHERE id=$1`, f.SalesOrderItemID).Scan(&soPicked)
	if soPicked != 4 {
		t.Errorf("SO picked_qty = %.0f, want 4", soPicked)
	}
}

func TestConfirmPickRejectsWrongLocation(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var packLocID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO warehouse_locations (
			code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
			location_type, allow_mixed_items, disabled
		) VALUES ('PACK-T',$1,'PK','PK','01','01','01','low','01','packing',true,false)
		RETURNING id`, f.WarehouseID).Scan(&packLocID); err != nil {
		t.Fatalf("packing loc: %v", err)
	}
	_ = shared.ReserveBalance(ctx, tx, f.BalanceID, 5)

	var pickID, lineID int
	_ = tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-ENG-2', $1, $2, 'open', 'scan', 'single', $3) RETURNING id`,
		f.SalesOrderNo, f.WarehouseID, packLocID).Scan(&pickID)
	_ = tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,5,5,0,'pending',$4,$5,$6) RETURNING id`,
		pickID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID).Scan(&lineID)

	_, err := ConfirmPick(ctx, tx, ConfirmPickInput{
		PickListID:     pickID,
		PickListItemID: lineID,
		ItemCode:       f.ItemCode,
		ScannedBin:     "WRONG-BIN",
		ExpectedBin:    f.LocationCode,
		Quantity:       1,
	})
	if !errors.Is(err, ErrWrongLocation) {
		t.Fatalf("err = %v, want ErrWrongLocation", err)
	}
	var rejected int
	_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM pick_scan_logs WHERE pick_list_id=$1 AND rejected=true`, pickID).Scan(&rejected)
	if rejected < 1 {
		t.Error("expected rejected scan log")
	}
}

func TestAssignToBoxAndShip(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var packLocID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO warehouse_locations (
			code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
			location_type, allow_mixed_items, disabled
		) VALUES ('PACK-S',$1,'PK','PK','01','01','01','low','01','packing',true,false)
		RETURNING id`, f.WarehouseID).Scan(&packLocID); err != nil {
		t.Fatalf("packing loc: %v", err)
	}
	_ = shared.ReserveBalance(ctx, tx, f.BalanceID, 3)

	var pickID, lineID int
	_ = tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-ENG-3', $1, $2, 'open', 'scan', 'single', $3) RETURNING id`,
		f.SalesOrderNo, f.WarehouseID, packLocID).Scan(&pickID)
	_ = tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,3,3,0,'pending',$4,$5,$6) RETURNING id`,
		pickID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID).Scan(&lineID)

	_, err := ConfirmPick(ctx, tx, ConfirmPickInput{
		PickListID: pickID, PickListItemID: lineID, ItemCode: f.ItemCode,
		ScannedBin: f.LocationCode, Quantity: 3,
	})
	if err != nil {
		t.Fatalf("pick: %v", err)
	}

	var boxID int
	boxLabel := "BOX-ENG-" + f.ItemCode
	if err := tx.QueryRow(ctx, `
		INSERT INTO boxes (label, pick_list_id, warehouse_id, packing_location_id)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		boxLabel, pickID, f.WarehouseID, packLocID).Scan(&boxID); err != nil {
		t.Fatalf("box: %v", err)
	}

	if _, _, err := AssignToBox(ctx, tx, AssignToBoxInput{
		BoxID: boxID, PickListID: pickID, ItemCode: f.ItemCode, Quantity: 3,
	}); err != nil {
		t.Fatalf("assign: %v", err)
	}
	var packed float64
	_ = tx.QueryRow(ctx, `SELECT packed_qty FROM pick_list_items WHERE id=$1`, lineID).Scan(&packed)
	if packed != 3 {
		t.Errorf("packed_qty = %.0f, want 3", packed)
	}

	if err := ShipBox(ctx, tx, boxID); err != nil {
		t.Fatalf("ship: %v", err)
	}
	var packLeft float64
	_ = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
		WHERE location_id=$1 AND item_code=$2`, packLocID, f.ItemCode).Scan(&packLeft)
	if packLeft != 0 {
		t.Errorf("packing left = %.0f, want 0", packLeft)
	}
	var ledger int
	_ = tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM stock_ledger_entries
		WHERE item_code=$1 AND voucher_type='Sales Ship'`, f.ItemCode).Scan(&ledger)
	if ledger < 1 {
		t.Error("expected ledger entry")
	}
}
