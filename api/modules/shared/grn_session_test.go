package shared

import "testing"

func TestDerivePackingListNo(t *testing.T) {
	if got := DerivePackingListNo("GRN-2026-00296"); got != "PL-2026-00296" {
		t.Fatalf("got %q", got)
	}
	if got := DerivePackingListNo("GRN-2026-BFTEST2"); got != "PL-2026-BFTEST2" {
		t.Fatalf("got %q", got)
	}
	if DerivePackingListNo("") != "" {
		t.Fatal("empty session")
	}
}
