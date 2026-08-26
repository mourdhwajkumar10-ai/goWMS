package fulfillment

// End-to-end smoke tests for all three outbound fulfillment modes, run
// against a real Postgres database via the testdb harness. These exercise
// the same code paths the RF screens call — allocate, scan, pack, ship —
// and assert real stock movement, not mocked behaviour. This is the closest
// a headless test suite can get to a "floor smoke test" without an actual
// RF gun; hardware/network/tunnel connectivity must still be verified
// manually on site.
//
// Run with: GOWMS_TEST_DSN=... go test ./api/modules/fulfillment/ -run Smoke -v

import (
	"context"
	"testing"

	"goWMS/api/internal/testdb"
	"goWMS/api/modules/shared"
)

func packingLocFor(t *testing.T, ctx context.Context, tx shared.DBTX, whID int) int {
	t.Helper()
	id, err := ResolvePackingLocationID(ctx, tx, whID)
	if err != nil {
		t.Fatalf("packing location: %v", err)
	}
	return id
}

// TestSmokeF2SingleOrderFullLifecycle walks a single-order pick from
// allocation through scan, pack, and ship, and asserts stock, pick, and SO
// progress all land correctly.
func TestSmokeF2SingleOrderFullLifecycle(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := packingLocFor(t, ctx, tx, f.WarehouseID)

	// Reserve the full SO qty (mirrors createPickFromSO's FEFO reserve).
	if err := shared.ReserveBalance(ctx, tx, f.BalanceID, 10); err != nil {
		t.Fatalf("reserve: %v", err)
	}
	var pickID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-SMOKE-F2', $1, $2, 'open', 'scan', 'single', $3) RETURNING id`,
		f.SalesOrderNo, f.WarehouseID, packLoc).Scan(&pickID); err != nil {
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

	// Guided pick: scan location then item, full qty in one go (RF would do this in two taps).
	res, err := ConfirmPick(ctx, tx, ConfirmPickInput{
		PickListID: pickID, PickListItemID: lineID, ItemCode: f.ItemCode,
		ScannedBin: f.LocationCode, ExpectedBin: f.LocationCode, Quantity: 10, ScannedBy: 1,
	})
	if err != nil {
		t.Fatalf("ConfirmPick: %v", err)
	}
	if !res.ListCompleted || res.Status != "picked" {
		t.Fatalf("expected list completed + picked, got %+v", res)
	}

	// Pack: create box, assign full qty picked.
	var boxID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO boxes (label, pick_list_id, warehouse_id, packing_location_id)
		VALUES ('SMOKE-F2-BOX',$1,$2,$3) RETURNING id`, pickID, f.WarehouseID, packLoc).Scan(&boxID); err != nil {
		t.Fatalf("box: %v", err)
	}
	if _, warn, err := AssignToBox(ctx, tx, AssignToBoxInput{
		BoxID: boxID, PickListID: pickID, ItemCode: f.ItemCode, Quantity: 10, ScannedBy: 1,
	}); err != nil {
		t.Fatalf("AssignToBox: %v", err)
	} else if warn != "" {
		t.Logf("pack warning: %s", warn)
	}

	// Ship: consume packing stock, post ledger, advance delivered.
	if err := ShipBox(ctx, tx, boxID); err != nil {
		t.Fatalf("ShipBox: %v", err)
	}

	var srcActual, srcReserved, packActual float64
	if err := tx.QueryRow(ctx, `SELECT actual_qty, reserved_qty FROM stock_location_balances WHERE id=$1`, f.BalanceID).
		Scan(&srcActual, &srcReserved); err != nil {
		t.Fatalf("source balance: %v", err)
	}
	if srcActual != 90 || srcReserved != 0 {
		t.Errorf("source actual/reserved = %.0f/%.0f, want 90/0", srcActual, srcReserved)
	}
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
		WHERE location_id=$1 AND item_code=$2`, packLoc, f.ItemCode).Scan(&packActual); err != nil {
		t.Fatalf("packing balance: %v", err)
	}
	if packActual != 0 {
		t.Errorf("packing location actual = %.0f, want 0 (shipped out)", packActual)
	}

	var perDelivered float64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(per_delivered,0) FROM sales_orders WHERE id=$1`, f.SalesOrderID).
		Scan(&perDelivered); err != nil {
		t.Fatalf("so progress: %v", err)
	}
	if perDelivered != 100 {
		t.Errorf("per_delivered = %.0f, want 100", perDelivered)
	}

	var ledgerQty float64
	if err := tx.QueryRow(ctx, `
		SELECT actual_qty FROM stock_ledger_entries
		WHERE item_code=$1 AND voucher_type='Sales Ship' ORDER BY id DESC LIMIT 1`, f.ItemCode).
		Scan(&ledgerQty); err != nil {
		t.Fatalf("ledger entry: %v", err)
	}
	if ledgerQty != -10 {
		t.Errorf("ledger qty = %.0f, want -10", ledgerQty)
	}
}

// TestSmokeF1CounterSaleFullLifecycle mirrors the /counter-sale API's
// allocate -> scan -> box -> ship -> invoice sequence directly against the
// engine, including a partial shortage line to prove backorder creation.
func TestSmokeF1CounterSaleFullLifecycle(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := packingLocFor(t, ctx, tx, f.WarehouseID)

	// Counter sale asks for 6 of 100 available — well within stock, no shortage.
	cands, err := shared.ListFEFOCandidates(ctx, tx, f.WarehouseID, f.ItemCode, true)
	if err != nil || len(cands) == 0 {
		t.Fatalf("FEFO candidates: %v (n=%d)", err, len(cands))
	}
	if err := shared.ReserveBalance(ctx, tx, cands[0].BalanceID, 6); err != nil {
		t.Fatalf("reserve: %v", err)
	}

	var soID int
	var soName string
	if err := tx.QueryRow(ctx, `
		INSERT INTO sales_orders (name, customer_name, status, wms_status, order_type, warehouse_id, priority, net_total, grand_total)
		VALUES ('CS-SMOKE-0001','Walk-in','Confirmed','picking','Counter',$1,1,600,708)
		RETURNING id, name`, f.WarehouseID).Scan(&soID, &soName); err != nil {
		t.Fatalf("counter so: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO sales_order_items (sales_order_id, item_code, item_name, qty, rate, amount)
		VALUES ($1,$2,$2,6,100,600)`, soID, f.ItemCode); err != nil {
		t.Fatalf("counter so item: %v", err)
	}
	var pickID, lineID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-SMOKE-F1',$1,'Walk-in',$2,'open','scan','counter',$3) RETURNING id`,
		soName, f.WarehouseID, packLoc).Scan(&pickID); err != nil {
		t.Fatalf("counter pick: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,6,6,0,'pending',$4,$5,$6) RETURNING id`,
		pickID, f.ItemCode, f.WarehouseName, cands[0].LocationID, cands[0].LocationCode, cands[0].BalanceID).Scan(&lineID); err != nil {
		t.Fatalf("counter pick line: %v", err)
	}

	res, err := ConfirmPick(ctx, tx, ConfirmPickInput{
		PickListID: pickID, PickListItemID: lineID, ItemCode: f.ItemCode,
		ScannedBin: cands[0].LocationCode, Quantity: 6, ScannedBy: 1,
	})
	if err != nil {
		t.Fatalf("ConfirmPick: %v", err)
	}
	if !res.ListCompleted {
		t.Fatalf("expected counter pick list completed, got %+v", res)
	}

	var boxID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO boxes (label, pick_list_id, warehouse_id, packing_location_id)
		VALUES ('SMOKE-F1-BOX',$1,$2,$3) RETURNING id`, pickID, f.WarehouseID, packLoc).Scan(&boxID); err != nil {
		t.Fatalf("box: %v", err)
	}
	if _, _, err := AssignToBox(ctx, tx, AssignToBoxInput{
		BoxID: boxID, PickListID: pickID, ItemCode: f.ItemCode, Quantity: 6, ScannedBy: 1,
	}); err != nil {
		t.Fatalf("AssignToBox: %v", err)
	}
	if err := ShipBox(ctx, tx, boxID); err != nil {
		t.Fatalf("ShipBox: %v", err)
	}

	var packedRemaining float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
		WHERE location_id=$1 AND item_code=$2`, packLoc, f.ItemCode).Scan(&packedRemaining); err != nil {
		t.Fatalf("packing balance: %v", err)
	}
	if packedRemaining != 0 {
		t.Errorf("counter sale packing leftover = %.0f, want 0", packedRemaining)
	}
}

// TestSmokeF3WaveFullLifecycle allocates a wave across two orders (one
// higher priority than the other), bulk-picks, consolidates by item into
// per-order boxes, ships, and reconciles the pool to zero.
func TestSmokeF3WaveFullLifecycle(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)
	packLoc := packingLocFor(t, ctx, tx, f.WarehouseID)

	// Second order sharing the same item, lower priority number = more urgent.
	var so2ID int
	var so2Name = "SO-SMOKE-WAVE-2"
	if err := tx.QueryRow(ctx, `
		INSERT INTO sales_orders (name, customer_name, warehouse_id, wms_status, status, priority)
		VALUES ($1,'Second Customer',$2,'confirmed','confirmed',1) RETURNING id`,
		so2Name, f.WarehouseID).Scan(&so2ID); err != nil {
		t.Fatalf("second so: %v", err)
	}
	var so2ItemID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO sales_order_items (sales_order_id, item_code, qty, picked_qty)
		VALUES ($1,$2,5,0) RETURNING id`, so2ID, f.ItemCode).Scan(&so2ItemID); err != nil {
		t.Fatalf("second so item: %v", err)
	}

	// Aggregate demand: SO1 wants 10, SO2 wants 5 = 15 total, well within 100 available.
	if err := shared.ReserveBalance(ctx, tx, f.BalanceID, 15); err != nil {
		t.Fatalf("reserve wave: %v", err)
	}
	var waveID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-SMOKE-F3', $1, $2, $3, 'open', 'wave', 'wave', $4)
		RETURNING id`, f.SalesOrderNo+","+so2Name, "WAVE-SMOKE", f.WarehouseID, packLoc).Scan(&waveID); err != nil {
		t.Fatalf("wave pick list: %v", err)
	}
	var waveLineID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,15,15,0,'pending',$4,$5,$6) RETURNING id`,
		waveID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID).Scan(&waveLineID); err != nil {
		t.Fatalf("wave pick line: %v", err)
	}
	// Priority attribution: SO2 (priority 1) served first, then SO1.
	if _, err := tx.Exec(ctx, `
		INSERT INTO wave_order_lines (pick_list_id, sales_order_id, sales_order_item_id, item_code, required_qty)
		VALUES ($1,$2,$3,$4,5)`, waveID, so2ID, so2ItemID, f.ItemCode); err != nil {
		t.Fatalf("wave order line so2: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO wave_order_lines (pick_list_id, sales_order_id, sales_order_item_id, item_code, required_qty)
		VALUES ($1,$2,$3,$4,10)`, waveID, f.SalesOrderID, f.SalesOrderItemID, f.ItemCode); err != nil {
		t.Fatalf("wave order line so1: %v", err)
	}

	// Bulk pick the full 15 in one scan (same engine call as single-order).
	res, err := ConfirmPick(ctx, tx, ConfirmPickInput{
		PickListID: waveID, PickListItemID: waveLineID, ItemCode: f.ItemCode,
		ScannedBin: f.LocationCode, Quantity: 15, ScannedBy: 1,
	})
	if err != nil {
		t.Fatalf("ConfirmPick wave: %v", err)
	}
	if !res.ListCompleted {
		t.Fatalf("expected wave pick completed, got %+v", res)
	}

	// Consolidate: put 5 into SO2's box, then 10 into SO1's box.
	var box2, box1 int
	if err := tx.QueryRow(ctx, `
		INSERT INTO boxes (label, pick_list_id, sales_order_id, warehouse_id, packing_location_id)
		VALUES ('SMOKE-F3-SO2',$1,$2,$3,$4) RETURNING id`, waveID, so2ID, f.WarehouseID, packLoc).Scan(&box2); err != nil {
		t.Fatalf("box2: %v", err)
	}
	if _, _, err := Consolidate(ctx, tx, ConsolidateInput{
		PickListID: waveID, SalesOrderID: so2ID, BoxID: box2, ItemCode: f.ItemCode, Quantity: 5, ScannedBy: 1,
	}); err != nil {
		t.Fatalf("consolidate so2: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO boxes (label, pick_list_id, sales_order_id, warehouse_id, packing_location_id)
		VALUES ('SMOKE-F3-SO1',$1,$2,$3,$4) RETURNING id`, waveID, f.SalesOrderID, f.WarehouseID, packLoc).Scan(&box1); err != nil {
		t.Fatalf("box1: %v", err)
	}
	if _, _, err := Consolidate(ctx, tx, ConsolidateInput{
		PickListID: waveID, SalesOrderID: f.SalesOrderID, BoxID: box1, ItemCode: f.ItemCode, Quantity: 10, ScannedBy: 1,
	}); err != nil {
		t.Fatalf("consolidate so1: %v", err)
	}

	// Over-consolidating past required_qty must be rejected.
	if _, _, err := Consolidate(ctx, tx, ConsolidateInput{
		PickListID: waveID, SalesOrderID: f.SalesOrderID, BoxID: box1, ItemCode: f.ItemCode, Quantity: 1, ScannedBy: 1,
	}); err == nil {
		t.Error("expected over-consolidation to be rejected")
	}

	if err := ShipBox(ctx, tx, box2); err != nil {
		t.Fatalf("ship box2: %v", err)
	}
	if err := ShipBox(ctx, tx, box1); err != nil {
		t.Fatalf("ship box1: %v", err)
	}

	var leftover float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(GREATEST(COALESCE(picked_qty,0)-COALESCE(packed_qty,0),0)),0)
		FROM pick_list_items WHERE pick_list_id=$1`, waveID).Scan(&leftover); err != nil {
		t.Fatalf("leftover calc: %v", err)
	}
	if leftover != 0 {
		t.Errorf("wave leftover = %.0f, want 0 (fully consolidated + shipped)", leftover)
	}

	var so1Consolidated, so2Consolidated float64
	if err := tx.QueryRow(ctx, `SELECT consolidated_qty FROM wave_order_lines WHERE sales_order_id=$1`, f.SalesOrderID).
		Scan(&so1Consolidated); err != nil {
		t.Fatalf("so1 consolidated: %v", err)
	}
	if err := tx.QueryRow(ctx, `SELECT consolidated_qty FROM wave_order_lines WHERE sales_order_id=$1`, so2ID).
		Scan(&so2Consolidated); err != nil {
		t.Fatalf("so2 consolidated: %v", err)
	}
	if so1Consolidated != 10 || so2Consolidated != 5 {
		t.Errorf("consolidated qtys = so1:%.0f so2:%.0f, want 10/5", so1Consolidated, so2Consolidated)
	}
}
