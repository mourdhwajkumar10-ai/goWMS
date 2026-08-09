package billing

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the billing routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/invoices", listInvoices(db))
	r.Post("/invoices", createInvoice(db))
}

func listInvoices(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, supplier_name, status, grand_total, posting_date::text, created_at::text
			FROM purchase_invoices ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type inv struct {
			ID           int      `json:"id"`
			Name         string   `json:"name"`
			SupplierName *string  `json:"supplier_name"`
			Status       *string  `json:"status"`
			GrandTotal   *float64 `json:"grand_total"`
			PostingDate  *string  `json:"posting_date"`
			CreatedAt    *string  `json:"created_at"`
		}
		var list []inv
		for rows.Next() {
			var i inv
			if err := rows.Scan(&i.ID, &i.Name, &i.SupplierName, &i.Status, &i.GrandTotal, &i.PostingDate, &i.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, i)
		}
		return shared.OK(c, list)
	}
}

func createInvoice(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SupplierName string  `json:"supplier_name"`
			Company      string  `json:"company"`
			GrandTotal   float64 `json:"grand_total"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SupplierName == "" || body.Company == "" {
			return shared.Err(c, fiber.StatusBadRequest, "supplier_name and company required")
		}

		// supplier (the customer record link) is NOT NULL — mirror supplier_name.
		var id int
		var name string
		err := db.QueryRow(c.Context(),
			`INSERT INTO purchase_invoices (name, supplier, supplier_name, company, grand_total)
			 VALUES ('PI-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('purchase_invoices_id_seq')::TEXT,5,'0'), $1, $1, $2, $3)
			 RETURNING id, name`,
			body.SupplierName, body.Company, body.GrandTotal).Scan(&id, &name)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "name": name})
	}
}
