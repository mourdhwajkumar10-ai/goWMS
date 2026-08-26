package consolidate

import (
	"strconv"
	"strings"

	"goWMS/api/modules/fulfillment"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires wave consolidation under /consolidate.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/scan-item", scanItem(db))
	r.Post("/place", place(db))
	r.Get("/:waveId/status", status(db))
	r.Post("/:waveId/reconcile", reconcile(db))
}

func scanItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			PickListID int    `json:"pick_list_id"`
			WaveID     int    `json:"wave_id"`
			ItemCode   string `json:"item_code"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		waveID := body.PickListID
		if waveID == 0 {
			waveID = body.WaveID
		}
		code := strings.TrimSpace(body.ItemCode)
		if waveID == 0 || code == "" {
			return shared.Err(c, fiber.StatusBadRequest, "pick_list_id and item_code required")
		}

		var remaining float64
		err := db.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(GREATEST(COALESCE(picked_qty,0)-COALESCE(packed_qty,0),0)),0)
			FROM pick_list_items WHERE pick_list_id=$1 AND upper(item_code)=upper($2)`,
			waveID, code).Scan(&remaining)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if remaining <= 0 {
			return shared.Err(c, fiber.StatusConflict, "no open picked qty for this item in the wave pool")
		}

		var wolID, soID int
		var soName, customer string
		var need float64
		var priority int
		err = db.QueryRow(c.Context(), `
			SELECT wol.id, wol.sales_order_id, so.name, COALESCE(so.customer_name,''),
			       wol.required_qty - wol.consolidated_qty,
			       COALESCE(so.priority, 99)
			FROM wave_order_lines wol
			JOIN sales_orders so ON so.id = wol.sales_order_id
			WHERE wol.pick_list_id=$1 AND upper(wol.item_code)=upper($2)
			  AND wol.required_qty > wol.consolidated_qty
			ORDER BY COALESCE(so.priority,99) ASC, wol.id ASC
			LIMIT 1`, waveID, code).
			Scan(&wolID, &soID, &soName, &customer, &need, &priority)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusConflict, "all orders already consolidated for this item")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if need > remaining {
			need = remaining
		}

		// Prefer an open box already linked to this SO on the wave.
		var boxID *int
		var boxLabel *string
		_ = db.QueryRow(c.Context(), `
			SELECT id, label FROM boxes
			WHERE pick_list_id=$1 AND sales_order_id=$2 AND COALESCE(loaded,false)=false
			ORDER BY id DESC LIMIT 1`, waveID, soID).Scan(&boxID, &boxLabel)

		return shared.OK(c, fiber.Map{
			"item_code":        code,
			"qty":              need,
			"wave_order_line_id": wolID,
			"sales_order_id":   soID,
			"sales_order_no":   soName,
			"customer":         customer,
			"priority":         priority,
			"suggested_box_id": boxID,
			"suggested_box_label": boxLabel,
			"prompt":           formatPrompt(code, need, boxLabel, customer, soName),
		})
	}
}

func formatPrompt(item string, qty float64, boxLabel *string, customer, soName string) string {
	box := "a new box"
	if boxLabel != nil && *boxLabel != "" {
		box = "BOX " + *boxLabel
	}
	return "ITEM " + item + " — put " + trimFloat(qty) + " in " + box + " (" + customer + ", " + soName + ")"
}

func trimFloat(v float64) string {
	s := strconv.FormatFloat(v, 'f', 0, 64)
	return s
}

func place(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			PickListID   int     `json:"pick_list_id"`
			WaveID       int     `json:"wave_id"`
			SalesOrderID int     `json:"sales_order_id"`
			BoxID        int     `json:"box_id"`
			BoxLabel     string  `json:"box_label"`
			ItemCode     string  `json:"item_code"`
			Quantity     float64 `json:"quantity"`
			BatchNo      string  `json:"batch_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		waveID := body.PickListID
		if waveID == 0 {
			waveID = body.WaveID
		}
		if waveID == 0 || body.SalesOrderID == 0 || body.ItemCode == "" || body.Quantity <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "pick_list_id, sales_order_id, item_code, quantity required")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		boxID := body.BoxID
		if boxID <= 0 {
			label := strings.TrimSpace(body.BoxLabel)
			if label == "" {
				return shared.Err(c, fiber.StatusBadRequest, "box_id or box_label required")
			}
			var whID, packLoc *int
			_ = tx.QueryRow(c.Context(), `
				SELECT warehouse_id, packing_location_id FROM pick_lists WHERE id=$1`, waveID).
				Scan(&whID, &packLoc)
			err = tx.QueryRow(c.Context(), `
				SELECT id FROM boxes
				WHERE label=$1 AND COALESCE(warehouse_id,0)=COALESCE($2,0)
				  AND COALESCE(loaded,false)=false
				LIMIT 1`, label, whID).Scan(&boxID)
			if err == pgx.ErrNoRows {
				err = tx.QueryRow(c.Context(), `
					INSERT INTO boxes (label, pick_list_id, sales_order_id, warehouse_id, packing_location_id)
					VALUES ($1,$2,$3,$4,$5) RETURNING id`,
					label, waveID, body.SalesOrderID, whID, packLoc).Scan(&boxID)
			}
			if err != nil {
				return shared.Err(c, fiber.StatusConflict, "cannot open box: "+err.Error())
			}
			_, _ = tx.Exec(c.Context(), `
				UPDATE boxes SET sales_order_id=COALESCE(sales_order_id,$1),
				  pick_list_id=COALESCE(pick_list_id,$2) WHERE id=$3`,
				body.SalesOrderID, waveID, boxID)
		}

		biID, warning, err := fulfillment.Consolidate(c.Context(), tx, fulfillment.ConsolidateInput{
			PickListID:   waveID,
			SalesOrderID: body.SalesOrderID,
			BoxID:        boxID,
			ItemCode:     body.ItemCode,
			Quantity:     body.Quantity,
			BatchNo:      body.BatchNo,
			ScannedBy:    userID(c),
		})
		if err != nil {
			return shared.Err(c, fiber.StatusConflict, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		resp := fiber.Map{"box_item_id": biID, "box_id": boxID}
		if warning != "" {
			resp["warning"] = warning
		}
		return shared.OK(c, resp)
	}
}

func status(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		waveID, err := strconv.Atoi(c.Params("waveId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid wave id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT wol.sales_order_id, so.name, COALESCE(so.customer_name,''), COALESCE(so.priority,99),
			       SUM(wol.required_qty), SUM(wol.consolidated_qty),
			       BOOL_AND(wol.consolidated_qty >= wol.required_qty - 0.0001)
			FROM wave_order_lines wol
			JOIN sales_orders so ON so.id = wol.sales_order_id
			WHERE wol.pick_list_id=$1
			GROUP BY wol.sales_order_id, so.name, so.customer_name, so.priority
			ORDER BY COALESCE(so.priority,99), so.name`, waveID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type orderRow struct {
			SalesOrderID   int     `json:"sales_order_id"`
			SalesOrderNo   string  `json:"sales_order_no"`
			Customer       string  `json:"customer"`
			Priority       int     `json:"priority"`
			RequiredQty    float64 `json:"required_qty"`
			ConsolidatedQty float64 `json:"consolidated_qty"`
			Complete       bool    `json:"complete"`
		}
		var orders []orderRow
		allDone := true
		for rows.Next() {
			var o orderRow
			if err := rows.Scan(&o.SalesOrderID, &o.SalesOrderNo, &o.Customer, &o.Priority,
				&o.RequiredQty, &o.ConsolidatedQty, &o.Complete); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if !o.Complete {
				allDone = false
			}
			orders = append(orders, o)
		}

		var leftover float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(GREATEST(COALESCE(picked_qty,0)-COALESCE(packed_qty,0),0)),0)
			FROM pick_list_items WHERE pick_list_id=$1`, waveID).Scan(&leftover)

		return shared.OK(c, fiber.Map{
			"wave_id": waveID, "orders": orders, "all_complete": allDone, "leftover_qty": leftover,
		})
	}
}

func reconcile(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		waveID, err := strconv.Atoi(c.Params("waveId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid wave id")
		}
		var body struct {
			Force bool   `json:"force"`
			Note  string `json:"note"`
		}
		_ = shared.Bind(c, &body)

		var leftover float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(GREATEST(COALESCE(picked_qty,0)-COALESCE(packed_qty,0),0)),0)
			FROM pick_list_items WHERE pick_list_id=$1`, waveID).Scan(&leftover)
		if leftover > 0.0001 && !body.Force {
			return shared.Err(c, fiber.StatusConflict,
				"leftover stock at packing location — investigate or force reconcile")
		}
		_, err = db.Exec(c.Context(), `
			UPDATE pick_lists SET status='completed' WHERE id=$1 AND picking_mode='wave'`, waveID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"wave_id": waveID, "reconciled": true, "leftover_qty": leftover, "note": body.Note,
		})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
