package grn

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DefaultOverReceiptPct is the fallback tolerance when PO item has no explicit limit.
const DefaultOverReceiptPct = 10.0

// CheckOverReceipt blocks if scanned exceeds baseline by more than the PO's max_overreceipt_pct
// (or DefaultOverReceiptPct when unset). Returns nil if within tolerance.
func CheckOverReceipt(ctx context.Context, db *pgxpool.Pool, sessionID int, itemCode string, baselineQty, scannedQty float64) error {
	if baselineQty <= 0 || scannedQty <= baselineQty {
		return nil
	}

	var maxPct float64
	_ = db.QueryRow(ctx, `
		SELECT COALESCE(poi.max_overreceipt_pct, 0)
		FROM grn_sessions gs
		JOIN purchase_orders po ON po.name = gs.purchase_receipt_no
		JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND UPPER(poi.item_code)=UPPER($2)
		WHERE gs.id=$1 LIMIT 1`, sessionID, itemCode).Scan(&maxPct)

	tolerance := maxPct
	if tolerance <= 0 {
		tolerance = DefaultOverReceiptPct
	}

	overPct := (scannedQty - baselineQty) / baselineQty * 100
	if overPct > tolerance {
		return fmt.Errorf("over-receipt blocked: %.1f%% exceeds max %.1f%% (default tolerance %.0f%%)", overPct, tolerance, DefaultOverReceiptPct)
	}
	return nil
}
