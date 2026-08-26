package countersale

// Idle counter-sale sessions (blocker #6): a cashier opens a counter sale,
// walks away or the walk-in customer leaves, and the reservation sits held
// against real stock forever. StartIdleReaper periodically finds counter
// sessions with no scan activity for a configurable window and cancels them
// the same way a manual cancel would — releasing reservations and marking
// the backing "Counter" sales order cancelled.

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"

	"goWMS/api/modules/fulfillment"

	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultIdleMinutes = 20

// StartIdleReaper launches a background loop that cancels abandoned counter
// sessions. Call once at server startup; it runs until ctx is cancelled.
func StartIdleReaper(ctx context.Context, db *pgxpool.Pool) {
	idleMinutes := defaultIdleMinutes
	if v := os.Getenv("GOWMS_COUNTER_IDLE_MINUTES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			idleMinutes = n
		}
	}
	interval := time.Duration(idleMinutes) * time.Minute / 4
	if interval < time.Minute {
		interval = time.Minute
	}
	log.Printf("counter-sale idle reaper: cancelling sessions idle > %d min (checking every %s)", idleMinutes, interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if n, err := ReapIdleSessions(ctx, db, idleMinutes); err != nil {
				log.Printf("counter-sale idle reaper: %v", err)
			} else if n > 0 {
				log.Printf("counter-sale idle reaper: cancelled %d abandoned session(s)", n)
			}
		}
	}
}

// ReapIdleSessions cancels open counter-sale pick lists whose most recent
// activity (creation or last scan) is older than idleMinutes. Returns the
// number of sessions cancelled. Safe to call repeatedly / concurrently —
// each cancellation is its own transaction and re-checks status under lock.
func ReapIdleSessions(ctx context.Context, db *pgxpool.Pool, idleMinutes int) (int, error) {
	rows, err := db.Query(ctx, `
		SELECT pl.id
		FROM pick_lists pl
		WHERE pl.fulfillment_type='counter'
		  AND pl.status='open'
		  AND COALESCE(pl.stock_consumed,false)=false
		  AND GREATEST(
		        pl.created_at,
		        COALESCE((SELECT MAX(scanned_at) FROM pick_scan_logs WHERE pick_list_id = pl.id), pl.created_at)
		      ) < NOW() - ($1 * INTERVAL '1 minute')`, idleMinutes)
	if err != nil {
		return 0, err
	}
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	cancelled := 0
	for _, id := range ids {
		if err := cancelIdleSession(ctx, db, id); err != nil {
			log.Printf("counter-sale idle reaper: cancel pick_list %d: %v", id, err)
			continue
		}
		cancelled++
	}
	return cancelled, nil
}

func cancelIdleSession(ctx context.Context, db *pgxpool.Pool, pickListID int) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var ft, soNo, status string
	var stockConsumed bool
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(fulfillment_type,''), COALESCE(sales_order_no,''), status, COALESCE(stock_consumed,false)
		FROM pick_lists WHERE id=$1 FOR UPDATE`, pickListID).Scan(&ft, &soNo, &status, &stockConsumed); err != nil {
		return err
	}
	if ft != "counter" || status != "open" || stockConsumed {
		return nil // already progressed/cancelled by the cashier — nothing to do
	}
	if err := fulfillment.ReleaseReservations(ctx, tx, pickListID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE pick_lists SET status='cancelled' WHERE id=$1`, pickListID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE sales_orders SET wms_status='cancelled', status='Cancelled', updated_at=NOW()
		WHERE name=$1 AND order_type='Counter'`, soNo); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
