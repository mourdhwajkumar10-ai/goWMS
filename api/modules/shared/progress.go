package shared

import (
	"context"
	"strings"
)

// SyncSalesOrderProgress recomputes picked_qty on sales_order_items and
// per_picked on sales_orders from the pick lists that reference the order.
//
// Recomputation rather than increment: scans can be retried, and a SUM over
// current pick-line state is idempotent where "+= qty" is not.
//
// Silently does nothing when salesOrderNo is empty (free-form pick) or
// contains a comma (a wave label, not a single order) — those pick lists
// have no single owning order to attribute progress to.
func SyncSalesOrderProgress(ctx context.Context, tx DBTX, salesOrderNo string) error {
	name := strings.TrimSpace(salesOrderNo)
	if name == "" || strings.Contains(name, ",") {
		return nil
	}

	var soID int
	err := tx.QueryRow(ctx,
		`SELECT id FROM sales_orders WHERE name=$1`, name).Scan(&soID)
	if err != nil {
		// No row, or more than one — nothing safe to attribute.
		return nil
	}

	if _, err := tx.Exec(ctx, `
		UPDATE sales_order_items soi
		SET picked_qty = COALESCE((
		      SELECT SUM(COALESCE(pli.picked_qty,0))
		      FROM pick_list_items pli
		      JOIN pick_lists pl ON pl.id = pli.pick_list_id
		      WHERE pl.sales_order_no = $1
		        AND COALESCE(pl.status,'') <> 'cancelled'
		        AND pli.item_code = soi.item_code), 0)
		WHERE soi.sales_order_id = $2`, name, soID); err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		UPDATE sales_orders so
		SET per_picked = COALESCE((
		      SELECT ROUND(100 * SUM(LEAST(COALESCE(picked_qty,0), COALESCE(qty,0)))
		                   / NULLIF(SUM(COALESCE(qty,0)),0), 2)
		      FROM sales_order_items WHERE sales_order_id = so.id), 0),
		    wms_status = CASE
		      WHEN COALESCE(so.wms_status,'') IN ('draft','confirmed','picking')
		      THEN 'picking' ELSE so.wms_status END
		WHERE so.id = $1`, soID)
	return err
}
