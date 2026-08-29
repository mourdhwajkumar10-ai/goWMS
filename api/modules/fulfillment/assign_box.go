package fulfillment

import (
	"context"
	"fmt"

	"goWMS/api/modules/shared"
)

// AssignToBoxInput packs qty of an item into a box against a pick list.
type AssignToBoxInput struct {
	BoxID      int
	PickListID int
	ItemCode   string
	Quantity   float64
	BatchNo    string
	ScannedBy  int
}

// AssignToBox validates against picked qty and records box_items + packed_qty.
// Does not move stock — boxes sit in the packing location.
func AssignToBox(ctx context.Context, tx shared.DBTX, in AssignToBoxInput) (int, string, error) {
	if in.Quantity <= 0 {
		return 0, "", fmt.Errorf("quantity > 0 required")
	}
	if in.BoxID <= 0 || in.PickListID <= 0 {
		return 0, "", fmt.Errorf("box_id and pick_list_id required")
	}

	// Fix #1: Advisory lock to prevent concurrent AssignToBox for same pick_list_id + item_code
	// from both passing the ceiling check and exceeding picked quantity.
	lockKey1 := int64(in.PickListID) << 32
	lockKey2 := int64(hashItemCode(in.ItemCode))
	_, _ = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1, $2)`, lockKey1, lockKey2)

	var boxPick *int
	if err := tx.QueryRow(ctx,
		`SELECT pick_list_id FROM boxes WHERE id=$1 FOR UPDATE`, in.BoxID).Scan(&boxPick); err != nil {
		return 0, "", err
	}
	if boxPick == nil || *boxPick != in.PickListID {
		return 0, "", fmt.Errorf("box is not linked to pick list %d", in.PickListID)
	}

	var ceiling float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(COALESCE(picked_qty,0)),0)
		FROM pick_list_items WHERE pick_list_id=$1 AND item_code=$2`,
		in.PickListID, in.ItemCode).Scan(&ceiling); err != nil {
		return 0, "", err
	}
	if ceiling <= 0 {
		return 0, "", fmt.Errorf("%w: SKU not picked on this pick list", ErrOverPack)
	}
	var packed float64
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(bi.quantity),0)
		FROM box_items bi JOIN boxes b ON b.id = bi.box_id
		WHERE b.pick_list_id=$1 AND bi.item_code=$2`,
		in.PickListID, in.ItemCode).Scan(&packed); err != nil {
		return 0, "", err
	}
	// Fix #9: Use relative tolerance instead of absolute 0.0001
	tolerance := ceiling * 0.0001
	if packed+in.Quantity > ceiling+tolerance {
		return 0, "", fmt.Errorf("%w: %.0f of %.0f already packed", ErrOverPack, packed, ceiling)
	}

	var batch any
	if in.BatchNo != "" {
		batch = in.BatchNo
	}
	var scannedBy any
	if in.ScannedBy > 0 {
		scannedBy = in.ScannedBy
	}
	var id int
	if err := tx.QueryRow(ctx, `
		INSERT INTO box_items (box_id,item_code,quantity,batch_no,scanned_by,scanned_at)
		VALUES ($1,$2,$3,$4,$5,NOW()) RETURNING id`,
		in.BoxID, in.ItemCode, in.Quantity, batch, scannedBy).Scan(&id); err != nil {
		return 0, "", err
	}

	// Distribute packed_qty across pick lines FEFO-style (lowest id first).
	remaining := in.Quantity
	rows, err := tx.Query(ctx, `
		SELECT id, COALESCE(picked_qty,0), COALESCE(packed_qty,0)
		FROM pick_list_items
		WHERE pick_list_id=$1 AND item_code=$2
		  AND COALESCE(picked_qty,0) > COALESCE(packed_qty,0)
		ORDER BY id
		FOR UPDATE`, in.PickListID, in.ItemCode)
	if err != nil {
		return 0, "", err
	}
	type line struct {
		ID                 int
		Picked, PackedAlready float64
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.ID, &l.Picked, &l.PackedAlready); err != nil {
			rows.Close()
			return 0, "", err
		}
		lines = append(lines, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, "", err
	}

	for _, l := range lines {
		if remaining <= 0 {
			break
		}
		room := l.Picked - l.PackedAlready
		if room <= 0 {
			continue
		}
		take := room
		if take > remaining {
			take = remaining
		}
		if _, err := tx.Exec(ctx,
			`UPDATE pick_list_items SET packed_qty = COALESCE(packed_qty,0) + $1 WHERE id=$2`,
			take, l.ID); err != nil {
			return 0, "", err
		}
		remaining -= take
	}

	warning := ""
	var unitWeight float64
	_ = tx.QueryRow(ctx, `SELECT COALESCE(weight_per_unit,0) FROM items WHERE code=$1`, in.ItemCode).Scan(&unitWeight)
	addWeight := unitWeight * in.Quantity
	if addWeight > 0 {
		var maxWeight *float64
		var declared float64
		_ = tx.QueryRow(ctx, `SELECT max_weight, COALESCE(declared_weight,0) FROM boxes WHERE id=$1`, in.BoxID).
			Scan(&maxWeight, &declared)
		newTotal := declared + addWeight
		_, _ = tx.Exec(ctx, `UPDATE boxes SET declared_weight = COALESCE(declared_weight,0) + $1 WHERE id=$2`, addWeight, in.BoxID)
		if maxWeight != nil && *maxWeight > 0 && newTotal > *maxWeight {
			warning = fmt.Sprintf("box weight would exceed max_weight (%.2f > %.2f)", newTotal, *maxWeight)
		}
	}

	return id, warning, nil
}

func hashItemCode(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}
