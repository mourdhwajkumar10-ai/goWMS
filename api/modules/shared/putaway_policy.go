package shared

import (
	"context"
	"fmt"
	"math"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ItemBinCapacity is the tightest of: this SKU in this bin, item default, location max.
// Returns nil (no cap) when no explicit capacity is configured anywhere.
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

// itemUnitVolumeSQL derives a usable unit volume: explicit value first, else L*W*H.
// Used both in Go and embedded in SQL so the two stay consistent.
const itemUnitVolumeSQL = `COALESCE(NULLIF(i.unit_volume_cm3,0), i.unit_length_cm * i.unit_width_cm * i.unit_height_cm, 0)`

// itemPhysical returns an item's weight (kg) and unit volume (cm³).
// Both are 0 when unknown, which signals "skip that fit layer".
func itemPhysical(ctx context.Context, q querier, itemCode string) (weightKg, volumeCM3 float64) {
	var l, w, h float64
	_ = q.QueryRow(ctx, `
		SELECT COALESCE(weight_per_unit,0), COALESCE(unit_volume_cm3,0),
		       COALESCE(unit_length_cm,0), COALESCE(unit_width_cm,0), COALESCE(unit_height_cm,0)
		FROM items WHERE UPPER(code)=UPPER($1)`, strings.TrimSpace(itemCode)).
		Scan(&weightKg, &volumeCM3, &l, &w, &h)
	if volumeCM3 <= 0 && l > 0 && w > 0 && h > 0 {
		volumeCM3 = l * w * h
	}
	return weightKg, volumeCM3
}

// locationPhysical returns a bin's max weight (kg) and usable volume (cm³).
func locationPhysical(ctx context.Context, q querier, locationID int) (maxWeightKg, binVolumeCM3 float64) {
	var l, w, h float64
	_ = q.QueryRow(ctx, `
		SELECT COALESCE(max_weight_kg,0), COALESCE(volume_cm3,0),
		       COALESCE(length_cm,0), COALESCE(width_cm,0), COALESCE(height_cm,0)
		FROM warehouse_locations WHERE id=$1`, locationID).
		Scan(&maxWeightKg, &binVolumeCM3, &l, &w, &h)
	if binVolumeCM3 <= 0 && l > 0 && w > 0 && h > 0 {
		binVolumeCM3 = l * w * h
	}
	return maxWeightKg, binVolumeCM3
}

// locationOccupied returns the total weight and volume already sitting in a bin,
// across every SKU (bins are usually mixed). Unknown SKUs contribute 0 to the
// dimension they lack, so the estimate is a lower bound.
func locationOccupied(ctx context.Context, q querier, locationID int) (weightKg, volumeCM3 float64) {
	_ = q.QueryRow(ctx, `
		SELECT COALESCE(SUM(slb.actual_qty * COALESCE(i.weight_per_unit,0)),0),
		       COALESCE(SUM(slb.actual_qty * `+itemUnitVolumeSQL+`),0)
		FROM stock_location_balances slb
		LEFT JOIN items i ON UPPER(i.code)=UPPER(slb.item_code)
		WHERE slb.location_id=$1 AND slb.actual_qty <> 0`, locationID).
		Scan(&weightKg, &volumeCM3)
	return weightKg, volumeCM3
}

// ComputeMaxFitUnits returns how many of requestedQty units fit in the location,
// applying the tightest of: quantity cap, weight limit, and volume limit. Each
// layer is skipped when its inputs are missing. The returned value is floored.
func ComputeMaxFitUnits(ctx context.Context, q querier, itemCode string, locationID int, requestedQty float64) (float64, error) {
	if requestedQty <= 0 {
		return 0, nil
	}
	itemCode = strings.TrimSpace(itemCode)

	cap, err := ItemBinCapacity(ctx, q, itemCode, locationID)
	if err != nil {
		return 0, err
	}
	var onHand float64
	_ = q.QueryRow(ctx, `
		SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
		WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`, locationID, itemCode).Scan(&onHand)

	fits := requestedQty
	if cap != nil {
		free := *cap - onHand
		if free < 0 {
			free = 0
		}
		if free < fits {
			fits = free
		}
	}

	uw, uv := itemPhysical(ctx, q, itemCode)
	maxW, binV := locationPhysical(ctx, q, locationID)
	occW, occV := locationOccupied(ctx, q, locationID)

	if uw > 0 && maxW > 0 {
		room := maxW - occW
		if room < 0 {
			room = 0
		}
		if byWeight := room / uw; byWeight < fits {
			fits = byWeight
		}
	}
	if uv > 0 && binV > 0 {
		room := binV - occV
		if room < 0 {
			room = 0
		}
		if byVolume := room / uv; byVolume < fits {
			fits = byVolume
		}
	}
	if fits < 0 {
		fits = 0
	}
	return math.Floor(fits + 1e-9), nil
}

// CheckBinLimits returns an error when adding qty of itemCode to locationID would
// exceed the bin's weight or volume capacity. It returns nil when data is missing.
func CheckBinLimits(ctx context.Context, q querier, itemCode string, locationID int, qty float64) error {
	if qty <= 0 {
		return nil
	}
	uw, uv := itemPhysical(ctx, q, itemCode)
	maxW, binV := locationPhysical(ctx, q, locationID)
	occW, occV := locationOccupied(ctx, q, locationID)

	if uw > 0 && maxW > 0 && occW+qty*uw > maxW+1e-9 {
		return fmt.Errorf("bin weight limit %.1f kg exceeded (already %.1f kg, adding %.1f kg)",
			maxW, occW, qty*uw)
	}
	if uv > 0 && binV > 0 && occV+qty*uv > binV+1e-9 {
		return fmt.Errorf("bin volume limit %.0f cm³ exceeded (already %.0f cm³, adding %.0f cm³) — split or pick a larger bin",
			binV, occV, qty*uv)
	}
	return nil
}
