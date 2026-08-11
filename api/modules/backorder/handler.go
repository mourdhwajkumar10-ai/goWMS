package backorder

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the backorder routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", create(db))
	r.Get("/", list(db))
	r.Get("/list", list(db))
	r.Post("/:id/fulfill", fulfill(db))
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SalesOrderNo string `json:"sales_order_no"`
			Customer     string `json:"customer"`
			Warehouse    string `json:"warehouse"`
			Notes        string `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SalesOrderNo == "" {
			return shared.Err(c, fiber.StatusBadRequest, "sales_order_no required")
		}

		var id int
		var backorderNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO backorders (backorder_no, sales_order_no, customer, warehouse, notes)
			 VALUES ('BO-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('backorders_id_seq')::TEXT,5,'0'),$1,$2,$3,$4) RETURNING id, backorder_no`,
			body.SalesOrderNo, body.Customer, body.Warehouse, body.Notes).Scan(&id, &backorderNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "backorder_no": backorderNo, "status": "pending"})
	}
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT backorder_no, sales_order_no, customer, status, created_at::text
			FROM backorders WHERE status IN ('pending','partially_fulfilled') ORDER BY created_at`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type b struct {
			BackorderNo  string  `json:"backorder_no"`
			SalesOrderNo string  `json:"sales_order_no"`
			Customer     *string `json:"customer"`
			Status       string  `json:"status"`
			CreatedAt    string  `json:"created_at"`
		}
		var list []b
		for rows.Next() {
			var item b
			if err := rows.Scan(&item.BackorderNo, &item.SalesOrderNo, &item.Customer, &item.Status, &item.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, item)
		}
		return shared.OK(c, list)
	}
}

func fulfill(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := parseID(c)
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE backorders SET status='fulfilled' WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "backorder not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "fulfilled"})
	}
}

func parseID(c *fiber.Ctx) (int, error) {
	var body struct {
		ID int `json:"id"`
	}
	_ = shared.Bind(c, &body)
	if body.ID != 0 {
		return body.ID, nil
	}
	return c.ParamsInt("id")
}
