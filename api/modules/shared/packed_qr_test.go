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
		{"36DH4013-1_1354", "36DH4013", 1, true},
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

func TestParsePackedItemQRDetails(t *testing.T) {
	tests := []struct {
		in     string
		item   string
		qty    float64
		amount float64
		unit   float64
	}{
		{"JL401403-1_759", "JL401403", 1, 759, 759},
		{"36DH4013-10_13540", "36DH4013", 10, 13540, 1354},
		{"36DH4013-10_13540.00", "36DH4013", 10, 13540, 1354},
		{"36DH4013-10_13,540.00", "36DH4013", 10, 13540, 1354},
		{"36DH4013-1_1354", "36DH4013", 1, 1354, 1354},
		{"KIT-CHAIN-5_6770", "KIT-CHAIN", 5, 6770, 1354},
		{"AB-3_300", "AB", 3, 300, 100},
	}
	for _, tt := range tests {
		got, ok := ParsePackedItemQRDetails(tt.in)
		if !ok {
			t.Fatalf("ParsePackedItemQRDetails(%q) not ok", tt.in)
		}
		if got.Item != tt.item || got.Qty != tt.qty || got.Amount != tt.amount || got.UnitPrice != tt.unit {
			t.Errorf("ParsePackedItemQRDetails(%q)=%+v want item=%q qty=%v amount=%v unit=%v",
				tt.in, got, tt.item, tt.qty, tt.amount, tt.unit)
		}
	}
	for _, bad := range []string{"JL401403", "BOX-001", "", "36DH4013-10", "AB-0_100"} {
		if _, ok := ParsePackedItemQRDetails(bad); ok {
			t.Errorf("ParsePackedItemQRDetails(%q) should not parse", bad)
		}
	}
}
