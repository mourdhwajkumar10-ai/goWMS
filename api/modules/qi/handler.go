package qi

import (
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the quality inspection routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	RegisterTemplates(r, db) // templates before /:id
	r.Post("/", create(db))
	r.Get("/", list(db))
	r.Get("/list", list(db))
	r.Get("/:id", get(db))
	r.Post("/:id/reading", addReading(db))
	r.Post("/:id/readings", saveReadings(db))
	r.Post("/:id/submit", submit(db))
	r.Post("/:id/accept", accept(db)) // alias → submit status=accepted
	r.Post("/:id/reject", reject(db)) // alias → submit status=rejected
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			ReferenceType string  `json:"reference_type"`
			ReferenceName string  `json:"reference_name"`
			ItemCode      string  `json:"item_code"`
			SampleSize    float64 `json:"sample_size"`
			BatchNo       string  `json:"batch_no"`
			WarehouseID   int     `json:"warehouse_id"`
			LocationID    int     `json:"location_id"`
			Qty           float64 `json:"qty"`
			GRNSessionID  int     `json:"grn_session_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}
		if body.Qty <= 0 {
			body.Qty = body.SampleSize
		}

		var id int
		var inspectionNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO quality_inspections (
				inspection_no, reference_type, reference_name, item_code, sample_size, status,
				warehouse_id, location_id, qty, grn_session_id, batch_no
			 ) VALUES (
				'QI-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('quality_inspections_id_seq')::TEXT,5,'0'),
				$1,$2,$3,$4,'pending',$5,$6,$7,$8,NULLIF($9,'')
			 ) RETURNING id, inspection_no`,
			body.ReferenceType, body.ReferenceName, body.ItemCode, body.SampleSize,
			nullInt(body.WarehouseID), nullInt(body.LocationID), body.Qty, nullInt(body.GRNSessionID), body.BatchNo,
		).Scan(&id, &inspectionNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "inspection_no": inspectionNo, "status": "pending"})
	}
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, inspection_no, reference_type, reference_name, item_code, sample_size, status,
			       warehouse_id, location_id, COALESCE(qty,0), grn_session_id, batch_no
			FROM quality_inspections ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type qiRow struct {
			ID            int      `json:"id"`
			InspectionNo  string   `json:"inspection_no"`
			ReferenceType *string  `json:"reference_type"`
			ReferenceName *string  `json:"reference_name"`
			ItemCode      string   `json:"item_code"`
			SampleSize    *float64 `json:"sample_size"`
			Status        *string  `json:"status"`
			WarehouseID   *int     `json:"warehouse_id"`
			LocationID    *int     `json:"location_id"`
			Qty           float64  `json:"qty"`
			GRNSessionID  *int     `json:"grn_session_id"`
			BatchNo       *string  `json:"batch_no"`
		}
		list := []qiRow{}
		for rows.Next() {
			var q qiRow
			if err := rows.Scan(&q.ID, &q.InspectionNo, &q.ReferenceType, &q.ReferenceName,
				&q.ItemCode, &q.SampleSize, &q.Status, &q.WarehouseID, &q.LocationID,
				&q.Qty, &q.GRNSessionID, &q.BatchNo); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, q)
		}
		return shared.OK(c, list)
	}
}

func get(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var q struct {
			ID            int      `json:"id"`
			InspectionNo  string   `json:"inspection_no"`
			ReferenceType *string  `json:"reference_type"`
			ReferenceName *string  `json:"reference_name"`
			ItemCode      string   `json:"item_code"`
			SampleSize    *float64 `json:"sample_size"`
			Status        *string  `json:"status"`
			InspectedAt   *string  `json:"inspected_at"`
			WarehouseID   *int     `json:"warehouse_id"`
			LocationID    *int     `json:"location_id"`
			Qty           float64  `json:"qty"`
			BatchNo       *string  `json:"batch_no"`
		}
		err = db.QueryRow(c.Context(),
			`SELECT id, inspection_no, reference_type, reference_name, item_code, sample_size, status, inspected_at::text,
			        warehouse_id, location_id, COALESCE(qty,0), batch_no
			 FROM quality_inspections WHERE id=$1`, id).
			Scan(&q.ID, &q.InspectionNo, &q.ReferenceType, &q.ReferenceName, &q.ItemCode,
				&q.SampleSize, &q.Status, &q.InspectedAt, &q.WarehouseID, &q.LocationID, &q.Qty, &q.BatchNo)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "inspection not found")
		}
		readings := []fiber.Map{}
		rrows, rerr := db.Query(c.Context(), `
			SELECT id, COALESCE(specification,''), COALESCE(value,''), COALESCE(status,'pending'),
			       COALESCE(notes,''), min_value, max_value, COALESCE("numeric",true)
			FROM quality_inspection_readings WHERE inspection_id=$1 ORDER BY id`, id)
		if rerr == nil {
			defer rrows.Close()
			for rrows.Next() {
				var rid int
				var spec, val, st, notes string
				var minV, maxV *float64
				var numeric bool
				if err := rrows.Scan(&rid, &spec, &val, &st, &notes, &minV, &maxV, &numeric); err != nil {
					continue
				}
				status := readingStatus(val, st, minV, maxV, numeric)
				readings = append(readings, fiber.Map{
					"id": rid, "specification": spec, "value": val, "status": status,
					"notes": notes, "min_value": minV, "max_value": maxV, "numeric": numeric,
					"expected": expectedRange(minV, maxV),
				})
			}
		}
		return shared.OK(c, fiber.Map{
			"id": q.ID, "inspection_no": q.InspectionNo, "reference_type": q.ReferenceType,
			"reference_name": q.ReferenceName, "item_code": q.ItemCode, "sample_size": q.SampleSize,
			"status": q.Status, "inspected_at": q.InspectedAt, "warehouse_id": q.WarehouseID,
			"location_id": q.LocationID, "qty": q.Qty, "batch_no": q.BatchNo, "readings": readings,
		})
	}
}

func addReading(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var body struct {
			Specification string `json:"specification"`
			Value         string `json:"value"`
			Status        string `json:"status"`
			Notes         string `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var readingID int
		err = db.QueryRow(c.Context(),
			`INSERT INTO quality_inspection_readings (inspection_id, specification, value, status, notes)
			 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
			id, body.Specification, body.Value, body.Status, body.Notes).Scan(&readingID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": readingID, "inspection_id": id})
	}
}

func saveReadings(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Readings []struct {
				ID            int    `json:"id"`
				Specification string `json:"specification"`
				Value         string `json:"value"`
				Status        string `json:"status"`
				Notes         string `json:"notes"`
			} `json:"readings"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		saved := 0
		failed := 0
		for _, rd := range body.Readings {
			var minV, maxV *float64
			var numeric bool
			var spec string
			if rd.ID > 0 {
				_ = db.QueryRow(c.Context(), `
					SELECT COALESCE(specification,''), min_value, max_value, COALESCE("numeric",true)
					FROM quality_inspection_readings WHERE id=$1 AND inspection_id=$2`, rd.ID, id).
					Scan(&spec, &minV, &maxV, &numeric)
			}
			st := readingStatus(rd.Value, rd.Status, minV, maxV, numeric)
			if st == "fail" {
				failed++
			}
			if rd.ID > 0 {
				_, err = db.Exec(c.Context(), `
					UPDATE quality_inspection_readings SET value=$2, status=$3, notes=COALESCE(NULLIF($4,''), notes)
					WHERE id=$1 AND inspection_id=$5`, rd.ID, rd.Value, st, rd.Notes, id)
			} else {
				spec = strings.TrimSpace(rd.Specification)
				if spec == "" {
					continue
				}
				_, err = db.Exec(c.Context(), `
					INSERT INTO quality_inspection_readings (inspection_id, specification, value, status, notes)
					VALUES ($1,$2,$3,$4,$5)`, id, spec, rd.Value, st, rd.Notes)
			}
			if err == nil {
				saved++
			}
		}
		return shared.OK(c, fiber.Map{"inspection_id": id, "saved": saved, "failed": failed})
	}
}

func expectedRange(minV, maxV *float64) string {
	if minV != nil && maxV != nil {
		return strconv.FormatFloat(*minV, 'f', -1, 64) + " – " + strconv.FormatFloat(*maxV, 'f', -1, 64)
	}
	if minV != nil {
		return "≥ " + strconv.FormatFloat(*minV, 'f', -1, 64)
	}
	if maxV != nil {
		return "≤ " + strconv.FormatFloat(*maxV, 'f', -1, 64)
	}
	return ""
}

func readingStatus(value, requested string, minV, maxV *float64, numeric bool) string {
	req := strings.ToLower(strings.TrimSpace(requested))
	if req == "fail" || req == "failed" || req == "pass" || req == "ok" {
		if req == "ok" {
			return "pass"
		}
		if req == "failed" {
			return "fail"
		}
		return req
	}
	v := strings.TrimSpace(value)
	if v == "" {
		if req != "" {
			return req
		}
		return "pending"
	}
	if numeric && (minV != nil || maxV != nil) {
		n, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return "fail"
		}
		if minV != nil && n < *minV {
			return "fail"
		}
		if maxV != nil && n > *maxV {
			return "fail"
		}
		return "pass"
	}
	low := strings.ToLower(v)
	if low == "fail" || low == "ng" || low == "no" || low == "reject" {
		return "fail"
	}
	if low == "pass" || low == "ok" || low == "yes" {
		return "pass"
	}
	return "pending"
}

func submit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var body struct {
			Status string `json:"status"` // accepted | rejected
			Reason string `json:"reason"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Status == "" {
			body.Status = "accepted"
		}
		return doSubmit(c, db, id, body.Status, body.Reason)
	}
}

func accept(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Reason string `json:"reason"`
		}
		_ = shared.Bind(c, &body)
		return doSubmit(c, db, id, "accepted", body.Reason)
	}
}

func reject(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Reason string `json:"reason"`
		}
		_ = shared.Bind(c, &body)
		return doSubmit(c, db, id, "rejected", body.Reason)
	}
}

func doSubmit(c *fiber.Ctx, db *pgxpool.Pool, id int, status, reason string) error {
	status = strings.ToLower(status)
	if status != "accepted" && status != "rejected" {
		return shared.Err(c, fiber.StatusBadRequest, "status must be accepted or rejected")
	}

	var itemCode string
	var warehouseID, locationID *int
	var qty float64
	var batch *string
	var currentStatus string
	err := db.QueryRow(c.Context(), `
			SELECT item_code, warehouse_id, location_id, COALESCE(qty, sample_size, 0), batch_no, COALESCE(status,'pending')
			FROM quality_inspections WHERE id=$1`, id).
		Scan(&itemCode, &warehouseID, &locationID, &qty, &batch, &currentStatus)
	if err == pgx.ErrNoRows {
		return shared.Err(c, fiber.StatusNotFound, "inspection not found")
	}
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	if currentStatus != "pending" {
		return shared.Err(c, fiber.StatusBadRequest, "inspection already submitted")
	}

	movedTo := ""
	if warehouseID != nil && locationID != nil && qty > 0 {
		wid := *warehouseID
		fromID := *locationID
		batchStr := ""
		if batch != nil {
			batchStr = *batch
		}

		var toID int
		var toCode string
		if status == "accepted" {
			toID, toCode, err = shared.EnsureLocation(c.Context(), db, wid, "INCOMING-01", "incoming")
		} else {
			toID, toCode, err = shared.EnsureLocation(c.Context(), db, wid, "DAMAGED-01", "damaged")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Move hold → incoming (accepted) or damaged (rejected).
		_ = shared.AdjustLocationQty(c.Context(), db, itemCode, wid, fromID, batchStr, -qty)
		if err := shared.AdjustLocationQty(c.Context(), db, itemCode, wid, toID, batchStr, qty); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		movedTo = toCode
	}

	if reason != "" {
		_, _ = db.Exec(c.Context(), `
				UPDATE quality_inspections SET remarks = COALESCE(remarks,'') || $1 WHERE id=$2`,
			"\n"+reason, id)
	}

	tag, err := db.Exec(c.Context(),
		`UPDATE quality_inspections SET status=$1, inspected_by=$2, inspected_at=NOW() WHERE id=$3`,
		status, userID(c), id)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	if tag.RowsAffected() == 0 {
		return shared.Err(c, fiber.StatusNotFound, "inspection not found")
	}

	return shared.OK(c, fiber.Map{
		"id": id, "status": status, "moved_to": movedTo,
		"putaway_ready": status == "accepted" && movedTo != "",
	})
}

func nullInt(v int) any {
	if v == 0 {
		return nil
	}
	return v
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
