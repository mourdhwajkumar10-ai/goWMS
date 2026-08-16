package putaway

import (
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
