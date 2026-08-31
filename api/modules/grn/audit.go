package grn

import (
	"fmt"
	"strings"
)

func clampAuditSampleSize(n int) int {
	if n < 1 {
		return 5
	}
	if n > 100 {
		return 100
	}
	return n
}

func sessionAuditable(status string) bool {
	st := strings.ToLower(strings.TrimSpace(status))
	return st != "completed" && st != "closed"
}

func auditItemResult(systemQty, physicalQty float64) string {
	if physicalQty == systemQty {
		return "pass"
	}
	return "fail"
}

func auditReadyToComplete(itemCount, checked int) error {
	if itemCount < 1 {
		return fmt.Errorf("no sample items to complete")
	}
	if checked < itemCount {
		return fmt.Errorf("check all sample items before completing (%d/%d)", checked, itemCount)
	}
	return nil
}
