package po

import "testing"

func TestMergeDuplicatePOItemsAddsQty(t *testing.T) {
	got := mergeDuplicatePOItems([]poCreateItem{
		{ItemCode: "item", ItemName: "Widget", Qty: 10, Rate: 5},
		{ItemCode: "ITEM", ItemName: "Widget", Qty: 10, Rate: 5},
		{ItemCode: "other", Qty: 3, Rate: 1},
		{ItemCode: "  ", Qty: 9},
	})
	if len(got) != 2 {
		t.Fatalf("want 2 lines, got %d", len(got))
	}
	if got[0].ItemCode != "item" || got[0].Qty != 20 || got[0].Amount != 100 {
		t.Fatalf("merged line: %+v", got[0])
	}
	if got[1].ItemCode != "other" || got[1].Qty != 3 {
		t.Fatalf("second line: %+v", got[1])
	}
}
