package shared

import "testing"

func TestRejectWarehouseRule(t *testing.T) {
	if err := RejectWarehouseRule(nil, 10); err != nil {
		t.Fatalf("nil rule should allow: %v", err)
	}
	if err := RejectWarehouseRule(&WarehousePutawayRule{StockCapacity: 0, CurrentQty: 5}, 10); err != nil {
		t.Fatalf("unset cap should allow: %v", err)
	}
	rule := &WarehousePutawayRule{Warehouse: "MAIN", StockCapacity: 100, CurrentQty: 90, Remaining: 10}
	if err := RejectWarehouseRule(rule, 10); err != nil {
		t.Fatalf("exact remaining should allow: %v", err)
	}
	if err := RejectWarehouseRule(rule, 11); err == nil {
		t.Fatal("over cap should reject")
	}
}

func TestRejectWarehouseRuleZeroRemaining(t *testing.T) {
	rule := &WarehousePutawayRule{Warehouse: "MAIN", StockCapacity: 50, CurrentQty: 50, Remaining: 0}
	if err := RejectWarehouseRule(rule, 1); err == nil {
		t.Fatal("full cap should reject")
	}
}
