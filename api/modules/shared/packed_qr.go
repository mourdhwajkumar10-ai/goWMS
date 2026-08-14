package shared

import (
	"strconv"
	"strings"
)

// ParsePackedItemQR parses a Bajaj-style case/box QR:
//
//	{item}-{qty}_{qty * mrp}
//
// Example: 36DH4013-10_13540.00 → item 36DH4013, qty 10.
// Returns ok=false when the payload is a plain item code (or anything else).
func ParsePackedItemQR(raw string) (item string, qty float64, ok bool) {
	s := strings.NewReplacer(" ", "", "\n", "", "\r", "", "\t", "").Replace(strings.TrimSpace(raw))
	if s == "" {
		return "", 0, false
	}
	us := strings.LastIndex(s, "_")
	if us <= 0 || us == len(s)-1 {
		return "", 0, false
	}
	amount := strings.ReplaceAll(s[us+1:], ",", "")
	if _, err := strconv.ParseFloat(amount, 64); err != nil {
		return "", 0, false
	}
	left := s[:us]
	hy := strings.LastIndex(left, "-")
	if hy <= 0 || hy == len(left)-1 {
		return "", 0, false
	}
	item = strings.TrimSpace(left[:hy])
	qty, err := strconv.ParseFloat(left[hy+1:], 64)
	if err != nil || qty <= 0 || item == "" {
		return "", 0, false
	}
	return item, qty, true
}
