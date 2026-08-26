package consolidate

// Tests for the "world-class" wave reconciliation logic: leftover
// breakdown, incomplete-order detection, return-to-stock movement,
// write-off ledger posting, and per-item shortage extraction for
// backorder creation. Run against a real Postgres via the testdb harness
// (see api/internal/testdb).
//
// Run with: GOWMS_TEST_DSN=... go test ./api/modules/consolidate/ -v

import (
	"context"
	"testing"

	"goWMS/api/internal/testdb"
	"goWMS/api/modules/shared"
)

func seedPackingLoc(t *testing.T, ctx context.Context, tx shared.DBTX, whID int, code string) int {
	t.Helper()
	var id int
	if err := tx.QueryRow(ctx, `
		INSERT INTO warehouse_locations (code, warehouse_id, location_type)
		VALUES ($1,$2,'packing') RETURNING id`, code, whID).Scan(&id); err != nil {
		t.Fatalf("seed packing location: %v", err)
	}
	return id
}

func seedStorageLoc(t *testing.T, ctx context.Context, tx shared.DBTX, whID int, code string) int {
	t.Helper()
	var id int
	if err := tx.QueryRow(ctx, `
		INSERT INTO warehouse_locations (code, warehouse_id, location_type)
		VALUES ($1,$2,'storage') RETURNING id`, code, whID).Scan(&id); err != nil {
		t.Fatalf("seed storage location: %v", err)
	}
	return id
}

func seedWave(t *testing.T, ctx context.Context, tx shared.DBTX, f testdb.Fixture, packLoc int) int {
	t.Helper()
	var waveID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-RECON-TEST',$1,$2,'open','wave','wave',$3) RETURNING id`,
		f.SalesOrderNo, f.WarehouseID, packLoc).Scan(&waveID); err != nil {
		t.Fatalf("seed wave: %v", err)
	}
	return waveID
}

// TestWaveOrdersFlagsIncompleteOrder proves an order that only got partial
// consolidation is reported as incomplete with the correct short_qty, while
// a fully-consolidated order in the same wave is not.
func TestWaveOrdersFlagsIncompleteOrder(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := seedPackingLoc(t, ctx, tx, f.WarehouseID, "PACK-RECON-1")
	waveID := seedWave(t, ctx, tx, f, packLoc)

	// SO1: needed 10, only 6 consolidated -> short 4, incomplete.
	if _, err := tx.Exec(ctx, `
		INSERT INTO wave_order_lines (pick_list_id, sales_order_id, sales_order_item_id, item_code, required_qty, consolidated_qty)
		VALUES ($1,$2,$3,$4,10,6)`, waveID, f.SalesOrderID, f.SalesOrderItemID, f.ItemCode); err != nil {
		t.Fatalf("wave order line: %v", err)
	}
	// A second, fully-served order must not show up as incomplete.
	var so2ID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO sales_orders (name, customer_name, warehouse_id, wms_status, status)
		VALUES ('SO-RECON-2','Second',$1,'confirmed','confirmed') RETURNING id`, f.WarehouseID).
		Scan(&so2ID); err != nil {
		t.Fatalf("second so: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO wave_order_lines (pick_list_id, sales_order_id, item_code, required_qty, consolidated_qty)
		VALUES ($1,$2,$3,5,5)`, waveID, so2ID, f.ItemCode); err != nil {
		t.Fatalf("second wave order line: %v", err)
	}

	orders, err := waveOrders(ctx, tx, waveID)
	if err != nil {
		t.Fatalf("waveOrders: %v", err)
	}
	if len(orders) != 2 {
		t.Fatalf("got %d orders, want 2", len(orders))
	}
	var so1, so2 *waveOrderRow
	for i := range orders {
		if orders[i].SalesOrderID == f.SalesOrderID {
			so1 = &orders[i]
		}
		if orders[i].SalesOrderID == so2ID {
			so2 = &orders[i]
		}
	}
	if so1 == nil || so1.Complete || so1.ShortQty != 4 {
		t.Errorf("so1 = %+v, want incomplete with short_qty=4", so1)
	}
	if so2 == nil || !so2.Complete || so2.ShortQty != 0 {
		t.Errorf("so2 = %+v, want complete with short_qty=0", so2)
	}
}

// TestWaveOrdersIgnoresOrdersWithNoAllocation proves an SO row with
// required_qty=0 (nothing was ever attributed to it in this wave) doesn't
// falsely block reconciliation as "incomplete".
func TestWaveOrdersIgnoresOrdersWithNoAllocation(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := seedPackingLoc(t, ctx, tx, f.WarehouseID, "PACK-RECON-2")
	waveID := seedWave(t, ctx, tx, f, packLoc)

	if _, err := tx.Exec(ctx, `
		INSERT INTO wave_order_lines (pick_list_id, sales_order_id, sales_order_item_id, item_code, required_qty, consolidated_qty)
		VALUES ($1,$2,$3,$4,0,0)`, waveID, f.SalesOrderID, f.SalesOrderItemID, f.ItemCode); err != nil {
		t.Fatalf("zero-allocation wave order line: %v", err)
	}

	orders, err := waveOrders(ctx, tx, waveID)
	if err != nil {
		t.Fatalf("waveOrders: %v", err)
	}
	if len(orders) != 1 || !orders[0].Complete || orders[0].HasAllocation {
		t.Errorf("zero-allocation order = %+v, want complete=true has_allocation=false", orders[0])
	}
}

// TestLeftoverBreakdownReportsPerItem proves leftover picked-but-unpacked
// stock is broken down by item, not just a single total.
func TestLeftoverBreakdownReportsPerItem(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := seedPackingLoc(t, ctx, tx, f.WarehouseID, "PACK-RECON-3")
	waveID := seedWave(t, ctx, tx, f, packLoc)

	if _, err := tx.Exec(ctx, `
		INSERT INTO pick_list_items (pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty, packed_qty, status, location_id, location_code, balance_id)
		VALUES ($1,$2,$3,15,15,15,10,'picked',$4,$5,$6)`,
		waveID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID); err != nil {
		t.Fatalf("leftover pick line: %v", err)
	}

	lines, total, err := leftoverBreakdown(ctx, tx, waveID)
	if err != nil {
		t.Fatalf("leftoverBreakdown: %v", err)
	}
	if total != 5 {
		t.Fatalf("leftover total = %.0f, want 5", total)
	}
	if len(lines) != 1 || lines[0].ItemCode != f.ItemCode || lines[0].Qty != 5 {
		t.Errorf("leftover lines = %+v, want [{%s 5}]", lines, f.ItemCode)
	}
}

// TestReturnLeftoverToStockMovesQtyBackToStorage proves stranded packing-loc
// stock is moved back to a real storage location, not silently dropped, and
// nets to zero at the packing location.
func TestReturnLeftoverToStockMovesQtyBackToStorage(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := seedPackingLoc(t, ctx, tx, f.WarehouseID, "PACK-RECON-4")
	storageLoc := seedStorageLoc(t, ctx, tx, f.WarehouseID, "STORE-RECON-4")
	_ = storageLoc

	// Seed 5 units physically sitting at the packing location (as if picked
	// but never consolidated/shipped).
	if err := shared.AdjustLocationQtyTx(ctx, tx, f.ItemCode, f.WarehouseID, packLoc, "", 5); err != nil {
		t.Fatalf("seed packing stock: %v", err)
	}

	lines := []leftoverLine{{ItemCode: f.ItemCode, Qty: 5}}
	if err := returnLeftoverToStock(ctx, tx, 0, &f.WarehouseID, &packLoc, lines); err != nil {
		t.Fatalf("returnLeftoverToStock: %v", err)
	}

	var packQty float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
		WHERE location_id=$1 AND item_code=$2`, packLoc, f.ItemCode).Scan(&packQty); err != nil {
		t.Fatalf("packing qty: %v", err)
	}
	if packQty != 0 {
		t.Errorf("packing qty after return = %.0f, want 0", packQty)
	}

	var totalStorageQty float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances slb
		JOIN warehouse_locations wl ON wl.id = slb.location_id
		WHERE slb.item_code=$1 AND wl.warehouse_id=$2 AND wl.location_type IN ('storage','pick_face')`,
		f.ItemCode, f.WarehouseID).Scan(&totalStorageQty); err != nil {
		t.Fatalf("storage qty: %v", err)
	}
	// Fixture already seeds 100 units in a storage/pick_face location; the
	// returned 5 units must land on top of that, not disappear.
	if totalStorageQty != 105 {
		t.Errorf("total storage qty after return = %.0f, want 105 (100 seeded + 5 returned)", totalStorageQty)
	}
}

// TestWriteOffLeftoverZeroesPackingAndPostsLedger proves a write-off removes
// the stranded qty from packing and leaves an auditable negative ledger
// entry rather than just vanishing the number from a report.
func TestWriteOffLeftoverZeroesPackingAndPostsLedger(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := seedPackingLoc(t, ctx, tx, f.WarehouseID, "PACK-RECON-5")

	if err := shared.AdjustLocationQtyTx(ctx, tx, f.ItemCode, f.WarehouseID, packLoc, "", 3); err != nil {
		t.Fatalf("seed packing stock: %v", err)
	}

	lines := []leftoverLine{{ItemCode: f.ItemCode, Qty: 3}}
	if err := writeOffLeftover(ctx, tx, 999, &f.WarehouseID, &packLoc, lines); err != nil {
		t.Fatalf("writeOffLeftover: %v", err)
	}

	var packQty float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
		WHERE location_id=$1 AND item_code=$2`, packLoc, f.ItemCode).Scan(&packQty); err != nil {
		t.Fatalf("packing qty: %v", err)
	}
	if packQty != 0 {
		t.Errorf("packing qty after write-off = %.0f, want 0", packQty)
	}

	var ledgerQty float64
	if err := tx.QueryRow(ctx, `
		SELECT actual_qty FROM stock_ledger_entries
		WHERE item_code=$1 AND voucher_type='Wave Reconcile Write-off' ORDER BY id DESC LIMIT 1`,
		f.ItemCode).Scan(&ledgerQty); err != nil {
		t.Fatalf("ledger entry: %v", err)
	}
	if ledgerQty != -3 {
		t.Errorf("ledger qty = %.0f, want -3", ledgerQty)
	}
}

// TestWaveOrderShortageLinesReturnsPerItemShortfall proves the shortfall fed
// into backorder creation is item-level, not a vague order-level number.
func TestWaveOrderShortageLinesReturnsPerItemShortfall(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := seedPackingLoc(t, ctx, tx, f.WarehouseID, "PACK-RECON-6")
	waveID := seedWave(t, ctx, tx, f, packLoc)

	if _, err := tx.Exec(ctx, `
		INSERT INTO wave_order_lines (pick_list_id, sales_order_id, sales_order_item_id, item_code, required_qty, consolidated_qty)
		VALUES ($1,$2,$3,$4,10,4)`, waveID, f.SalesOrderID, f.SalesOrderItemID, f.ItemCode); err != nil {
		t.Fatalf("wave order line: %v", err)
	}

	lines, err := waveOrderShortageLines(ctx, tx, waveID, f.SalesOrderID)
	if err != nil {
		t.Fatalf("waveOrderShortageLines: %v", err)
	}
	if len(lines) != 1 || lines[0].ItemCode != f.ItemCode || lines[0].Qty != 6 {
		t.Errorf("shortage lines = %+v, want [{%s 6}]", lines, f.ItemCode)
	}

	boNo, created, err := shared.CreateBackorderFromShortages(ctx, tx, waveID, f.SalesOrderNo, "Test Customer", f.WarehouseName, lines)
	if err != nil {
		t.Fatalf("CreateBackorderFromShortages: %v", err)
	}
	if !created || boNo == "" {
		t.Fatalf("expected backorder created, got created=%v no=%q", created, boNo)
	}

	var lineQty float64
	if err := tx.QueryRow(ctx, `
		SELECT bl.qty FROM backorder_lines_v2 bl
		JOIN backorders_v2 b ON b.id = bl.backorder_id
		WHERE b.backorder_no=$1 AND bl.item_code=$2`, boNo, f.ItemCode).Scan(&lineQty); err != nil {
		t.Fatalf("backorder line qty: %v", err)
	}
	if lineQty != 6 {
		t.Errorf("backorder line qty = %.0f, want 6", lineQty)
	}
}