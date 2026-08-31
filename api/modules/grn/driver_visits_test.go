package grn

import "testing"

func TestDriverVisitStatusOrder(t *testing.T) {
	if driverVisitStatusRank("planned") != 0 || driverVisitStatusRank("signed_off") != 4 {
		t.Fatalf("status ranks unexpected")
	}
	if timestampColumnForStatus("dock") != "dock_at" || timestampColumnForStatus("planned") != "" {
		t.Fatalf("timestamp columns unexpected")
	}
	if driverVisitStatusRank("cancelled") != 99 {
		t.Fatal("cancelled should be terminal rank")
	}
}
