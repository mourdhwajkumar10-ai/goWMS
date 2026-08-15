package shared

import (
	"math"
	"strconv"
	"strings"
)

// PackedItemQR is a decoded item/case label.
type PackedItemQR struct {
	Item string `json:"item_code"`
	Qty  float64 `json:"qty"`
	// Amount is the calculated line amount (qty * unit price).
	Amount float64 `json:"amount"`
	// UnitPrice is the trailing price on the label.
	UnitPrice float64 `json:"unit_price"`
}

// ParsePackedItemQRDetails parses a Bajaj-style case/box QR:
//
//	{item}-{qty}_{unit price}
//
// Examples:
//
//	36DH4013-10_1354.00 → item 36DH4013, qty 10, amount 13540, unit price 1354
//	JL401403-1_759       → item JL401403, qty 1, amount 759, unit price 759
//
// Item codes may contain hyphens (KIT-CHAIN-5_6770), so quantity and amount are
// read from the right. Returns ok=false for a plain item code or anything else.
func ParsePackedItemQRDetails(raw string) (PackedItemQR, bool) {
	var out PackedItemQR
	s := strings.NewReplacer(" ", "", "\n", "", "\r", "", "\t", "").Replace(strings.TrimSpace(raw))
	if s == "" {
		return out, false
	}
	us := strings.LastIndex(s, "_")
	if us <= 0 || us == len(s)-1 {
		return out, false
	}
	unitPrice, err := strconv.ParseFloat(strings.ReplaceAll(s[us+1:], ",", ""), 64)
	if err != nil || unitPrice < 0 {
		return out, false
	}
	left := s[:us]
	hy := strings.LastIndex(left, "-")
	if hy <= 0 || hy == len(left)-1 {
		return out, false
	}
	item := strings.TrimSpace(left[:hy])
	qty, err := strconv.ParseFloat(left[hy+1:], 64)
	if err != nil || qty <= 0 || item == "" {
		return out, false
	}
	out = PackedItemQR{
		Item:      item,
		Qty:       qty,
		UnitPrice: math.Round(unitPrice*100) / 100,
		Amount:    math.Round(qty*unitPrice*100) / 100,
	}
	return out, true
}

// ParsePackedItemQR reports the item and quantity only.
func ParsePackedItemQR(raw string) (item string, qty float64, ok bool) {
	p, ok := ParsePackedItemQRDetails(raw)
	if !ok {
		return "", 0, false
	}
	return p.Item, p.Qty, true
}
