package shared

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ItemBinCapacity is the tightest of: this SKU in this bin, item default, location max.
func ItemBinCapacity(ctx context.Context, q querier, itemCode string, locationID int) (*float64, error) {
	var cap *float64
	err := q.QueryRow(ctx, `
		SELECT MIN(v) FROM (
			SELECT ibc.max_qty FROM item_bin_capacities ibc
			 WHERE ibc.location_id=$1 AND UPPER(ibc.item_code)=UPPER($2)
			UNION ALL
			SELECT i.max_qty_per_bin FROM items i
			 WHERE UPPER(i.code)=UPPER($2) AND COALESCE(i.disabled,false)=false
			UNION ALL
			SELECT wl.max_capacity_qty FROM warehouse_locations wl WHERE wl.id=$1
		) s(v) WHERE v IS NOT NULL AND v > 0`, locationID, itemCode).Scan(&cap)
	if err != nil {
		return nil, err
	}
	return cap, nil
}

// RejectMixedPutaway errors when the bin already holds a different SKU and mixed stock is off.
func RejectMixedPutaway(ctx context.Context, q querier, itemCode string, locationID int) error {
	var allow bool
	err := q.QueryRow(ctx, `
		SELECT COALESCE(allow_mixed_items, true) FROM warehouse_locations WHERE id=$1`, locationID).Scan(&allow)
	if err == pgx.ErrNoRows {
		return fmt.Errorf("target location not found")
	}
	if err != nil {
		return err
	}
	if allow {
		return nil
	}
	var other string
	err = q.QueryRow(ctx, `
		SELECT item_code FROM stock_location_balances
		WHERE location_id=$1 AND actual_qty <> 0 AND UPPER(item_code) <> UPPER($2)
		ORDER BY actual_qty DESC LIMIT 1`, locationID, itemCode).Scan(&other)
	if err == pgx.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	return fmt.Errorf("bin does not allow mixed items (already has %s)", other)
}

// WarehousePutawayRule is the highest-priority active rule for an item in a warehouse.
type WarehousePutawayRule struct {
	ID            int
	Warehouse     string
	Priority      int
	StockCapacity float64
	CurrentQty    float64
	Remaining     float64
}

func LoadWarehousePutawayRule(ctx context.Context, db *pgxpool.Pool, itemCode string, warehouseID int) (*WarehousePutawayRule, error) {
	whCode := ""
	if warehouseID > 0 {
		_ = db.QueryRow(ctx, `SELECT code FROM warehouses WHERE id=$1`, warehouseID).Scan(&whCode)
	}
	var r WarehousePutawayRule
	err := db.QueryRow(ctx, `
		SELECT pr.id, COALESCE(pr.warehouse,''), COALESCE(pr.priority,1), COALESCE(pr.stock_capacity,0)
		FROM putaway_rules pr
		WHERE pr.active=true AND UPPER(pr.item_code)=UPPER($1)
		  AND (
		    $2='' OR UPPER(pr.warehouse)=UPPER($2)
		    OR LOWER(pr.warehouse) IN ('', 'any', '*', 'all')
		  )
		ORDER BY
		  CASE WHEN $2<>'' AND UPPER(pr.warehouse)=UPPER($2) THEN 0 ELSE 1 END,
		  pr.priority ASC
		LIMIT 1`, itemCode, strings.TrimSpace(whCode)).Scan(&r.ID, &r.Warehouse, &r.Priority, &r.StockCapacity)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	_ = db.QueryRow(ctx, `
		SELECT COALESCE(SUM(slb.actual_qty),0)
		FROM stock_location_balances slb
		JOIN warehouse_locations wl ON wl.id = slb.location_id
		WHERE UPPER(slb.item_code)=UPPER($1)
		  AND wl.location_type IN ('pick_face','storage')
		  AND ($2=0 OR slb.warehouse_id=$2)`, itemCode, warehouseID).Scan(&r.CurrentQty)
	if r.StockCapacity > 0 {
		r.Remaining = r.StockCapacity - r.CurrentQty
		if r.Remaining < 0 {
			r.Remaining = 0
		}
	}
	return &r, nil
}

func RejectWarehouseRule(rule *WarehousePutawayRule, qty float64) error {
	if rule == nil || rule.StockCapacity <= 0 {
		return nil
	}
	if rule.CurrentQty+qty > rule.StockCapacity+1e-9 {
		return fmt.Errorf("putaway rule cap %.0f for this item in %s (already %.0f, trying to add %.0f)",
			rule.StockCapacity, rule.Warehouse, rule.CurrentQty, qty)
	}
	return nil
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}
