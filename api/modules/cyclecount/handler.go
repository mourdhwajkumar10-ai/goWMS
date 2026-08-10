package cyclecount

import (
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the cycle count routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/sheets", createSheet(db))
	r.Post("/", createSheet(db)) // alias for frontend
	r.Get("/sheets", listSheets(db))
	r.Get("/sheets/:id", getSheet(db))
	r.Get("/:id", getSheet(db)) // alias
	r.Post("/sheets/:id/line", addLine(db))
	r.Post("/:id/line", addLine(db))
	r.Post("/sheets/:id/generate", generateLines(db))
	r.Post("/lines/:id/count", countLine(db))
	r.Post("/line/:id/count", countLine(db)) // frontend alias
	r.Post("/sheets/:id/close", closeSheet(db))
	r.Post("/:id/close", closeSheet(db))
	r.Post("/:id/complete", closeSheet(db)) // frontend alias
}

func createSheet(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			WarehouseID   int    `json:"warehouse_id"`
			Tier          string `json:"tier"`
			ScheduledDate string `json:"scheduled_date"`
			Zone          string `json:"zone"`
			Aisle         string `json:"aisle"`
			AutoGenerate  bool   `json:"auto_generate"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Tier == "" {
			body.Tier = "A"
		}

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
			`INSERT INTO cycle_count_sheets (sheet_no, warehouse_id, tier, scheduled_date, status, zone, aisle)
			 VALUES ('CC-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('cycle_count_sheets_id_seq')::TEXT,5,'0'),$1,$2,$3,'pending',$4,$5)
			 RETURNING id, sheet_no`,
			warehouseID, body.Tier, scheduledDate, nullEmpty(body.Zone), nullEmpty(body.Aisle)).Scan(&id, &sheetNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		generated := 0
		if body.AutoGenerate && body.WarehouseID != 0 {
			n, gerr := generateFromLocations(c, db, id, body.WarehouseID, body.Zone, body.Aisle)
			if gerr == nil {
				generated = n
			}
		}

		return shared.OK(c, fiber.Map{
			"id": id, "sheet_no": sheetNo, "status": "pending", "lines_generated": generated,
		})
	}
}

func generateLines(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sheetID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid sheet id")
		}
		var body struct {
			WarehouseID int    `json:"warehouse_id"`
			Zone        string `json:"zone"`
			Aisle       string `json:"aisle"`
		}
		_ = shared.Bind(c, &body)

		var whID *int
		var zone, aisle *string
		_ = db.QueryRow(c.Context(), `
			SELECT warehouse_id, zone, aisle FROM cycle_count_sheets WHERE id=$1`, sheetID).
			Scan(&whID, &zone, &aisle)
		if body.WarehouseID == 0 && whID != nil {
			body.WarehouseID = *whID
		}
		if body.Zone == "" && zone != nil {
			body.Zone = *zone
		}
		if body.Aisle == "" && aisle != nil {
			body.Aisle = *aisle
		}
		if body.WarehouseID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse_id required")
		}

		n, err := generateFromLocations(c, db, sheetID, body.WarehouseID, body.Zone, body.Aisle)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"sheet_id": sheetID, "lines_generated": n})
	}
}

func generateFromLocations(c *fiber.Ctx, db *pgxpool.Pool, sheetID, warehouseID int, zone, aisle string) (int, error) {
	args := []any{warehouseID}
	sql := `
		SELECT slb.item_code, slb.location_id, COALESCE(slb.batch_no,''), slb.actual_qty
		FROM stock_location_balances slb
		JOIN warehouse_locations wl ON wl.id = slb.location_id
		WHERE slb.warehouse_id=$1 AND slb.actual_qty <> 0
		  AND wl.location_type IN ('storage','pick_face')`
	if strings.TrimSpace(zone) != "" {
		args = append(args, zone)
		sql += ` AND wl.zone = $` + strconv.Itoa(len(args))
	}
	if strings.TrimSpace(aisle) != "" {
		args = append(args, aisle)
		sql += ` AND wl.aisle = $` + strconv.Itoa(len(args))
	}
	sql += ` ORDER BY wl.code, slb.item_code`

	rows, err := db.Query(c.Context(), sql, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	n := 0
	for rows.Next() {
		var itemCode, batch string
		var locID int
		var qty float64
		if err := rows.Scan(&itemCode, &locID, &batch, &qty); err != nil {
			return n, err
		}
		_, err = db.Exec(c.Context(), `
			INSERT INTO cycle_count_lines (sheet_id, item_code, system_qty, location_id, batch_no)
			VALUES ($1,$2,$3,$4,NULLIF($5,''))`,
			sheetID, itemCode, qty, locID, batch)
		if err == nil {
			n++
		}
	}
	return n, nil
}

func listSheets(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, sheet_no, warehouse_id, tier, scheduled_date::text, status, created_at, zone, aisle
			FROM cycle_count_sheets ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type sheet struct {
			ID            int        `json:"id"`
			SheetNo       string     `json:"sheet_no"`
			WarehouseID   *int       `json:"warehouse_id"`
			Tier          *string    `json:"tier"`
			ScheduledDate *string    `json:"scheduled_date"`
			Status        *string    `json:"status"`
			CreatedAt     *time.Time `json:"created_at"`
			Zone          *string    `json:"zone"`
			Aisle         *string    `json:"aisle"`
		}
		list := []sheet{}
		for rows.Next() {
			var s sheet
			if err := rows.Scan(&s.ID, &s.SheetNo, &s.WarehouseID, &s.Tier, &s.ScheduledDate, &s.Status, &s.CreatedAt, &s.Zone, &s.Aisle); err != nil {
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
			WarehouseID   *int    `json:"warehouse_id"`
			Tier          *string `json:"tier"`
			ScheduledDate *string `json:"scheduled_date"`
			Status        *string `json:"status"`
			Zone          *string `json:"zone"`
			Aisle         *string `json:"aisle"`
		}
		err = db.QueryRow(c.Context(),
			`SELECT id, sheet_no, warehouse_id, tier, scheduled_date::text, status, zone, aisle FROM cycle_count_sheets WHERE id=$1`, id).
			Scan(&sheet.ID, &sheet.SheetNo, &sheet.WarehouseID, &sheet.Tier, &sheet.ScheduledDate, &sheet.Status, &sheet.Zone, &sheet.Aisle)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "sheet not found")
		}

		rows, err := db.Query(c.Context(), `
			SELECT ccl.id, ccl.item_code, ccl.system_qty, ccl.counted_qty, ccl.discrepancy_status,
			       ccl.location_id, wl.code, COALESCE(ccl.batch_no,'')
			FROM cycle_count_lines ccl
			LEFT JOIN warehouse_locations wl ON wl.id = ccl.location_id
			WHERE ccl.sheet_id=$1 ORDER BY wl.code NULLS LAST, ccl.id`, id)
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
			LocationID        *int     `json:"location_id"`
			LocationCode      *string  `json:"location_code"`
			BatchNo           string   `json:"batch_no"`
		}
		lines := []line{}
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.ID, &l.ItemCode, &l.SystemQty, &l.CountedQty, &l.DiscrepancyStatus,
				&l.LocationID, &l.LocationCode, &l.BatchNo); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			lines = append(lines, l)
		}

		return shared.OK(c, fiber.Map{
			"id": sheet.ID, "sheet_no": sheet.SheetNo, "warehouse_id": sheet.WarehouseID,
			"tier": sheet.Tier, "scheduled_date": sheet.ScheduledDate, "status": sheet.Status,
			"zone": sheet.Zone, "aisle": sheet.Aisle, "lines": lines,
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
			ItemCode   string  `json:"item_code"`
			SystemQty  float64 `json:"system_qty"`
			LocationID int     `json:"location_id"`
			BatchNo    string  `json:"batch_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}

		if body.LocationID > 0 && body.SystemQty == 0 {
			_ = db.QueryRow(c.Context(), `
				SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
				WHERE location_id=$1 AND item_code=$2 AND COALESCE(batch_no,'')=COALESCE(NULLIF($3,''),'')`,
				body.LocationID, body.ItemCode, body.BatchNo).Scan(&body.SystemQty)
		}

		var id int
		err = db.QueryRow(c.Context(),
			`INSERT INTO cycle_count_lines (sheet_id, item_code, system_qty, location_id, batch_no)
			 VALUES ($1,$2,$3,NULLIF($4,0),NULLIF($5,'')) RETURNING id`,
			sheetID, body.ItemCode, body.SystemQty, body.LocationID, body.BatchNo).Scan(&id)
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

		var body struct {
			ApplyAdjustments bool `json:"apply_adjustments"`
		}
		_ = shared.Bind(c, &body)

		adjusted := 0
		if body.ApplyAdjustments {
			rows, err := db.Query(c.Context(), `
				SELECT ccl.item_code, ccl.location_id, COALESCE(ccl.batch_no,''),
				       COALESCE(ccl.system_qty,0), COALESCE(ccl.counted_qty,0), wl.warehouse_id
				FROM cycle_count_lines ccl
				JOIN warehouse_locations wl ON wl.id = ccl.location_id
				WHERE ccl.sheet_id=$1 AND ccl.location_id IS NOT NULL AND ccl.counted_qty IS NOT NULL
				  AND COALESCE(ccl.counted_qty,0) <> COALESCE(ccl.system_qty,0)`, sheetID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			for rows.Next() {
				var itemCode, batch string
				var locID, whID int
				var sysQty, counted float64
				if err := rows.Scan(&itemCode, &locID, &batch, &sysQty, &counted, &whID); err != nil {
					rows.Close()
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				delta := counted - sysQty
				if err := shared.AdjustLocationQty(c.Context(), db, itemCode, whID, locID, batch, delta); err == nil {
					adjusted++
				}
			}
			rows.Close()
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE cycle_count_sheets SET status='completed', completed_at=NOW() WHERE id=$1 AND status='pending'`, sheetID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "sheet not found or already completed")
		}
		return shared.OK(c, fiber.Map{"id": sheetID, "status": "completed", "adjustments_applied": adjusted})
	}
}

func nullEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
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
