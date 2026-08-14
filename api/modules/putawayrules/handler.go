package putawayrules

import (
	"strconv"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the putaway-rules routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createRule(db))
	r.Get("/", listRules(db))
	r.Get("/resolve", resolve(db))
	r.Put("/:id", updateRule(db))
}

func createRule(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			ItemCode      string  `json:"item_code"`
			Warehouse     string  `json:"warehouse"`
			Priority      int     `json:"priority"`
			StockCapacity float64 `json:"stock_capacity"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.Warehouse == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and warehouse required")
		}
		if body.Priority == 0 {
			body.Priority = 1
		}

		var id int
		err := db.QueryRow(c.Context(),
			`INSERT INTO putaway_rules (item_code, warehouse, priority, stock_capacity)
			 VALUES ($1, $2, $3, $4) RETURNING id`,
			body.ItemCode, body.Warehouse, body.Priority, body.StockCapacity).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func listRules(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, item_code, warehouse, priority, stock_capacity
			FROM putaway_rules WHERE active=true ORDER BY item_code, priority`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type rule struct {
			ID            int     `json:"id"`
			ItemCode      string  `json:"item_code"`
			Warehouse     string  `json:"warehouse"`
			Priority      int     `json:"priority"`
			StockCapacity float64 `json:"stock_capacity"`
		}
		var list []rule
		for rows.Next() {
			var r rule
			if err := rows.Scan(&r.ID, &r.ItemCode, &r.Warehouse, &r.Priority, &r.StockCapacity); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func resolve(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		itemCode := c.Query("item_code")
		if itemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code query required")
		}

		// Best location: highest priority (lowest number) with remaining capacity.
		var (
			ruleID  int
			wh      string
			cap     float64
			current float64
		)
		err := db.QueryRow(c.Context(), `
			SELECT pr.id, pr.warehouse, pr.stock_capacity
			FROM putaway_rules pr
			WHERE pr.item_code=$1 AND pr.active=true
			ORDER BY pr.priority ASC LIMIT 1`, itemCode).Scan(&ruleID, &wh, &cap)
		if err != nil {
			return shared.OK(c, fiber.Map{
				"found": false, "item_code": itemCode, "message": "no putaway rule for item",
			})
		}
		var warehouseID int
		_ = db.QueryRow(c.Context(), `SELECT id FROM warehouses WHERE UPPER(code)=UPPER($1)`, wh).Scan(&warehouseID)
		rule, _ := shared.LoadWarehousePutawayRule(c.Context(), db, itemCode, warehouseID)
		if rule != nil {
			ruleID = rule.ID
			wh = rule.Warehouse
			cap = rule.StockCapacity
			current = rule.CurrentQty
		} else {
			_ = db.QueryRow(c.Context(), `
				SELECT COALESCE(SUM(slb.actual_qty),0)
				FROM stock_location_balances slb
				JOIN warehouse_locations wl ON wl.id = slb.location_id
				JOIN warehouses w ON w.id = slb.warehouse_id
				WHERE UPPER(slb.item_code)=UPPER($1)
				  AND wl.location_type IN ('pick_face','storage')
				  AND (LOWER($2) IN ('','any','*','all') OR UPPER(w.code)=UPPER($2))`,
				itemCode, wh).Scan(&current)
		}

		available := cap - current
		if available < 0 {
			available = 0
		}

		return shared.OK(c, fiber.Map{
			"rule_id":         ruleID,
			"item_code":       itemCode,
			"warehouse":       wh,
			"stock_capacity":  cap,
			"current_stock":   current,
			"available_space": available,
		})
	}
}

func updateRule(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var body struct {
			Warehouse     string  `json:"warehouse"`
			Priority      int     `json:"priority"`
			StockCapacity float64 `json:"stock_capacity"`
			Active        *bool   `json:"active"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		active := true
		if body.Active != nil {
			active = *body.Active
		}

		tag, err := db.Exec(c.Context(),
			`UPDATE putaway_rules SET warehouse=$1, priority=$2, stock_capacity=$3, active=$4 WHERE id=$5`,
			body.Warehouse, body.Priority, body.StockCapacity, active, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "rule not found")
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}
