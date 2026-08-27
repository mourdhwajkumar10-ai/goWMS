package putaway

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"time"

	"goWMS/api/modules/rbac"
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

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		rows, err := tx.Query(c.Context(),
			`SELECT id FROM putaway_sessions WHERE user_id=$1 AND status='picking' FOR UPDATE`, userID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		for rows.Next() {
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if err = releasePickedReservationsForUser(c.Context(), tx, userID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if _, err = tx.Exec(c.Context(),
			`UPDATE putaway_sessions SET status='cancelled', completed_at=now(), updated_at=now()
			 WHERE user_id=$1 AND status='picking'`, userID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var id int
		err = tx.QueryRow(c.Context(),
			`INSERT INTO putaway_sessions (user_id, warehouse_id, zone, status)
			 VALUES ($1, $2, NULLIF($3,''), 'picking') RETURNING id`,
			userID, body.WarehouseID, body.Zone).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err = tx.Commit(c.Context()); err != nil {
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
			if err := rows.Scan(&i.ID, &i.ItemCode, &i.Qty, &i.Status, &i.Source, &i.ItemName); err != nil {
				log.Printf("getSession scan error: %v", err)
				continue
			}
			items = append(items, i)
		}
		if err := rows.Err(); err != nil {
			log.Printf("getSession rows error: %v", err)
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

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		tag, err := tx.Exec(c.Context(),
			`UPDATE putaway_sessions SET status='cancelled', completed_at=now(), updated_at=now()
			 WHERE id=$1 AND status='picking'`, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "session not found or already completed")
		}

		if err = releasePickedReservations(c.Context(), tx, sessionID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"status": "cancelled"})
	}
}

func completeSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		actorID := userID(c)

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var sessionUserID int
		var status string
		if err := tx.QueryRow(c.Context(), `
			SELECT user_id, status FROM putaway_sessions WHERE id=$1 FOR UPDATE`, sessionID).
			Scan(&sessionUserID, &status); err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		} else if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if actorID > 0 && sessionUserID > 0 && actorID != sessionUserID && !rbac.HasPermission(c, putawayOverridePermission) {
			return shared.Err(c, fiber.StatusForbidden, "putaway session belongs to another operator")
		}
		if status != "picking" {
			return shared.Err(c, fiber.StatusBadRequest, "session is not active")
		}

		var pending float64
		if err := tx.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(qty),0) FROM putaway_session_items
			WHERE session_id=$1 AND status='picked'`, sessionID).Scan(&pending); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := validatePutawayCompletion(pending); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		var reserved float64
		_ = tx.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(slb.reserved_qty),0)
			FROM stock_location_balances slb
			JOIN putaway_session_items psi ON psi.source_location_id=slb.location_id
			  AND UPPER(psi.item_code)=UPPER(slb.item_code)
			WHERE psi.session_id=$1 AND psi.status='picked'`, sessionID).Scan(&reserved)
		if reserved > 1e-9 {
			return shared.Err(c, fiber.StatusBadRequest, "putaway still has reserved source quantity")
		}

		if _, err := tx.Exec(c.Context(), `
			UPDATE putaway_sessions SET status='completed', completed_at=now(), updated_at=now()
			WHERE id=$1 AND status='picking'`, sessionID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": sessionID, "status": "completed"})
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

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var status string
		err = tx.QueryRow(c.Context(),
			`SELECT status FROM putaway_sessions WHERE id=$1 FOR UPDATE`, sessionID).Scan(&status)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if status != "picking" {
			return shared.Err(c, fiber.StatusBadRequest, "session is not in picking status")
		}

	var balID int
	var actual, reserved float64
	err = tx.QueryRow(c.Context(),
			`SELECT id, actual_qty, COALESCE(reserved_qty,0)
			 FROM stock_location_balances
			 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)
			   AND actual_qty > 0
			 ORDER BY CASE WHEN allocation_status IN ('allocatable','staging') THEN 0 ELSE 1 END, id
			 LIMIT 1
			 FOR UPDATE`,
			body.SourceLocationID, body.ItemCode).Scan(&balID, &actual, &reserved)
	if err == pgx.ErrNoRows {
		// Stock not in stock_location_balances — check for unposted GRN items.
		// This happens when GRN reached putaway_pending but stock was never auto-posted.
		var grnQty float64
		var grnWarehouseID int
		err = tx.QueryRow(c.Context(),
			`SELECT COALESCE(gl.scanned_qty,0), COALESCE(gs.warehouse_id,1)
			 FROM grn_lines gl
			 JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
			 JOIN grn_sessions gs ON gs.id = gc.grn_session_id
			 WHERE UPPER(gl.item_code) = UPPER($1)
			   AND COALESCE(gl.scanned_qty,0) > 0
			   AND gs.status IN ('putaway_pending','putaway_in_progress','completed','closed')
			   AND COALESCE(gs.stock_posted_at) IS NULL
			 LIMIT 1`, body.ItemCode).Scan(&grnQty, &grnWarehouseID)
		if err == nil && grnQty > 0 {
			// Auto-post stock from GRN to stock_location_balances so pick can proceed.
			if grnWarehouseID < 1 {
				grnWarehouseID = 1
			}
			// Use INSERT ... ON CONFLICT to handle both new and existing rows.
			_, postErr := tx.Exec(c.Context(),
				`INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, actual_qty, reserved_qty, allocation_status)
				 VALUES ($1,$2,$3,$4,0,'staging')
				 ON CONFLICT (item_code, location_id, COALESCE(batch_no,''))
				 DO UPDATE SET actual_qty = stock_location_balances.actual_qty + $4,
				               allocation_status='staging', updated_at=now()`,
				body.ItemCode, grnWarehouseID, body.SourceLocationID, grnQty)
			if postErr != nil {
				log.Printf("PUTAWAY AUTO-POST: failed to insert stock for %s at location %d: %v", body.ItemCode, body.SourceLocationID, postErr)
			}
			// Mark GRN as stock_posted_at so queue won't show this item twice.
			_, _ = tx.Exec(c.Context(),
				`UPDATE grn_sessions SET stock_posted_at=now()
				 WHERE status IN ('putaway_pending','putaway_in_progress','completed','closed')
				   AND COALESCE(stock_posted_at) IS NULL`)
			// Now re-query the balance we just created.
			err = tx.QueryRow(c.Context(),
				`SELECT id, actual_qty, COALESCE(reserved_qty,0)
				 FROM stock_location_balances
				 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)
				   AND actual_qty > 0
				 ORDER BY id LIMIT 1 FOR UPDATE`,
				body.SourceLocationID, body.ItemCode).Scan(&balID, &actual, &reserved)
		}
	}
	if err == pgx.ErrNoRows {
		return shared.Err(c, fiber.StatusBadRequest, "no available stock at source location")
	}
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
		avail := actual - reserved
		if avail+1e-9 < body.Qty {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("insufficient stock at source (available %.0f, requested %.0f)", avail, body.Qty))
		}

		tag, err := tx.Exec(c.Context(), `
			UPDATE stock_location_balances
			SET reserved_qty = reserved_qty + $1, updated_at=now()
			WHERE id=$2 AND (actual_qty - reserved_qty) >= $1 - 1e-9`, body.Qty, balID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() != 1 {
			return shared.Err(c, fiber.StatusConflict, "could not reserve source qty")
		}

		var picker any
		if uid := userID(c); uid > 0 {
			picker = uid
		}
		var id int
		// If same item already picked in this session from same source, aggregate qty instead of creating duplicate rows
		var existingID int
		var existingQty float64
		err = tx.QueryRow(c.Context(),
			`SELECT id, qty FROM putaway_session_items WHERE session_id=$1 AND UPPER(item_code)=UPPER($2) AND source_location_id=$3 AND status='picked' FOR UPDATE`,
			sessionID, body.ItemCode, body.SourceLocationID).Scan(&existingID, &existingQty)
		if err == nil {
			if _, err = tx.Exec(c.Context(), `UPDATE putaway_session_items SET qty = qty + $1 WHERE id=$2`, body.Qty, existingID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			id = existingID
		} else if err == pgx.ErrNoRows {
			err = tx.QueryRow(c.Context(),
				`INSERT INTO putaway_session_items (session_id, item_code, source_location_id, qty, status, picked_by_user_id)
				 VALUES ($1, $2, $3, $4, 'picked', $5) RETURNING id`,
				sessionID, body.ItemCode, body.SourceLocationID, body.Qty, picker).Scan(&id)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		} else {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if _, err = tx.Exec(c.Context(),
			`UPDATE putaway_sessions SET updated_at=now() WHERE id=$1`, sessionID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if picker != nil {
			if _, err = tx.Exec(c.Context(), `
				UPDATE warehouse_locations
				SET last_picked_by_user_id = $1, last_picked_at = now(), updated_at = now()
				WHERE id = $2`, picker, body.SourceLocationID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
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

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var removeQty float64
		var removeSourceID int
		var itemCode string
		err = tx.QueryRow(c.Context(),
			`SELECT qty, source_location_id, item_code FROM putaway_session_items
			 WHERE id=$1 AND session_id=$2 AND status='picked' FOR UPDATE`,
			itemID, sessionID).Scan(&removeQty, &removeSourceID, &itemCode)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "item not found or already placed")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		tag, err := tx.Exec(c.Context(),
			`DELETE FROM putaway_session_items WHERE id=$1 AND session_id=$2 AND status='picked'`,
			itemID, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "item not found or already placed")
		}

		if removeSourceID > 0 && removeQty > 0 {
			if _, err = tx.Exec(c.Context(), `
				UPDATE stock_location_balances
				SET reserved_qty = GREATEST(reserved_qty - $1, 0), updated_at=now()
				WHERE location_id=$2 AND UPPER(item_code)=UPPER($3)`,
				removeQty, removeSourceID, itemCode); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		if _, err = tx.Exec(c.Context(),
			`UPDATE putaway_sessions SET updated_at=now() WHERE id=$1`, sessionID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
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
			Qty              float64 `json:"qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.TargetLocationID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "target_location_id required")
		}

		tx, txErr := db.Begin(c.Context())
		if txErr != nil {
			return shared.Err(c, fiber.StatusInternalServerError, txErr.Error())
		}
		defer tx.Rollback(c.Context())

		var itemCode string
		var sessionQty float64
		var sourceLocationID int
		var sessionUserID int
		err = tx.QueryRow(c.Context(),
			`SELECT psi.item_code, psi.qty, psi.source_location_id, ps.user_id
			 FROM putaway_session_items psi
			 JOIN putaway_sessions ps ON ps.id = psi.session_id
			 WHERE psi.id=$1 AND psi.session_id=$2 AND psi.status='picked' FOR UPDATE`,
			itemID, sessionID).Scan(&itemCode, &sessionQty, &sourceLocationID, &sessionUserID)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "item not found or already placed")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if actorID := userID(c); actorID > 0 && sessionUserID > 0 && actorID != sessionUserID && !rbac.HasPermission(c, "putaway.override") {
			return shared.Err(c, fiber.StatusForbidden, "putaway session belongs to another operator")
		}

		qty := sessionQty
		if body.Qty > 0 {
			qty = body.Qty
		}
		if err := validatePlacementQuantity(qty, sessionQty); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}

		var locOK int
		err = tx.QueryRow(c.Context(),
			`SELECT id FROM warehouse_locations WHERE id=$1 FOR UPDATE`, body.TargetLocationID).Scan(&locOK)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusBadRequest, "target location not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if body.IsOverride && !rbac.HasPermission(c, putawayOverridePermission) {
			return shared.Err(c, fiber.StatusForbidden, "putaway.override required for override placement")
		}
		if body.IsOverride && !rbac.HasPermission(c, putawayOverridePermission) {
			return shared.Err(c, fiber.StatusForbidden, putawayOverridePermission+" required for override placement")
		}
		if err := shared.RejectMixedPutaway(c.Context(), tx, itemCode, body.TargetLocationID); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"ok": false, "error": err.Error(), "error_type": "mixed_items",
			})
		}

		cap, capErr := shared.ItemBinCapacity(c.Context(), tx, itemCode, body.TargetLocationID)
		if capErr != nil {
			return shared.Err(c, fiber.StatusInternalServerError, capErr.Error())
		}
		var onHand float64
		_ = tx.QueryRow(c.Context(),
			`SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
			 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`,
			body.TargetLocationID, itemCode).Scan(&onHand)
		if cap != nil && onHand+qty > *cap+1e-9 {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"ok":         false,
				"error":      fmt.Sprintf("bin holds max %.0f of this item (already %.0f, trying to add %.0f)", *cap, onHand, qty),
				"error_type": "bin_full",
				"data": fiber.Map{
					"bin_capacity": *cap, "bin_on_hand": onHand, "trying_to_add": qty,
				},
			})
		}
		if limErr := shared.CheckBinLimits(c.Context(), tx, itemCode, body.TargetLocationID, qty); limErr != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"ok": false, "error": limErr.Error(), "error_type": "bin_full",
			})
		}

		var warehouseID int
		_ = tx.QueryRow(c.Context(),
			`SELECT warehouse_id FROM putaway_sessions WHERE id=$1`, sessionID).Scan(&warehouseID)
		if warehouseID < 1 {
			if wid, werr := shared.EnsureDefaultWarehouse(c.Context(), db); werr == nil {
				warehouseID = wid
			}
		}

		var warehouseWarning string
		rule, _ := shared.LoadWarehousePutawayRule(c.Context(), db, itemCode, warehouseID)
		if rule != nil && rule.StockCapacity > 0 {
			if rule.CurrentQty+qty > rule.StockCapacity+1e-9 {
				warehouseWarning = "warehouse_cap_exceeded"
				log.Printf("WAREHOUSE CAP WARNING: item %s in warehouse %s would exceed cap %.0f (current %.0f, adding %.0f)",
					itemCode, rule.Warehouse, rule.StockCapacity, rule.CurrentQty, qty)
			}
		}

		tag, err := tx.Exec(c.Context(), `
			UPDATE stock_location_balances
			SET actual_qty = actual_qty - $1,
			    reserved_qty = CASE WHEN reserved_qty >= $1 THEN reserved_qty - $1 ELSE 0 END,
			    updated_at=now()
			WHERE location_id=$2 AND UPPER(item_code)=UPPER($3) AND actual_qty >= $1 - 1e-9`,
			qty, sourceLocationID, itemCode)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() != 1 {
			return shared.Err(c, fiber.StatusConflict, "insufficient stock at source")
		}

		var existingID int
		err = tx.QueryRow(c.Context(),
			`SELECT id FROM stock_location_balances
			 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2) FOR UPDATE`,
			body.TargetLocationID, itemCode).Scan(&existingID)
		if err == pgx.ErrNoRows {
			if _, err = tx.Exec(c.Context(), `
				INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, actual_qty, reserved_qty, allocation_status)
				VALUES ($1,$2,$3,$4,0,'allocatable')`, itemCode, warehouseID, body.TargetLocationID, qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		} else if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		} else {
			if _, err = tx.Exec(c.Context(), `
				UPDATE stock_location_balances
				SET actual_qty = actual_qty + $1, allocation_status='allocatable', updated_at=now()
				WHERE id=$2`, qty, existingID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		if _, err = tx.Exec(c.Context(),
			`UPDATE warehouse_locations SET is_occupied=true, current_item=$2, updated_at=now() WHERE id=$1`,
			body.TargetLocationID, itemCode); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var targetCode, sourceCode string
		_ = tx.QueryRow(c.Context(), `SELECT code FROM warehouse_locations WHERE id=$1`, body.TargetLocationID).Scan(&targetCode)
		_ = tx.QueryRow(c.Context(), `SELECT code FROM warehouse_locations WHERE id=$1`, sourceLocationID).Scan(&sourceCode)
		if targetCode != "" {
			_, _ = tx.Exec(c.Context(), `
				UPDATE grn_lines gl SET route_location=$2
				WHERE UPPER(gl.item_code)=UPPER($1)
				  AND COALESCE(gl.scanned_qty,0) > 0
				  AND (
				    NULLIF(BTRIM(gl.route_location),'') IS NULL
				    OR UPPER(gl.route_location) LIKE 'INCOMING%'
				    OR UPPER(gl.route_location) LIKE 'HOLD%'
				    OR UPPER(gl.route_location) LIKE 'STAGING%'
				  )
				  AND EXISTS (
				    SELECT 1 FROM grn_sessions gs
				    WHERE gs.id = gl.grn_session_id
				      AND gs.status IN ('completed','closed','putaway_pending','putaway_in_progress','item_verification_complete')
				  )`, itemCode, targetCode)
		}

		var logID int
		err = tx.QueryRow(c.Context(),
			`INSERT INTO putaway_logs (log_no, item_code, source_warehouse, target_location, quantity, placed_at, placed_by, source_location_id)
			 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,NOW(),$5,$6)
			 RETURNING id`,
			itemCode, sourceCode, targetCode, qty, userID(c), sourceLocationID).Scan(&logID)
		if err != nil {
			if scanErr := tx.QueryRow(c.Context(),
				`INSERT INTO putaway_logs (log_no, item_code, source_warehouse, target_location, quantity, placed_at, placed_by, source_location_id)
				 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,NOW(),$5,$6)
				 RETURNING id`,
				itemCode, sourceCode, targetCode, qty, userID(c), sourceLocationID).Scan(&logID); scanErr != nil {
				return shared.Err(c, fiber.StatusInternalServerError, scanErr.Error())
			}
		}

		remaining := sessionQty - qty
		if remaining > 1e-9 {
			tag, err = tx.Exec(c.Context(),
				`UPDATE putaway_session_items SET qty=$1
				 WHERE id=$2 AND session_id=$3 AND status='picked'`, remaining, itemID, sessionID)
		} else {
			tag, err = tx.Exec(c.Context(),
				`UPDATE putaway_session_items
				 SET target_location_id=$1, status='placed', qty=$4
				 WHERE id=$2 AND session_id=$3 AND status='picked'`, body.TargetLocationID, itemID, sessionID, qty)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() != 1 {
			return shared.Err(c, fiber.StatusConflict, "item already placed")
		}

		_, _ = tx.Exec(c.Context(),
			`UPDATE putaway_session_items SET used_location_ids = array_append(used_location_ids, $1) WHERE id = $2`,
			body.TargetLocationID, itemID)
		_, _ = tx.Exec(c.Context(),
			`UPDATE putaway_logs SET source_location_id = COALESCE(source_location_id, $1),
			    source_warehouse = COALESCE(NULLIF(BTRIM(source_warehouse), ''), $3),
			    target_location = COALESCE(NULLIF(BTRIM(target_location), ''), $4)
			 WHERE id = $2`, sourceLocationID, logID, sourceCode, targetCode)
		if uid := userID(c); uid > 0 {
			_, _ = tx.Exec(c.Context(),
				`UPDATE warehouse_locations SET last_picked_by_user_id = $1, last_picked_at = now(), updated_at = now() WHERE id = $2`,
				uid, body.TargetLocationID)
		}
		if remaining <= 1e-9 {
			_, _ = tx.Exec(c.Context(),
				`UPDATE warehouse_locations SET last_picked_by_user_id = NULL, updated_at = now() WHERE id = $1`,
				sourceLocationID)
		}
		_, _ = tx.Exec(c.Context(), `UPDATE putaway_sessions SET updated_at=now() WHERE id=$1`, sessionID)

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{
			"status": "placed", "item_code": itemCode, "quantity": qty, "remaining": remaining,
			"source_location_id": sourceLocationID, "target_location_id": body.TargetLocationID,
			"warning": warehouseWarning,
		})
	}
}

func releasePickedReservations(ctx context.Context, tx pgx.Tx, sessionID int) error {
	if _, err := tx.Exec(ctx, `
		UPDATE stock_location_balances slb
		SET reserved_qty = GREATEST(slb.reserved_qty - psi.qty, 0), updated_at=now()
		FROM putaway_session_items psi
		WHERE psi.session_id = $1 AND psi.status = 'picked'
		  AND slb.location_id = psi.source_location_id
		  AND UPPER(slb.item_code) = UPPER(psi.item_code)`, sessionID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE warehouse_locations wl
		SET last_picked_by_user_id = NULL, updated_at = now()
		FROM putaway_session_items psi
		WHERE psi.session_id = $1
		  AND psi.source_location_id = wl.id
		  AND psi.status = 'picked'`, sessionID)
	return err
}

func releasePickedReservationsForUser(ctx context.Context, tx pgx.Tx, uid int) error {
	if _, err := tx.Exec(ctx, `
		UPDATE stock_location_balances slb
		SET reserved_qty = GREATEST(slb.reserved_qty - psi.qty, 0), updated_at=now()
		FROM putaway_session_items psi
		JOIN putaway_sessions ps ON ps.id = psi.session_id
		WHERE ps.user_id = $1 AND ps.status = 'picking' AND psi.status = 'picked'
		  AND slb.location_id = psi.source_location_id
		  AND UPPER(slb.item_code) = UPPER(psi.item_code)`, uid); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		UPDATE warehouse_locations wl
		SET last_picked_by_user_id = NULL, updated_at = now()
		FROM putaway_session_items psi
		JOIN putaway_sessions ps ON ps.id = psi.session_id
		WHERE ps.user_id = $1 AND ps.status = 'picking' AND psi.status = 'picked'
		  AND psi.source_location_id = wl.id`, uid)
	return err
}
