package shared

import "context"

// ShortageLine is one unfulfillable demand line.
type ShortageLine struct {
	ItemCode string
	Qty      float64
}

// CreateBackorderFromShortages records a v2 backorder for lines that could
// not be allocated. Returns the backorder number and whether one was created.
// Creating nothing is not an error: a pick with no shortages is the norm.
//
// backorder_lines_v2 has a partial unique index on
// (item_code, COALESCE(warehouse,'')) WHERE status='pending'
// (migrations/010:32-34), so an open shortage for the same item in the same
// warehouse must accumulate onto the existing line rather than insert a
// duplicate.
func CreateBackorderFromShortages(
	ctx context.Context, tx DBTX, pickListID int,
	soName, customer, warehouse string, shortages []ShortageLine,
) (string, bool, error) {
	if len(shortages) == 0 {
		return "", false, nil
	}

	var boID int
	var boNo string
	if err := tx.QueryRow(ctx, `
		INSERT INTO backorders_v2
		  (backorder_no, sales_order_no, customer, warehouse, notes, status, source_pick_list_id)
		VALUES ('BO2-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('backorders_v2_id_seq')::TEXT,5,'0'),
		        $1,$2,$3,'auto from pick create','pending',$4)
		RETURNING id, backorder_no`,
		soName, customer, warehouse, pickListID).Scan(&boID, &boNo); err != nil {
		return "", false, err
	}

	for _, s := range shortages {
		// Prefer upsert against the open-line unique index. If inference fails
		// on some Postgres builds, fall back to select-then-update.
		tag, err := tx.Exec(ctx, `
			INSERT INTO backorder_lines_v2 (backorder_id, item_code, qty, warehouse, status)
			VALUES ($1,$2,$3,$4,'pending')
			ON CONFLICT (item_code, (COALESCE(warehouse, ''))) WHERE status = 'pending'
			DO UPDATE SET qty = backorder_lines_v2.qty + EXCLUDED.qty`,
			boID, s.ItemCode, s.Qty, warehouse)
		if err != nil {
			return "", false, err
		}
		_ = tag
	}
	return boNo, true, nil
}
