package cyclecount

import (
	"strconv"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the cycle count routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/sheets", createSheet(db))
	r.Get("/sheets", listSheets(db))
	r.Get("/sheets/:id", getSheet(db))
	r.Post("/sheets/:id/line", addLine(db))
	r.Post("/lines/:id/count", countLine(db))
	r.Post("/sheets/:id/close", closeSheet(db))
}

func createSheet(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			WarehouseID   int    `json:"warehouse_id"`
			Tier          string `json:"tier"`
			ScheduledDate string `json:"scheduled_date"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Tier == "" {
			body.Tier = "A"
		}

		// scheduled_date is nullable — empty string becomes NULL.
		var scheduledDate any
		if body.ScheduledDate != "" {
			scheduledDate = body.ScheduledDate
		}
		var warehouseID any
		if body.WarehouseID != 0 {
			warehouseID = body.WarehouseID
		}

		var id int
		var sheetNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO cycle_count_sheets (sheet_no, warehouse_id, tier, scheduled_date, status)
			 VALUES ('CC-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('cycle_count_sheets_id_seq')::TEXT,5,'0'),$1,$2,$3,'pending')
			 RETURNING id, sheet_no`,
			warehouseID, body.Tier, scheduledDate).Scan(&id, &sheetNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "sheet_no": sheetNo, "status": "pending"})
	}
}

func listSheets(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, sheet_no, tier, scheduled_date::text, status, created_at
			FROM cycle_count_sheets ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type sheet struct {
			ID            int        `json:"id"`
			SheetNo       string     `json:"sheet_no"`
			Tier          *string    `json:"tier"`
			ScheduledDate *string    `json:"scheduled_date"`
			Status        *string    `json:"status"`
			CreatedAt     *time.Time `json:"created_at"`
		}
		var list []sheet
		for rows.Next() {
			var s sheet
			if err := rows.Scan(&s.ID, &s.SheetNo, &s.Tier, &s.ScheduledDate, &s.Status, &s.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		return shared.OK(c, list)
	}
}

func getSheet(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var sheet struct {
			ID            int     `json:"id"`
			SheetNo       string  `json:"sheet_no"`
			Tier          *string `json:"tier"`
			ScheduledDate *string `json:"scheduled_date"`
			Status        *string `json:"status"`
		}
		err = db.QueryRow(c.Context(),
			`SELECT id, sheet_no, tier, scheduled_date::text, status FROM cycle_count_sheets WHERE id=$1`, id).
			Scan(&sheet.ID, &sheet.SheetNo, &sheet.Tier, &sheet.ScheduledDate, &sheet.Status)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "sheet not found")
		}

		rows, err := db.Query(c.Context(),
			`SELECT id, item_code, system_qty, counted_qty, discrepancy_status FROM cycle_count_lines WHERE sheet_id=$1 ORDER BY id`,
			id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type line struct {
			ID                int      `json:"id"`
			ItemCode          string   `json:"item_code"`
			SystemQty         *float64 `json:"system_qty"`
			CountedQty        *float64 `json:"counted_qty"`
			DiscrepancyStatus *string  `json:"discrepancy_status"`
		}
		var lines []line
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.ID, &l.ItemCode, &l.SystemQty, &l.CountedQty, &l.DiscrepancyStatus); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			lines = append(lines, l)
		}

		return shared.OK(c, fiber.Map{
			"id":             sheet.ID,
			"sheet_no":       sheet.SheetNo,
			"tier":           sheet.Tier,
			"scheduled_date": sheet.ScheduledDate,
			"status":         sheet.Status,
			"lines":          lines,
		})
	}
}

func addLine(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sheetID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid sheet id")
		}

		var body struct {
			ItemCode  string  `json:"item_code"`
			SystemQty float64 `json:"system_qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO cycle_count_lines (sheet_id, item_code, system_qty) VALUES ($1,$2,$3) RETURNING id`,
			sheetID, body.ItemCode, body.SystemQty).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func countLine(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		lineID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid line id")
		}

		var body struct {
			CountedQty float64 `json:"counted_qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var systemQty float64
		err = db.QueryRow(c.Context(),
			`SELECT COALESCE(system_qty,0) FROM cycle_count_lines WHERE id=$1`, lineID).Scan(&systemQty)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "line not found")
		}

		discrepancy := "match"
		if body.CountedQty > systemQty {
			discrepancy = "over"
		} else if body.CountedQty < systemQty {
			discrepancy = "short"
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE cycle_count_lines SET counted_qty=$1, discrepancy_status=$2, counted_by=$3, counted_at=NOW() WHERE id=$4`,
			body.CountedQty, discrepancy, userID(c), lineID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "line not found")
		}
		return shared.OK(c, fiber.Map{"id": lineID, "discrepancy_status": discrepancy})
	}
}

func closeSheet(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sheetID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid sheet id")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE cycle_count_sheets SET status='completed', completed_at=NOW() WHERE id=$1 AND status='pending'`, sheetID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "sheet not found or already completed")
		}
		return shared.OK(c, fiber.Map{"id": sheetID, "status": "completed"})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
