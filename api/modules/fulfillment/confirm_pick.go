package fulfillment

import (
	"context"
	"fmt"
	"strings"

	"goWMS/api/modules/shared"
)

// ConfirmPickInput is one verified scan against a pick list line.
type ConfirmPickInput struct {
	PickListID     int
	PickListItemID int
	ItemCode       string
	ScannedBin     string
	ExpectedBin    string
	Quantity       float64
	ScannedBy      int
	Override       bool
	OverrideBy     int
	OverrideReason string
}

// ConfirmPickResult is returned on success.
type ConfirmPickResult struct {
	LogID          int
	LogNo          string
	PickListItemID int
	PickedQty      float64
	Status         string
	LocationDrift  bool
	ListCompleted  bool
}

// ConfirmPick verifies location/item, moves stock source → packing, advances picked_qty.
func ConfirmPick(ctx context.Context, tx shared.DBTX, in ConfirmPickInput) (*ConfirmPickResult, error) {
	if in.Quantity <= 0 {
		in.Quantity = 1
	}
	if in.PickListID <= 0 {
		return nil, fmt.Errorf("pick_list_id required")
	}

	var fulfillmentType *string
	var packingLocID *int
	var warehouseID *int
	var soNo string
	err := tx.QueryRow(ctx, `
		SELECT fulfillment_type, packing_location_id, warehouse_id, COALESCE(sales_order_no,'')
		FROM pick_lists WHERE id=$1 FOR UPDATE`, in.PickListID).
		Scan(&fulfillmentType, &packingLocID, &warehouseID, &soNo)
	if err != nil {
		return nil, err
	}
	if fulfillmentType == nil || strings.TrimSpace(*fulfillmentType) == "" {
		return nil, ErrLegacyPickList
	}
	if packingLocID == nil || *packingLocID <= 0 {
		return nil, ErrNoPackingLoc
	}
	whID := 0
	if warehouseID != nil {
		whID = *warehouseID
	}

	var (
		itemID                     int
		itemCode, locCode, status  string
		ordered, picked, allocated float64
		balanceID                  *int
		batchNo                    string
		locationID                 *int
	)
	if in.PickListItemID > 0 {
		err = tx.QueryRow(ctx, `
			SELECT id, item_code, COALESCE(location_code,''), COALESCE(status,'pending'),
			       COALESCE(ordered_qty,0), COALESCE(picked_qty,0), COALESCE(allocated_qty,0),
			       balance_id, COALESCE(batch_no,''), location_id
			FROM pick_list_items WHERE id=$1 AND pick_list_id=$2 FOR UPDATE`,
			in.PickListItemID, in.PickListID).
			Scan(&itemID, &itemCode, &locCode, &status, &ordered, &picked, &allocated, &balanceID, &batchNo, &locationID)
	} else {
		err = tx.QueryRow(ctx, `
			SELECT id, item_code, COALESCE(location_code,''), COALESCE(status,'pending'),
			       COALESCE(ordered_qty,0), COALESCE(picked_qty,0), COALESCE(allocated_qty,0),
			       balance_id, COALESCE(batch_no,''), location_id
			FROM pick_list_items
			WHERE pick_list_id=$1 AND item_code=$2
			  AND COALESCE(status,'pending') IN ('pending','partial','in_progress')
			  AND ($3='' OR location_code=$3 OR location_code IS NULL)
			ORDER BY
			  CASE WHEN location_code = $3 THEN 0 ELSE 1 END,
			  expiry_date NULLS LAST, id
			LIMIT 1
			FOR UPDATE`,
			in.PickListID, in.ItemCode, in.ScannedBin).
			Scan(&itemID, &itemCode, &locCode, &status, &ordered, &picked, &allocated, &balanceID, &batchNo, &locationID)
	}
	if err != nil {
		_ = logScan(ctx, tx, in, itemID, itemCode, locCode, true)
		return nil, ErrLineNotPickable
	}
	if status == "shortage" || status == "cancelled" || status == "picked" || status == "delivered" {
		_ = logScan(ctx, tx, in, itemID, itemCode, locCode, true)
		return nil, ErrLineNotPickable
	}

	wantItem := strings.TrimSpace(in.ItemCode)
	if wantItem != "" && !strings.EqualFold(wantItem, itemCode) {
		_ = logScan(ctx, tx, in, itemID, itemCode, locCode, true)
		return nil, ErrWrongItem
	}

	expected := in.ExpectedBin
	if expected == "" {
		expected = locCode
	}
	locationDrift := in.ScannedBin != "" && expected != "" &&
		!strings.EqualFold(strings.TrimSpace(in.ScannedBin), strings.TrimSpace(expected))
	if locationDrift && !in.Override {
		_ = logScan(ctx, tx, in, itemID, itemCode, expected, true)
		return nil, ErrWrongLocation
	}

	target := allocated
	if target <= 0 {
		target = ordered
	}
	if picked+in.Quantity > target+0.0001 {
		_ = logScan(ctx, tx, in, itemID, itemCode, expected, true)
		return nil, ErrOverPick
	}

	// Move stock: consume reserve+actual at source, add actual at packing.
	if balanceID != nil && *balanceID > 0 {
		if err := shared.ConsumeReserved(ctx, tx, *balanceID, in.Quantity); err != nil {
			return nil, err
		}
	}
	if whID <= 0 {
		_ = tx.QueryRow(ctx, `
			SELECT warehouse_id FROM warehouse_locations WHERE id=$1`, *packingLocID).Scan(&whID)
	}
	if err := shared.AdjustLocationQtyTx(ctx, tx, itemCode, whID, *packingLocID, batchNo, in.Quantity); err != nil {
		return nil, err
	}

	newPicked := picked + in.Quantity
	newStatus := "in_progress"
	if newPicked+0.0001 >= target {
		newStatus = "picked"
	}
	if _, err := tx.Exec(ctx,
		`UPDATE pick_list_items SET picked_qty=$1, status=$2 WHERE id=$3`,
		newPicked, newStatus, itemID); err != nil {
		return nil, err
	}

	_, _ = tx.Exec(ctx, `UPDATE pick_lists SET status='open' WHERE id=$1 AND status='draft'`, in.PickListID)

	var remaining int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM pick_list_items
		WHERE pick_list_id=$1 AND COALESCE(allocated_qty,0) > 0
		  AND COALESCE(picked_qty,0) < COALESCE(allocated_qty, ordered_qty)`,
		in.PickListID).Scan(&remaining); err != nil {
		return nil, err
	}
	listCompleted := remaining == 0
	if listCompleted {
		if _, err := tx.Exec(ctx,
			`UPDATE pick_lists SET status='completed' WHERE id=$1 AND COALESCE(stock_consumed,false)=false`,
			in.PickListID); err != nil {
			return nil, err
		}
	}

	if err := shared.SyncSalesOrderProgress(ctx, tx, soNo); err != nil {
		return nil, err
	}

	logID, logNo, err := insertScanLog(ctx, tx, in, itemID, itemCode, expected, locationDrift, false)
	if err != nil {
		return nil, err
	}

	return &ConfirmPickResult{
		LogID:          logID,
		LogNo:          logNo,
		PickListItemID: itemID,
		PickedQty:      newPicked,
		Status:         newStatus,
		LocationDrift:  locationDrift,
		ListCompleted:  listCompleted,
	}, nil
}

func logScan(ctx context.Context, tx shared.DBTX, in ConfirmPickInput, itemID int, itemCode, expected string, rejected bool) error {
	_, _, err := insertScanLog(ctx, tx, in, itemID, itemCode, expected, true, rejected)
	return err
}

func insertScanLog(ctx context.Context, tx shared.DBTX, in ConfirmPickInput, itemID int, itemCode, expected string, drift, rejected bool) (int, string, error) {
	var logID int
	var logNo string
	var overrideBy any
	var overrideReason any
	if in.Override {
		if in.OverrideBy > 0 {
			overrideBy = in.OverrideBy
		}
		if strings.TrimSpace(in.OverrideReason) != "" {
			overrideReason = in.OverrideReason
		}
	}
	var scannedBy any
	if in.ScannedBy > 0 {
		scannedBy = in.ScannedBy
	}
	pli := any(nil)
	if itemID > 0 {
		pli = itemID
	}
	code := itemCode
	if code == "" {
		code = in.ItemCode
	}
	err := tx.QueryRow(ctx, `
		INSERT INTO pick_scan_logs (
			log_no, pick_list_id, pick_list_item_id, item_code,
			scanned_bin, expected_bin, location_drift, quantity, scanned_by,
			rejected, override_by, override_reason
		) VALUES (
			'PS-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_scan_logs_id_seq')::TEXT,5,'0'),
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
		) RETURNING id, log_no`,
		in.PickListID, pli, code, in.ScannedBin, expected,
		drift, in.Quantity, scannedBy, rejected, overrideBy, overrideReason,
	).Scan(&logID, &logNo)
	return logID, logNo, err
}
