package salesorder

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/notifications"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires sales order routes under /sales-orders.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/", listOrders(db))
	r.Get("/list", listOrders(db))
	r.Post("/", createOrder(db))
	r.Post("/import", importCSV(db))
	r.Post("/decay-priorities", decayPriorities(db))
	r.Get("/:id", getOrder(db))
	r.Put("/:id", updateOrder(db))
	r.Post("/:id/confirm", confirmOrder(db))
	r.Post("/:id/cancel", cancelOrder(db))
	r.Post("/:id/priority", setPriority(db))
	r.Post("/:id/create-pick", createPickFromSO(db))
}

func priorityLabel(p int) string {
	switch {
	case p >= 9:
		return "Critical"
	case p >= 7:
		return "High"
	case p >= 5:
		return "Elevated"
	case p >= 3:
		return "Normal"
	default:
		return "Low"
	}
}

func autoPriority(deliveryDate *time.Time, grandTotal float64, isKeyAccount bool) int {
	p := 4
	if isKeyAccount {
		p = 7
	}
	if grandTotal > 50000 {
		if p < 7 {
			p = 7
		}
	} else if grandTotal > 10000 {
		if p < 6 {
			p = 6
		}
	}
	if deliveryDate != nil {
		days := int(deliveryDate.Sub(time.Now().Truncate(24*time.Hour)).Hours() / 24)
		if days <= 1 && p < 8 {
			p = 8
		}
	}
	return p
}

func createOrder(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			CustomerName    string  `json:"customer_name"`
			DeliveryDate    string  `json:"delivery_date"`
			WarehouseID     *int    `json:"warehouse_id"`
			SetWarehouse    string  `json:"set_warehouse"`
			Priority        *int    `json:"priority"`
			PriorityReason  string  `json:"priority_reason"`
			PONo            string  `json:"po_no"`
			Notes           string  `json:"notes"`
			Currency        string  `json:"currency"`
			Company         string  `json:"company"`
			CustomerAddress string  `json:"customer_address"`
			Items           []struct {
				ItemCode string  `json:"item_code"`
				ItemName string  `json:"item_name"`
				Qty      float64 `json:"qty"`
				Rate     float64 `json:"rate"`
				UOM      string  `json:"uom"`
				Warehouse string `json:"warehouse"`
			} `json:"items"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.CustomerName == "" {
			return shared.Err(c, fiber.StatusBadRequest, "customer_name required")
		}
		if len(body.CustomerName) > 255 {
			return shared.Err(c, fiber.StatusBadRequest, "customer_name must be at most 255 characters")
		}
		if len(body.Items) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "at least one item required")
		}
		if body.Currency == "" {
			body.Currency = "INR"
		}
		if body.Company == "" {
			body.Company = "Nirvana"
		}

		var deliveryDate *time.Time
		if body.DeliveryDate != "" {
			d, err := time.Parse("2006-01-02", body.DeliveryDate)
			if err != nil {
				return shared.Err(c, fiber.StatusBadRequest, "delivery_date must be YYYY-MM-DD")
			}
			today := time.Now().Truncate(24 * time.Hour)
			if d.Before(today) {
				return shared.Err(c, fiber.StatusBadRequest, "delivery_date cannot be in the past")
			}
			deliveryDate = &d
		}

		var netTotal float64
		for _, it := range body.Items {
			if it.ItemCode == "" || it.Qty <= 0 {
				return shared.Err(c, fiber.StatusBadRequest, "each item needs item_code and qty > 0")
			}
			var exists bool
			_ = db.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM items WHERE upper(code)=upper($1))`, it.ItemCode).Scan(&exists)
			if !exists {
				return shared.Err(c, fiber.StatusBadRequest, "item not found: "+it.ItemCode)
			}
			netTotal += it.Qty * it.Rate
		}

		prio := 4
		if body.Priority != nil {
			prio = *body.Priority
			if prio < 1 || prio > 10 {
				return shared.Err(c, fiber.StatusBadRequest, "priority must be 1-10")
			}
		} else {
			prio = autoPriority(deliveryDate, netTotal, false)
		}
		label := priorityLabel(prio)

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var id int
		var name string
		err = tx.QueryRow(c.Context(), `
			INSERT INTO sales_orders (
				name, customer_name, status, wms_status, grand_total, net_total, currency,
				delivery_date, company, po_no, set_warehouse, warehouse_id, notes,
				customer_address, priority, priority_label, priority_reason, priority_set_at,
				transaction_date
			) VALUES (
				'SO-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('sales_orders_id_seq')::TEXT,5,'0'),
				$1, 'Draft', 'draft', $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), CURRENT_DATE
			) RETURNING id, name`,
			body.CustomerName, netTotal, body.Currency, deliveryDate, body.Company,
			nullEmpty(body.PONo), nullEmpty(body.SetWarehouse), body.WarehouseID, nullEmpty(body.Notes),
			nullEmpty(body.CustomerAddress), prio, label, nullEmpty(body.PriorityReason),
		).Scan(&id, &name)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		for _, it := range body.Items {
			amount := it.Qty * it.Rate
			_, err = tx.Exec(c.Context(), `
				INSERT INTO sales_order_items (
					sales_order_id, item_code, item_name, qty, rate, amount, uom, warehouse, stock_qty, delivery_date
				) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$4,$9)`,
				id, it.ItemCode, nullEmpty(it.ItemName), it.Qty, it.Rate, amount,
				nullEmpty(it.UOM), nullEmpty(it.Warehouse), deliveryDate)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		if _, err := tx.Exec(c.Context(), `
			INSERT INTO priority_history (sales_order_id, old_priority, new_priority, reason, set_by)
			VALUES ($1, NULL, $2, $3, $4)`, id, prio, coalesce(body.PriorityReason, "initial"), userID(c)); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "name": name, "priority": prio, "priority_label": label})
	}
}

func listOrders(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		status := c.Query("status")
		customer := c.Query("customer")
		prioMin := c.Query("priority_min")
		q := c.Query("q")

		sql := `
			SELECT so.id, so.name, so.customer_name, COALESCE(so.wms_status, so.status, 'draft'),
			       so.grand_total, so.currency, so.delivery_date::text, so.priority,
			       COALESCE(so.priority_label, 'Normal'), so.per_picked, so.per_delivered, so.per_billed,
			       so.po_no, so.set_warehouse, so.created_at, so.transaction_date::text,
			       (SELECT COUNT(*) FROM sales_order_items soi WHERE soi.sales_order_id = so.id) AS line_count
			FROM sales_orders so WHERE 1=1`
		args := []any{}
		n := 1
		if status != "" {
			sql += ` AND COALESCE(so.wms_status, so.status) ILIKE $` + strconv.Itoa(n)
			args = append(args, status)
			n++
		}
		if customer != "" {
			sql += ` AND so.customer_name ILIKE $` + strconv.Itoa(n)
			args = append(args, "%"+customer+"%")
			n++
		}
		if prioMin != "" {
			sql += ` AND COALESCE(so.priority,4) >= $` + strconv.Itoa(n)
			args = append(args, prioMin)
			n++
		}
		if q != "" {
			sql += ` AND (so.name ILIKE $` + strconv.Itoa(n) + ` OR so.customer_name ILIKE $` + strconv.Itoa(n) + ` OR so.po_no ILIKE $` + strconv.Itoa(n) + `)`
			args = append(args, "%"+q+"%")
			n++
		}
		sql += ` ORDER BY COALESCE(so.priority,4) DESC, so.delivery_date NULLS LAST, so.id DESC LIMIT 200`

		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			ID             int      `json:"id"`
			Name           string   `json:"name"`
			CustomerName   *string  `json:"customer_name"`
			Status         string   `json:"status"`
			GrandTotal     *float64 `json:"grand_total"`
			Currency       *string  `json:"currency"`
			DeliveryDate   *string  `json:"delivery_date"`
			Priority       *int     `json:"priority"`
			PriorityLabel  string   `json:"priority_label"`
			PerPicked      *float64 `json:"per_picked"`
			PerDelivered   *float64 `json:"per_delivered"`
			PerBilled      *float64 `json:"per_billed"`
			PONo           *string  `json:"po_no"`
			SetWarehouse   *string  `json:"set_warehouse"`
			CreatedAt      *time.Time `json:"created_at"`
			TransactionDate *string `json:"transaction_date"`
			LineCount      int      `json:"line_count"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.Name, &r.CustomerName, &r.Status, &r.GrandTotal, &r.Currency,
				&r.DeliveryDate, &r.Priority, &r.PriorityLabel, &r.PerPicked, &r.PerDelivered, &r.PerBilled,
				&r.PONo, &r.SetWarehouse, &r.CreatedAt, &r.TransactionDate, &r.LineCount); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		if list == nil {
			list = []row{}
		}
		return shared.OK(c, list)
	}
}

func getOrder(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var so struct {
			ID              int
			Name            string
			CustomerName    *string
			Status          string
			GrandTotal      *float64
			NetTotal        *float64
			Currency        *string
			DeliveryDate    *string
			Priority        *int
			PriorityLabel   *string
			PriorityReason  *string
			PerPicked       *float64
			PerDelivered    *float64
			PerBilled       *float64
			PONo            *string
			SetWarehouse    *string
			WarehouseID     *int
			Notes           *string
			CustomerAddress *string
			Company         *string
			CreatedAt       *time.Time
		}
		err = db.QueryRow(c.Context(), `
			SELECT id, name, customer_name, COALESCE(wms_status, status, 'draft'),
			       grand_total, net_total, currency, delivery_date::text, priority, priority_label,
			       priority_reason, per_picked, per_delivered, per_billed, po_no, set_warehouse,
			       warehouse_id, notes, customer_address, company, created_at
			FROM sales_orders WHERE id=$1`, id).Scan(
			&so.ID, &so.Name, &so.CustomerName, &so.Status, &so.GrandTotal, &so.NetTotal, &so.Currency,
			&so.DeliveryDate, &so.Priority, &so.PriorityLabel, &so.PriorityReason, &so.PerPicked,
			&so.PerDelivered, &so.PerBilled, &so.PONo, &so.SetWarehouse, &so.WarehouseID, &so.Notes,
			&so.CustomerAddress, &so.Company, &so.CreatedAt)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "sales order not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		itemRows, err := db.Query(c.Context(), `
			SELECT id, item_code, item_name, qty, rate, amount, uom, warehouse,
			       COALESCE(picked_qty,0), COALESCE(delivered_qty,0), COALESCE(allocated_qty,0),
			       COALESCE(backordered_qty,0), COALESCE(status,'open'), delivery_date::text
			FROM sales_order_items WHERE sales_order_id=$1 ORDER BY id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer itemRows.Close()

		type item struct {
			ID             int      `json:"id"`
			ItemCode       string   `json:"item_code"`
			ItemName       *string  `json:"item_name"`
			Qty            *float64 `json:"qty"`
			Rate           *float64 `json:"rate"`
			Amount         *float64 `json:"amount"`
			UOM            *string  `json:"uom"`
			Warehouse      *string  `json:"warehouse"`
			PickedQty      float64  `json:"picked_qty"`
			DeliveredQty   float64  `json:"delivered_qty"`
			AllocatedQty   float64  `json:"allocated_qty"`
			BackorderedQty float64  `json:"backordered_qty"`
			Status         string   `json:"status"`
			DeliveryDate   *string  `json:"delivery_date"`
		}
		var items []item
		for itemRows.Next() {
			var it item
			if err := itemRows.Scan(&it.ID, &it.ItemCode, &it.ItemName, &it.Qty, &it.Rate, &it.Amount,
				&it.UOM, &it.Warehouse, &it.PickedQty, &it.DeliveredQty, &it.AllocatedQty,
				&it.BackorderedQty, &it.Status, &it.DeliveryDate); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			items = append(items, it)
		}
		if items == nil {
			items = []item{}
		}

		return shared.OK(c, fiber.Map{
			"id": so.ID, "name": so.Name, "customer_name": so.CustomerName, "status": so.Status,
			"grand_total": so.GrandTotal, "net_total": so.NetTotal, "currency": so.Currency,
			"delivery_date": so.DeliveryDate, "priority": so.Priority, "priority_label": so.PriorityLabel,
			"priority_reason": so.PriorityReason, "per_picked": so.PerPicked, "per_delivered": so.PerDelivered,
			"per_billed": so.PerBilled, "po_no": so.PONo, "set_warehouse": so.SetWarehouse,
			"warehouse_id": so.WarehouseID, "notes": so.Notes, "customer_address": so.CustomerAddress,
			"company": so.Company, "created_at": so.CreatedAt, "items": items,
		})
	}
}

func updateOrder(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			CustomerName    string `json:"customer_name"`
			DeliveryDate    string `json:"delivery_date"`
			PONo            string `json:"po_no"`
			Notes           string `json:"notes"`
			CustomerAddress string `json:"customer_address"`
			SetWarehouse    string `json:"set_warehouse"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var status string
		err = db.QueryRow(c.Context(),
			`SELECT COALESCE(wms_status, status, 'draft') FROM sales_orders WHERE id=$1`, id).Scan(&status)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "sales order not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if strings.EqualFold(status, "cancelled") || strings.EqualFold(status, "completed") {
			return shared.Err(c, fiber.StatusBadRequest, "cannot edit "+status+" order")
		}

		var deliveryDate any
		if body.DeliveryDate != "" {
			d, err := time.Parse("2006-01-02", body.DeliveryDate)
			if err != nil {
				return shared.Err(c, fiber.StatusBadRequest, "delivery_date must be YYYY-MM-DD")
			}
			deliveryDate = d
		}

		_, err = db.Exec(c.Context(), `
			UPDATE sales_orders SET
				customer_name = COALESCE(NULLIF($2,''), customer_name),
				delivery_date = COALESCE($3, delivery_date),
				po_no = COALESCE(NULLIF($4,''), po_no),
				notes = COALESCE(NULLIF($5,''), notes),
				customer_address = COALESCE(NULLIF($6,''), customer_address),
				set_warehouse = COALESCE(NULLIF($7,''), set_warehouse),
				updated_at = NOW()
			WHERE id=$1`, id, body.CustomerName, deliveryDate, body.PONo, body.Notes,
			body.CustomerAddress, body.SetWarehouse)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}

func confirmOrder(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE sales_orders SET status='To Deliver and Bill', wms_status='confirmed', updated_at=NOW()
			WHERE id=$1 AND COALESCE(wms_status, status, 'draft') IN ('draft','Draft')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "order cannot be confirmed (not draft)")
		}
		var name string
		_ = db.QueryRow(c.Context(), `SELECT name FROM sales_orders WHERE id=$1`, id).Scan(&name)
		notifications.EmitSOConfirmed(c.Context(), db, name)
		return shared.OK(c, fiber.Map{"id": id, "status": "confirmed"})
	}
}

func cancelOrder(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE sales_orders SET status='Cancelled', wms_status='cancelled', updated_at=NOW()
			WHERE id=$1 AND COALESCE(wms_status, status) NOT IN ('cancelled','Cancelled','completed','Completed')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "order cannot be cancelled")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "cancelled"})
	}
}

func setPriority(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Priority int    `json:"priority"`
			Reason   string `json:"reason"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Priority < 1 || body.Priority > 10 {
			return shared.Err(c, fiber.StatusBadRequest, "priority must be 1-10")
		}
		if body.Reason == "" {
			return shared.Err(c, fiber.StatusBadRequest, "reason required for priority override")
		}

		var old *int
		err = db.QueryRow(c.Context(), `SELECT priority FROM sales_orders WHERE id=$1`, id).Scan(&old)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "sales order not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		label := priorityLabel(body.Priority)
		_, err = db.Exec(c.Context(), `
			UPDATE sales_orders SET priority=$2, priority_label=$3, priority_reason=$4,
				priority_set_by=$5, priority_set_at=NOW(), updated_at=NOW()
			WHERE id=$1`, id, body.Priority, label, body.Reason, userID(c))
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		_, _ = db.Exec(c.Context(), `
			INSERT INTO priority_history (sales_order_id, old_priority, new_priority, reason, set_by)
			VALUES ($1,$2,$3,$4,$5)`, id, old, body.Priority, body.Reason, userID(c))

		return shared.OK(c, fiber.Map{"id": id, "priority": body.Priority, "priority_label": label})
	}
}

// createPickFromSO creates a pick list from a confirmed SO using the same FEFO reserve path as picking.
func createPickFromSO(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var name, customer string
		var soWhID *int
		var status string
		err = db.QueryRow(c.Context(), `
			SELECT name, COALESCE(customer_name,''), warehouse_id, COALESCE(wms_status, status, 'draft')
			FROM sales_orders WHERE id=$1`, id).Scan(&name, &customer, &soWhID, &status)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "sales order not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if strings.EqualFold(status, "draft") || strings.EqualFold(status, "cancelled") || strings.EqualFold(status, "Cancelled") {
			return shared.Err(c, fiber.StatusBadRequest, "confirm sales order before creating pick list")
		}

		whHint := 0
		if soWhID != nil {
			whHint = *soWhID
		}
		whID, err := shared.ResolveWarehouseID(c.Context(), db, &whHint)
		if err != nil || whID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse_id required on sales order or as default warehouse")
		}

		var whName string
		_ = db.QueryRow(c.Context(), `SELECT COALESCE(name, code) FROM warehouses WHERE id=$1`, whID).Scan(&whName)

		rows, err := db.Query(c.Context(), `
			SELECT soi.item_code,
			       COALESCE(soi.qty,0) - COALESCE(soi.picked_qty,0)
			     - COALESCE((SELECT SUM(GREATEST(
			           COALESCE(pli.allocated_qty,0) - COALESCE(pli.picked_qty,0)
			         - COALESCE(pli.consumed_qty,0), 0))
			       FROM pick_list_items pli
			       JOIN pick_lists pl ON pl.id = pli.pick_list_id
			       WHERE pl.sales_order_no = $2
			         AND pl.status IN ('draft','open')
			         AND pli.item_code = soi.item_code), 0) AS open_qty
			FROM sales_order_items soi
			WHERE soi.sales_order_id = $1`, id, name)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type soLine struct {
			ItemCode string
			Qty      float64
		}
		var soLines []soLine
		for rows.Next() {
			var l soLine
			if err := rows.Scan(&l.ItemCode, &l.Qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if l.Qty > 0 {
				soLines = append(soLines, l)
			}
		}
		if len(soLines) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "no open lines to pick")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var openID int
		var openName string
		err = tx.QueryRow(c.Context(), `
			SELECT id, name FROM pick_lists
			WHERE sales_order_no=$1 AND status IN ('draft','open')
			LIMIT 1 FOR UPDATE`, name).Scan(&openID, &openName)
		if err == nil {
			return shared.Err(c, fiber.StatusConflict,
				fmt.Sprintf("open pick list %s already exists for %s", openName, name))
		}
		if err != nil && err != pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var pickID int
		var pickName string
		err = tx.QueryRow(c.Context(), `
			INSERT INTO pick_lists (name, sales_order_no, customer, warehouse_id, status, picking_mode)
			VALUES ('PL-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_lists_id_seq')::TEXT,5,'0'),
				$1, $2, $3, 'open', 'scan')
			RETURNING id, name`, name, customer, whID).Scan(&pickID, &pickName)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		allocatedAny := false
		for _, sl := range soLines {
			cands, err := shared.ListFEFOCandidates(c.Context(), tx, whID, sl.ItemCode, true)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			remaining := sl.Qty
			for _, cand := range cands {
				if remaining <= 0 {
					break
				}
				take := cand.Available
				if take > remaining {
					take = remaining
				}
				if err := shared.ReserveBalance(c.Context(), tx, cand.BalanceID, take); err != nil {
					return shared.Err(c, fiber.StatusConflict, err.Error())
				}
				locID, balID := cand.LocationID, cand.BalanceID
				var batch any
				if cand.BatchNo != "" {
					batch = cand.BatchNo
				}
				var expiry any
				if cand.ExpiryDate != nil {
					expiry = cand.ExpiryDate.Format("2006-01-02")
				}
				_, err = tx.Exec(c.Context(), `
					INSERT INTO pick_list_items (
						pick_list_id, item_code, warehouse, ordered_qty, picked_qty,
						allocated_qty, status, batch_no, location_id, location_code,
						balance_id, expiry_date, shortage_qty
					) VALUES ($1,$2,$3,$4,0,$4,'pending',$5,$6,$7,$8,$9,0)`,
					pickID, sl.ItemCode, whName, take, batch, locID, cand.LocationCode, balID, expiry)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				allocatedAny = true
				remaining -= take
			}
			if remaining > 0 {
				_, err = tx.Exec(c.Context(), `
					INSERT INTO pick_list_items (
						pick_list_id, item_code, warehouse, ordered_qty, picked_qty,
						allocated_qty, status, shortage_qty
					) VALUES ($1,$2,$3,$4,0,0,'shortage',$4)`,
					pickID, sl.ItemCode, whName, remaining)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
			}
		}
		if !allocatedAny {
			return shared.Err(c, fiber.StatusConflict, "insufficient stock to allocate any line (FEFO)")
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		_, _ = db.Exec(c.Context(), `
			UPDATE sales_orders SET wms_status='picking', updated_at=NOW() WHERE id=$1`, id)

		return shared.OK(c, fiber.Map{
			"id": pickID, "pick_list_id": pickID, "name": pickName,
			"pick_list_name": pickName, "sales_order": name, "warehouse_id": whID,
		})
	}
}

func importCSV(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Rows []map[string]any `json:"rows"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Rows) == 0 {
			return shared.Err(c, fiber.StatusBadRequest,
				`rows required — send {"rows":[{"so_number":"SO1","customer":"Acme","item_code":"SKU","qty":1}]}`)
		}

		// Normalize to string maps
		rows := make([]map[string]string, 0, len(body.Rows))
		for _, raw := range body.Rows {
			m := map[string]string{}
			for k, v := range raw {
				m[k] = fmt.Sprint(v)
			}
			rows = append(rows, m)
		}

		// Group by so_number
		type lineIn struct {
			ItemCode string
			Qty      float64
			Rate     float64
		}
		type orderIn struct {
			Customer     string
			DeliveryDate string
			Priority     *int
			Address      string
			Lines        []lineIn
		}
		groups := map[string]*orderIn{}
		orderKeys := []string{}

		for _, row := range rows {
			soNo := first(row, "so_number", "sales_order", "name", "SO Number")
			if soNo == "" {
				continue
			}
			g, ok := groups[soNo]
			if !ok {
				g = &orderIn{
					Customer:     first(row, "customer_code", "customer", "customer_name", "Customer"),
					DeliveryDate: first(row, "delivery_date", "Delivery Date"),
					Address:      first(row, "delivery_address", "address", "Customer Address"),
				}
				if ps := first(row, "priority", "Priority"); ps != "" {
					if p, err := strconv.Atoi(ps); err == nil {
						g.Priority = &p
					}
				}
				groups[soNo] = g
				orderKeys = append(orderKeys, soNo)
			}
			item := first(row, "item_code", "Item Code", "sku")
			qty, _ := strconv.ParseFloat(first(row, "qty", "quantity", "Qty"), 64)
			rate, _ := strconv.ParseFloat(first(row, "unit_price", "rate", "Rate"), 64)
			if item != "" && qty > 0 {
				g.Lines = append(g.Lines, lineIn{ItemCode: item, Qty: qty, Rate: rate})
			}
		}

		if len(orderKeys) == 0 {
			return shared.Err(c, fiber.StatusBadRequest,
				"no valid SO rows — need so_number/customer/item_code/qty columns")
		}

		created := []fiber.Map{}
		errors := []string{}
		for _, soNo := range orderKeys {
			g := groups[soNo]
			if g.Customer == "" || len(g.Lines) == 0 {
				errors = append(errors, soNo+": missing customer or items")
				continue
			}
			var net float64
			for _, l := range g.Lines {
				net += l.Qty * l.Rate
			}
			var dd *time.Time
			if g.DeliveryDate != "" {
				if d, err := time.Parse("2006-01-02", g.DeliveryDate); err == nil {
					dd = &d
				}
			}
			prio := 4
			if g.Priority != nil {
				prio = *g.Priority
			} else {
				prio = autoPriority(dd, net, false)
			}
			label := priorityLabel(prio)

			tx, err := db.Begin(c.Context())
			if err != nil {
				errors = append(errors, soNo+": "+err.Error())
				continue
			}

			var id int
			var name string
			// Prefer provided SO number if unique; else auto-generate
			err = tx.QueryRow(c.Context(), `
				INSERT INTO sales_orders (
					name, customer_name, status, wms_status, grand_total, net_total, currency,
					delivery_date, customer_address, priority, priority_label, priority_set_at, transaction_date
				) VALUES ($1,$2,'Draft','draft',$3,$3,'INR',$4,$5,$6,$7,NOW(),CURRENT_DATE)
				ON CONFLICT (name) DO NOTHING
				RETURNING id, name`,
				soNo, g.Customer, net, dd, nullEmpty(g.Address), prio, label).Scan(&id, &name)
			if err == pgx.ErrNoRows {
				tx.Rollback(c.Context())
				errors = append(errors, soNo+": already exists")
				continue
			}
			if err != nil {
				tx.Rollback(c.Context())
				errors = append(errors, soNo+": "+err.Error())
				continue
			}
			for _, l := range g.Lines {
				_, err = tx.Exec(c.Context(), `
					INSERT INTO sales_order_items (sales_order_id, item_code, qty, rate, amount, stock_qty)
					VALUES ($1,$2,$3,$4,$5,$3)`, id, l.ItemCode, l.Qty, l.Rate, l.Qty*l.Rate)
				if err != nil {
					tx.Rollback(c.Context())
					errors = append(errors, soNo+": "+err.Error())
					continue
				}
			}
			if err := tx.Commit(c.Context()); err != nil {
				errors = append(errors, soNo+": "+err.Error())
				continue
			}
			created = append(created, fiber.Map{"id": id, "name": name, "priority": prio})
		}

		return shared.OK(c, fiber.Map{"created": created, "errors": errors, "count": len(created)})
	}
}

func first(m map[string]string, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
		// case-insensitive
		for mk, mv := range m {
			if strings.EqualFold(mk, k) && strings.TrimSpace(mv) != "" {
				return strings.TrimSpace(mv)
			}
		}
	}
	return ""
}

func nullEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func coalesce(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

// decayPriorities bumps priority +1 (max 10) for open orders past delivery_date or SLA hours.
// Simple on-demand job — call from UI or cron; does not over-engineer a scheduler.
func decayPriorities(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, COALESCE(priority,4), COALESCE(priority_sla_hours,24), delivery_date, priority_set_at, created_at
			FROM sales_orders
			WHERE COALESCE(wms_status, status, 'draft') NOT IN ('cancelled','Cancelled','completed','Completed')
			  AND COALESCE(priority,4) < 10
			  AND (
			    (delivery_date IS NOT NULL AND delivery_date < CURRENT_DATE)
			    OR (
			      COALESCE(priority_set_at, created_at, NOW()) + (COALESCE(priority_sla_hours,24) || ' hours')::interval < NOW()
			    )
			  )
			  AND (priority_decay_at IS NULL OR priority_decay_at < NOW() - INTERVAL '20 hours')`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type cand struct {
			ID, Priority, SLA int
		}
		var list []cand
		for rows.Next() {
			var id, p, sla int
			var dd, psa, ca any
			if err := rows.Scan(&id, &p, &sla, &dd, &psa, &ca); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, cand{ID: id, Priority: p, SLA: sla})
		}
		updated := 0
		for _, it := range list {
			newP := it.Priority + 1
			if newP > 10 {
				newP = 10
			}
			label := priorityLabel(newP)
			_, err = db.Exec(c.Context(), `
				UPDATE sales_orders SET priority=$2, priority_label=$3, priority_reason='SLA decay',
					priority_decay_at=NOW(), priority_set_at=NOW(), updated_at=NOW()
				WHERE id=$1`, it.ID, newP, label)
			if err != nil {
				continue
			}
			_, _ = db.Exec(c.Context(), `
				INSERT INTO priority_history (sales_order_id, old_priority, new_priority, reason, set_by)
				VALUES ($1,$2,$3,'SLA decay',0)`, it.ID, it.Priority, newP)
			updated++
		}
		return shared.OK(c, fiber.Map{"decayed": updated, "candidates": len(list)})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
