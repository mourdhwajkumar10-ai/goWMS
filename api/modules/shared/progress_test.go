package shared

import (
	"context"
	"testing"

	"goWMS/api/internal/testdb"
)

func TestSyncSalesOrderProgress(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var pickID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode)
		VALUES ('PL-TEST-PROG', $1, $2, 'open', 'scan') RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&pickID); err != nil {
		t.Fatalf("insert pick list: %v", err)
	}
	// SO line is for 10; pick 5 of them.
	if _, err := tx.Exec(ctx, `
		INSERT INTO pick_list_items
		  (pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty, status)
		VALUES ($1,$2,$3,10,10,5,'in_progress')`, pickID, f.ItemCode, f.WarehouseName); err != nil {
		t.Fatalf("insert pick line: %v", err)
	}

	if err := SyncSalesOrderProgress(ctx, tx, f.SalesOrderNo); err != nil {
		t.Fatalf("sync: %v", err)
	}

	var picked, perPicked float64
	if err := tx.QueryRow(ctx,
		`SELECT picked_qty FROM sales_order_items WHERE id=$1`,
		f.SalesOrderItemID).Scan(&picked); err != nil {
		t.Fatalf("read line: %v", err)
	}
	if picked != 5 {
		t.Errorf("sales_order_items.picked_qty = %v, want 5", picked)
	}
	if err := tx.QueryRow(ctx,
		`SELECT per_picked FROM sales_orders WHERE id=$1`,
		f.SalesOrderID).Scan(&perPicked); err != nil {
		t.Fatalf("read header: %v", err)
	}
	if perPicked != 50 {
		t.Errorf("per_picked = %v, want 50", perPicked)
	}

	// Idempotent: running again must not change anything.
	if err := SyncSalesOrderProgress(ctx, tx, f.SalesOrderNo); err != nil {
		t.Fatalf("second sync: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`SELECT picked_qty FROM sales_order_items WHERE id=$1`,
		f.SalesOrderItemID).Scan(&picked); err != nil {
		t.Fatalf("re-read line: %v", err)
	}
	if picked != 5 {
		t.Errorf("after second sync picked_qty = %v, want 5", picked)
	}
}

func TestSyncSalesOrderProgressSkipsWaveLabels(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()

	// A comma-joined label is a wave, not a single order — must be a no-op
	// and must not return an error.
	if err := SyncSalesOrderProgress(ctx, tx, "SO-1,SO-2"); err != nil {
		t.Errorf("wave label returned error: %v", err)
	}
	if err := SyncSalesOrderProgress(ctx, tx, ""); err != nil {
		t.Errorf("empty label returned error: %v", err)
	}
}
