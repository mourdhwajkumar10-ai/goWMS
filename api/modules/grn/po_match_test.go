package grn

import "testing"

func TestDecideMissingBoxLine(t *testing.T) {
	tests := []struct {
		name                      string
		hasPL, sub, onPO, onOther bool
		want                      string
	}{
		{"packing list unknown item", true, false, false, false, itemDecisionWrongItem},
		{"packing list item on PO but wrong box", true, false, true, false, itemDecisionWrongItem},
		{"packing list other PO", true, false, false, true, itemDecisionWrongPO},
		{"no list item on this PO", false, false, true, false, itemDecisionAcceptPO},
		{"no list item on this and other PO", false, false, true, true, itemDecisionAcceptPO},
		{"no list other PO only", false, false, false, true, itemDecisionWrongPO},
		{"no list unknown item", false, false, false, false, itemDecisionWrongItem},
		{"substitute always first", false, true, true, false, itemDecisionSubstitute},
		{"substitute even with packing list", true, true, false, false, itemDecisionSubstitute},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := decideMissingBoxLine(tt.hasPL, tt.sub, tt.onPO, tt.onOther)
			if got != tt.want {
				t.Fatalf("got %q want %q", got, tt.want)
			}
		})
	}
}

func TestClassifyItemScan(t *testing.T) {
	st, excess := classifyItemScan(10, 4, false)
	if st != "pending" || excess != 0 {
		t.Fatalf("partial packing-list scan should stay pending, got %s excess=%v", st, excess)
	}
	st, excess = classifyItemScan(10, 12, false)
	if st != "excess" || excess != 2 {
		t.Fatalf("overscan packing-list: %s %v", st, excess)
	}
	st, excess = classifyItemScan(10, 3, true)
	if st != "full_match" || excess != 0 {
		t.Fatalf("PO fallback must not mark shortage mid-scan, got %s excess=%v", st, excess)
	}
}

func TestFoldPOExpectedPartsMergesDuplicateSKU(t *testing.T) {
	got := foldPOExpectedParts(
		[]partBoxQty{
			{PartNo: "item", Expected: 10},
			{PartNo: "ITEM", Expected: 10},
		},
		[]partBoxQty{
			{PartNo: "item", BoxNo: "box1", Scanned: 10},
			{PartNo: "item", BoxNo: "box2", Scanned: 10},
		},
	)
	if len(got) != 1 {
		t.Fatalf("want 1 part, got %d: %+v", len(got), got)
	}
	if got[0].Expected != 20 || got[0].Scanned != 20 {
		t.Fatalf("want expected 20 scanned 20, got %+v", got[0])
	}
}

func TestClassifyNewBoxStillAllowsUnknownWhenNoList(t *testing.T) {
	st, excess := classifyNewBox(false, 0, 0)
	if st != "received" || excess {
		t.Fatalf("skip packing list: new box should be received, got %s excess=%v", st, excess)
	}
	st, excess = classifyNewBox(true, 10, 2)
	if st != "excess" || !excess {
		t.Fatalf("with packing list unknown box is excess, got %s excess=%v", st, excess)
	}
}
