package fulfillment

import (
	"context"
	"fmt"
	"strings"

	"goWMS/api/modules/shared"
)

// ShipBox removes stock from the packing location for all items in the box,
// posts ledger entries, and advances delivered/consumed quantities.
func ShipBox(ctx context.Context, tx shared.DBTX, boxID int) error {
	if boxID <= 0 {
		return fmt.Errorf("box_id required")
	}

	var pickListID *int
	var packingLocID *int
	var warehouseID *int
	var stockConsumed bool
	err := tx.QueryRow(ctx, `
		SELECT pick_list_id, packing_location_id, warehouse_id, COALESCE(stock_consumed,false)
		FROM boxes WHERE id=$1 FOR UPDATE`, boxID).
		Scan(&pickListID, &packingLocID, &warehouseID, &stockConsumed)
	if err != nil {
		return err
	}
	if stockConsumed {
		return nil // idempotent
	}

	if pickListID == nil || *pickListID <= 0 {
		return fmt.Errorf("box has no pick list")
	}

	var fulfillmentType *string
	var plPacking *int
	var plWh *int
	var soNo string
	if err := tx.QueryRow(ctx, `
		SELECT fulfillment_type, packing_location_id, warehouse_id, COALESCE(sales_order_no,'')
		FROM pick_lists WHERE id=$1 FOR UPDATE`, *pickListID).
		Scan(&fulfillmentType, &plPacking, &plWh, &soNo); err != nil {
		return err
	}
	if fulfillmentType == nil || strings.TrimSpace(*fulfillmentType) == "" {
		return ErrLegacyPickList
	}

	packLoc := 0
	if packingLocID != nil && *packingLocID > 0 {
		packLoc = *packingLocID
	} else if plPacking != nil {
		packLoc = *plPacking
	}
	if packLoc <= 0 {
		return ErrNoPackingLoc
	}
	whID := 0
	if warehouseID != nil && *warehouseID > 0 {
		whID = *warehouseID
	} else if plWh != nil {
		whID = *plWh
	}

	rows, err := tx.Query(ctx, `
		SELECT item_code, COALESCE(SUM(quantity),0), COALESCE(MAX(batch_no),'')
		FROM box_items WHERE box_id=$1
		GROUP BY item_code`, boxID)
	if err != nil {
		return err
	}
	type shipLine struct {
		ItemCode string
		Qty      float64
		BatchNo  string
	}
	var lines []shipLine
	for rows.Next() {
		var l shipLine
		if err := rows.Scan(&l.ItemCode, &l.Qty, &l.BatchNo); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	var whName string
	_ = tx.QueryRow(ctx, `SELECT COALESCE(name, code) FROM warehouses WHERE id=$1`, whID).Scan(&whName)

	for _, l := range lines {
		if l.Qty <= 0 {
			continue
		}
		// Deduct from packing balance (unreserved actual).
		var balID int
		var actual float64
		err := tx.QueryRow(ctx, `
			SELECT id, actual_qty FROM stock_location_balances
			WHERE item_code=$1 AND location_id=$2 AND COALESCE(batch_no,'')=COALESCE(NULLIF($3,''),'')
			ORDER BY id FOR UPDATE`,
			l.ItemCode, packLoc, l.BatchNo).Scan(&balID, &actual)
		if err != nil {
			// Try without batch match
			err = tx.QueryRow(ctx, `
				SELECT id, actual_qty FROM stock_location_balances
				WHERE item_code=$1 AND location_id=$2 AND actual_qty > 0
				ORDER BY id FOR UPDATE LIMIT 1`,
				l.ItemCode, packLoc).Scan(&balID, &actual)
		}
		if err != nil || actual+0.0001 < l.Qty {
			return fmt.Errorf("%w: %s need %.0f at packing", ErrInsufficientPack, l.ItemCode, l.Qty)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE stock_location_balances
			SET actual_qty = GREATEST(actual_qty - $1, 0), updated_at=now()
			WHERE id=$2`, l.Qty, balID); err != nil {
			return err
		}

		// Advance pick lines delivered/consumed for this SKU.
		remaining := l.Qty
		plRows, err := tx.Query(ctx, `
			SELECT id, COALESCE(picked_qty,0), COALESCE(consumed_qty,0)
			FROM pick_list_items
			WHERE pick_list_id=$1 AND item_code=$2
			ORDER BY id FOR UPDATE`, *pickListID, l.ItemCode)
		if err != nil {
			return err
		}
		type pl struct {
			ID                 int
			Picked, Consumed   float64
		}
		var pls []pl
		for plRows.Next() {
			var p pl
			if err := plRows.Scan(&p.ID, &p.Picked, &p.Consumed); err != nil {
				plRows.Close()
				return err
			}
			pls = append(pls, p)
		}
		plRows.Close()
		for _, p := range pls {
			if remaining <= 0 {
				break
			}
			room := p.Picked - p.Consumed
			if room <= 0 {
				continue
			}
			take := room
			if take > remaining {
				take = remaining
			}
			newConsumed := p.Consumed + take
			if _, err := tx.Exec(ctx, `
				UPDATE pick_list_items
				SET consumed_qty=$1, delivered_qty=$1,
				    status = CASE WHEN $1+0.0001 >= ordered_qty THEN 'delivered'
				                  WHEN $1 > 0 THEN 'partially_delivered'
				                  ELSE status END
				WHERE id=$2`, newConsumed, p.ID); err != nil {
				return err
			}
			remaining -= take
		}

		if err := postLedger(ctx, tx, l.ItemCode, whName, -l.Qty, "Sales Ship", fmt.Sprintf("BOX-%d", boxID)); err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE boxes SET stock_consumed=true, loaded=true, loaded_at=COALESCE(loaded_at,NOW()) WHERE id=$1`, boxID); err != nil {
		return err
	}

	// Mark pick list stock_consumed when all picked qty is consumed.
	var open int
	_ = tx.QueryRow(ctx, `
		SELECT COUNT(*) FROM pick_list_items
		WHERE pick_list_id=$1 AND COALESCE(picked_qty,0) > COALESCE(consumed_qty,0)`,
		*pickListID).Scan(&open)
	if open == 0 {
		_, _ = tx.Exec(ctx, `
			UPDATE pick_lists SET stock_consumed=true, status='completed' WHERE id=$1`, *pickListID)
	}

	return syncDeliveredProgress(ctx, tx, soNo)
}

func postLedger(ctx context.Context, tx shared.DBTX, itemCode, warehouse string, qty float64, voucherType, voucherNo string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO stock_ledger_entries (
			item_code, warehouse, actual_qty, voucher_type, voucher_no,
			posting_date, posting_datetime, creation
		) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,NOW(),NOW())`,
		itemCode, warehouse, qty, voucherType, voucherNo)
	return err
}

func syncDeliveredProgress(ctx context.Context, tx shared.DBTX, salesOrderNo string) error {
	name := strings.TrimSpace(salesOrderNo)
	if name == "" || strings.Contains(name, ",") {
		return nil
	}
	var soID int
	if err := tx.QueryRow(ctx, `SELECT id FROM sales_orders WHERE name=$1`, name).Scan(&soID); err != nil {
		return nil
	}
	if _, err := tx.Exec(ctx, `
		UPDATE sales_order_items soi
		SET delivered_qty = COALESCE((
		      SELECT SUM(COALESCE(pli.delivered_qty,0))
		      FROM pick_list_items pli
		      JOIN pick_lists pl ON pl.id = pli.pick_list_id
		      WHERE pl.sales_order_no = $1
		        AND COALESCE(pl.status,'') <> 'cancelled'
		        AND pli.item_code = soi.item_code), 0)
		WHERE soi.sales_order_id = $2`, name, soID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE sales_orders so
		SET per_delivered = COALESCE((
		      SELECT ROUND(100 * SUM(LEAST(COALESCE(delivered_qty,0), COALESCE(qty,0)))
		                   / NULLIF(SUM(COALESCE(qty,0)),0), 2)
		      FROM sales_order_items WHERE sales_order_id = so.id), 0),
		    updated_at = NOW()
		WHERE so.id = $1`, soID)
	return err
}
