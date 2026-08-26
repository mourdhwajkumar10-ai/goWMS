package salesorder

import (
	"context"
	"testing"

	"goWMS/api/internal/testdb"
	"goWMS/api/modules/shared"
)

func TestNetOpenDemandExcludesOpenReservations(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	// An open pick list already holds 10 allocated, 0 picked.
	var pickID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode)
		VALUES ('PL-TEST-DEMAND', $1, $2, 'open', 'scan') RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&pickID); err != nil {
		t.Fatalf("insert pick list: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO pick_list_items
		  (pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty, consumed_qty, status)
		VALUES ($1,$2,$3,10,10,0,0,'pending')`, pickID, f.ItemCode, f.WarehouseName); err != nil {
		t.Fatalf("insert pick line: %v", err)
	}

	// The net-open demand query must return zero remaining for this SKU.
	var openQty float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(soi.qty,0) - COALESCE(soi.picked_qty,0)
		     - COALESCE((SELECT SUM(GREATEST(
		           COALESCE(pli.allocated_qty,0) - COALESCE(pli.picked_qty,0)
		         - COALESCE(pli.consumed_qty,0), 0))
		       FROM pick_list_items pli
		       JOIN pick_lists pl ON pl.id = pli.pick_list_id
		       WHERE pl.sales_order_no = $1
		         AND pl.status IN ('draft','open')
		         AND pli.item_code = soi.item_code), 0)
		FROM sales_order_items soi
		WHERE soi.sales_order_id = $2 AND soi.item_code = $3`,
		f.SalesOrderNo, f.SalesOrderID, f.ItemCode).Scan(&openQty); err != nil {
		t.Fatalf("demand query: %v", err)
	}
	if openQty != 0 {
		t.Errorf("net open demand = %v, want 0 (all 10 already reserved)", openQty)
	}
}

func TestOpenPickGuardDetectsExistingList(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode)
		VALUES ('PL-TEST-GUARD', $1, $2, 'open', 'scan')`,
		f.SalesOrderNo, f.WarehouseID); err != nil {
		t.Fatalf("insert pick list: %v", err)
	}

	var id int
	var name string
	err := tx.QueryRow(ctx, `
		SELECT id, name FROM pick_lists
		WHERE sales_order_no=$1 AND status IN ('draft','open')
		LIMIT 1`, f.SalesOrderNo).Scan(&id, &name)
	if err != nil {
		t.Fatalf("guard query found nothing, want the open list: %v", err)
	}
	if name != "PL-TEST-GUARD" {
		t.Errorf("guard found %q, want PL-TEST-GUARD", name)
	}

	// A cancelled list must not block a new pick.
	if _, err := tx.Exec(ctx,
		`UPDATE pick_lists SET status='cancelled' WHERE id=$1`, id); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	err = tx.QueryRow(ctx, `
		SELECT id, name FROM pick_lists
		WHERE sales_order_no=$1 AND status IN ('draft','open')
		LIMIT 1`, f.SalesOrderNo).Scan(&id, &name)
	if err == nil {
		t.Error("guard still blocks after cancel, want no open list")
	}
}

func TestBackorderCreatedForShortage(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var pickID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode)
		VALUES ('PL-TEST-BO', $1, $2, 'open', 'scan') RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&pickID); err != nil {
		t.Fatalf("insert pick list: %v", err)
	}

	boNo, created, err := shared.CreateBackorderFromShortages(ctx, tx, pickID,
		f.SalesOrderNo, "Test Customer", f.WarehouseName,
		[]shared.ShortageLine{{ItemCode: f.ItemCode, Qty: 3}})
	if err != nil {
		t.Fatalf("create backorder: %v", err)
	}
	if !created || boNo == "" {
		t.Fatalf("created=%v boNo=%q, want true and a number", created, boNo)
	}

	var lines int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM backorder_lines_v2 bl
		JOIN backorders_v2 b ON b.id = bl.backorder_id
		WHERE b.backorder_no=$1`, boNo).Scan(&lines); err != nil {
		t.Fatalf("count lines: %v", err)
	}
	if lines != 1 {
		t.Errorf("backorder lines = %d, want 1", lines)
	}

	// No shortages must create nothing, without erroring.
	_, created, err = shared.CreateBackorderFromShortages(ctx, tx, pickID,
		f.SalesOrderNo, "Test Customer", f.WarehouseName, nil)
	if err != nil || created {
		t.Errorf("empty shortages: created=%v err=%v, want false and nil", created, err)
	}
}
