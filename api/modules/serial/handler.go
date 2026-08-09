package serial

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the serial number routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", create(db))
	r.Get("/", list(db))
	r.Get("/item/:item_code", byItem(db))
	r.Post("/scan", scan(db))
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SerialNo  string `json:"serial_no"`
			ItemCode  string `json:"item_code"`
			BatchNo   string `json:"batch_no"`
			Warehouse string `json:"warehouse"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SerialNo == "" || body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "serial_no and item_code required")
		}

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO serial_numbers (serial_no, item_code, batch_no, status, warehouse)
			 VALUES ($1, $2, $3, 'available', $4) RETURNING id`,
			body.SerialNo, body.ItemCode, body.BatchNo, body.Warehouse).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "serial_no": body.SerialNo, "status": "available"})
	}
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, serial_no, item_code, warehouse, status, batch_no
			FROM serial_numbers ORDER BY id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type sn struct {
			ID        int     `json:"id"`
			SerialNo  string  `json:"serial_no"`
			ItemCode  string  `json:"item_code"`
			Warehouse *string `json:"warehouse"`
			Status    *string `json:"status"`
			BatchNo   *string `json:"batch_no"`
		}
		var list []sn
		for rows.Next() {
			var s sn
			if err := rows.Scan(&s.ID, &s.SerialNo, &s.ItemCode, &s.Warehouse, &s.Status, &s.BatchNo); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		return shared.OK(c, list)
	}
}

func byItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		itemCode := c.Params("item_code")
		rows, err := db.Query(c.Context(),
			`SELECT id, serial_no, item_code, warehouse, status FROM serial_numbers WHERE item_code=$1 ORDER BY id DESC LIMIT 1000`,
			itemCode)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type sn struct {
			ID        int     `json:"id"`
			SerialNo  string  `json:"serial_no"`
			ItemCode  string  `json:"item_code"`
			Warehouse *string `json:"warehouse"`
			Status    *string `json:"status"`
		}
		var list []sn
		for rows.Next() {
			var s sn
			if err := rows.Scan(&s.ID, &s.SerialNo, &s.ItemCode, &s.Warehouse, &s.Status); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		return shared.OK(c, list)
	}
}

func scan(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SerialNo  string `json:"serial_no"`
			Status    string `json:"status"`
			Warehouse string `json:"warehouse"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SerialNo == "" {
			return shared.Err(c, fiber.StatusBadRequest, "serial_no required")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE serial_numbers SET status=$1, warehouse=$2 WHERE serial_no=$3`,
			body.Status, body.Warehouse, body.SerialNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "serial number not found")
		}
		return shared.OK(c, fiber.Map{"serial_no": body.SerialNo, "status": body.Status})
	}
}
