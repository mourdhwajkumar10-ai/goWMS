package putaway

import "testing"

func TestVelocityShelfBand(t *testing.T) {
	tests := []struct {
		tier string
		want string
	}{
		{"fast", "middle"},
		{"medium", "lower"},
		{"slow", "upper"},
		{"", "lower"},
		{"invalid", "lower"},
	}
	for _, tt := range tests {
		got := velocityShelfBand(tt.tier)
		if got != tt.want {
			t.Errorf("velocityShelfBand(%q) = %q, want %q", tt.tier, got, tt.want)
		}
	}
}

func TestShelfBandFilter(t *testing.T) {
	tests := []struct {
		band   string
		wantOK bool
	}{
		{"middle", true},
		{"lower", true},
		{"upper", true},
		{"", false},
	}
	for _, tt := range tests {
		got := shelfBandFilter(tt.band)
		if tt.wantOK && got == "" {
			t.Errorf("shelfBandFilter(%q) returned empty, expected non-empty", tt.band)
		}
		if !tt.wantOK && got != "" {
			t.Errorf("shelfBandFilter(%q) returned %q, expected empty", tt.band, got)
		}
	}
}
