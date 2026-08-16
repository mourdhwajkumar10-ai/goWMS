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
			TargetLocationID int  `json:"target_location_id"`
			IsOverride       bool `json:"is_override"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.TargetLocationID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "target_location_id required")
		}

		var itemCode string
		var qty float64
		err = db.QueryRow(c.Context(),
			`SELECT item_code, qty FROM putaway_session_items
			 WHERE id=$1 AND session_id=$2 AND status='picked'`,
			itemID, sessionID).Scan(&itemCode, &qty)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "item not found or already placed")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		cap, _ := shared.ItemBinCapacity(c.Context(), db, itemCode, body.TargetLocationID)
		var onHand float64
		_ = db.QueryRow(c.Context(),
			`SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
			 WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`,
			body.TargetLocationID, itemCode).Scan(&onHand)

		if cap != nil && onHand+qty > *cap+1e-9 {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("bin holds max %.0f of this item (already %.0f, trying to add %.0f) — system will suggest another location",
					*cap, onHand, qty))
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE putaway_session_items
			 SET target_location_id=$1, status='placed'
			 WHERE id=$2 AND session_id=$3 AND status='picked'`,
			body.TargetLocationID, itemID, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "item not found or already placed")
		}

		_, _ = db.Exec(c.Context(),
			`UPDATE putaway_sessions SET updated_at=now() WHERE id=$1`, sessionID)

		return shared.OK(c, fiber.Map{"status": "placed"})
	}
}
