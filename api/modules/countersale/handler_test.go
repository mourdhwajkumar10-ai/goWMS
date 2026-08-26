package countersale

import (
	"context"
	"strconv"
	"testing"

	"goWMS/api/internal/testdb"
	"goWMS/api/modules/fulfillment"
	"goWMS/api/modules/shared"
)

func TestIssueGSTInvoiceFromCounterPick(t *testing.T) {
	tx := testdb.Tx(t)
	ctx := context.Background()
	f := testdb.Seed(t, tx)

	var packLocID int
	if err := tx.QueryRow(ctx, `
		SELECT id FROM warehouse_locations
		WHERE warehouse_id=$1 AND location_type='packing' ORDER BY id LIMIT 1`,
		f.WarehouseID).Scan(&packLocID); err != nil {
		if err := tx.QueryRow(ctx, `
			INSERT INTO warehouse_locations (
				code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
				location_type, allow_mixed_items, disabled
			) VALUES ('PACK-01',$1,'PK','PK','01','01','01','low','01','packing',true,false)
			RETURNING id`, f.WarehouseID).Scan(&packLocID); err != nil {
			t.Fatalf("packing loc: %v", err)
		}
	}

	_, _ = tx.Exec(ctx, `
		UPDATE items SET mrp=100, gst_percentage=18, hsn_no='8708', max_rate_discount=10
		WHERE code=$1`, f.ItemCode)

	var soID int
	var soName string
	if err := tx.QueryRow(ctx, `
		INSERT INTO sales_orders (name, customer_name, status, wms_status, order_type, warehouse_id, priority, net_total, grand_total)
		VALUES ('CS-INV-'||floor(random()*100000)::int,'Walk-in','Confirmed','picking','Counter',$1,1,100,118)
		RETURNING id, name`, f.WarehouseID).Scan(&soID, &soName); err != nil {
		t.Fatalf("so: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO sales_order_items (sales_order_id, item_code, item_name, qty, rate, amount)
		VALUES ($1,$2,$2,1,100,100)`, soID, f.ItemCode); err != nil {
		t.Fatalf("soi: %v", err)
	}

	if err := shared.ReserveBalance(ctx, tx, f.BalanceID, 1); err != nil {
		t.Fatalf("reserve: %v", err)
	}
	var pickID, lineID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
		VALUES ('PL-CS-INV',$1,'Walk-in',$2,'open','scan','counter',$3) RETURNING id`,
		soName, f.WarehouseID, packLocID).Scan(&pickID); err != nil {
		t.Fatalf("pick: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO pick_list_items (
			pick_list_id, item_code, warehouse, ordered_qty, allocated_qty, picked_qty,
			status, location_id, location_code, balance_id
		) VALUES ($1,$2,$3,1,1,0,'pending',$4,$5,$6) RETURNING id`,
		pickID, f.ItemCode, f.WarehouseName, f.LocationID, f.LocationCode, f.BalanceID).Scan(&lineID); err != nil {
		t.Fatalf("line: %v", err)
	}

	if _, err := fulfillment.ConfirmPick(ctx, tx, fulfillment.ConfirmPickInput{
		PickListID: pickID, PickListItemID: lineID, ItemCode: f.ItemCode,
		ScannedBin: f.LocationCode, Quantity: 1, ScannedBy: 1,
	}); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	var boxID int
	label := "CSBOX-" + strconv.Itoa(pickID)
	if err := tx.QueryRow(ctx, `
		INSERT INTO boxes (label, pick_list_id, warehouse_id, packing_location_id)
		VALUES ($1,$2,$3,$4) RETURNING id`, label, pickID, f.WarehouseID, packLocID).Scan(&boxID); err != nil {
		t.Fatalf("box: %v", err)
	}
	if _, _, err := fulfillment.AssignToBox(ctx, tx, fulfillment.AssignToBoxInput{
		BoxID: boxID, PickListID: pickID, ItemCode: f.ItemCode, Quantity: 1,
	}); err != nil {
		t.Fatalf("assign: %v", err)
	}
	if err := fulfillment.ShipBox(ctx, tx, boxID); err != nil {
		t.Fatalf("ship: %v", err)
	}

	inv, err := issueGSTInvoice(ctx, tx, invoiceInput{
		SalesOrderNo: soName, CustomerName: "Walk-in", PaymentMode: "Cash",
		WarehouseID: &f.WarehouseID, PickListID: pickID,
	})
	if err != nil {
		t.Fatalf("invoice: %v", err)
	}
	if inv.GrandTotal < 100 {
		t.Errorf("grand_total=%.2f, expected >= 100 with GST", inv.GrandTotal)
	}
	if inv.Name == "" {
		t.Error("invoice name empty")
	}
}
