package testdb

import (
	"context"
	"strconv"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// Fixture holds the identifiers of a minimal seeded object graph.
type Fixture struct {
	WarehouseID      int
	WarehouseName    string
	LocationID       int
	LocationCode     string
	BalanceID        int
	ItemCode         string
	SalesOrderID     int
	SalesOrderNo     string
	SalesOrderItemID int
}

// Seed inserts one warehouse, one storage location, one item, one stock
// balance of 100 units, and one confirmed sales order for 10 units.
//
// Names are suffixed with the current nanosecond so repeated or parallel runs
// never collide on warehouses_code_key, items_code_key, sales_orders_name_key
// or warehouse_locations_warehouse_code_key.
func Seed(t *testing.T, tx pgx.Tx) Fixture {
	t.Helper()
	ctx := context.Background()
	sfx := strconv.FormatInt(time.Now().UnixNano(), 10)
	f := Fixture{
		WarehouseName: "TESTWH-" + sfx,
		LocationCode:  "T-A01-" + sfx,
		ItemCode:      "TESTITEM-" + sfx,
		SalesOrderNo:  "SO-TEST-" + sfx,
	}

	if err := tx.QueryRow(ctx,
		`INSERT INTO warehouses (name, code) VALUES ($1,$1) RETURNING id`,
		f.WarehouseName).Scan(&f.WarehouseID); err != nil {
		t.Fatalf("seed warehouse %q: %v", f.WarehouseName, err)
	}

	if err := tx.QueryRow(ctx,
		`INSERT INTO warehouse_locations (code, warehouse_id, location_type, disabled)
		 VALUES ($1,$2,'storage',false) RETURNING id`,
		f.LocationCode, f.WarehouseID).Scan(&f.LocationID); err != nil {
		t.Fatalf("seed location %q: %v", f.LocationCode, err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO items (code, name) VALUES ($1,$1)`,
		f.ItemCode); err != nil {
		t.Fatalf("seed item %q: %v", f.ItemCode, err)
	}

	if err := tx.QueryRow(ctx,
		`INSERT INTO stock_location_balances
		   (item_code, warehouse_id, location_id, actual_qty, reserved_qty)
		 VALUES ($1,$2,$3,100,0) RETURNING id`,
		f.ItemCode, f.WarehouseID, f.LocationID).Scan(&f.BalanceID); err != nil {
		t.Fatalf("seed stock balance for %q: %v", f.ItemCode, err)
	}

	if err := tx.QueryRow(ctx,
		`INSERT INTO sales_orders (name, customer_name, warehouse_id, wms_status, status)
		 VALUES ($1,'Test Customer',$2,'confirmed','confirmed') RETURNING id`,
		f.SalesOrderNo, f.WarehouseID).Scan(&f.SalesOrderID); err != nil {
		t.Fatalf("seed sales order %q: %v", f.SalesOrderNo, err)
	}

	if err := tx.QueryRow(ctx,
		`INSERT INTO sales_order_items (sales_order_id, item_code, qty, picked_qty)
		 VALUES ($1,$2,10,0) RETURNING id`,
		f.SalesOrderID, f.ItemCode).Scan(&f.SalesOrderItemID); err != nil {
		t.Fatalf("seed sales order item for %q: %v", f.SalesOrderNo, err)
	}

	return f
}
