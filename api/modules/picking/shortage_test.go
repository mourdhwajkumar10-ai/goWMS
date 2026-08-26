package picking

// Integration checks for the can't-find-it -> supervisor review -> backorder
// pipeline. These exercise the same SQL statements the HTTP handlers in
// shortage.go run (release reserve on flag, re-reserve on reject, backorder
// insert on approve) directly against a transaction, since the handlers
// themselves take a *pgxpool.Pool (not a tx) and so aren't unit-testable
// without a live, mutating pool. Run with GOWMS_TEST_DSN set.

import (
	"context"
	"testing"

	"goWMS/api/internal/testdb"
	"goWMS/api/modules/shared"
)

func TestShortageFlagReleasesReservationAndBlocksLine(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	if err := shared.ReserveBalance(ctx, tx, f.BalanceID, 10); err != nil {
		t.Fatalf("reserve: %v", err)
	}
	var pickID, lineID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-SF-TEST', $1, $2, 'open', 'scan', 'single', NULL) RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&pickID); err != nil {
		t.Fatalf("pick list: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,10,10,3,'in_progress',$4,$5,$6) RETURNING id`,
		pickID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID).Scan(&lineID); err != nil {
		t.Fatalf("pick line: %v", err)
	}

	// Simulate cantFindIt: release the remaining 7, cap allocated at picked (3), flag it.
	if err := shared.ReleaseReserved(ctx, tx, f.BalanceID, 7); err != nil {
		t.Fatalf("release: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE pick_list_items SET allocated_qty=3, status='flagged' WHERE id=$1`, lineID); err != nil {
		t.Fatalf("flag update: %v", err)
	}
	var flagID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_shortage_flags (
			flag_no, pick_list_id, pick_list_item_id, sales_order_no, item_code, qty, reason, status, flagged_by
		) VALUES ('SF-TEST-1',$1,$2,$3,$4,7,'not on shelf','pending',1) RETURNING id`,
		pickID, lineID, f.SalesOrderNo, f.ItemCode).Scan(&flagID); err != nil {
		t.Fatalf("insert flag: %v — apply migrations/051_shortage_flags.sql", err)
	}

	var reserved, allocated float64
	if err := tx.QueryRow(ctx, `SELECT reserved_qty FROM stock_location_balances WHERE id=$1`, f.BalanceID).Scan(&reserved); err != nil {
		t.Fatalf("reserved: %v", err)
	}
	if reserved != 3 {
		t.Errorf("reserved_qty after flag = %.0f, want 3 (10 reserved - 7 released)", reserved)
	}
	if err := tx.QueryRow(ctx, `SELECT allocated_qty FROM pick_list_items WHERE id=$1`, lineID).Scan(&allocated); err != nil {
		t.Fatalf("allocated: %v", err)
	}
	if allocated != 3 {
		t.Errorf("allocated_qty after flag = %.0f, want 3 (capped at picked)", allocated)
	}

	// ConfirmPick's "remaining" query must now treat this list as complete
	// for allocation purposes: allocated(3) == picked(3), no longer counted.
	var remaining int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM pick_list_items
		WHERE pick_list_id=$1 AND COALESCE(allocated_qty,0) > 0
		  AND COALESCE(picked_qty,0) < COALESCE(allocated_qty, ordered_qty)`, pickID).Scan(&remaining); err != nil {
		t.Fatalf("remaining calc: %v", err)
	}
	if remaining != 0 {
		t.Errorf("remaining open lines = %d, want 0 (flagged line should not block completion)", remaining)
	}

	// Approve: create backorder, mark line 'shortage'.
	var backorderID int
	var backorderNo string
	if err := tx.QueryRow(ctx, `
		INSERT INTO backorders_v2 (backorder_no, sales_order_no, customer, notes, status)
		VALUES ('BO2-TEST-1',$1,'Test Customer','supervisor-approved shortage flag','pending')
		RETURNING id, backorder_no`, f.SalesOrderNo).Scan(&backorderID, &backorderNo); err != nil {
		t.Fatalf("backorder insert: %v — apply migrations/010_backorders_v2_qc_templates.sql", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO backorder_lines_v2 (backorder_id, item_code, qty, status)
		VALUES ($1,$2,7,'pending')`, backorderID, f.ItemCode); err != nil {
		t.Fatalf("backorder line insert: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE pick_list_items SET status='shortage', shortage_qty=7 WHERE id=$1`, lineID); err != nil {
		t.Fatalf("mark shortage: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE pick_shortage_flags SET status='approved', backorder_no=$1, reviewed_by=1, reviewed_at=NOW() WHERE id=$2`,
		backorderNo, flagID); err != nil {
		t.Fatalf("approve flag: %v", err)
	}

	var lineQty float64
	if err := tx.QueryRow(ctx, `SELECT qty FROM backorder_lines_v2 WHERE backorder_id=$1`, backorderID).Scan(&lineQty); err != nil {
		t.Fatalf("backorder line qty: %v", err)
	}
	if lineQty != 7 {
		t.Errorf("backorder line qty = %.0f, want 7", lineQty)
	}
}

func TestShortageFlagRejectRestoresLine(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	if err := shared.ReserveBalance(ctx, tx, f.BalanceID, 10); err != nil {
		t.Fatalf("reserve: %v", err)
	}
	var pickID, lineID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-SF-REJECT', $1, $2, 'open', 'scan', 'single', NULL) RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&pickID); err != nil {
		t.Fatalf("pick list: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,10,10,0,'in_progress',$4,$5,$6) RETURNING id`,
		pickID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID).Scan(&lineID); err != nil {
		t.Fatalf("pick line: %v", err)
	}

	if err := shared.ReleaseReserved(ctx, tx, f.BalanceID, 10); err != nil {
		t.Fatalf("release: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE pick_list_items SET allocated_qty=0, status='flagged' WHERE id=$1`, lineID); err != nil {
		t.Fatalf("flag: %v", err)
	}
	var flagID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_shortage_flags (flag_no, pick_list_id, pick_list_item_id, sales_order_no, item_code, qty, reason, status, flagged_by)
		VALUES ('SF-TEST-2',$1,$2,$3,$4,10,'thought missing','pending',1) RETURNING id`,
		pickID, lineID, f.SalesOrderNo, f.ItemCode).Scan(&flagID); err != nil {
		t.Fatalf("insert flag: %v", err)
	}

	// Reject: re-reserve and restore allocated_qty + pending status.
	if err := shared.ReserveBalance(ctx, tx, f.BalanceID, 10); err != nil {
		t.Fatalf("re-reserve: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE pick_list_items SET status='pending', allocated_qty=allocated_qty+10 WHERE id=$1`, lineID); err != nil {
		t.Fatalf("restore line: %v", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE pick_shortage_flags SET status='rejected', review_note='found it on recount', reviewed_by=1, reviewed_at=NOW() WHERE id=$1`, flagID); err != nil {
		t.Fatalf("reject flag: %v", err)
	}

	var reserved, allocated float64
	var status string
	if err := tx.QueryRow(ctx, `SELECT reserved_qty FROM stock_location_balances WHERE id=$1`, f.BalanceID).Scan(&reserved); err != nil {
		t.Fatalf("reserved: %v", err)
	}
	if reserved != 10 {
		t.Errorf("reserved_qty after reject = %.0f, want 10", reserved)
	}
	if err := tx.QueryRow(ctx, `SELECT allocated_qty, status FROM pick_list_items WHERE id=$1`, lineID).Scan(&allocated, &status); err != nil {
		t.Fatalf("line: %v", err)
	}
	if allocated != 10 || status != "pending" {
		t.Errorf("line after reject = allocated:%.0f status:%q, want 10/pending", allocated, status)
	}
}
