package customer

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the customer routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", list(db))
	r.Post("/", create(db))
}

func list(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, customer_group, customer_type, default_currency, default_price_list,
			       gstin, industry, tax_category, territory
			FROM customers ORDER BY name`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type cust struct {
			ID               int     `json:"id"`
			Name             string  `json:"name"`
			CustomerGroup    *string `json:"customer_group"`
			CustomerType     *string `json:"customer_type"`
			DefaultCurrency  *string `json:"default_currency"`
			DefaultPriceList *string `json:"default_price_list"`
			GSTIN            *string `json:"gstin"`
			Industry         *string `json:"industry"`
			TaxCategory      *string `json:"tax_category"`
			Territory        *string `json:"territory"`
		}
		var list []cust
		for rows.Next() {
			var cu cust
			if err := rows.Scan(&cu.ID, &cu.Name, &cu.CustomerGroup, &cu.CustomerType,
				&cu.DefaultCurrency, &cu.DefaultPriceList, &cu.GSTIN, &cu.Industry,
				&cu.TaxCategory, &cu.Territory); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, cu)
		}
		return shared.OK(c, list)
	}
}

func create(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Name          string `json:"name"`
			CustomerGroup string `json:"customer_group"`
			CustomerType  string `json:"customer_type"`
			GSTIN         string `json:"gstin"`
			Territory     string `json:"territory"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "name required")
		}
		if body.CustomerType == "" {
			body.CustomerType = "Company"
		}

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO customers (name, customer_group, customer_type, gstin, territory)
			 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
			body.Name, body.CustomerGroup, body.CustomerType, body.GSTIN, body.Territory).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}
