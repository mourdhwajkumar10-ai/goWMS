package picking

// "Can't find it" flow: a picker who cannot locate a line flags it instead
// of silently skipping or force-scanning. The line is pulled out of the
// active queue immediately (so the rest of the pick isn't blocked) and its
// reservation is released. A supervisor then reviews the flag in a desk UI
// and either approves it (creates a backorder for the shortfall) or rejects
// it (the line goes back into the pick queue for another attempt).

import (
	"strconv"
	"strings"

	"goWMS/api/modules/notifications"
	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterShortageFlags wires the can't-find-it + supervisor review routes.
func RegisterShortageFlags(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/:id/cant-find", cantFindIt(db))
	r.Get("/shortage-flags", listShortageFlags(db))
	r.Post("/shortage-flags/:flag_id/approve", approveShortageFlag(db))
	r.Post("/shortage-flags/:flag_id/reject", rejectShortageFlag(db))
}

func cantFindIt(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		pickID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid pick list id")
		}
		var body struct {
			PickListItemID int    `json:"pick_list_item_id"`
			ItemCode       string `json:"item_code"`
			Reason         string `json:"reason"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Reason) == "" {
			return shared.Err(c, fiber.StatusBadRequest, "reason required")
		}
		if body.PickListItemID <= 0 && body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "pick_list_item_id or item_code required")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var soNo string
		_ = tx.QueryRow(c.Context(), `SELECT COALESCE(sales_order_no,'') FROM pick_lists WHERE id=$1`, pickID).Scan(&soNo)

		var (
			itemID                            int
			itemCode, locCode, status         string
			allocated, picked                 float64
			balanceID                         *int
			itemName                          string
		)
		var scanErr error
		if body.PickListItemID > 0 {
			scanErr = tx.QueryRow(c.Context(), `
				SELECT id, item_code, COALESCE(location_code,''), COALESCE(status,'pending'),
				       COALESCE(allocated_qty,0), COALESCE(picked_qty,0), balance_id
				FROM pick_list_items WHERE id=$1 AND pick_list_id=$2 FOR UPDATE`,
				body.PickListItemID, pickID).Scan(&itemID, &itemCode, &locCode, &status, &allocated, &picked, &balanceID)
		} else {
			scanErr = tx.QueryRow(c.Context(), `
				SELECT id, item_code, COALESCE(location_code,''), COALESCE(status,'pending'),
				       COALESCE(allocated_qty,0), COALESCE(picked_qty,0), balance_id
				FROM pick_list_items
				WHERE pick_list_id=$1 AND item_code=$2
				  AND COALESCE(status,'pending') IN ('pending','partial','in_progress')
				ORDER BY id LIMIT 1 FOR UPDATE`,
				pickID, body.ItemCode).Scan(&itemID, &itemCode, &locCode, &status, &allocated, &picked, &balanceID)
		}
		if scanErr != nil {
			return shared.Err(c, fiber.StatusNotFound, "pick line not found or not open")
		}
		if status == "picked" || status == "delivered" || status == "shortage" || status == "flagged" || status == "cancelled" {
			return shared.Err(c, fiber.StatusConflict, "line is not open for flagging (status: "+status+")")
		}
		remaining := allocated - picked
		if remaining <= 0 {
			return shared.Err(c, fiber.StatusConflict, "nothing remaining to flag on this line")
		}
		_ = tx.QueryRow(c.Context(), `SELECT COALESCE(name,'') FROM items WHERE code=$1`, itemCode).Scan(&itemName)

		if balanceID != nil && *balanceID > 0 {
			if err := shared.ReleaseReserved(c.Context(), tx, *balanceID, remaining); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		// Pull the line out of the active queue: cap allocated at what's already
		// picked so it no longer blocks pick-list completion, but keep the row
		// (and its history) intact for the supervisor's review.
		if _, err := tx.Exec(c.Context(), `
			UPDATE pick_list_items SET allocated_qty=$1, status='flagged' WHERE id=$2`,
			picked, itemID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var flagID int
		var flagNo string
		if err := tx.QueryRow(c.Context(), `
			INSERT INTO pick_shortage_flags (
				flag_no, pick_list_id, pick_list_item_id, sales_order_no, item_code, item_name,
				location_code, qty, reason, status, flagged_by
			) VALUES (
				'SF-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_shortage_flags_no_seq')::TEXT,5,'0'),
				$1,$2,$3,$4,$5,$6,$7,$8,'pending',$9
			) RETURNING id, flag_no`,
			pickID, itemID, soNo, itemCode, itemName, locCode, remaining, strings.TrimSpace(body.Reason), userID(c),
		).Scan(&flagID, &flagNo); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error()+" — apply migrations/051_shortage_flags.sql")
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		notifications.Emit(c.Context(), db, "warning", "Can't find it: "+itemCode,
			itemCode+" ("+strconv.FormatFloat(remaining, 'f', -1, 64)+") flagged on "+soNo+" — needs supervisor review", 0)

		return shared.OK(c, fiber.Map{"id": flagID, "flag_no": flagNo, "status": "pending"})
	}
}

func listShortageFlags(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		status := strings.TrimSpace(c.Query("status"))
		if status == "" {
			status = "pending"
		}
		var rows pgx.Rows
		var err error
		if status == "all" {
			rows, err = db.Query(c.Context(), `
				SELECT id, flag_no, pick_list_id, pick_list_item_id, COALESCE(sales_order_no,''),
				       item_code, COALESCE(item_name,''), COALESCE(location_code,''), qty, COALESCE(reason,''),
				       status, flagged_by, flagged_at::text, reviewed_by, reviewed_at::text,
				       COALESCE(review_note,''), COALESCE(backorder_no,'')
				FROM pick_shortage_flags ORDER BY flagged_at DESC LIMIT 200`)
		} else {
			rows, err = db.Query(c.Context(), `
				SELECT id, flag_no, pick_list_id, pick_list_item_id, COALESCE(sales_order_no,''),
				       item_code, COALESCE(item_name,''), COALESCE(location_code,''), qty, COALESCE(reason,''),
				       status, flagged_by, flagged_at::text, reviewed_by, reviewed_at::text,
				       COALESCE(review_note,''), COALESCE(backorder_no,'')
				FROM pick_shortage_flags WHERE status=$1 ORDER BY flagged_at DESC LIMIT 200`, status)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error()+" — apply migrations/051_shortage_flags.sql")
		}
		defer rows.Close()

		type flag struct {
			ID             int     `json:"id"`
			FlagNo         string  `json:"flag_no"`
			PickListID     int     `json:"pick_list_id"`
			PickListItemID *int    `json:"pick_list_item_id"`
			SalesOrderNo   string  `json:"sales_order_no"`
			ItemCode       string  `json:"item_code"`
			ItemName       string  `json:"item_name"`
			LocationCode   string  `json:"location_code"`
			Qty            float64 `json:"qty"`
			Reason         string  `json:"reason"`
			Status         string  `json:"status"`
			FlaggedBy      *int    `json:"flagged_by"`
			FlaggedAt      string  `json:"flagged_at"`
			ReviewedBy     *int    `json:"reviewed_by"`
			ReviewedAt     *string `json:"reviewed_at"`
			ReviewNote     string  `json:"review_note"`
			BackorderNo    string  `json:"backorder_no"`
		}
		var list []flag
		for rows.Next() {
			var f flag
			if err := rows.Scan(&f.ID, &f.FlagNo, &f.PickListID, &f.PickListItemID, &f.SalesOrderNo,
				&f.ItemCode, &f.ItemName, &f.LocationCode, &f.Qty, &f.Reason,
				&f.Status, &f.FlaggedBy, &f.FlaggedAt, &f.ReviewedBy, &f.ReviewedAt,
				&f.ReviewNote, &f.BackorderNo); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, f)
		}
		if list == nil {
			list = []flag{}
		}
		return shared.OK(c, list)
	}
}

func approveShortageFlag(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !rbac.HasPermission(c, "picking.override") {
			return shared.Err(c, fiber.StatusForbidden, "picking.override required")
		}
		flagID, err := strconv.Atoi(c.Params("flag_id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid flag id")
		}
		var body struct {
			Note string `json:"note"`
		}
		_ = shared.Bind(c, &body)

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var pickListItemID *int
		var soNo, itemCode, customer string
		var qty float64
		var status string
		if err := tx.QueryRow(c.Context(), `
			SELECT pick_list_item_id, COALESCE(sales_order_no,''), item_code, qty, status
			FROM pick_shortage_flags WHERE id=$1 FOR UPDATE`, flagID).
			Scan(&pickListItemID, &soNo, &itemCode, &qty, &status); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "flag not found")
		}
		if status != "pending" {
			return shared.Err(c, fiber.StatusConflict, "flag already reviewed (status: "+status+")")
		}
		if pickListItemID != nil {
			if _, err := tx.Exec(c.Context(), `
				UPDATE pick_list_items SET status='shortage', shortage_qty=$1 WHERE id=$2`,
				qty, *pickListItemID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		_ = tx.QueryRow(c.Context(), `SELECT customer FROM pick_lists WHERE id=(SELECT pick_list_id FROM pick_shortage_flags WHERE id=$1)`, flagID).Scan(&customer)

		var backorderID int
		var backorderNo string
		// Reuse an existing pending backorder for this SO if one exists
		err = tx.QueryRow(c.Context(), `
			SELECT id, backorder_no FROM backorders_v2
			WHERE sales_order_no=$1 AND status='pending'
			ORDER BY id DESC LIMIT 1`, soNo).Scan(&backorderID, &backorderNo)
		if err == pgx.ErrNoRows {
			if err := tx.QueryRow(c.Context(), `
				INSERT INTO backorders_v2 (backorder_no, sales_order_no, customer, notes, status)
				VALUES ('BO2-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('backorders_v2_id_seq')::TEXT,5,'0'),
					$1,$2,$3,'pending') RETURNING id, backorder_no`,
				soNo, customer, "supervisor-approved shortage flag").Scan(&backorderID, &backorderNo); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		} else if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		// The unique index on (item_code) WHERE pending is global — check for any existing pending line for this item across all backorders
		var existingLineID int
		if err := tx.QueryRow(c.Context(), `
			SELECT id FROM backorder_lines_v2
			WHERE item_code=$1 AND status='pending'
			LIMIT 1`, itemCode).Scan(&existingLineID); err == nil {
			if _, err := tx.Exec(c.Context(), `
				UPDATE backorder_lines_v2 SET qty=qty+$1 WHERE id=$2`, qty, existingLineID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		} else {
			if _, err := tx.Exec(c.Context(), `
				INSERT INTO backorder_lines_v2 (backorder_id, item_code, qty, status)
				VALUES ($1,$2,$3,'pending')`, backorderID, itemCode, qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if _, err := tx.Exec(c.Context(), `
			UPDATE pick_shortage_flags
			SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_note=$2, backorder_no=$3
			WHERE id=$4`, userID(c), body.Note, backorderNo, flagID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		notifications.Emit(c.Context(), db, "success", "Backorder created",
			itemCode+" x"+strconv.FormatFloat(qty, 'f', -1, 64)+" moved to backorder "+backorderNo, 0)
		return shared.OK(c, fiber.Map{"id": flagID, "status": "approved", "backorder_no": backorderNo})
	}
}

func rejectShortageFlag(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !rbac.HasPermission(c, "picking.override") {
			return shared.Err(c, fiber.StatusForbidden, "picking.override required")
		}
		flagID, err := strconv.Atoi(c.Params("flag_id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid flag id")
		}
		var body struct {
			Note string `json:"note"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Note) == "" {
			return shared.Err(c, fiber.StatusBadRequest, "note required — explain why this was rejected")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var pickListItemID *int
		var qty float64
		var status, itemCode string
		var balanceID *int
		if err := tx.QueryRow(c.Context(), `
			SELECT pick_list_item_id, qty, status, item_code
			FROM pick_shortage_flags WHERE id=$1 FOR UPDATE`, flagID).
			Scan(&pickListItemID, &qty, &status, &itemCode); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "flag not found")
		}
		if status != "pending" {
			return shared.Err(c, fiber.StatusConflict, "flag already reviewed (status: "+status+")")
		}
		if pickListItemID != nil {
			var allocated float64
			if err := tx.QueryRow(c.Context(), `
				SELECT COALESCE(allocated_qty,0), balance_id FROM pick_list_items WHERE id=$1 FOR UPDATE`,
				*pickListItemID).Scan(&allocated, &balanceID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if balanceID != nil && *balanceID > 0 {
				if err := shared.ReserveBalance(c.Context(), tx, *balanceID, qty); err != nil {
					return shared.Err(c, fiber.StatusConflict, "cannot re-reserve stock: "+err.Error())
				}
			}
			if _, err := tx.Exec(c.Context(), `
				UPDATE pick_list_items SET status='pending', allocated_qty=allocated_qty+$1 WHERE id=$2`,
				qty, *pickListItemID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if _, err := tx.Exec(c.Context(), `
			UPDATE pick_shortage_flags
			SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_note=$2
			WHERE id=$3`, userID(c), body.Note, flagID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": flagID, "status": "rejected"})
	}
}