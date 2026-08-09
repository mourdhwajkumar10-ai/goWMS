package qi

import (
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the quality inspection routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", create(db))
	r.Get("/", list(db))
	r.Get("/:id", get(db))
	r.Post("/:id/reading", addReading(db))
	r.Post("/:id/submit", submit(db))
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			ReferenceType string  `json:"reference_type"`
			ReferenceName string  `json:"reference_name"`
			ItemCode      string  `json:"item_code"`
			SampleSize    float64 `json:"sample_size"`
			BatchNo       string  `json:"batch_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}

		var id int
		var inspectionNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO quality_inspections (inspection_no, reference_type, reference_name, item_code, sample_size, status)
			 VALUES ('QI-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('quality_inspections_id_seq')::TEXT,5,'0'), $1, $2, $3, $4, 'pending') RETURNING id, inspection_no`,
			body.ReferenceType, body.ReferenceName, body.ItemCode, body.SampleSize).Scan(&id, &inspectionNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "inspection_no": inspectionNo, "status": "pending"})
	}
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, inspection_no, reference_type, reference_name, item_code, sample_size, status
			FROM quality_inspections ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type qi struct {
			ID            int      `json:"id"`
			InspectionNo  string   `json:"inspection_no"`
			ReferenceType *string  `json:"reference_type"`
			ReferenceName *string  `json:"reference_name"`
			ItemCode      string   `json:"item_code"`
			SampleSize    *float64 `json:"sample_size"`
			Status        *string  `json:"status"`
		}
		var list []qi
		for rows.Next() {
			var q qi
			if err := rows.Scan(&q.ID, &q.InspectionNo, &q.ReferenceType, &q.ReferenceName,
				&q.ItemCode, &q.SampleSize, &q.Status); err != nil {
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
		}
		err = db.QueryRow(c.Context(),
			`SELECT id, inspection_no, reference_type, reference_name, item_code, sample_size, status, inspected_at::text
			 FROM quality_inspections WHERE id=$1`, id).
			Scan(&q.ID, &q.InspectionNo, &q.ReferenceType, &q.ReferenceName, &q.ItemCode,
				&q.SampleSize, &q.Status, &q.InspectedAt)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "inspection not found")
		}
		return shared.OK(c, q)
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

func submit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var body struct {
			Status string `json:"status"` // accepted | rejected
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Status == "" {
			body.Status = "accepted"
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE quality_inspections SET status=$1, inspected_by=$2, inspected_at=NOW() WHERE id=$3`,
			body.Status, userID(c), id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "inspection not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": body.Status})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
