package fulfillment

import (
	"context"
	"fmt"

	"goWMS/api/modules/shared"
)

// ConsolidateInput is one put-to-order placement from the wave bulk pool.
type ConsolidateInput struct {
	PickListID   int
	SalesOrderID int
	BoxID        int
	ItemCode     string
	Quantity     float64
	BatchNo      string
	ScannedBy    int
}

// Consolidate draws down wave_order_lines and assigns into the order's box.
func Consolidate(ctx context.Context, tx shared.DBTX, in ConsolidateInput) (int, string, error) {
	if in.Quantity <= 0 {
		return 0, "", fmt.Errorf("quantity > 0 required")
	}

	// Fix #2: Advisory lock to prevent concurrent Consolidate + AssignToBox on same item
	lockKey1 := int64(in.PickListID) << 32
	lockKey2 := int64(hashItemCode(in.ItemCode))
	_, _ = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1, $2)`, lockKey1, lockKey2)

	var wolID int
	var required, consolidated float64
	err := tx.QueryRow(ctx, `
		SELECT id, required_qty, consolidated_qty
		FROM wave_order_lines
		WHERE pick_list_id=$1 AND sales_order_id=$2 AND item_code=$3
		FOR UPDATE`,
		in.PickListID, in.SalesOrderID, in.ItemCode).
		Scan(&wolID, &required, &consolidated)
	if err != nil {
		return 0, "", fmt.Errorf("no wave order line for item %s on order %d", in.ItemCode, in.SalesOrderID)
	}
	// Fix #9: Use relative tolerance
	tolerance := required * 0.0001
	if consolidated+in.Quantity > required+tolerance {
		return 0, "", fmt.Errorf("%w: consolidating %.0f would exceed required %.0f", ErrOverPack, in.Quantity, required-consolidated)
	}

	boxID := in.BoxID
	if boxID <= 0 {
		return 0, "", fmt.Errorf("box_id required")
	}
	// Ensure box is linked to this SO when column is set.
	_, _ = tx.Exec(ctx, `
		UPDATE boxes SET sales_order_id = COALESCE(sales_order_id, $1), pick_list_id = COALESCE(pick_list_id, $2)
		WHERE id=$3`, in.SalesOrderID, in.PickListID, boxID)

	id, warning, err := AssignToBox(ctx, tx, AssignToBoxInput{
		BoxID:      boxID,
		PickListID: in.PickListID,
		ItemCode:   in.ItemCode,
		Quantity:   in.Quantity,
		BatchNo:    in.BatchNo,
		ScannedBy:  in.ScannedBy,
	})
	if err != nil {
		return 0, "", err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE wave_order_lines SET consolidated_qty = consolidated_qty + $1 WHERE id=$2`,
		in.Quantity, wolID); err != nil {
		return 0, "", err
	}
	return id, warning, nil
}
