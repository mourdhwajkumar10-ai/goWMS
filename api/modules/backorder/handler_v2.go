package backorder

// Backorders v2 — multi-SO + item-level open-line dedup.
// Live v1 keeps UNIQUE(sales_order_no). V2 uses backorders_v2 tables (migration 010).
// Registered at /api/backorder/v2. Auto-from-pick creates shortage backorders safely.

import (
	"strconv"

	"goWMS/api/modules/notifications"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterV2 wires alternate backorder APIs that do not rely on UNIQUE(sales_order_no).
func RegisterV2(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", listV2(db))
	r.Get("/list", listV2(db))
	r.Post("/", createV2(db))
	r.Post("/auto-from-pick/:pick_list_id", autoFromPick(db))
	r.Get("/open-by-item", openByItem(db))
	r.Post("/:id/fulfill", fulfillV2(db))
}

func listV2(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, backorder_no, sales_order_no, customer, warehouse, status, notes, created_at::text,
			       (SELECT COUNT(*) FROM backorder_lines_v2 l WHERE l.backorder_id = b.id) AS line_count
			FROM backorders_v2 b
			WHERE status IN ('pending','partially_fulfilled')
			ORDER BY created_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error()+" — apply migrations/010_backorders_v2_qc_templates.sql")
		}
		defer rows.Close()
		type row struct {
			ID           int     `json:"id"`
			BackorderNo  string  `json:"backorder_no"`
			SalesOrderNo string  `json:"sales_order_no"`
			Customer     *string `json:"customer"`
			Warehouse    *string `json:"warehouse"`
			Status       string  `json:"status"`
			Notes        *string `json:"notes"`
			CreatedAt    string  `json:"created_at"`
			LineCount    int     `json:"line_count"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.BackorderNo, &r.SalesOrderNo, &r.Customer, &r.Warehouse,
				&r.Status, &r.Notes, &r.CreatedAt, &r.LineCount); err != nil {
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

func createV2(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SalesOrderNo string `json:"sales_order_no"`
			Customer     string `json:"customer"`
			Warehouse    string `json:"warehouse"`
			Notes        string `json:"notes"`
			Lines        []struct {
				ItemCode string  `json:"item_code"`
				Qty      float64 `json:"qty"`
			} `json:"lines"`
			Items []struct {
				ItemCode string  `json:"item_code"`
				Qty      float64 `json:"qty"`
			} `json:"items"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SalesOrderNo == "" {
			return shared.Err(c, fiber.StatusBadRequest, "sales_order_no required")
		}
		lines := body.Lines
		if len(lines) == 0 {
			lines = body.Items
		}
		if len(lines) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "items (or lines) array required and must not be empty")
		}

		var id int
		var no string
		err := db.QueryRow(c.Context(), `
			INSERT INTO backorders_v2 (backorder_no, sales_order_no, customer, warehouse, notes, status)
			VALUES ('BO2-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('backorders_v2_id_seq')::TEXT,5,'0'),
				$1,$2,$3,$4,'pending') RETURNING id, backorder_no`,
			body.SalesOrderNo, body.Customer, body.Warehouse, body.Notes).Scan(&id, &no)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError,
				err.Error()+" — apply migrations/010_backorders_v2_qc_templates.sql")
		}
		for _, ln := range lines {
			if ln.ItemCode == "" || ln.Qty <= 0 {
				continue
			}
			upsertLineV2(db, c, id, ln.ItemCode, ln.Qty, body.Warehouse)
		}
		return shared.OK(c, fiber.Map{"id": id, "backorder_no": no, "variant": "v2"})
	}
}

func upsertLineV2(db *pgxpool.Pool, c *fiber.Ctx, backorderID int, itemCode string, qty float64, warehouse string) {
	var existingID int
	err := db.QueryRow(c.Context(), `
		SELECT id FROM backorder_lines_v2
		WHERE item_code=$1 AND COALESCE(warehouse,'')=COALESCE($2,'') AND status='pending'
		LIMIT 1`, itemCode, warehouse).Scan(&existingID)
	if err == nil && existingID > 0 {
		_, _ = db.Exec(c.Context(), `
			UPDATE backorder_lines_v2 SET qty = qty + $1 WHERE id=$2`, qty, existingID)
		return
	}
	_, _ = db.Exec(c.Context(), `
		INSERT INTO backorder_lines_v2 (backorder_id, item_code, qty, warehouse, status)
		VALUES ($1,$2,$3,$4,'pending')`, backorderID, itemCode, qty, nullEmptyBO(warehouse))
}

func autoFromPick(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		pickID, err := strconv.Atoi(c.Params("pick_list_id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid pick_list_id")
		}
		var soNo, customer string
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(sales_order_no,''), COALESCE(customer,'') FROM pick_lists WHERE id=$1`, pickID).
			Scan(&soNo, &customer)

		rows, err := db.Query(c.Context(), `
			SELECT item_code, GREATEST(COALESCE(shortage_qty,0), COALESCE(ordered_qty,0) - COALESCE(allocated_qty,0))
			FROM pick_list_items WHERE pick_list_id=$1 AND (status='shortage' OR COALESCE(shortage_qty,0)>0)`, pickID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type line struct {
			ItemCode string
			Qty      float64
		}
		var lines []line
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.ItemCode, &l.Qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if l.Qty > 0 {
				lines = append(lines, l)
			}
		}
		if len(lines) == 0 {
			return shared.OK(c, fiber.Map{"created": false, "message": "no shortage lines"})
		}

		var id int
		var no string
		err = db.QueryRow(c.Context(), `
			INSERT INTO backorders_v2 (backorder_no, sales_order_no, customer, notes, status, source_pick_list_id)
			VALUES ('BO2-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('backorders_v2_id_seq')::TEXT,5,'0'),
				$1,$2,$3,'pending',$4) RETURNING id, backorder_no`,
			soNo, customer, "auto from pick "+strconv.Itoa(pickID), pickID).Scan(&id, &no)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError,
				err.Error()+" — apply migrations/010_backorders_v2_qc_templates.sql")
		}
		for _, l := range lines {
			upsertLineV2(db, c, id, l.ItemCode, l.Qty, "")
			notifications.EmitShortage(c.Context(), db, no, l.ItemCode)
		}
		return shared.OK(c, fiber.Map{"created": true, "id": id, "backorder_no": no, "lines": len(lines), "variant": "v2"})
	}
}

func openByItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT item_code, warehouse, SUM(qty) AS open_qty
			FROM backorder_lines_v2 WHERE status='pending'
			GROUP BY item_code, warehouse ORDER BY item_code`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError,
				err.Error()+" — apply migrations/010_backorders_v2_qc_templates.sql")
		}
		defer rows.Close()
		type row struct {
			ItemCode  string  `json:"item_code"`
			Warehouse *string `json:"warehouse"`
			OpenQty   float64 `json:"open_qty"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ItemCode, &r.Warehouse, &r.OpenQty); err != nil {
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

func fulfillV2(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE backorders_v2 SET status='fulfilled' WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "backorder not found")
		}
		_, _ = db.Exec(c.Context(), `UPDATE backorder_lines_v2 SET status='fulfilled' WHERE backorder_id=$1`, id)
		return shared.OK(c, fiber.Map{"id": id, "status": "fulfilled", "variant": "v2"})
	}
}

func nullEmptyBO(s string) any {
	if s == "" {
		return nil
	}
	return s
}
