package shared

import "testing"

func TestDocLineStatus(t *testing.T) {
	cases := []struct {
		po, pl, inv   float64
		hasPL, hasInv bool
		want          string
	}{
		{10, 10, 0, true, false, "match"},
		{10, 8, 0, true, false, "qty_mismatch"},
		{10, 0, 0, true, false, "missing_from_pl"},
		{0, 5, 0, true, false, "extra_on_pl"},
		{10, 0, 10, false, true, "match"},
		{10, 0, 7, false, true, "qty_mismatch"},
		{10, 0, 0, false, true, "missing_from_invoice"},
		{0, 0, 4, false, true, "extra_on_invoice"},
		{10, 10, 10, true, true, "match"},
	}
	for _, tc := range cases {
		got := DocLineStatus(tc.po, tc.pl, tc.inv, tc.hasPL, tc.hasInv)
		if got != tc.want {
			t.Fatalf("DocLineStatus(%v,%v,%v,pl=%v,inv=%v)=%s want %s",
				tc.po, tc.pl, tc.inv, tc.hasPL, tc.hasInv, got, tc.want)
		}
	}
}
