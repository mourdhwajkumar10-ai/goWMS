package testdb

import (
	"context"
	"testing"
)

func TestSeedCreatesUsableGraph(t *testing.T) {
	tx := Tx(t)
	f := Seed(t, tx)

	if f.WarehouseID == 0 || f.LocationID == 0 || f.BalanceID == 0 ||
		f.SalesOrderID == 0 || f.SalesOrderItemID == 0 {
		t.Fatalf("seed returned zero ids: %+v", f)
	}

	var qty float64
	if err := tx.QueryRow(context.Background(),
		`SELECT actual_qty FROM stock_location_balances WHERE id=$1`,
		f.BalanceID).Scan(&qty); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if qty != 100 {
		t.Errorf("actual_qty = %v, want 100", qty)
	}
}
