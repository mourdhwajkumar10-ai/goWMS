package picking

import (
	"context"
	"testing"

	"goWMS/api/internal/testdb"
)

func TestCancelPersistsStatus(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var pickID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode)
		VALUES ('PL-TEST-CANCEL', $1, $2, 'open', 'scan') RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&pickID); err != nil {
		t.Fatalf("insert pick list: %v", err)
	}

	// Writing 'cancelled' must be accepted by the widened constraint.
	if _, err := tx.Exec(ctx,
		`UPDATE pick_lists SET status='cancelled' WHERE id=$1`, pickID); err != nil {
		t.Fatalf("update to cancelled rejected: %v", err)
	}

	var status string
	if err := tx.QueryRow(ctx,
		`SELECT status FROM pick_lists WHERE id=$1`, pickID).Scan(&status); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "cancelled" {
		t.Errorf("status = %q, want cancelled", status)
	}
}
