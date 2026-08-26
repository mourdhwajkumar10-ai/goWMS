package countersale

// ReapIdleSessions mutates via the pool (not a rollback-on-cleanup tx, since
// the reaper itself takes a *pgxpool.Pool), so this test seeds its own rows
// directly and tears them down explicitly rather than using testdb.Tx.

import (
	"context"
	"strconv"
	"testing"
	"time"

	"goWMS/api/internal/testdb"
)

func TestReapIdleSessionsCancelsAbandonedCounterSale(t *testing.T) {
	pool := testdb.Open(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano(), 10)

	whName := "REAPWH-" + sfx
	locCode := "REAP-A01-" + sfx
	itemCode := "REAPITEM-" + sfx
	soName := "CS-REAP-" + sfx

	var whID, locID, balID, soID, pickID, lineID int
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM pick_scan_logs WHERE pick_list_id=$1`, pickID)
		_, _ = pool.Exec(ctx, `DELETE FROM pick_list_items WHERE pick_list_id=$1`, pickID)
		_, _ = pool.Exec(ctx, `DELETE FROM pick_lists WHERE id=$1`, pickID)
		_, _ = pool.Exec(ctx, `DELETE FROM sales_order_items WHERE sales_order_id=$1`, soID)
		_, _ = pool.Exec(ctx, `DELETE FROM sales_orders WHERE id=$1`, soID)
		_, _ = pool.Exec(ctx, `DELETE FROM stock_location_balances WHERE id=$1`, balID)
		_, _ = pool.Exec(ctx, `DELETE FROM warehouse_locations WHERE id=$1`, locID)
		_, _ = pool.Exec(ctx, `DELETE FROM items WHERE code=$1`, itemCode)
		_, _ = pool.Exec(ctx, `DELETE FROM warehouses WHERE id=$1`, whID)
	})

	if err := pool.QueryRow(ctx, `INSERT INTO warehouses (name, code) VALUES ($1,$1) RETURNING id`, whName).Scan(&whID); err != nil {
		t.Fatalf("warehouse: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO warehouse_locations (code, warehouse_id, location_type, disabled)
		VALUES ($1,$2,'storage',false) RETURNING id`, locCode, whID).Scan(&locID); err != nil {
		t.Fatalf("location: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO items (code, name) VALUES ($1,$1)`, itemCode); err != nil {
		t.Fatalf("item: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, actual_qty, reserved_qty)
		VALUES ($1,$2,$3,50,5) RETURNING id`, itemCode, whID, locID).Scan(&balID); err != nil {
		t.Fatalf("balance: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO sales_orders (name, customer_name, status, wms_status, order_type, warehouse_id, priority)
		VALUES ($1,'Walk-in','Confirmed','picking','Counter',$2,1) RETURNING id`, soName, whID).Scan(&soID); err != nil {
		t.Fatalf("counter so: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		INSERT INTO sales_order_items (sales_order_id, item_code, qty) VALUES ($1,$2,5)`, soID, itemCode); err != nil {
		t.Fatalf("counter so item: %v", err)
	}

	// Backdate created_at 30 minutes so the 20-minute idle threshold trips it.
	if err := pool.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id, created_at)
		VALUES ('PL-REAP-'||$1,$2,'Walk-in',$3,'open','scan','counter',NULL, NOW() - INTERVAL '30 minutes')
		RETURNING id`, sfx, soName, whID).Scan(&pickID); err != nil {
		t.Fatalf("pick list: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,5,5,0,'pending',$4,$5,$6) RETURNING id`,
		pickID, itemCode, whName, locID, locCode, balID).Scan(&lineID); err != nil {
		t.Fatalf("pick line: %v", err)
	}

	n, err := ReapIdleSessions(ctx, pool, 20)
	if err != nil {
		t.Fatalf("ReapIdleSessions: %v", err)
	}
	if n != 1 {
		t.Fatalf("cancelled = %d, want 1", n)
	}

	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM pick_lists WHERE id=$1`, pickID).Scan(&status); err != nil {
		t.Fatalf("read pick list status: %v", err)
	}
	if status != "cancelled" {
		t.Errorf("pick list status = %q, want cancelled", status)
	}

	var reserved float64
	if err := pool.QueryRow(ctx, `SELECT reserved_qty FROM stock_location_balances WHERE id=$1`, balID).Scan(&reserved); err != nil {
		t.Fatalf("read reserved: %v", err)
	}
	if reserved != 0 {
		t.Errorf("reserved_qty after reap = %.0f, want 0 (released)", reserved)
	}

	var soStatus, soWmsStatus string
	if err := pool.QueryRow(ctx, `SELECT status, wms_status FROM sales_orders WHERE id=$1`, soID).Scan(&soStatus, &soWmsStatus); err != nil {
		t.Fatalf("read so status: %v", err)
	}
	if soStatus != "Cancelled" || soWmsStatus != "cancelled" {
		t.Errorf("so status = %q/%q, want Cancelled/cancelled", soStatus, soWmsStatus)
	}

	// A second pass must be a no-op (already cancelled, not picked up by the WHERE status='open' filter).
	n2, err := ReapIdleSessions(ctx, pool, 20)
	if err != nil {
		t.Fatalf("second ReapIdleSessions: %v", err)
	}
	if n2 != 0 {
		t.Errorf("second pass cancelled = %d, want 0 (idempotent)", n2)
	}
}

func TestReapIdleSessionsLeavesRecentSessionsAlone(t *testing.T) {
	pool := testdb.Open(t)
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano(), 10)

	whName := "REAPWH2-" + sfx
	itemCode := "REAPITEM2-" + sfx
	soName := "CS-REAP2-" + sfx
	var whID, soID, pickID int
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DELETE FROM pick_lists WHERE id=$1`, pickID)
		_, _ = pool.Exec(ctx, `DELETE FROM sales_order_items WHERE sales_order_id=$1`, soID)
		_, _ = pool.Exec(ctx, `DELETE FROM sales_orders WHERE id=$1`, soID)
		_, _ = pool.Exec(ctx, `DELETE FROM items WHERE code=$1`, itemCode)
		_, _ = pool.Exec(ctx, `DELETE FROM warehouses WHERE id=$1`, whID)
	})

	if err := pool.QueryRow(ctx, `INSERT INTO warehouses (name, code) VALUES ($1,$1) RETURNING id`, whName).Scan(&whID); err != nil {
		t.Fatalf("warehouse: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO items (code, name) VALUES ($1,$1)`, itemCode); err != nil {
		t.Fatalf("item: %v", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO sales_orders (name, customer_name, status, wms_status, order_type, warehouse_id, priority)
		VALUES ($1,'Walk-in','Confirmed','picking','Counter',$2,1) RETURNING id`, soName, whID).Scan(&soID); err != nil {
		t.Fatalf("counter so: %v", err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO sales_order_items (sales_order_id, item_code, qty) VALUES ($1,$2,5)`, soID, itemCode); err != nil {
		t.Fatalf("counter so item: %v", err)
	}
	// Created just now — well inside any sane idle window.
	if err := pool.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-REAP2-'||$1,$2,'Walk-in',$3,'open','scan','counter',NULL)
		RETURNING id`, sfx, soName, whID).Scan(&pickID); err != nil {
		t.Fatalf("pick list: %v", err)
	}

	n, err := ReapIdleSessions(ctx, pool, 20)
	if err != nil {
		t.Fatalf("ReapIdleSessions: %v", err)
	}
	if n != 0 {
		t.Fatalf("cancelled = %d, want 0 (session is fresh)", n)
	}
	var status string
	if err := pool.QueryRow(ctx, `SELECT status FROM pick_lists WHERE id=$1`, pickID).Scan(&status); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "open" {
		t.Errorf("status = %q, want open (untouched)", status)
	}
}
