package shared

import "testing"

func TestParsePackedItemQR(t *testing.T) {
	tests := []struct {
		in     string
		item   string
		qty    float64
		wantOK bool
	}{
		{"36DH4013-10_13540.00", "36DH4013", 10, true},
		{" 36DH4013-10_13540.00 ", "36DH4013", 10, true},
		{"36DH4013-10_13,540.00", "36DH4013", 10, true},
		{"KIT-CHAIN-5_6770", "KIT-CHAIN", 5, true},
		{"36DH4013", "", 0, false},
		{"BOX-001", "", 0, false},
		{"", "", 0, false},
		{"36DH4013-10", "", 0, false},
	}
	for _, tt := range tests {
		item, qty, ok := ParsePackedItemQR(tt.in)
		if ok != tt.wantOK || item != tt.item || qty != tt.qty {
			t.Errorf("ParsePackedItemQR(%q)=(%q,%v,%v) want (%q,%v,%v)",
				tt.in, item, qty, ok, tt.item, tt.qty, tt.wantOK)
		}
	}
}
