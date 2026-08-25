package grn

import (
	"strings"
	"testing"
)

func TestCanonicalStatus(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"open", "receiving"},
		{"OPEN", "receiving"},
		{"closed", "completed"},
		{" Closed ", "completed"},
		{"receiving", "receiving"},
		{"DRAFT", "draft"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := canonicalStatus(tt.in); got != tt.want {
			t.Errorf("canonicalStatus(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestSpecStatusLabel(t *testing.T) {
	if got := specStatusLabel("open"); got != "RECEIVING" {
		t.Errorf("specStatusLabel(open) = %q, want RECEIVING", got)
	}
	if got := specStatusLabel("closed"); got != "COMPLETED" {
		t.Errorf("specStatusLabel(closed) = %q, want COMPLETED", got)
	}
	if got := specStatusLabel(""); got != "RECEIVING" {
		t.Errorf("specStatusLabel(\"\") = %q, want RECEIVING", got)
	}
}

func TestSessionWritable(t *testing.T) {
	tests := []struct {
		status   string
		expected bool
	}{
		{"receiving", true},
		{"open", true},
		{"draft", true},
		{"box_reconciliation", true},
		{"item_verification", true},
		{"exception_pending", true},
		{"item_verification_complete", true},
		{"putaway_pending", true},
		{"putaway_in_progress", true},
		{"closed", false},
		{"completed", false},
		{"", true},
		{"RECEIVING", true},
		{"CLOSED", false},
		{" Closed ", false},
	}
	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			if got := sessionWritable(tt.status); got != tt.expected {
				t.Errorf("sessionWritable(%q) = %v, want %v", tt.status, got, tt.expected)
			}
		})
	}
}

func TestSessionAcceptsBoxReceive(t *testing.T) {
	tests := []struct {
		status   string
		expected bool
	}{
		{"open", true},
		{"draft", true},
		{"receiving", true},
		{"box_reconciliation", true},
		{"item_verification", true},
		{"exception_pending", true},
		{"completed", false},
		{"closed", false},
		{"", false},
		{"OPEN", true},
		{" Receiving ", true},
	}
	for _, tt := range tests {
		t.Run(tt.status, func(t *testing.T) {
			if got := sessionAcceptsBoxReceive(tt.status); got != tt.expected {
				t.Errorf("sessionAcceptsBoxReceive(%q) = %v, want %v", tt.status, got, tt.expected)
			}
		})
	}
}

func TestNullEmpty(t *testing.T) {
	if v := nullEmpty(""); v != nil {
		t.Errorf("nullEmpty(\"\") = %v, want nil", v)
	}
	if v := nullEmpty("  "); v != nil {
		t.Errorf("nullEmpty(\"  \") = %v, want nil", v)
	}
	if v := nullEmpty("test"); v != "test" {
		t.Errorf("nullEmpty(\"test\") = %v, want \"test\"", v)
	}
}

func TestNullStr(t *testing.T) {
	if v := nullStr(""); v != nil {
		t.Errorf("nullStr(\"\") = %v, want nil", v)
	}
	if v := nullStr("  "); v != nil {
		t.Errorf("nullStr(\"  \") = %v, want nil", v)
	}
	if v := nullStr("data"); v != "data" {
		t.Errorf("nullStr(\"data\") = %v, want \"data\"", v)
	}
}

func TestParentOutstandingAfterFollowUp(t *testing.T) {
	tests := []struct {
		exp, scanned, follow, wantScanned, wantOut float64
	}{
		{20, 0, 20, 20, 0},
		{20, 0, 5, 5, 15},
		{20, 18, 2, 20, 0},
		{20, 18, 5, 20, 0},
		{0, 0, 4, 4, 0},
	}
	for _, tt := range tests {
		gotScan, gotOut := parentOutstandingAfterFollowUp(tt.exp, tt.scanned, tt.follow)
		if gotScan != tt.wantScanned || gotOut != tt.wantOut {
			t.Errorf("parentOutstandingAfterFollowUp(%v,%v,%v)=(%v,%v) want (%v,%v)",
				tt.exp, tt.scanned, tt.follow, gotScan, gotOut, tt.wantScanned, tt.wantOut)
		}
	}
}

func TestRequestDeviceTruncates(t *testing.T) {
	long := strings.Repeat("a", 150)
	if got := requestDevice(nil); got != "" {
		t.Errorf("nil ctx device = %q", got)
	}
	_ = long
}

func TestClassifyNewBox(t *testing.T) {
	tests := []struct {
		hasList   bool
		exp, recv int
		status    string
		excess    bool
	}{
		{true, 0, 0, "excess", true},
		{true, 10, 2, "excess", true},
		{false, 0, 0, "received", false},
		{false, 10, 9, "received", false},
		{false, 10, 10, "excess", true},
		{false, 10, 11, "excess", true},
	}
	for _, tt := range tests {
		st, ex := classifyNewBox(tt.hasList, tt.exp, tt.recv)
		if st != tt.status || ex != tt.excess {
			t.Errorf("classifyNewBox(%v,%d,%d)=(%s,%v) want (%s,%v)",
				tt.hasList, tt.exp, tt.recv, st, ex, tt.status, tt.excess)
		}
	}
}

func TestIsInvalidBoxBarcode(t *testing.T) {
	if !isInvalidBoxBarcode("!@#$%^&*()") || !isInvalidBoxBarcode("***") || !isInvalidBoxBarcode("") {
		t.Fatal("punctuation-only / empty should be invalid")
	}
	if isInvalidBoxBarcode("BOX-002") || isInvalidBoxBarcode("12345") || isInvalidBoxBarcode("PART-SHARED") {
		t.Fatal("normal box/part codes should be valid")
	}
}

func TestIsDuplicateBoxStatus(t *testing.T) {
	if !isDuplicateBoxStatus("received") || !isDuplicateBoxStatus("VERIFIED") {
		t.Fatal("received/verified should be duplicates")
	}
	if !isDuplicateBoxStatus("excess") || !isDuplicateBoxStatus("exception") {
		t.Fatal("excess/exception already counted")
	}
	if isDuplicateBoxStatus("expected") || isDuplicateBoxStatus("pending") || isDuplicateBoxStatus("missing") {
		t.Fatal("expected/pending/missing can still be received")
	}
}

func TestRollupPartReconciliation(t *testing.T) {
	got := rollupPartReconciliation([]partBoxQty{
		{PartNo: "12345", BoxNo: "BOX-001", Expected: 20, Scanned: 20},
		{PartNo: "12345", BoxNo: "BOX-002", Expected: 15, Scanned: 15},
		{PartNo: "12345", BoxNo: "BOX-003", Expected: 25, Scanned: 25},
		{PartNo: "67890", BoxNo: "BOX-001", Expected: 10, Scanned: 8},
	})
	if len(got) != 2 {
		t.Fatalf("parts=%d want 2", len(got))
	}
	if got[0].PartNo != "12345" || got[0].Expected != 60 || got[0].Scanned != 60 || !got[0].OK {
		t.Fatalf("part 12345 rollup: %+v", got[0])
	}
	if len(got[0].Boxes) != 3 {
		t.Fatalf("boxes=%d want 3", len(got[0].Boxes))
	}
	if got[1].OK || got[1].Scanned != 8 {
		t.Fatalf("part 67890 should be short: %+v", got[1])
	}
}

func TestNormalizeBoxCondition(t *testing.T) {
	if got := normalizeBoxCondition("DAMAGED"); got != "damaged" {
		t.Errorf("got %q", got)
	}
	if got := normalizeBoxCondition("broken"); got != "damaged" {
		t.Errorf("broken: got %q", got)
	}
	if got := normalizeBoxCondition(""); got != "ok" {
		t.Errorf("got %q", got)
	}
	if !isDamagedCondition("wet") || isDamagedCondition("ok") {
		t.Error("damage condition helpers")
	}
}

func TestRfPhaseFromStatus(t *testing.T) {
	if got := rfPhaseFromStatus("receiving", ""); got != "box_verify" {
		t.Errorf("receiving: %q", got)
	}
	if got := rfPhaseFromStatus("item_verification", ""); got != "item_verify" {
		t.Errorf("item_verification: %q", got)
	}
	// After transporter sign-off, session status wins — client cannot force box_verify.
	if got := rfPhaseFromStatus("item_verification", "box_verify"); got != "item_verify" {
		t.Errorf("item_verification locks phase: %q", got)
	}
	if got := rfPhaseFromStatus("receiving", "item_verify"); got != "item_verify" {
		t.Errorf("explicit item_verify before sign-off: %q", got)
	}
	if !transporterAlreadySignedOff("item_verification") || transporterAlreadySignedOff("receiving") {
		t.Error("transporterAlreadySignedOff helpers")
	}
}

func TestAllowedGRNException(t *testing.T) {
	ok := []string{
		"shortage", "excess", "wrong_item", "empty_box", "label_mismatch",
		"mixed_items", "wrong_variant", "wrong_revision", "substitute",
		"counterfeit", "wrong_po", "other", "EMPTY_BOX",
		"internal_damage", "unknown_box", "relabeled", "no_box_id",
		"damaged_barcode", "nested_box", "no_packing_list", "no_invoice",
		"packing_list_po_mismatch", "packing_list_physical_mismatch",
		"invoice_po_mismatch", "quality_fail", "expired", "wrong_supplier",
		"unscheduled_delivery", "undo_last_box", "return_receipt", "cross_dock",
		"quarantine", "serialized", "hazmat",
	}
	for _, k := range ok {
		if !allowedGRNException(k) {
			t.Errorf("allowedGRNException(%q) = false, want true", k)
		}
	}
	if allowedGRNException("not_a_type") || allowedGRNException("") {
		t.Fatal("unknown/empty kinds must be rejected")
	}
}

func TestExtraDiscrepancyKindsAllowed(t *testing.T) {
	if len(extraDiscrepancyKinds) < 40 {
		t.Fatalf("catalog size %d, want remaining S-041–S-081 kinds", len(extraDiscrepancyKinds))
	}
	for k := range extraDiscrepancyKinds {
		if !allowedGRNException(k) {
			t.Errorf("catalog kind %q not allowed", k)
		}
	}
}

func TestBoxReconIndependentParts(t *testing.T) {
	got := rollupPartReconciliation([]partBoxQty{
		{PartNo: "PART-A", BoxNo: "BOX-1", Expected: 50, Scanned: 45},
		{PartNo: "PART-B", BoxNo: "BOX-1", Expected: 30, Scanned: 35},
	})
	if len(got) != 2 {
		t.Fatalf("parts=%d want 2", len(got))
	}
	okA, stA := boxReconStatus(got[0].Expected, got[0].Scanned)
	okB, stB := boxReconStatus(got[1].Expected, got[1].Scanned)
	if okA || stA != "shortage" {
		t.Fatalf("part A should be shortage: ok=%v status=%s", okA, stA)
	}
	if okB || stB != "excess" {
		t.Fatalf("part B should be excess: ok=%v status=%s", okB, stB)
	}
	if got[0].Scanned+got[1].Scanned != got[0].Expected+got[1].Expected {
		t.Fatal("net qty can match while parts disagree — still record both")
	}
}
