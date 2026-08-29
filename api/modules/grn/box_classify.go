package grn

import (
	"strings"
	"unicode"
)

func normalizeBoxCondition(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "damaged", "damage", "broken":
		return "damaged"
	case "wet":
		return "wet"
	case "crushed", "torn":
		return "crushed"
	default:
		return "ok"
	}
}

func isDamagedCondition(cond string) bool {
	c := normalizeBoxCondition(cond)
	return c == "damaged" || c == "wet" || c == "crushed"
}

// classifyNewBox decides status for a carton that is not already on the GRN.
// Unknown boxes are excess only when a packing list (expected boxes) exists,
// or the session's expected_boxes count is already filled.
func classifyNewBox(hasExpectedList bool, expectedBoxes, alreadyReceived int) (status string, excess bool) {
	if hasExpectedList {
		return "excess", true
	}
	if expectedBoxes > 0 && alreadyReceived >= expectedBoxes {
		return "excess", true
	}
	return "received", false
}

// isDuplicateBoxStatus is true when the carton was already physically received.
// Expected / pending / missing boxes can still be received for the first time.
func isDuplicateBoxStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "received", "accounted", "verified", "box_verified", "item_verified", "completed", "rejected", "exception", "excess":
		return true
	default:
		return false
	}
}

// isInvalidBoxBarcode rejects scans that are empty, huge, or have no letters/digits
// (e.g. "!@#$%^&*()") so they are not silently received as boxes.
func isInvalidBoxBarcode(cartonNo string) bool {
	s := strings.TrimSpace(cartonNo)
	if s == "" || len(s) > 80 {
		return true
	}
	hasAlnum := false
	for _, r := range s {
		if unicode.IsControl(r) {
			return true
		}
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			hasAlnum = true
		}
	}
	return !hasAlnum
}
