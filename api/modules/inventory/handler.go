package inventory

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires inventory-health + transfer routes under /inventory.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/reorder-alerts", reorderAlerts(db))
	r.Get("/expiry-alerts", expiryAlerts(db))
	r.Post("/refresh-alerts", refreshAlerts(db))

	r.Get("/transfers", listTransfers(db))
	r.Post("/transfers", createTransfer(db))
	r.Get("/transfers/:id", getTransfer(db))
	r.Post("/transfers/:id/ship", shipTransfer(db))
	r.Post("/transfers/:id/receive", receiveTransfer(db))
}

func reorderAlerts(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Fix #19: Allow filtering by warehouse_id for per-warehouse reorder alerts
		warehouseID, _ := strconv.Atoi(c.Query("warehouse_id"))

		warehouseFilter := ""
		args := []any{}
		if warehouseID > 0 {
			warehouseFilter = " AND slb.warehouse_id = $1"
			args = append(args, warehouseID)
		}

		query := `
			SELECT i.code, i.name,
			       COALESCE(i.safety_stock,0), COALESCE(i.reorder_level,0), COALESCE(i.reorder_qty,0),
			       COALESCE(i.max_stock,0),
			       COALESCE((
			         SELECT SUM(slb.actual_qty - slb.reserved_qty)
			         FROM stock_location_balances slb
			         JOIN warehouse_locations wl ON wl.id = slb.location_id
			         WHERE slb.item_code = i.code
			           AND wl.location_type IN ('storage','pick_face')
			           ` + warehouseFilter + `
			       ),0) AS available_qty
			FROM items i
			WHERE i.disabled=false AND COALESCE(i.master_complete,true)=true
			ORDER BY i.code`
		rows, err := db.Query(c.Context(), query, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type alert struct {
			ItemCode     string  `json:"item_code"`
			ItemName     string  `json:"item_name"`
			SafetyStock  float64 `json:"safety_stock"`
			ReorderLevel float64 `json:"reorder_level"`
			ReorderQty   float64 `json:"reorder_qty"`
			MaxStock     float64 `json:"max_stock"`
			AvailableQty float64 `json:"available_qty"`
			AlertType    string  `json:"alert_type"`
			SuggestedQty float64 `json:"suggested_qty"`
		}
		list := []alert{}
		for rows.Next() {
			var a alert
			if err := rows.Scan(&a.ItemCode, &a.ItemName, &a.SafetyStock, &a.ReorderLevel, &a.ReorderQty, &a.MaxStock, &a.AvailableQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			threshold := a.ReorderLevel
			if threshold <= 0 {
				threshold = a.SafetyStock
			}
			if threshold > 0 && a.AvailableQty < threshold {
				a.AlertType = "below_min"
				a.SuggestedQty = a.ReorderQty
				if a.SuggestedQty <= 0 {
					a.SuggestedQty = threshold - a.AvailableQty
				}
				list = append(list, a)
			} else if a.MaxStock > 0 && a.AvailableQty > a.MaxStock {
				a.AlertType = "above_max"
				list = append(list, a)
			}
		}
		return shared.OK(c, list)
	}
}

func expiryAlerts(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		days, _ := strconv.Atoi(c.Query("days", "90"))
		if days <= 0 {
			days = 90
		}
		rows, err := db.Query(c.Context(), `
			SELECT slb.item_code, COALESCE(i.name,''), slb.warehouse_id, w.code, wl.id, wl.code,
			       COALESCE(slb.batch_no,''), b.expiry_date::text,
			       (b.expiry_date - CURRENT_DATE) AS days_until,
			       slb.actual_qty, slb.reserved_qty,
			       (slb.actual_qty - slb.reserved_qty) AS available_qty
			FROM stock_location_balances slb
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			JOIN warehouses w ON w.id = slb.warehouse_id
			LEFT JOIN items i ON i.code = slb.item_code
			JOIN batches b ON b.item_code = slb.item_code AND b.batch_id = slb.batch_no
			WHERE slb.actual_qty > 0
			  AND b.expiry_date IS NOT NULL
			  AND b.expiry_date <= CURRENT_DATE + $1::int
			ORDER BY b.expiry_date ASC, slb.item_code
			LIMIT 200`, days)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			ItemCode       string  `json:"item_code"`
			ItemName       string  `json:"item_name"`
			WarehouseID    int     `json:"warehouse_id"`
			WarehouseCode  string  `json:"warehouse_code"`
			LocationID     int     `json:"location_id"`
			LocationCode   string  `json:"location_code"`
			BatchNo        string  `json:"batch_no"`
			ExpiryDate     string  `json:"expiry_date"`
			DaysUntil      int     `json:"days_until_expiry"`
			ActualQty      float64 `json:"actual_qty"`
			ReservedQty    float64 `json:"reserved_qty"`
			AvailableQty   float64 `json:"available_qty"`
			Severity       string  `json:"severity"`
			FefoPriority   bool    `json:"fefo_priority"`
		}
		list := []row{}
		for rows.Next() {
			var r row
			var exp *string
			var daysUntil *int
			if err := rows.Scan(&r.ItemCode, &r.ItemName, &r.WarehouseID, &r.WarehouseCode,
				&r.LocationID, &r.LocationCode, &r.BatchNo, &exp, &daysUntil,
				&r.ActualQty, &r.ReservedQty, &r.AvailableQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if exp != nil {
				r.ExpiryDate = *exp
			}
			if daysUntil != nil {
				r.DaysUntil = *daysUntil
			}
			switch {
			case r.DaysUntil < 0:
				r.Severity = "expired"
			case r.DaysUntil <= 30:
				r.Severity = "critical"
			case r.DaysUntil <= 90:
				r.Severity = "warning"
			default:
				r.Severity = "info"
			}
			r.FefoPriority = true
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func refreshAlerts(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		created := 0

		// Reorder alerts → notifications (dedupe by title today).
		rows, err := db.Query(c.Context(), `
			SELECT i.code, i.name, COALESCE(i.reorder_level, i.safety_stock, 0),
			       COALESCE((
			         SELECT SUM(slb.actual_qty - slb.reserved_qty)
			         FROM stock_location_balances slb
			         JOIN warehouse_locations wl ON wl.id = slb.location_id
			         WHERE slb.item_code = i.code AND wl.location_type IN ('storage','pick_face')
			       ),0)
			FROM items i
			WHERE i.disabled=false
			  AND COALESCE(i.reorder_level, i.safety_stock, 0) > 0`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		for rows.Next() {
			var code, name string
			var level, avail float64
			if err := rows.Scan(&code, &name, &level, &avail); err != nil {
				rows.Close()
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if avail >= level {
				continue
			}
			title := fmt.Sprintf("Reorder: %s", code)
			var exists int
			_ = db.QueryRow(c.Context(), `
				SELECT COUNT(*) FROM notifications
				WHERE title=$1 AND created_at::date = CURRENT_DATE AND is_read=false`, title).Scan(&exists)
			if exists > 0 {
				continue
			}
			_, err = db.Exec(c.Context(), `
				INSERT INTO notifications (type, title, message)
				VALUES ('warning', $1, $2)`,
				title, fmt.Sprintf("%s available %.0f below reorder %.0f", name, avail, level))
			if err == nil {
				created++
			}
		}
		rows.Close()

		// Expiry critical (≤30 days)
		erows, err := db.Query(c.Context(), `
			SELECT slb.item_code, b.expiry_date::text, (b.expiry_date - CURRENT_DATE), SUM(slb.actual_qty)
			FROM stock_location_balances slb
			JOIN batches b ON b.item_code = slb.item_code AND b.batch_id = slb.batch_no
			WHERE slb.actual_qty > 0 AND b.expiry_date IS NOT NULL
			  AND b.expiry_date <= CURRENT_DATE + 30
			GROUP BY slb.item_code, b.expiry_date`)
		if err == nil {
			for erows.Next() {
				var code, exp string
				var days int
				var qty float64
				if err := erows.Scan(&code, &exp, &days, &qty); err != nil {
					break
				}
				title := fmt.Sprintf("Expiry: %s (%s)", code, exp)
				var exists int
				_ = db.QueryRow(c.Context(), `
					SELECT COUNT(*) FROM notifications
					WHERE title=$1 AND created_at::date = CURRENT_DATE AND is_read=false`, title).Scan(&exists)
				if exists > 0 {
					continue
				}
				msg := fmt.Sprintf("%.0f units expire in %d days (FEFO)", qty, days)
				if days < 0 {
					msg = fmt.Sprintf("%.0f units expired on %s", qty, exp)
				}
				_, err = db.Exec(c.Context(), `
					INSERT INTO notifications (type, title, message) VALUES ('error', $1, $2)`, title, msg)
				if err == nil {
					created++
				}
			}
			erows.Close()
		}

		return shared.OK(c, fiber.Map{"notifications_created": created, "refreshed_at": time.Now().UTC()})
	}
}

func listTransfers(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, stock_entry_type, purpose, status, posting_date::text,
			       from_warehouse, to_warehouse, from_warehouse_id, to_warehouse_id, remarks
			FROM stock_entries
			WHERE purpose = 'Material Transfer' OR stock_entry_type = 'Material Transfer'
			ORDER BY id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type t struct {
			ID               int     `json:"id"`
			Name             string  `json:"name"`
			StockEntryType   *string `json:"stock_entry_type"`
			Purpose          *string `json:"purpose"`
			Status           *string `json:"status"`
			PostingDate      *string `json:"posting_date"`
			FromWarehouse    *string `json:"from_warehouse"`
			ToWarehouse      *string `json:"to_warehouse"`
			FromWarehouseID  *int    `json:"from_warehouse_id"`
			ToWarehouseID    *int    `json:"to_warehouse_id"`
			Remarks          *string `json:"remarks"`
		}
		list := []t{}
		for rows.Next() {
			var row t
			if err := rows.Scan(&row.ID, &row.Name, &row.StockEntryType, &row.Purpose, &row.Status, &row.PostingDate,
				&row.FromWarehouse, &row.ToWarehouse, &row.FromWarehouseID, &row.ToWarehouseID, &row.Remarks); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, row)
		}
		return shared.OK(c, list)
	}
}

func createTransfer(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			FromWarehouseID int `json:"from_warehouse_id"`
			ToWarehouseID   int `json:"to_warehouse_id"`
			Remarks         string `json:"remarks"`
			Items           []struct {
				ItemCode       string  `json:"item_code"`
				Qty            float64 `json:"qty"`
				BatchNo        string  `json:"batch_no"`
				SourceLocationID int   `json:"source_location_id"`
			} `json:"items"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.FromWarehouseID == 0 || body.ToWarehouseID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "from_warehouse_id and to_warehouse_id required")
		}
		if body.FromWarehouseID == body.ToWarehouseID {
			return shared.Err(c, fiber.StatusBadRequest, "warehouses must differ")
		}
		if len(body.Items) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "items required")
		}

		var fromCode, toCode string
		if err := db.QueryRow(c.Context(), `SELECT code FROM warehouses WHERE id=$1`, body.FromWarehouseID).Scan(&fromCode); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "from warehouse not found")
		}
		if err := db.QueryRow(c.Context(), `SELECT code FROM warehouses WHERE id=$1`, body.ToWarehouseID).Scan(&toCode); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "to warehouse not found")
		}

		var id int
		var name string
		err := db.QueryRow(c.Context(), `
			INSERT INTO stock_entries (
				name, stock_entry_type, purpose, company, from_warehouse, to_warehouse,
				from_warehouse_id, to_warehouse_id, status, remarks, created_by
			) VALUES (
				'TR-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('stock_entries_id_seq')::TEXT,5,'0'),
				'Material Transfer', 'Material Transfer', 'Default', $1, $2, $3, $4, 'draft', $5, $6
			) RETURNING id, name`,
			fromCode, toCode, body.FromWarehouseID, body.ToWarehouseID, nullEmpty(body.Remarks), userID(c),
		).Scan(&id, &name)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		for _, it := range body.Items {
			if strings.TrimSpace(it.ItemCode) == "" || it.Qty <= 0 {
				continue
			}
			_, err = db.Exec(c.Context(), `
				INSERT INTO stock_entry_items (
					stock_entry_id, item_code, s_warehouse, t_warehouse, qty, uom, transfer_qty, batch_no, s_location_id
				) VALUES ($1,$2,$3,$4,$5,'Nos',$5,NULLIF($6,''),NULLIF($7,0))`,
				id, it.ItemCode, fromCode, toCode, it.Qty, it.BatchNo, it.SourceLocationID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		return shared.OK(c, fiber.Map{"id": id, "name": name, "status": "draft"})
	}
}

func getTransfer(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var t struct {
			ID              int     `json:"id"`
			Name            string  `json:"name"`
			Status          *string `json:"status"`
			FromWarehouse   *string `json:"from_warehouse"`
			ToWarehouse     *string `json:"to_warehouse"`
			FromWarehouseID *int    `json:"from_warehouse_id"`
			ToWarehouseID   *int    `json:"to_warehouse_id"`
			Remarks         *string `json:"remarks"`
		}
		err = db.QueryRow(c.Context(), `
			SELECT id, name, status, from_warehouse, to_warehouse, from_warehouse_id, to_warehouse_id, remarks
			FROM stock_entries WHERE id=$1`, id).
			Scan(&t.ID, &t.Name, &t.Status, &t.FromWarehouse, &t.ToWarehouse, &t.FromWarehouseID, &t.ToWarehouseID, &t.Remarks)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "transfer not found")
		}

		rows, err := db.Query(c.Context(), `
			SELECT id, item_code, qty, COALESCE(batch_no,''), s_location_id, t_location_id, s_warehouse, t_warehouse
			FROM stock_entry_items WHERE stock_entry_id=$1 ORDER BY id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type line struct {
			ID             int     `json:"id"`
			ItemCode       string  `json:"item_code"`
			Qty            float64 `json:"qty"`
			BatchNo        string  `json:"batch_no"`
			SLocationID    *int    `json:"s_location_id"`
			TLocationID    *int    `json:"t_location_id"`
			SWarehouse     *string `json:"s_warehouse"`
			TWarehouse     *string `json:"t_warehouse"`
		}
		items := []line{}
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.ID, &l.ItemCode, &l.Qty, &l.BatchNo, &l.SLocationID, &l.TLocationID, &l.SWarehouse, &l.TWarehouse); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			items = append(items, l)
		}
		return shared.OK(c, fiber.Map{
			"id": t.ID, "name": t.Name, "status": t.Status,
			"from_warehouse": t.FromWarehouse, "to_warehouse": t.ToWarehouse,
			"from_warehouse_id": t.FromWarehouseID, "to_warehouse_id": t.ToWarehouseID,
			"remarks": t.Remarks, "items": items,
		})
	}
}

func shipTransfer(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var status string
		var fromWID, toWID *int
		err = tx.QueryRow(c.Context(), `
			SELECT COALESCE(status,'draft'), from_warehouse_id, to_warehouse_id FROM stock_entries WHERE id=$1 FOR UPDATE`, id).
			Scan(&status, &fromWID, &toWID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "transfer not found")
		}
		if status != "draft" {
			return shared.Err(c, fiber.StatusBadRequest, "only draft transfers can be shipped")
		}
		if fromWID == nil || toWID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse ids missing")
		}

		transitID, _, err := shared.EnsureLocation(c.Context(), db, *toWID, "IN-TRANSIT-01", "staging")
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		rows, err := tx.Query(c.Context(), `
			SELECT id, item_code, qty, COALESCE(batch_no,''), s_location_id
			FROM stock_entry_items WHERE stock_entry_id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		for rows.Next() {
			var lineID int
			var itemCode, batch string
			var qty float64
			var srcLoc *int
			if err := rows.Scan(&lineID, &itemCode, &qty, &batch, &srcLoc); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			srcID := 0
			if srcLoc != nil {
				srcID = *srcLoc
			}
			if srcID == 0 {
				// Fix #6: Use FOR UPDATE to prevent concurrent shipTransfers from picking same source location
				err = tx.QueryRow(c.Context(), `
					SELECT slb.location_id FROM stock_location_balances slb
					JOIN warehouse_locations wl ON wl.id = slb.location_id
					WHERE slb.item_code=$1 AND slb.warehouse_id=$2
					  AND wl.location_type IN ('storage','pick_face')
					  AND slb.actual_qty - slb.reserved_qty >= $3
					  AND ($4='' OR COALESCE(slb.batch_no,'')=$4)
					ORDER BY (
					  SELECT MIN(b.expiry_date) FROM batches b
					  WHERE b.item_code=slb.item_code AND b.batch_id=slb.batch_no
					) NULLS LAST, slb.id
					LIMIT 1 FOR UPDATE`, itemCode, *fromWID, qty, batch).Scan(&srcID)
if err != nil {
				return shared.Err(c, fiber.StatusBadRequest, fmt.Sprintf("insufficient stock for %s", itemCode))
			}
			}
			if err := shared.AdjustLocationQtyTx(c.Context(), tx, itemCode, *fromWID, srcID, batch, -qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if err := shared.AdjustLocationQtyTx(c.Context(), tx, itemCode, *toWID, transitID, batch, qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			_, _ = tx.Exec(c.Context(), `
				UPDATE stock_entry_items SET s_location_id=$1, t_location_id=$2 WHERE id=$3`,
				srcID, transitID, lineID)
		}

		if _, err := tx.Exec(c.Context(), `UPDATE stock_entries SET status='in_transit' WHERE id=$1`, id); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "in_transit"})
	}
}

func receiveTransfer(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			TargetLocationID int `json:"target_location_id"`
		}
		_ = shared.Bind(c, &body)

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var status string
		var toWID *int
		err = tx.QueryRow(c.Context(), `
			SELECT COALESCE(status,'draft'), to_warehouse_id FROM stock_entries WHERE id=$1 FOR UPDATE`, id).
			Scan(&status, &toWID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "transfer not found")
		}
		if status != "in_transit" {
			return shared.Err(c, fiber.StatusBadRequest, "transfer must be in_transit to receive")
		}
		if toWID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "to warehouse missing")
		}

		// Fix #13: Validate target location belongs to the correct warehouse
		if body.TargetLocationID > 0 {
			var targetWhID int
			err = tx.QueryRow(c.Context(), `SELECT warehouse_id FROM warehouse_locations WHERE id=$1`, body.TargetLocationID).Scan(&targetWhID)
			if err != nil {
				return shared.Err(c, fiber.StatusBadRequest, "target location not found")
			}
			if targetWhID != *toWID {
				return shared.Err(c, fiber.StatusBadRequest, "target location must be in the destination warehouse")
			}
		}

		incomingID, _, err := shared.EnsureLocation(c.Context(), db, *toWID, "INCOMING-01", "incoming")
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		targetID := body.TargetLocationID
		if targetID == 0 {
			targetID = incomingID
		}

		transitID, _, err := shared.EnsureLocation(c.Context(), db, *toWID, "IN-TRANSIT-01", "staging")
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		rows, err := tx.Query(c.Context(), `
			SELECT id, item_code, qty, COALESCE(batch_no,'') FROM stock_entry_items WHERE stock_entry_id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		for rows.Next() {
			var lineID int
			var itemCode, batch string
			var qty float64
			if err := rows.Scan(&lineID, &itemCode, &qty, &batch); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			_ = shared.AdjustLocationQtyTx(c.Context(), tx, itemCode, *toWID, transitID, batch, -qty)
			if err := shared.AdjustLocationQtyTx(c.Context(), tx, itemCode, *toWID, targetID, batch, qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			_, _ = tx.Exec(c.Context(), `UPDATE stock_entry_items SET t_location_id=$1 WHERE id=$2`, targetID, lineID)
		}

		if _, err := tx.Exec(c.Context(), `UPDATE stock_entries SET status='completed' WHERE id=$1`, id); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "completed", "target_location_id": targetID})
	}
}

func nullEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
