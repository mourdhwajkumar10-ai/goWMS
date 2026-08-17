package putaway

import (
	"fmt"
	"strconv"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func createSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			WarehouseID int    `json:"warehouse_id"`
			Zone        string `json:"zone"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.WarehouseID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse_id required")
		}

		userID := 0
		if v, ok := c.Locals("user_id").(int); ok {
			userID = v
		}

		// Cancel any stale sessions for this user first
		_, _ = db.Exec(c.Context(),
			`UPDATE putaway_sessions SET status='cancelled', completed_at=now()
			 WHERE user_id=$1 AND status='picking'`, userID)

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO putaway_sessions (user_id, warehouse_id, zone, status)
			 VALUES ($1, $2, NULLIF($3,''), 'picking') RETURNING id`,
			userID, body.WarehouseID, body.Zone).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "picking"})
	}
}

func getSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}

		var session struct {
			ID          int     `json:"id"`
			WarehouseID int     `json:"warehouse_id"`
			Zone        *string `json:"zone"`
			Status      string  `json:"status"`
			StartedAt   string  `json:"started_at"`
		}
		err = db.QueryRow(c.Context(),
			`SELECT id, warehouse_id, zone, status, started_at::text
			 FROM putaway_sessions WHERE id=$1`, sessionID).
			Scan(&session.ID, &session.WarehouseID, &session.Zone, &session.Status, &session.StartedAt)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Get picked items
		rows, err := db.Query(c.Context(),
			`SELECT psi.id, psi.item_code, psi.qty, psi.status,
			        wl.code as source_code, i.name as item_name
			 FROM putaway_session_items psi
			 JOIN warehouse_locations wl ON wl.id = psi.source_location_id
			 LEFT JOIN items i ON UPPER(i.code) = UPPER(psi.item_code)
			 WHERE psi.session_id=$1
			 ORDER BY psi.id`, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type item struct {
			ID       int     `json:"id"`
			ItemCode string  `json:"item_code"`
			ItemName *string `json:"item_name"`
			Qty      float64 `json:"qty"`
			Status   string  `json:"status"`
			Source   string  `json:"source"`
		}
		items := []item{}
		for rows.Next() {
			var i item
			if err := rows.Scan(&i.ID, &i.ItemCode, &i.ItemName, &i.Qty, &i.Status, &i.Source); err != nil {
				continue
			}
			items = append(items, i)
		}

		return shared.OK(c, fiber.Map{
			"session": session,
			"items":   items,
		})
	}
}

func cancelSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE putaway_sessions SET status='cancelled', completed_at=now(), updated_at=now()
			 WHERE id=$1 AND status='picking'`, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "session not found or already completed")
		}

		_, _ = db.Exec(c.Context(), `
			UPDATE warehouse_locations wl
			SET last_picked_by_user_id = NULL, updated_at = now()
			FROM putaway_session_items psi
			WHERE psi.session_id = $1
				AND psi.source_location_id = wl.id
				AND psi.status = 'picked'`, sessionID)

		return shared.OK(c, fiber.Map{"status": "cancelled"})
	}
}

func sessionHeartbeat(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}

		_, err = db.Exec(c.Context(),
			`UPDATE putaway_sessions SET updated_at=$1 WHERE id=$2 AND status='picking'`,
			time.Now(), sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"ok": true})
	}
}

func pickSessionItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}

		var body struct {
			ItemCode         string  `json:"item_code"`
			SourceLocationID int     `json:"source_location_id"`
			Qty              float64 `json:"qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.SourceLocationID < 1 || body.Qty <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "item_code, source_location_id, qty required")
		}

		var status string
		err = db.QueryRow(c.Context(),
			`SELECT status FROM putaway_sessions WHERE id=$1`, sessionID).Scan(&status)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if status != "picking" {
			return shared.Err(c, fiber.StatusBadRequest, "session is not in picking status")
		}

		var avail float64
		_ = db.QueryRow(c.Context(),
			`SELECT COALESCE(SUM(actual_qty - reserved_qty),0)
			 FROM stock_location_balances
			 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`,
			body.SourceLocationID, body.ItemCode).Scan(&avail)
		if avail < body.Qty {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("insufficient stock at source (available %.0f, requested %.0f)", avail, body.Qty))
		}

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO putaway_session_items (session_id, item_code, source_location_id, qty, status)
			 VALUES ($1, $2, $3, $4, 'picked') RETURNING id`,
			sessionID, body.ItemCode, body.SourceLocationID, body.Qty).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		_, _ = db.Exec(c.Context(),
			`UPDATE putaway_sessions SET updated_at=now() WHERE id=$1`, sessionID)

		_, _ = db.Exec(c.Context(), `
			UPDATE putaway_session_items 
			SET picked_by_user_id = $1 
			WHERE id = $2`, userID(c), id)

		_, _ = db.Exec(c.Context(), `
			UPDATE warehouse_locations 
			SET last_picked_by_user_id = $1, last_picked_at = now(), updated_at = now() 
			WHERE id = $2`, userID(c), body.SourceLocationID)

		return shared.OK(c, fiber.Map{"id": id, "status": "picked"})
	}
}

func removeSessionItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		itemID, err := strconv.Atoi(c.Params("itemId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid item id")
		}

		tag, err := db.Exec(c.Context(),
			`DELETE FROM putaway_session_items WHERE id=$1 AND session_id=$2 AND status='picked'`,
			itemID, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "item not found or already placed")
		}

		_, _ = db.Exec(c.Context(),
			`UPDATE putaway_sessions SET updated_at=now() WHERE id=$1`, sessionID)

		return shared.OK(c, fiber.Map{"status": "removed"})
	}
}

func placeSessionItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		itemID, err := strconv.Atoi(c.Params("itemId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid item id")
		}

		var body struct {
			TargetLocationID int     `json:"target_location_id"`
			IsOverride       bool    `json:"is_override"`
			Qty              float64 `json:"qty"` // actual qty to place (for splits)
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.TargetLocationID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "target_location_id required")
		}

		var itemCode string
		var sessionQty float64
		err = db.QueryRow(c.Context(),
			`SELECT item_code, qty FROM putaway_session_items
			 WHERE id=$1 AND session_id=$2 AND status='picked'`, itemID, sessionID).Scan(&itemCode, &sessionQty)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "item not found or already placed")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		// Use requested qty if provided, otherwise use full session qty
		qty := sessionQty
		if body.Qty > 0 && body.Qty <= sessionQty {
			qty = body.Qty
		}
		// Also cap to bin capacity if available
		testCap, _ := shared.ItemBinCapacity(c.Context(), db, itemCode, body.TargetLocationID)
		var testOnHand float64
		_ = db.QueryRow(c.Context(),
			`SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
			 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`, body.TargetLocationID, itemCode).Scan(&testOnHand)
		if testCap != nil && qty > *testCap-testOnHand+1e-9 {
			capped := *testCap - testOnHand
			if capped > 0 {
				qty = capped
			} else {
				return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
					"ok": false,
					"error": fmt.Sprintf("bin is full (max %.0f, already %.0f)", *testCap, testOnHand),
					"error_type": "bin_full",
					"data": fiber.Map{"bin_capacity": *testCap, "bin_on_hand": testOnHand, "trying_to_add": body.Qty},
				})
			}
		}

		cap, _ := shared.ItemBinCapacity(c.Context(), db, itemCode, body.TargetLocationID)
		var onHand float64
		_ = db.QueryRow(c.Context(),
			`SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
			 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`,
			body.TargetLocationID, itemCode).Scan(&onHand)

		// Check for mixed items
		if err := shared.RejectMixedPutaway(c.Context(), db, itemCode, body.TargetLocationID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"ok": false,
				"error": err.Error(),
				"error_type": "mixed_items",
			})
		}

		if cap != nil && onHand+qty > *cap+1e-9 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"ok": false,
				"error": fmt.Sprintf("bin holds max %.0f of this item (already %.0f, trying to add %.0f)", *cap, onHand, qty),
				"error_type": "bin_full",
				"data": fiber.Map{
					"bin_capacity": *cap,
					"bin_on_hand": onHand,
					"trying_to_add": qty,
				},
			})
		}

		// --- Move stock: decrement source, increment target ---
	var sourceLocationID int
	err = db.QueryRow(c.Context(),
		`SELECT source_location_id FROM putaway_session_items
		 WHERE id=$1 AND session_id=$2`, itemID, sessionID).Scan(&sourceLocationID)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}

	var warehouseID int
	_ = db.QueryRow(c.Context(),
		`SELECT warehouse_id FROM putaway_sessions WHERE id=$1`, sessionID).Scan(&warehouseID)
	if warehouseID < 1 {
		if wid, werr := shared.EnsureDefaultWarehouse(c.Context(), db); werr == nil {
			warehouseID = wid
		}
	}

	// Decrement source location
	_, _ = db.Exec(c.Context(), `
		UPDATE stock_location_balances
		SET actual_qty = GREATEST(actual_qty - $1, 0), updated_at=now()
		WHERE location_id=$2 AND UPPER(item_code)=UPPER($3)`, qty, sourceLocationID, itemCode)

	// Increment target location (upsert)
	var existingID int
	err = db.QueryRow(c.Context(),
		`SELECT id FROM stock_location_balances
		 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`, body.TargetLocationID, itemCode).Scan(&existingID)
	if err == pgx.ErrNoRows {
		_, _ = db.Exec(c.Context(), `
			INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, actual_qty, reserved_qty, allocation_status)
			VALUES ($1,$2,$3,$4,0,'allocatable')`, itemCode, warehouseID, body.TargetLocationID, qty)
	} else if err == nil {
		_, _ = db.Exec(c.Context(), `
			UPDATE stock_location_balances
			SET actual_qty = actual_qty + $1, allocation_status='allocatable', updated_at=now()
			WHERE id=$2`, qty, existingID)
	}

	// Mark bin as occupied
	_, _ = db.Exec(c.Context(),
		`UPDATE warehouse_locations SET is_occupied=true, current_item=$2, updated_at=now() WHERE id=$1`,
		body.TargetLocationID, itemCode)

	// Log the putaway
	var logID int
	err = db.QueryRow(c.Context(),
		`INSERT INTO putaway_logs (log_no, item_code, source_warehouse, target_location, quantity, placed_at, placed_by)
		 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,NOW(),$5)
		 RETURNING id`,
		itemCode, fmt.Sprintf("%d", warehouseID), "", qty, userID(c)).Scan(&logID)
	if err != nil {
		// Fallback without source_warehouse
		_ = db.QueryRow(c.Context(),
			`INSERT INTO putaway_logs (log_no, item_code, quantity, placed_at, placed_by)
			 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,NOW(),$3)
			 RETURNING id`,
			itemCode, qty, userID(c)).Scan(&logID)
	}

	// Update session item: if partial qty, reduce qty; if full, mark placed
	remaining := sessionQty - qty
	if remaining > 1e-9 {
		// Partial placement — reduce qty, keep as 'picked' for next split
		_, err = db.Exec(c.Context(),
			`UPDATE putaway_session_items
			 SET qty=$1
			 WHERE id=$2 AND session_id=$3 AND status='picked'`, remaining, itemID, sessionID)
	} else {
		// Full placement — mark as placed
		_, err = db.Exec(c.Context(),
			`UPDATE putaway_session_items
			 SET target_location_id=$1, status='placed', qty=$4
			 WHERE id=$2 AND session_id=$3 AND status='picked'`, body.TargetLocationID, itemID, sessionID, qty)
	}
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}

	_, _ = db.Exec(c.Context(), `
		UPDATE putaway_session_items 
		SET used_location_ids = array_append(used_location_ids, $1) 
		WHERE id = $2`, body.TargetLocationID, itemID)

	_, _ = db.Exec(c.Context(), `
		UPDATE putaway_logs 
		SET source_location_id = $1 
		WHERE id = $2`, sourceLocationID, logID)

	_, _ = db.Exec(c.Context(), `
		UPDATE warehouse_locations 
		SET last_picked_by_user_id = $1, last_picked_at = now(), updated_at = now() 
		WHERE id = $2`, userID(c), body.TargetLocationID)

	if remaining <= 1e-9 {
		_, _ = db.Exec(c.Context(), `
			UPDATE warehouse_locations 
			SET last_picked_by_user_id = NULL, updated_at = now() 
			WHERE id = $1`, sourceLocationID)
	}

	_, _ = db.Exec(c.Context(),
		`UPDATE putaway_sessions SET updated_at=now() WHERE id=$1`, sessionID)

	return shared.OK(c, fiber.Map{"status": "placed", "item_code": itemCode, "quantity": qty, "remaining": remaining, "source_location_id": sourceLocationID, "target_location_id": body.TargetLocationID})
	}
}
