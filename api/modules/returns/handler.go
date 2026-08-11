package returns

import (
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires return claims against existing return_claims table.
// Restock only to hold/damaged location types (never storage/pick_face by default).
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", list(db))
	r.Get("/list", list(db))
	r.Post("/", create(db))
	r.Get("/:id", get(db))
	r.Post("/:id/inspect", inspect(db))
	r.Post("/:id/restock", restock(db))
	registerWorkflowRoutes(r, db)
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, claim_no, customer_id, sales_invoice_no, reason, status, created_at::text
			FROM return_claims ORDER BY created_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type row struct {
			ID              int     `json:"id"`
			ClaimNo         string  `json:"claim_no"`
			CustomerID      *int    `json:"customer_id"`
			SalesInvoiceNo  *string `json:"sales_invoice_no"`
			Reason          *string `json:"reason"`
			Status          string  `json:"status"`
			CreatedAt       string  `json:"created_at"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.ClaimNo, &r.CustomerID, &r.SalesInvoiceNo, &r.Reason, &r.Status, &r.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		if list == nil {
			list = []row{}
		}
		return shared.OK(c, list)
	}
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			CustomerID     *int   `json:"customer_id"`
			SalesInvoiceNo string `json:"sales_invoice_no"`
			DeliveryNoteNo string `json:"delivery_note_no"`
			Reason         string `json:"reason"`
			Items          []struct {
				ItemCode string  `json:"item_code"`
				Qty      float64 `json:"qty"`
				Condition string `json:"condition"` // good|damaged
			} `json:"items"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Reason == "" {
			return shared.Err(c, fiber.StatusBadRequest, "reason required")
		}

		var id int
		var claimNo string
		err := db.QueryRow(c.Context(), `
			INSERT INTO return_claims (claim_no, customer_id, sales_invoice_no, reason, status, delivery_note_no)
			VALUES ('RC-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('return_claims_id_seq')::TEXT,5,'0'),
				$1, $2, $3, 'pending', $4)
			RETURNING id, claim_no`, body.CustomerID, nullEmpty(body.SalesInvoiceNo), body.Reason, nullEmpty(body.DeliveryNoteNo)).
			Scan(&id, &claimNo)
		if err != nil {
			err = db.QueryRow(c.Context(), `
				INSERT INTO return_claims (claim_no, customer_id, sales_invoice_no, reason, status)
				VALUES ('RC-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('return_claims_id_seq')::TEXT,5,'0'),
					$1, $2, $3, 'pending')
				RETURNING id, claim_no`, body.CustomerID, nullEmpty(body.SalesInvoiceNo), body.Reason).
				Scan(&id, &claimNo)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		for _, it := range body.Items {
			_, err2 := db.Exec(c.Context(), `
				INSERT INTO return_claim_lines (return_claim_id, item_code, qty, condition, decision)
				VALUES ($1,$2,$3,$4,'pending')`,
				id, it.ItemCode, it.Qty, it.Condition)
			if err2 != nil {
				_, _ = db.Exec(c.Context(), `
					INSERT INTO notifications (type, title, message, user_id)
					VALUES ('info', $1, $2, $3)`,
					claimNo+": "+it.ItemCode,
					"qty="+strconv.FormatFloat(it.Qty, 'f', -1, 64)+" condition="+it.Condition+" dn="+body.DeliveryNoteNo,
					userID(c))
			}
		}

		return shared.OK(c, fiber.Map{"id": id, "claim_no": claimNo, "status": "pending"})
	}
}

func get(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var claimNo string
		var customerID *int
		var inv, reason *string
		var status string
		var created string
		err = db.QueryRow(c.Context(), `
			SELECT claim_no, customer_id, sales_invoice_no, reason, status, created_at::text
			FROM return_claims WHERE id=$1`, id).Scan(&claimNo, &customerID, &inv, &reason, &status, &created)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "return claim not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": id, "claim_no": claimNo, "customer_id": customerID,
			"sales_invoice_no": inv, "reason": reason, "status": status, "created_at": created,
		})
	}
}

func inspect(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Result string `json:"result"` // accepted|rejected
			Notes  string `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		status := "inspected"
		if strings.EqualFold(body.Result, "rejected") {
			status = "rejected"
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE return_claims SET status=$2, reason = COALESCE(reason,'') || CASE WHEN $3<>'' THEN E'\n[inspect] '||$3 ELSE '' END
			WHERE id=$1 AND status IN ('pending','open','received')`, id, status, body.Notes)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "claim cannot be inspected")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": status})
	}
}

// restock places returned qty into a hold/damaged location only.
func restock(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			ItemCode     string  `json:"item_code"`
			Qty          float64 `json:"qty"`
			LocationID   int     `json:"location_id"`
			WarehouseID  int     `json:"warehouse_id"`
			BatchNo      string  `json:"batch_no"`
			Condition    string  `json:"condition"` // damaged|hold
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.Qty <= 0 || body.LocationID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "item_code, qty, location_id required")
		}

		var locType string
		var whID int
		err = db.QueryRow(c.Context(), `
			SELECT location_type, warehouse_id FROM warehouse_locations WHERE id=$1`, body.LocationID).
			Scan(&locType, &whID)
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "location not found")
		}
		lt := strings.ToLower(locType)
		if lt != "hold" && lt != "damaged" && lt != "quarantine" && lt != "returns" {
			return shared.Err(c, fiber.StatusBadRequest,
				"returns must restock to hold/damaged/quarantine/returns location (got "+locType+")")
		}
		if body.WarehouseID == 0 {
			body.WarehouseID = whID
		}

		if err := shared.AdjustLocationQty(c.Context(), db, body.ItemCode, body.WarehouseID, body.LocationID, body.BatchNo, body.Qty); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		_, _ = db.Exec(c.Context(), `UPDATE return_claims SET status='restocked' WHERE id=$1`, id)
		_, _ = db.Exec(c.Context(), `
			INSERT INTO notifications (type, title, message)
			VALUES ('success', $1, $2)`,
			"Return restocked",
			body.ItemCode+" x "+strconv.FormatFloat(body.Qty, 'f', -1, 64)+" → loc "+strconv.Itoa(body.LocationID))

		return shared.OK(c, fiber.Map{"id": id, "status": "restocked", "location_id": body.LocationID})
	}
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
