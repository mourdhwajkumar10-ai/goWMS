package qi

import (
	"encoding/json"
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterTemplates wires QC template CRUD under /qi/templates (call before /:id routes).
func RegisterTemplates(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/templates", listTemplates(db))
	r.Post("/templates", createTemplate(db))
	r.Get("/templates/:id", getTemplate(db))
	r.Put("/templates/:id", updateTemplate(db))
	r.Post("/from-template", createFromTemplate(db))
}

func listTemplates(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, category, sample_size, checklist::text, auto_approve, is_active
			FROM qc_templates WHERE is_active=true ORDER BY name`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error()+" — apply migration 010")
		}
		defer rows.Close()
		type t struct {
			ID          int              `json:"id"`
			Name        string           `json:"name"`
			Category    *string          `json:"category"`
			SampleSize  int              `json:"sample_size"`
			Checklist   []map[string]any `json:"checklist"`
			AutoApprove bool             `json:"auto_approve"`
			IsActive    bool             `json:"is_active"`
		}
		var list []t
		for rows.Next() {
			var x t
			var raw string
			if err := rows.Scan(&x.ID, &x.Name, &x.Category, &x.SampleSize, &raw, &x.AutoApprove, &x.IsActive); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			_ = json.Unmarshal([]byte(raw), &x.Checklist)
			if x.Checklist == nil {
				x.Checklist = []map[string]any{}
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
			Name        string           `json:"name"`
			Category    string           `json:"category"`
			SampleSize  int              `json:"sample_size"`
			Checklist   []map[string]any `json:"checklist"`
			AutoApprove bool             `json:"auto_approve"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "name required")
		}
		if body.SampleSize <= 0 {
			body.SampleSize = 1
		}
		if body.Checklist == nil {
			body.Checklist = []map[string]any{}
		}
		raw, _ := json.Marshal(body.Checklist)
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO qc_templates (name, category, sample_size, checklist, auto_approve)
			VALUES ($1, NULLIF($2,''), $3, $4::jsonb, $5) RETURNING id`,
			body.Name, body.Category, body.SampleSize, string(raw), body.AutoApprove).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func getTemplate(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var name string
		var category *string
		var sampleSize int
		var raw string
		var auto, active bool
		err = db.QueryRow(c.Context(), `
			SELECT name, category, sample_size, checklist::text, auto_approve, is_active
			FROM qc_templates WHERE id=$1`, id).Scan(&name, &category, &sampleSize, &raw, &auto, &active)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "template not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		var checklist []map[string]any
		_ = json.Unmarshal([]byte(raw), &checklist)
		return shared.OK(c, fiber.Map{
			"id": id, "name": name, "category": category, "sample_size": sampleSize,
			"checklist": checklist, "auto_approve": auto, "is_active": active,
		})
	}
}

func updateTemplate(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Name        string           `json:"name"`
			Category    string           `json:"category"`
			SampleSize  int              `json:"sample_size"`
			Checklist   []map[string]any `json:"checklist"`
			AutoApprove *bool            `json:"auto_approve"`
			IsActive    *bool            `json:"is_active"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		raw, _ := json.Marshal(body.Checklist)
		_, err = db.Exec(c.Context(), `
			UPDATE qc_templates SET
				name = COALESCE(NULLIF($2,''), name),
				category = COALESCE(NULLIF($3,''), category),
				sample_size = CASE WHEN $4>0 THEN $4 ELSE sample_size END,
				checklist = CASE WHEN $5::text = 'null' OR $5::text = '[]' THEN checklist ELSE $5::jsonb END,
				auto_approve = COALESCE($6, auto_approve),
				is_active = COALESCE($7, is_active)
			WHERE id=$1`, id, body.Name, body.Category, body.SampleSize, string(raw), body.AutoApprove, body.IsActive)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}

// createFromTemplate creates a QI and pre-populates readings from template checklist.
func createFromTemplate(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			TemplateID    int     `json:"template_id"`
			ItemCode      string  `json:"item_code"`
			ReferenceType string  `json:"reference_type"`
			ReferenceName string  `json:"reference_name"`
			SampleSize    int     `json:"sample_size"`
			Qty           float64 `json:"qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.TemplateID == 0 || body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "template_id and item_code required")
		}
		var tmplName string
		var sample int
		var raw string
		err := db.QueryRow(c.Context(), `
			SELECT name, sample_size, checklist::text FROM qc_templates WHERE id=$1 AND is_active=true`, body.TemplateID).
			Scan(&tmplName, &sample, &raw)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "template not found")
		}
		if body.SampleSize <= 0 {
			body.SampleSize = sample
		}

		var id int
		var inspNo string
		err = db.QueryRow(c.Context(), `
			INSERT INTO quality_inspections (
				inspection_no, item_code, sample_size, qty, status,
				reference_type, reference_name, quality_inspection_template
			) VALUES (
				'QI-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('quality_inspections_id_seq')::TEXT,5,'0'),
				$1,$2,$3,'pending',$4,$5,$6
			) RETURNING id, inspection_no`,
			body.ItemCode, body.SampleSize, body.Qty, nullEmptyQI(body.ReferenceType),
			nullEmptyQI(body.ReferenceName), tmplName).Scan(&id, &inspNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var checklist []map[string]any
		_ = json.Unmarshal([]byte(raw), &checklist)
		for _, item := range checklist {
			spec, _ := item["specification"].(string)
			if spec == "" {
				continue
			}
			_, _ = db.Exec(c.Context(), `
				INSERT INTO quality_inspection_readings (inspection_id, specification, status, min_value, max_value)
				VALUES ($1,$2,'pending',$3,$4)`, id, spec, checklistNum(item, "min_value"), checklistNum(item, "max_value"))
		}
		return shared.OK(c, fiber.Map{"id": id, "inspection_no": inspNo, "template": tmplName})
	}
}

func nullEmptyQI(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func checklistNum(item map[string]any, key string) any {
	v, ok := item[key]
	if !ok || v == nil {
		return nil
	}
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case json.Number:
		f, err := n.Float64()
		if err != nil {
			return nil
		}
		return f
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
		if err != nil {
			return nil
		}
		return f
	default:
		return nil
	}
}
