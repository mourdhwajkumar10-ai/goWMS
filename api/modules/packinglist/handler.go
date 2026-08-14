package packinglist

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires packing-list import into existing GRN cartons/lines (not spec grn_boxes).
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/templates", listTemplates(db))
	r.Post("/templates", createTemplate(db))
	r.Post("/import", importIntoGRN(db))
	RegisterXLSX(r, db)
}

// RegisterGRNAlias mounts docs/QA paths under /grn/:id/...
func RegisterGRNAlias(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/:id/import-packing-list", importPackingListViaGRN(db))
	r.Post("/:id/import-xlsx", importXLSX(db))
}

// RegisterSupplierAlias mounts template paths under /suppliers/:id/packing-templates.
func RegisterSupplierAlias(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/:id/packing-templates", listTemplates(db))
	r.Post("/:id/packing-templates", createTemplate(db))
}

func importPackingListViaGRN(db *pgxpool.Pool) fiber.Handler {
	xlsx := importXLSX(db)
	jsonImport := importIntoGRN(db)
	return func(c *fiber.Ctx) error {
		ct := string(c.Request().Header.ContentType())
		if strings.Contains(ct, "multipart") {
			return xlsx(c)
		}
		return jsonImport(c)
	}
}

func listTemplates(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		supplierID, _ := strconv.Atoi(c.Params("id"))
		q := `
			SELECT id, name, supplier_id, header_row, column_map::text, skip_summary_row, is_active
			FROM packing_list_templates WHERE is_active=true`
		args := []any{}
		if supplierID > 0 {
			q += ` AND (supplier_id=$1 OR supplier_id IS NULL)`
			args = append(args, supplierID)
		}
		q += ` ORDER BY id`
		rows, err := db.Query(c.Context(), q, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type t struct {
			ID             int            `json:"id"`
			Name           string         `json:"name"`
			SupplierID     *int           `json:"supplier_id"`
			HeaderRow      int            `json:"header_row"`
			ColumnMap      map[string]any `json:"column_map"`
			SkipSummaryRow bool           `json:"skip_summary_row"`
			IsActive       bool           `json:"is_active"`
		}
		var list []t
		for rows.Next() {
			var x t
			var raw string
			if err := rows.Scan(&x.ID, &x.Name, &x.SupplierID, &x.HeaderRow, &raw, &x.SkipSummaryRow, &x.IsActive); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			_ = json.Unmarshal([]byte(raw), &x.ColumnMap)
			if x.ColumnMap == nil {
				x.ColumnMap = map[string]any{}
			}
			list = append(list, x)
		}
		if list == nil {
			list = []t{}
		}
		return shared.OK(c, list)
	}
}

func createTemplate(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Name           string         `json:"name"`
			SupplierID     *int           `json:"supplier_id"`
			HeaderRow      int            `json:"header_row"`
			ColumnMap      map[string]any `json:"column_map"`
			SkipSummaryRow *bool          `json:"skip_summary_row"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Name == "" || body.ColumnMap == nil {
			return shared.Err(c, fiber.StatusBadRequest, "name and column_map required")
		}
		if body.HeaderRow <= 0 {
			body.HeaderRow = 1
		}
		// Prefer path supplier id when mounted under /suppliers/:id/packing-templates
		if sid, err := strconv.Atoi(c.Params("id")); err == nil && sid > 0 {
			body.SupplierID = &sid
		}
		skip := true
		if body.SkipSummaryRow != nil {
			skip = *body.SkipSummaryRow
		}
		var id int
		colJSON, _ := json.Marshal(body.ColumnMap)
		err := db.QueryRow(c.Context(), `
			INSERT INTO packing_list_templates (name, supplier_id, header_row, column_map, skip_summary_row)
			VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id`,
			body.Name, body.SupplierID, body.HeaderRow, string(colJSON), skip).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

// importIntoGRN accepts parsed CSV/Excel-as-JSON rows and creates cartons + lines on an open GRN session.
func importIntoGRN(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			GRNSessionID int               `json:"grn_session_id"`
			TemplateID   *int              `json:"template_id"`
			Rows         []map[string]any  `json:"rows"`
			ColumnMap    map[string]string `json:"column_map"` // optional override
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.GRNSessionID == 0 {
			body.GRNSessionID, _ = strconv.Atoi(c.Params("id"))
		}
		if body.GRNSessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "grn_session_id required")
		}
		if len(body.Rows) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "rows required")
		}

		var status string
		err := db.QueryRow(c.Context(), `SELECT status FROM grn_sessions WHERE id=$1`, body.GRNSessionID).Scan(&status)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "grn session not found")
		}
		if status != "open" && status != "receiving" && status != "draft" && status != "box_reconciliation" && status != "item_verification" {
			return shared.Err(c, fiber.StatusBadRequest, "grn session is not open for import")
		}

		colMap := body.ColumnMap
		if colMap == nil {
			colMap = map[string]string{
				"part_no": "Part No", "part_name": "Part Name", "qty": "Qty",
				"batch_no": "Batch No", "box_number": "Box Number", "supplier_sku": "Part No",
			}
			if body.TemplateID != nil {
				var raw string
				_ = db.QueryRow(c.Context(), `SELECT column_map::text FROM packing_list_templates WHERE id=$1`, *body.TemplateID).Scan(&raw)
				var parsed map[string]any
				_ = json.Unmarshal([]byte(raw), &parsed)
				for k, v := range parsed {
					if s, ok := v.(string); ok {
						colMap[k] = s
					}
				}
			}
		}

		get := func(row map[string]any, logical string) string {
			key := colMap[logical]
			if key == "" {
				key = logical
			}
			if v, ok := row[key]; ok {
				return strings.TrimSpace(toStr(v))
			}
			// case-insensitive fallback
			for k, v := range row {
				if strings.EqualFold(k, key) || strings.EqualFold(k, logical) {
					return strings.TrimSpace(toStr(v))
				}
			}
			return ""
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		cartonCache := map[string]int{}
		createdCartons := 0
		createdLines := 0
		skipped := 0
		warnings := []string{}

		for i, row := range body.Rows {
			// Skip summary-like last rows (no box, no part)
			boxNo := get(row, "box_number")
			partNo := get(row, "part_no")
			if boxNo == "" || partNo == "" {
				skipped++
				if boxNo == "" && partNo != "" {
					warnings = append(warnings, "row "+strconv.Itoa(i+1)+": empty Box Number, skipped")
				}
				continue
			}
			qtyStr := get(row, "qty")
			qty, _ := strconv.ParseFloat(qtyStr, 64)
			if qty <= 0 {
				skipped++
				continue
			}
			batch := get(row, "batch_no")
			partName := get(row, "part_name")
			supplierSKU := get(row, "supplier_sku")
			if supplierSKU == "" {
				supplierSKU = partNo
			}

			cartonID, ok := cartonCache[boxNo]
			if !ok {
				err2 := tx.QueryRow(c.Context(), `
					SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`, body.GRNSessionID, boxNo).Scan(&cartonID)
				if err2 != nil {
					err = tx.QueryRow(c.Context(), `
						INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected)
						VALUES ($1,$2,'expected',true) RETURNING id`,
						body.GRNSessionID, boxNo).Scan(&cartonID)
					if err != nil {
						// Pre-018 fallback
						err = tx.QueryRow(c.Context(), `
							INSERT INTO grn_cartons (grn_session_id, carton_no, status, scanned_at, scanned_by)
							VALUES ($1,$2,'accounted',NOW(),$3) RETURNING id`,
							body.GRNSessionID, boxNo, userID(c)).Scan(&cartonID)
						if err != nil {
							return shared.Err(c, fiber.StatusInternalServerError, err.Error())
						}
					}
					createdCartons++
				}
				cartonCache[boxNo] = cartonID
			}

			invNo := get(row, "invoice_no")
			_, err = tx.Exec(c.Context(), `
				INSERT INTO grn_lines (
					grn_carton_id, item_code, expected_qty, scanned_qty, status,
					verification_method, batch_no, supplier_sku, grn_session_id, notes, invoice_no
				) VALUES ($1,$2,$3,0,'pending','import',$4,$5,$6,$7,$8)`,
				cartonID, partNo, qty, nullEmpty(batch), nullEmpty(supplierSKU), body.GRNSessionID,
				nullEmpty(partName), nullEmpty(invNo))
			if err != nil {
				// Pre-018 without invoice_no column
				_, err = tx.Exec(c.Context(), `
					INSERT INTO grn_lines (
						grn_carton_id, item_code, expected_qty, scanned_qty, status,
						verification_method, batch_no, supplier_sku, grn_session_id, notes
					) VALUES ($1,$2,$3,0,'pending','import',$4,$5,$6,$7)`,
					cartonID, partNo, qty, nullEmpty(batch), nullEmpty(supplierSKU), body.GRNSessionID,
					nullEmpty(partName))
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
			}
			createdLines++
		}

		// Optionally stamp supplier/invoice from first row header fields
		if len(body.Rows) > 0 {
			inv := get(body.Rows[0], "invoice_no")
			sup := get(body.Rows[0], "supplier_name")
			if inv != "" || sup != "" {
				_, _ = tx.Exec(c.Context(), `
					UPDATE grn_sessions SET
						purchase_receipt_no = COALESCE(NULLIF($2,''), purchase_receipt_no),
						supplier_name = COALESCE(NULLIF($3,''), supplier_name)
					WHERE id=$1`, body.GRNSessionID, inv, sup)
			}
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		_, _ = db.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, actor_id, device, payload)
			VALUES ($1,'PACKING_LIST_IMPORTED',$2,$3,$4::jsonb)`,
			body.GRNSessionID, userID(c), eventDevice(c),
			mustJSON(map[string]any{
				"cartons_created": createdCartons, "lines_created": createdLines, "skipped": skipped,
			}))

		return shared.OK(c, fiber.Map{
			"grn_session_id":  body.GRNSessionID,
			"cartons_created": createdCartons,
			"lines_created":   createdLines,
			"skipped":         skipped,
			"warnings":        warnings,
			"imported_at":     time.Now(),
		})
	}
}

func toStr(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case int:
		return strconv.Itoa(t)
	default:
		return ""
	}
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}

func eventDevice(c *fiber.Ctx) string {
	if c == nil {
		return ""
	}
	d := strings.TrimSpace(c.Get("X-Device"))
	if d == "" {
		d = strings.TrimSpace(c.Get("User-Agent"))
	}
	if len(d) > 100 {
		return d[:100]
	}
	return d
}
