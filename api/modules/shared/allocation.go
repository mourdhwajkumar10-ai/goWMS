package shared

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DBTX is satisfied by *pgxpool.Pool and pgx.Tx.
type DBTX interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// FEFOCandidate is an allocatable slice of location stock ordered by expiry.
type FEFOCandidate struct {
	BalanceID    int
	LocationID   int
	LocationCode string
	BatchNo      string
	ExpiryDate   *time.Time
	Available    float64
}

// ListFEFOCandidates returns storage/pick_face balances for an item, FEFO-first.
// Locks matching balance rows when called inside a transaction (FOR UPDATE).
func ListFEFOCandidates(ctx context.Context, db DBTX, warehouseID int, itemCode string, forUpdate bool) ([]FEFOCandidate, error) {
	itemCode = strings.TrimSpace(itemCode)
	sql := `
		SELECT slb.id, slb.location_id, wl.code,
		       COALESCE(slb.batch_no,''),
		       (SELECT MIN(b.expiry_date) FROM batches b
		        WHERE b.item_code = slb.item_code AND b.batch_id = slb.batch_no),
		       (slb.actual_qty - slb.reserved_qty) AS available
		FROM stock_location_balances slb
		JOIN warehouse_locations wl ON wl.id = slb.location_id
		WHERE slb.item_code = $1
		  AND slb.warehouse_id = $2
		  AND COALESCE(wl.disabled,false) = false
		  AND wl.location_type IN ('storage','pick_face')
		  AND (slb.actual_qty - slb.reserved_qty) > 0
		ORDER BY
		  (SELECT MIN(b.expiry_date) FROM batches b
		   WHERE b.item_code = slb.item_code AND b.batch_id = slb.batch_no) NULLS LAST,
		  slb.id`
	if forUpdate {
		sql += ` FOR UPDATE OF slb`
	}
	rows, err := db.Query(ctx, sql, itemCode, warehouseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []FEFOCandidate
	for rows.Next() {
		var c FEFOCandidate
		if err := rows.Scan(&c.BalanceID, &c.LocationID, &c.LocationCode, &c.BatchNo, &c.ExpiryDate, &c.Available); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ReserveBalance increases reserved_qty on a balance row. Fails if insufficient available.
func ReserveBalance(ctx context.Context, db DBTX, balanceID int, qty float64) error {
	if qty <= 0 {
		return nil
	}
	tag, err := db.Exec(ctx, `
		UPDATE stock_location_balances
		SET reserved_qty = reserved_qty + $1, updated_at = now()
		WHERE id = $2 AND (actual_qty - reserved_qty) >= $1`,
		qty, balanceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("insufficient available qty to reserve on balance %d", balanceID)
	}
	return nil
}

// ReleaseReserved decreases reserved_qty without touching actual_qty.
func ReleaseReserved(ctx context.Context, db DBTX, balanceID int, qty float64) error {
	if qty <= 0 {
		return nil
	}
	_, err := db.Exec(ctx, `
		UPDATE stock_location_balances
		SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at = now()
		WHERE id = $2`,
		qty, balanceID)
	return err
}

// ConsumeReserved decreases both actual_qty and reserved_qty (ship/dispatch).
func ConsumeReserved(ctx context.Context, db DBTX, balanceID int, qty float64) error {
	if qty <= 0 {
		return nil
	}
	tag, err := db.Exec(ctx, `
		UPDATE stock_location_balances
		SET actual_qty = GREATEST(actual_qty - $1, 0),
		    reserved_qty = GREATEST(reserved_qty - $1, 0),
		    updated_at = now()
		WHERE id = $2`,
		qty, balanceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("balance %d not found", balanceID)
	}

	var locationID int
	var itemCode string
	_ = db.QueryRow(ctx, `SELECT location_id, item_code FROM stock_location_balances WHERE id=$1`, balanceID).
		Scan(&locationID, &itemCode)
	if locationID > 0 {
		_, _ = db.Exec(ctx, `
			UPDATE warehouse_locations SET is_occupied = (
				EXISTS (SELECT 1 FROM stock_location_balances s WHERE s.location_id=$1 AND s.actual_qty > 0)
			), updated_at=now() WHERE id=$1`, locationID)
	}
	return nil
}

// ConsumePickListStock consumes reserved location stock for a pick list (idempotent per line).
// Consumes picked_qty (or allocated if nothing picked yet but forceAllocated), releases unused reserve.
func ConsumePickListStock(ctx context.Context, db DBTX, pickListID int) error {
	if pickListID <= 0 {
		return nil
	}
	rows, err := db.Query(ctx, `
		SELECT id, COALESCE(balance_id,0), COALESCE(allocated_qty,0), COALESCE(picked_qty,0), COALESCE(consumed_qty,0)
		FROM pick_list_items
		WHERE pick_list_id = $1
		ORDER BY id`, pickListID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type line struct {
		ID, BalanceID                 int
		Allocated, Picked, Consumed   float64
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.ID, &l.BalanceID, &l.Allocated, &l.Picked, &l.Consumed); err != nil {
			return err
		}
		lines = append(lines, l)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for _, l := range lines {
		if l.BalanceID <= 0 {
			continue
		}
		// Ship what was picked; if never scanned, ship allocated (auto-pick).
		toShip := l.Picked
		if toShip <= 0 {
			toShip = l.Allocated
		}
		consumeNow := toShip - l.Consumed
		if consumeNow < 0 {
			consumeNow = 0
		}
		releaseNow := l.Allocated - toShip
		if releaseNow < 0 {
			releaseNow = 0
		}
		// Only release unused reserve once (when not yet consumed).
		if l.Consumed > 0 {
			releaseNow = 0
		}

		if err := ConsumeReserved(ctx, db, l.BalanceID, consumeNow); err != nil {
			return err
		}
		if err := ReleaseReserved(ctx, db, l.BalanceID, releaseNow); err != nil {
			return err
		}
		if consumeNow > 0 || releaseNow > 0 {
			_, err = db.Exec(ctx, `
				UPDATE pick_list_items
				SET consumed_qty = $1, delivered_qty = $1, status = CASE
					WHEN $1 >= ordered_qty THEN 'delivered'
					WHEN $1 > 0 THEN 'partially_delivered'
					ELSE status END
				WHERE id = $2`, toShip, l.ID)
			if err != nil {
				return err
			}
		}
	}

	_, err = db.Exec(ctx, `UPDATE pick_lists SET stock_consumed = true, status='completed' WHERE id=$1`, pickListID)
	return err
}
