package packing

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5"

	"goWMS/api/internal/testdb"
)

// packCeiling mirrors the gate: how much of this SKU may be packed, and how
// much already is. Kept as a test helper so the assertions below read clearly.
func packCeiling(ctx context.Context, tx pgx.Tx, pickListID int, itemCode string) (float64, float64) {
	var ceiling, packed float64
	_ = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(COALESCE(picked_qty,0)),0)
		FROM pick_list_items
		WHERE pick_list_id=$1 AND item_code=$2`,
		pickListID, itemCode).Scan(&ceiling)
	_ = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(bi.quantity),0)
		FROM box_items bi JOIN boxes b ON b.id = bi.box_id
		WHERE b.pick_list_id=$1 AND bi.item_code=$2`,
		pickListID, itemCode).Scan(&packed)
	return ceiling, packed
}

func TestPackCeilingReflectsPickedQty(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var pickID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode)
		VALUES ('PL-TEST-PACK', $1, $2, 'open', 'scan') RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&pickID); err != nil {
		t.Fatalf("insert pick list: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO pick_list_items
		  (pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty, status)
		VALUES ($1,$2,$3,10,10,4,'in_progress')`, pickID, f.ItemCode, f.WarehouseName); err != nil {
		t.Fatalf("insert pick line: %v", err)
	}

	ceiling, packed := packCeiling(ctx, tx, pickID, f.ItemCode)
	if ceiling != 4 {
		t.Errorf("ceiling = %v, want 4 (only 4 were picked)", ceiling)
	}
	if packed != 0 {
		t.Errorf("packed = %v, want 0", packed)
	}

	// A SKU never picked on this list must have a zero ceiling.
	ceiling, _ = packCeiling(ctx, tx, pickID, "NOT-ON-LIST")
	if ceiling != 0 {
		t.Errorf("ceiling for absent SKU = %v, want 0", ceiling)
	}
}
