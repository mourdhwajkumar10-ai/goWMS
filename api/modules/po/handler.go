package po

import (
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the purchase order routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createPO(db))
	r.Get("/list", listPOs(db))
	r.Get("/search", searchPO(db)) // must be registered BEFORE /:id (route shadowing)
	r.Get("/:id", getPO(db))
	r.Post("/:id/submit", submitPO(db))
	r.Delete("/:id", deletePO(db))
}

func createPO(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SupplierName string `json:"supplier_name"`
			Company      string `json:"company"`
			Currency     string `json:"currency"`
			Items        []struct {
				ItemCode  string  `json:"item_code"`
				ItemName  string  `json:"item_name"`
				Qty       float64 `json:"qty"`
				Rate      float64 `json:"rate"`
				Amount    float64 `json:"amount"`
				Warehouse string  `json:"warehouse"`
				UOM       string  `json:"uom"`
			} `json:"items"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SupplierName == "" {
			return shared.Err(c, fiber.StatusBadRequest, "supplier_name required")
		}
		if body.Company == "" {
			body.Company = "Nirvana"
		}
		if body.Currency == "" {
			body.Currency = "INR"
		}

		// Doc number from the id sequence (collision-proof, matches original binary).
		var id int
		var name string
		err := db.QueryRow(c.Context(),
			`INSERT INTO purchase_orders (name, supplier_name, status, company, currency)
			 VALUES ('PO-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('purchase_orders_id_seq')::TEXT,5,'0'), $1, 'draft', $2, $3)
			 RETURNING id, name`,
			body.SupplierName, body.Company, body.Currency).Scan(&id, &name)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		for _, it := range body.Items {
			amount := it.Amount
			if amount == 0 {
				amount = it.Qty * it.Rate
			}
			if _, err := db.Exec(c.Context(),
				`INSERT INTO purchase_order_items (purchase_order_id, item_code, item_name, qty, rate, amount, warehouse, uom) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
				id, it.ItemCode, it.ItemName, it.Qty, it.Rate, amount, it.Warehouse, it.UOM); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		return shared.OK(c, fiber.Map{"id": id, "name": name})
	}
}

func listPOs(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT po.id, po.name, po.supplier_name, po.status, po.per_received, po.per_billed,
			       po.company, po.currency, po.grand_total, po.net_total, po.total_qty,
			       po.schedule_date::text, po.set_warehouse, po.cost_center, po.transaction_date::text,
			       COALESCE((SELECT SUM(received_qty) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id), 0) AS total_received
			FROM purchase_orders po
			ORDER BY po.id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type poRow struct {
			ID              int      `json:"id"`
			Name            string   `json:"name"`
			SupplierName    *string  `json:"supplier_name"`
			Status          *string  `json:"status"`
			PerReceived     *float64 `json:"per_received"`
			PerBilled       *float64 `json:"per_billed"`
			Company         *string  `json:"company"`
			Currency        *string  `json:"currency"`
			GrandTotal      *float64 `json:"grand_total"`
			NetTotal        *float64 `json:"net_total"`
			TotalQty        *float64 `json:"total_qty"`
			ScheduleDate    *string  `json:"schedule_date"`
			SetWarehouse    *string  `json:"set_warehouse"`
			CostCenter      *string  `json:"cost_center"`
			TransactionDate *string  `json:"transaction_date"`
			TotalReceived   float64  `json:"total_received"`
		}

		var list []poRow
		for rows.Next() {
			var p poRow
			if err := rows.Scan(&p.ID, &p.Name, &p.SupplierName, &p.Status, &p.PerReceived, &p.PerBilled,
				&p.Company, &p.Currency, &p.GrandTotal, &p.NetTotal, &p.TotalQty,
				&p.ScheduleDate, &p.SetWarehouse, &p.CostCenter, &p.TransactionDate, &p.TotalReceived); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, p)
		}

		return shared.OK(c, list)
	}
}

func getPO(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var po struct {
			ID              int      `json:"id"`
			Name            string   `json:"name"`
			SupplierName    *string  `json:"supplier_name"`
			Status          *string  `json:"status"`
			PerReceived     *float64 `json:"per_received"`
			PerBilled       *float64 `json:"per_billed"`
			Company         *string  `json:"company"`
			Currency        *string  `json:"currency"`
			GrandTotal      *float64 `json:"grand_total"`
			NetTotal        *float64 `json:"net_total"`
			TotalQty        *float64 `json:"total_qty"`
			ScheduleDate    *string  `json:"schedule_date"`
			SetWarehouse    *string  `json:"set_warehouse"`
			CostCenter      *string  `json:"cost_center"`
			TransactionDate *string  `json:"transaction_date"`
			Terms           *string  `json:"terms"`
			PaymentTerms    *string  `json:"payment_terms_template"`
			TaxesCharges    *string  `json:"taxes_and_charges"`
			BuyingPriceList *string  `json:"buying_price_list"`
			TaxCategory     *string  `json:"tax_category"`
		}
		err = db.QueryRow(c.Context(), `
			SELECT id, name, supplier_name, status, per_received, per_billed, company, currency,
			       grand_total, net_total, total_qty,
			       schedule_date::text, set_warehouse, cost_center, transaction_date::text,
			       terms, payment_terms_template, taxes_and_charges, buying_price_list, tax_category
			FROM purchase_orders WHERE id=$1`, id).
			Scan(&po.ID, &po.Name, &po.SupplierName, &po.Status, &po.PerReceived, &po.PerBilled,
				&po.Company, &po.Currency, &po.GrandTotal, &po.NetTotal, &po.TotalQty,
				&po.ScheduleDate, &po.SetWarehouse, &po.CostCenter, &po.TransactionDate,
				&po.Terms, &po.PaymentTerms, &po.TaxesCharges, &po.BuyingPriceList, &po.TaxCategory)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "purchase order not found")
		}

		itemRows, err := db.Query(c.Context(), `
			SELECT id, item_code, item_name, qty, rate, amount, warehouse, uom,
			       COALESCE(received_qty,0), COALESCE(rejected_qty,0), COALESCE(billed_qty,0)
			FROM purchase_order_items WHERE purchase_order_id=$1 ORDER BY id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer itemRows.Close()

		type poItem struct {
			ID          int      `json:"id"`
			ItemCode    string   `json:"item_code"`
			ItemName    *string  `json:"item_name"`
			Qty         float64  `json:"qty"`
			Rate        *float64 `json:"rate"`
			Amount      *float64 `json:"amount"`
			Warehouse   *string  `json:"warehouse"`
			UOM         *string  `json:"uom"`
			ReceivedQty float64  `json:"received_qty"`
			RejectedQty float64  `json:"rejected_qty"`
			BilledQty   float64  `json:"billed_qty"`
		}
		items := []poItem{}
		for itemRows.Next() {
			var it poItem
			if err := itemRows.Scan(&it.ID, &it.ItemCode, &it.ItemName, &it.Qty, &it.Rate, &it.Amount,
				&it.Warehouse, &it.UOM, &it.ReceivedQty, &it.RejectedQty, &it.BilledQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			items = append(items, it)
		}

		return shared.OK(c, fiber.Map{
			"id":                      po.ID,
			"name":                    po.Name,
			"supplier_name":           po.SupplierName,
			"status":                  po.Status,
			"per_received":            po.PerReceived,
			"per_billed":              po.PerBilled,
			"company":                 po.Company,
			"currency":                po.Currency,
			"grand_total":             po.GrandTotal,
			"net_total":               po.NetTotal,
			"total_qty":               po.TotalQty,
			"schedule_date":           po.ScheduleDate,
			"set_warehouse":           po.SetWarehouse,
			"cost_center":             po.CostCenter,
			"transaction_date":        po.TransactionDate,
			"terms":                   po.Terms,
			"payment_terms_template":  po.PaymentTerms,
			"taxes_and_charges":       po.TaxesCharges,
			"buying_price_list":       po.BuyingPriceList,
			"tax_category":            po.TaxCategory,
			"items":                   items,
		})
	}
}

func searchPO(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := c.Query("q")
		if q == "" {
			q = c.Query("name")
		}

		rows, err := db.Query(c.Context(),
			`SELECT id, name, supplier_name, status FROM purchase_orders WHERE name ILIKE $1 OR supplier_name ILIKE $1 LIMIT 20`,
			"%"+q+"%")
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type result struct {
			ID           int     `json:"id"`
			Name         string  `json:"name"`
			SupplierName *string `json:"supplier_name"`
			Status       *string `json:"status"`
		}
		var list []result
		for rows.Next() {
			var r result
			if err := rows.Scan(&r.ID, &r.Name, &r.SupplierName, &r.Status); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func submitPO(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE purchase_orders SET status='To Receive and Bill' WHERE id=$1 AND COALESCE(status,'draft') IN ('draft','submitted')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "purchase order not found or already submitted")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "To Receive and Bill"})
	}
}

func deletePO(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		tag, err := db.Exec(c.Context(), `DELETE FROM purchase_orders WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "purchase order not found")
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}
