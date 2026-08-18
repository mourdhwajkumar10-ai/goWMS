package packinglist

import "testing"

func TestPackingBoxStage(t *testing.T) {
	tests := []struct {
		status, cond, want string
	}{
		{"", "ok", "awaiting"},
		{"pending", "ok", "awaiting"},
		{"received", "ok", "counted"},
		{"received", "damaged", "damaged"},
		{"received", "broken", "damaged"},
		{"verified", "ok", "verified"},
		{"verified", "damaged", "verified"},
		{"accounted", "wet", "damaged"},
		{"expected", "ok", "awaiting"},
		{"scanned", "ok", "counted"},
	}
	for _, tt := range tests {
		if got := packingBoxStage(tt.status, tt.cond); got != tt.want {
			t.Errorf("packingBoxStage(%q, %q) = %q, want %q", tt.status, tt.cond, got, tt.want)
		}
	}
	if got := packingBoxStageEx("expected", "ok", true); got != "counted" {
		t.Errorf("expected+scanned_at = %q, want counted", got)
	}
}

func TestPackingItemStage(t *testing.T) {
	tests := []struct {
		status            string
		expected, scanned float64
		want              string
	}{
		{"pending", 10, 0, "pending"},
		{"pending", 10, 4, "scanning"},
		{"shortage", 10, 4, "shortage"},
		{"full_match", 10, 10, "matched"},
		{"excess", 10, 12, "excess"},
		{"", 10, 10, "matched"},
	}
	for _, tt := range tests {
		if got := packingItemStage(tt.status, tt.expected, tt.scanned); got != tt.want {
			t.Errorf("packingItemStage(%q, %.0f, %.0f) = %q, want %q", tt.status, tt.expected, tt.scanned, got, tt.want)
		}
	}
}
