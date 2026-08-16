package putaway

import "testing"

func TestVelocityShelfBandIntegration(t *testing.T) {
	// Test that fast items map to middle shelves
	// Test that medium items map to lower shelves
	// Test that slow items map to upper shelves
	// Test fallback for unknown tier
	tests := []struct {
		name     string
		tier     string
		wantBand string
	}{
		{"fast item goes to middle shelf", "fast", "middle"},
		{"medium item goes to lower shelf", "medium", "lower"},
		{"slow item goes to upper shelf", "slow", "upper"},
		{"unknown tier defaults to lower", "unknown", "lower"},
		{"empty tier defaults to lower", "", "lower"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := velocityShelfBand(tt.tier)
			if got != tt.wantBand {
				t.Errorf("velocityShelfBand(%q) = %q, want %q", tt.tier, got, tt.wantBand)
			}
		})
	}
}

func TestShelfBandFilterIntegration(t *testing.T) {
	// Test that each band returns valid SQL fragment
	bands := []string{"middle", "lower", "upper", ""}
	for _, band := range bands {
		filter := shelfBandFilter(band)
		if band != "" && filter == "" {
			t.Errorf("shelfBandFilter(%q) returned empty for valid band", band)
		}
		if band == "" && filter != "" {
			t.Errorf("shelfBandFilter(%q) returned non-empty for empty band", band)
		}
	}
}
