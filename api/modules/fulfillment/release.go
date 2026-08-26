package fulfillment

import (
	"context"

	"goWMS/api/modules/shared"
)

// ReleaseReservations cancels a typed or legacy pick list via the shared helper.
func ReleaseReservations(ctx context.Context, tx shared.DBTX, pickListID int) error {
	return shared.ReleasePickListReservations(ctx, tx, pickListID)
}

// ResolvePackingLocationID returns PACK-01 (or first packing loc) for a warehouse.
func ResolvePackingLocationID(ctx context.Context, tx shared.DBTX, warehouseID int) (int, error) {
	var id int
	err := tx.QueryRow(ctx, `
		SELECT id FROM warehouse_locations
		WHERE warehouse_id=$1 AND location_type='packing' AND COALESCE(disabled,false)=false
		ORDER BY CASE WHEN code='PACK-01' THEN 0 ELSE 1 END, id
		LIMIT 1`, warehouseID).Scan(&id)
	if err == nil {
		return id, nil
	}
	err = tx.QueryRow(ctx, `
		INSERT INTO warehouse_locations (
			code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
			location_type, allow_mixed_items, disabled, is_occupied
		) VALUES ('PACK-01',$1,'PK','PK','01','01','01','low','01','packing',true,false,false)
		RETURNING id`, warehouseID).Scan(&id)
	return id, err
}

// IsTyped reports whether the pick list uses the new fulfillment engine.
func IsTyped(ctx context.Context, tx shared.DBTX, pickListID int) (bool, error) {
	var ft *string
	err := tx.QueryRow(ctx, `SELECT fulfillment_type FROM pick_lists WHERE id=$1`, pickListID).Scan(&ft)
	if err != nil {
		return false, err
	}
	return ft != nil && *ft != "", nil
}
