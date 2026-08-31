package grn

import (
	"strings"
	"testing"
)

func TestClampAuditSampleSize(t *testing.T) {
	tests := []struct {
		in, want int
	}{
		{0, 5},
		{-3, 5},
		{1, 1},
		{20, 20},
		{100, 100},
		{101, 100},
	}
	for _, tt := range tests {
		if got := clampAuditSampleSize(tt.in); got != tt.want {
			t.Errorf("clampAuditSampleSize(%d) = %d, want %d", tt.in, got, tt.want)
		}
	}
}

func TestSessionAuditable(t *testing.T) {
	if !sessionAuditable("putaway_pending") || !sessionAuditable("receiving") || !sessionAuditable("") {
		t.Fatal("open statuses must be auditable")
	}
	if sessionAuditable("completed") || sessionAuditable("closed") || sessionAuditable("CLOSED") {
		t.Fatal("completed/closed must not be auditable")
	}
}

func TestAuditItemResult(t *testing.T) {
	if auditItemResult(10, 10) != "pass" {
		t.Fatal("equal qty must pass")
	}
	if auditItemResult(10, 8) != "fail" {
		t.Fatal("mismatch must fail")
	}
	if auditItemResult(10, 0) != "fail" {
		t.Fatal("zero physical vs positive system is fail, not empty")
	}
}

func TestAuditReadyToComplete(t *testing.T) {
	if err := auditReadyToComplete(0, 0); err == nil {
		t.Fatal("zero items must block complete")
	}
	if err := auditReadyToComplete(5, 3); err == nil || !strings.Contains(err.Error(), "3/5") {
		t.Fatalf("partial check must block, got %v", err)
	}
	if err := auditReadyToComplete(5, 5); err != nil {
		t.Fatalf("all checked must allow complete: %v", err)
	}
}
