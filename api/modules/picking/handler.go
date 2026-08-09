package picking

import (
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the picking routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createPickList(db))
	r.Post("/scan", logPickScan(db))
	r.Get("/list", listPickLists(db))
}

func createPickList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SalesOrder  string `json:"sales_order_no"`
			Customer    string `json:"customer"`
			WarehouseID int    `json:"warehouse_id"`
			Items       []struct {
				ItemCode   string  `json:"item_code"`
				Warehouse  string  `json:"warehouse"`
				OrderedQty float64 `json:"ordered_qty"`
			} `json:"items"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Items) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "items required")
		}

		// warehouse_id is nullable — 0 becomes NULL.
		var warehouseID any
		if body.WarehouseID != 0 {
			warehouseID = body.WarehouseID
		}

		var id int
		var name string
		err := db.QueryRow(c.Context(),
			`INSERT INTO pick_lists (name,sales_order_no,customer,warehouse_id)
			 VALUES ('PL-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_lists_id_seq')::TEXT,5,'0'),$1,$2,$3)
			 RETURNING id, name`,
			body.SalesOrder, body.Customer, warehouseID).Scan(&id, &name)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		for _, it := range body.Items {
			if _, err := db.Exec(c.Context(),
				`INSERT INTO pick_list_items (pick_list_id,item_code,warehouse,ordered_qty,status) VALUES ($1,$2,$3,$4,'pending')`,
				id, it.ItemCode, it.Warehouse, it.OrderedQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		return shared.OK(c, fiber.Map{"id": id, "name": name, "status": "draft"})
	}
}

func listPickLists(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT pl.id, pl.name, pl.sales_order_no, pl.status, pl.picking_mode,
			       COALESCE((SELECT SUM(ordered_qty) FROM pick_list_items pli WHERE pli.pick_list_id = pl.id),0),
			       COALESCE((SELECT SUM(picked_qty) FROM pick_list_items pli WHERE pli.pick_list_id = pl.id),0)
			FROM pick_lists pl ORDER BY pl.created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type pl struct {
			ID          int     `json:"id"`
			Name        string  `json:"name"`
			SalesOrder  *string `json:"sales_order_no"`
			Status      *string `json:"status"`
			PickingMode *string `json:"picking_mode"`
			TotalQty    float64 `json:"total_qty"`
			PickedQty   float64 `json:"picked_qty"`
		}
		var list []pl
		for rows.Next() {
			var p pl
			if err := rows.Scan(&p.ID, &p.Name, &p.SalesOrder, &p.Status, &p.PickingMode, &p.TotalQty, &p.PickedQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, p)
		}
		return shared.OK(c, list)
	}
}

func logPickScan(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			PickListID  int     `json:"pick_list_id"`
			ItemCode    string  `json:"item_code"`
			ScannedBin  string  `json:"scanned_bin"`
			ExpectedBin string  `json:"expected_bin"`
			Quantity    float64 `json:"quantity"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}

		locationDrift := body.ScannedBin != "" && body.ExpectedBin != "" && body.ScannedBin != body.ExpectedBin

		// Resolve the pick list item id (first pending line for this item).
		var itemID int
		_ = db.QueryRow(c.Context(),
			`SELECT id FROM pick_list_items WHERE pick_list_id=$1 AND item_code=$2 ORDER BY id LIMIT 1`,
			body.PickListID, body.ItemCode).Scan(&itemID)

		var id int
		var logNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO pick_scan_logs (log_no,pick_list_id,pick_list_item_id,item_code,scanned_bin,expected_bin,location_drift,quantity,scanned_by)
			 VALUES ('PS-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_scan_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,$5,$6,$7,$8)
			 RETURNING id, log_no`,
			body.PickListID, itemID, body.ItemCode, body.ScannedBin, body.ExpectedBin,
			locationDrift, body.Quantity, userID(c)).Scan(&id, &logNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Update the item's picked quantity.
		if itemID > 0 {
			if _, err := db.Exec(c.Context(),
				`UPDATE pick_list_items SET picked_qty = picked_qty + $1, status='picked' WHERE id=$2`,
				body.Quantity, itemID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		return shared.OK(c, fiber.Map{"id": id, "location_drift": locationDrift})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}

var _ = strconv.Itoa // keep strconv import if unused in refactors
