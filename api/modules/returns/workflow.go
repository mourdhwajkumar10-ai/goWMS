package returns

// Extended return workflow: receive → inspect → decide (restock|scrap|rts).

import (
	"strconv"
	"strings"

	"goWMS/api/modules/notifications"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerWorkflowRoutes(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/:id/receive", receive(db))
	r.Post("/:id/decide", decide(db))
	r.Post("/:id/scrap", scrap(db))
}

func receive(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Notes       string `json:"notes"`
			WarehouseID int    `json:"warehouse_id"`
		}
		_ = shared.Bind(c, &body)

		tag, err := db.Exec(c.Context(), `
			UPDATE return_claims SET status='received',
				reason = COALESCE(reason,'') || CASE WHEN $2<>'' THEN E'\n[receive] '||$2 ELSE '' END,
				warehouse_id = COALESCE(NULLIF($3,0), warehouse_id)
			WHERE id=$1 AND status IN ('pending','open')`, id, body.Notes, body.WarehouseID)
		if err != nil {
			// warehouse_id column may be missing before migration 014
			tag, err = db.Exec(c.Context(), `
				UPDATE return_claims SET status='received',
					reason = COALESCE(reason,'') || CASE WHEN $2<>'' THEN E'\n[receive] '||$2 ELSE '' END
				WHERE id=$1 AND status IN ('pending','open')`, id, body.Notes)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest,
				"claim cannot be received — status must be pending/open (inspect/decide come after receive)")
		}
		notifications.Emit(c.Context(), db, "info", "Return received", "claim #"+strconv.Itoa(id), userID(c))
		return shared.OK(c, fiber.Map{"id": id, "status": "received"})
	}
}

func decide(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Decision    string  `json:"decision"` // restock|scrap|rts
			ItemCode    string  `json:"item_code"`
			Qty         float64 `json:"qty"`
			LocationID  int     `json:"location_id"`
			WarehouseID int     `json:"warehouse_id"`
			BatchNo     string  `json:"batch_no"`
			Notes       string  `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Decision = strings.ToLower(strings.TrimSpace(body.Decision))
		if body.Decision != "restock" && body.Decision != "scrap" && body.Decision != "rts" {
			return shared.Err(c, fiber.StatusBadRequest,
				`decision must be one of: "restock", "scrap", "rts"`)
		}

		var status string
		err = db.QueryRow(c.Context(), `SELECT status FROM return_claims WHERE id=$1`, id).Scan(&status)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "return claim not found")
		}
		if status != "inspected" && status != "received" && status != "accepted" {
			return shared.Err(c, fiber.StatusBadRequest, "claim must be received/inspected before decide")
		}

		switch body.Decision {
		case "restock":
			if body.ItemCode == "" || body.Qty <= 0 || body.LocationID == 0 {
				return shared.Err(c, fiber.StatusBadRequest, "item_code, qty, location_id required for restock")
			}
			if err := doRestock(c, db, id, body.ItemCode, body.Qty, body.LocationID, body.WarehouseID, body.BatchNo); err != nil {
				return err
			}
			_, _ = db.Exec(c.Context(), `
				UPDATE return_claims SET status='restocked', decided_at=NOW(),
					reason = COALESCE(reason,'') || CASE WHEN $2<>'' THEN E'\n[decide restock] '||$2 ELSE '' END
				WHERE id=$1`, id, body.Notes)
			return shared.OK(c, fiber.Map{"id": id, "status": "restocked", "decision": "restock"})

		case "scrap":
			if body.ItemCode == "" || body.Qty <= 0 {
				return shared.Err(c, fiber.StatusBadRequest, "item_code and qty required for scrap")
			}
			if err := doScrap(c, db, id, body.ItemCode, body.Qty, body.LocationID, body.WarehouseID, body.BatchNo); err != nil {
				return err
			}
			_, _ = db.Exec(c.Context(), `
				UPDATE return_claims SET status='scrapped', decided_at=NOW(),
					reason = COALESCE(reason,'') || CASE WHEN $2<>'' THEN E'\n[decide scrap] '||$2 ELSE '' END
				WHERE id=$1`, id, body.Notes)
			notifications.Emit(c.Context(), db, "warning", "Return scrapped", body.ItemCode+" x "+strconv.FormatFloat(body.Qty, 'f', -1, 64), userID(c))
			return shared.OK(c, fiber.Map{"id": id, "status": "scrapped", "decision": "scrap"})

		case "rts":
			_, _ = db.Exec(c.Context(), `
				UPDATE return_claims SET status='return_to_supplier', decided_at=NOW(),
					reason = COALESCE(reason,'') || CASE WHEN $2<>'' THEN E'\n[decide rts] '||$2 ELSE E'\n[decide rts]' END
				WHERE id=$1`, id, body.Notes)
			notifications.Emit(c.Context(), db, "info", "Return to supplier", "claim #"+strconv.Itoa(id), userID(c))
			return shared.OK(c, fiber.Map{"id": id, "status": "return_to_supplier", "decision": "rts"})
		}
		return shared.Err(c, fiber.StatusBadRequest, "unknown decision")
	}
}

func scrap(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			ItemCode    string  `json:"item_code"`
			Qty         float64 `json:"qty"`
			LocationID  int     `json:"location_id"`
			WarehouseID int     `json:"warehouse_id"`
			BatchNo     string  `json:"batch_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.Qty <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and qty required")
		}
		if err := doScrap(c, db, id, body.ItemCode, body.Qty, body.LocationID, body.WarehouseID, body.BatchNo); err != nil {
			return err
		}
		_, _ = db.Exec(c.Context(), `UPDATE return_claims SET status='scrapped', decided_at=NOW() WHERE id=$1`, id)
		return shared.OK(c, fiber.Map{"id": id, "status": "scrapped"})
	}
}

func doRestock(c *fiber.Ctx, db *pgxpool.Pool, claimID int, itemCode string, qty float64, locID, whID int, batch string) error {
	var locType string
	var resolvedWH int
	err := db.QueryRow(c.Context(), `
		SELECT location_type, warehouse_id FROM warehouse_locations WHERE id=$1`, locID).
		Scan(&locType, &resolvedWH)
	if err != nil {
		return shared.Err(c, fiber.StatusBadRequest, "location not found")
	}
	lt := strings.ToLower(locType)
	if lt != "hold" && lt != "damaged" && lt != "quarantine" && lt != "returns" {
		return shared.Err(c, fiber.StatusBadRequest,
			"returns must restock to hold/damaged/quarantine/returns location (got "+locType+")")
	}
	if whID == 0 {
		whID = resolvedWH
	}
	if err := shared.AdjustLocationQty(c.Context(), db, itemCode, whID, locID, batch, qty); err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	_, _ = db.Exec(c.Context(), `
		INSERT INTO return_claim_lines (return_claim_id, item_code, qty, condition, decision, location_id)
		VALUES ($1,$2,$3,'good','restock',$4)`, claimID, itemCode, qty, locID)
	return nil
}

func doScrap(c *fiber.Ctx, db *pgxpool.Pool, claimID int, itemCode string, qty float64, locID, whID int, batch string) error {
	// If location provided, remove from that location; else just record scrap decision (no stock yet).
	if locID > 0 {
		if whID == 0 {
			_ = db.QueryRow(c.Context(), `SELECT warehouse_id FROM warehouse_locations WHERE id=$1`, locID).Scan(&whID)
		}
		if whID > 0 {
			if err := shared.AdjustLocationQty(c.Context(), db, itemCode, whID, locID, batch, -qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
	}
	_, _ = db.Exec(c.Context(), `
		INSERT INTO return_claim_lines (return_claim_id, item_code, qty, condition, decision, location_id)
		VALUES ($1,$2,$3,'damaged','scrap',$4)`, claimID, itemCode, qty, nullInt(locID))
	return nil
}

func nullInt(v int) any {
	if v == 0 {
		return nil
	}
	return v
}
