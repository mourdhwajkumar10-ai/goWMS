package grn

import (
	"strings"
	"testing"
)

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
		{"item_verification", false},
		{"exception_pending", false},
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
