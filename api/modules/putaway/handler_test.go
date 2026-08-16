package putaway

import (
	"testing"
)

func TestSuggestWithVelocityTier(t *testing.T) {
	tests := []struct {
		name     string
		tier     string
		wantBand string
		wantSQL  bool
	}{
		{"fast item targets middle shelf", "fast", "middle", true},
		{"medium item targets lower shelf", "medium", "lower", true},
		{"slow item targets upper shelf", "slow", "upper", true},
		{"unknown tier defaults to lower shelf", "unknown", "lower", true},
		{"empty tier defaults to lower shelf", "", "lower", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			band := velocityShelfBand(tt.tier)
			if band != tt.wantBand {
				t.Errorf("velocityShelfBand(%q) = %q, want %q", tt.tier, band, tt.wantBand)
			}
			filter := shelfBandFilter(band)
			if tt.wantSQL && filter == "" {
				t.Errorf("shelfBandFilter(%q) returned empty, want SQL fragment", band)
			}
		})
	}
}

func TestSuggestVelocityFallback(t *testing.T) {
	for _, tier := range []string{"fast", "medium", "slow", ""} {
		band := velocityShelfBand(tier)
		filter := shelfBandFilter(band)
		if filter == "" {
			t.Errorf("tier %q produced band %q with empty filter — suggest fallback would skip shelf filter", tier, band)
		}
	}
}

func TestSuggestEmptyFilterForUnknown(t *testing.T) {
	filter := shelfBandFilter("")
	if filter != "" {
		t.Errorf("shelfBandFilter(\"\") = %q, want empty (triggers suggest fallback)", filter)
	}
}
