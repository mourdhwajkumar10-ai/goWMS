package picking

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the picking routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createPickList(db))
	r.Post("/scan", logPickScan(db))
	r.Get("/list", listPickLists(db))
	r.Get("/lists", listPickLists(db)) // frontend alias
	r.Get("/:id", getPickList(db))
}

func createPickList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SalesOrder  string `json:"sales_order_no"`
			Customer    string `json:"customer"`
			WarehouseID int    `json:"warehouse_id"`
			Warehouse   string `json:"warehouse"` // legacy alias (ignored if warehouse_id set)
			Items       []struct {
				ItemCode   string  `json:"item_code"`
				Warehouse  string  `json:"warehouse"`
				OrderedQty float64 `json:"ordered_qty"`
				Qty        float64 `json:"qty"` // frontend alias
			} `json:"items"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Items) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "items required")
		}

		whID, err := shared.ResolveWarehouseID(c.Context(), db, &body.WarehouseID)
		if err != nil || whID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse_id required")
		}

		var whName string
		_ = db.QueryRow(c.Context(), `SELECT COALESCE(name, code) FROM warehouses WHERE id=$1`, whID).Scan(&whName)
		if whName == "" {
			whName = body.Warehouse
		}
		if whName == "" {
			whName = fmt.Sprintf("WH-%d", whID)
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var id int
		var name string
		err = tx.QueryRow(c.Context(),
			`INSERT INTO pick_lists (name,sales_order_no,customer,warehouse_id,status,picking_mode)
			 VALUES ('PL-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_lists_id_seq')::TEXT,5,'0'),$1,$2,$3,'open','scan')
			 RETURNING id, name`,
			body.SalesOrder, body.Customer, whID).Scan(&id, &name)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		type allocLine struct {
			ItemCode     string
			OrderedQty   float64
			AllocatedQty float64
			LocationID   *int
			LocationCode string
			BalanceID    *int
			BatchNo      string
			Expiry       *time.Time
			Warehouse    string
			Status       string
		}
		var lines []allocLine

		for _, it := range body.Items {
			need := it.OrderedQty
			if need <= 0 {
				need = it.Qty
			}
			if strings.TrimSpace(it.ItemCode) == "" || need <= 0 {
				continue
			}
			cands, err := shared.ListFEFOCandidates(c.Context(), tx, whID, it.ItemCode, true)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			remaining := need
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
				lines = append(lines, allocLine{
					ItemCode:     it.ItemCode,
					OrderedQty:   take,
					AllocatedQty: take,
					LocationID:   &locID,
					LocationCode: cand.LocationCode,
					BalanceID:    &balID,
					BatchNo:      cand.BatchNo,
					Expiry:       cand.ExpiryDate,
					Warehouse:    whName,
					Status:       "pending",
				})
				remaining -= take
			}
			if remaining > 0 {
				lines = append(lines, allocLine{
					ItemCode:   it.ItemCode,
					OrderedQty: remaining,
					Warehouse:  whName,
					Status:     "shortage",
				})
			}
		}

		if len(lines) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "no valid items to allocate")
		}

		allocatedAny := false
		for _, ln := range lines {
			var batch any
			if ln.BatchNo != "" {
				batch = ln.BatchNo
			}
			var expiry any
			if ln.Expiry != nil {
				expiry = ln.Expiry.Format("2006-01-02")
			}
			_, err = tx.Exec(c.Context(), `
				INSERT INTO pick_list_items (
					pick_list_id, item_code, warehouse, ordered_qty, picked_qty,
					allocated_qty, status, batch_no, location_id, location_code,
					balance_id, expiry_date, shortage_qty
				) VALUES (
					$1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,
					CASE WHEN $6='shortage' THEN $4 ELSE 0 END
				)`,
				id, ln.ItemCode, ln.Warehouse, ln.OrderedQty, ln.AllocatedQty,
				ln.Status, batch, ln.LocationID, nullEmpty(ln.LocationCode),
				ln.BalanceID, expiry)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if ln.AllocatedQty > 0 {
				allocatedAny = true
			}
		}
		if !allocatedAny {
			return shared.Err(c, fiber.StatusConflict, "insufficient stock to allocate any line (FEFO)")
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "name": name, "status": "open", "warehouse_id": whID})
	}
}

func nullEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func listPickLists(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT pl.id, pl.name, pl.sales_order_no, pl.customer, pl.status, pl.picking_mode,
			       pl.warehouse_id,
			       COALESCE((SELECT SUM(ordered_qty) FROM pick_list_items pli WHERE pli.pick_list_id = pl.id),0),
			       COALESCE((SELECT SUM(picked_qty) FROM pick_list_items pli WHERE pli.pick_list_id = pl.id),0),
			       COALESCE((SELECT SUM(allocated_qty) FROM pick_list_items pli WHERE pli.pick_list_id = pl.id),0)
			FROM pick_lists pl ORDER BY pl.created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type pl struct {
			ID           int     `json:"id"`
			Name         string  `json:"name"`
			SalesOrder   *string `json:"sales_order_no"`
			Customer     *string `json:"customer"`
			Status       *string `json:"status"`
			PickingMode  *string `json:"picking_mode"`
			WarehouseID  *int    `json:"warehouse_id"`
			TotalQty     float64 `json:"total_qty"`
			PickedQty    float64 `json:"picked_qty"`
			AllocatedQty float64 `json:"allocated_qty"`
		}
		var list []pl
		for rows.Next() {
			var p pl
			if err := rows.Scan(&p.ID, &p.Name, &p.SalesOrder, &p.Customer, &p.Status, &p.PickingMode,
				&p.WarehouseID, &p.TotalQty, &p.PickedQty, &p.AllocatedQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, p)
		}
		return shared.OK(c, list)
	}
}

func getPickList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var (
			name, status, mode string
			salesOrder, customer *string
			warehouseID          *int
			stockConsumed        bool
		)
		err = db.QueryRow(c.Context(), `
			SELECT name, sales_order_no, customer, warehouse_id, COALESCE(status,'draft'),
			       COALESCE(picking_mode,'scan'), COALESCE(stock_consumed,false)
			FROM pick_lists WHERE id=$1`, id).
			Scan(&name, &salesOrder, &customer, &warehouseID, &status, &mode, &stockConsumed)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "pick list not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		rows, err := db.Query(c.Context(), `
			SELECT pli.id, pli.item_code, COALESCE(i.name, pli.item_code),
			       COALESCE(pli.ordered_qty,0), COALESCE(pli.picked_qty,0), COALESCE(pli.allocated_qty,0),
			       COALESCE(pli.consumed_qty,0), COALESCE(pli.status,'pending'),
			       COALESCE(pli.location_code, ''), pli.location_id, COALESCE(pli.batch_no,''),
			       pli.expiry_date, pli.balance_id,
			       CASE
			         WHEN pli.expiry_date IS NULL THEN NULL
			         WHEN pli.expiry_date < CURRENT_DATE THEN 'expired'
			         WHEN pli.expiry_date <= CURRENT_DATE + 30 THEN 'expiring_soon'
			         ELSE 'ok'
			       END AS fefo_badge
			FROM pick_list_items pli
			LEFT JOIN items i ON i.code = pli.item_code
			WHERE pli.pick_list_id = $1
			ORDER BY pli.location_code NULLS LAST, pli.id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type item struct {
			ID           int        `json:"id"`
			ItemCode     string     `json:"item_code"`
			ItemName     string     `json:"item_name"`
			Qty          float64    `json:"qty"`
			OrderedQty   float64    `json:"ordered_qty"`
			PickedQty    float64    `json:"picked_qty"`
			AllocatedQty float64    `json:"allocated_qty"`
			ConsumedQty  float64    `json:"consumed_qty"`
			Status       string     `json:"status"`
			BinLocation  string     `json:"bin_location"`
			LocationCode string     `json:"location_code"`
			LocationID   *int       `json:"location_id"`
			BatchNo      string     `json:"batch_no"`
			ExpiryDate   *time.Time `json:"expiry_date"`
			BalanceID    *int       `json:"balance_id"`
			FEFOBadge    *string    `json:"fefo_badge"`
		}
		var items []item
		var total, picked float64
		for rows.Next() {
			var it item
			var expiry *time.Time
			if err := rows.Scan(&it.ID, &it.ItemCode, &it.ItemName, &it.OrderedQty, &it.PickedQty, &it.AllocatedQty,
				&it.ConsumedQty, &it.Status, &it.LocationCode, &it.LocationID, &it.BatchNo, &expiry,
				&it.BalanceID, &it.FEFOBadge); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			it.Qty = it.OrderedQty
			it.BinLocation = it.LocationCode
			it.ExpiryDate = expiry
			total += it.OrderedQty
			picked += it.PickedQty
			items = append(items, it)
		}

		return shared.OK(c, fiber.Map{
			"id": id, "name": name, "sales_order_no": salesOrder, "customer": customer,
			"warehouse_id": warehouseID, "status": status, "picking_mode": mode,
			"stock_consumed": stockConsumed, "total_qty": total, "picked_qty": picked,
			"items": items,
		})
	}
}

func logPickScan(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			PickListID     int     `json:"pick_list_id"`
			PickListItemID int     `json:"pick_list_item_id"`
			ItemCode       string  `json:"item_code"`
			ScannedBin     string  `json:"scanned_bin"`
			ExpectedBin    string  `json:"expected_bin"`
			Quantity       float64 `json:"quantity"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" && body.PickListItemID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "item_code or pick_list_item_id required")
		}
		if body.Quantity <= 0 {
			body.Quantity = 1
		}
		if body.PickListID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "pick_list_id required")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var (
			itemID                         int
			itemCode, locCode, status      string
			ordered, picked, allocated     float64
			balanceID                      *int
		)
		if body.PickListItemID > 0 {
			err = tx.QueryRow(c.Context(), `
				SELECT id, item_code, COALESCE(location_code,''), COALESCE(status,'pending'),
				       COALESCE(ordered_qty,0), COALESCE(picked_qty,0), COALESCE(allocated_qty,0), balance_id
				FROM pick_list_items WHERE id=$1 AND pick_list_id=$2`,
				body.PickListItemID, body.PickListID).
				Scan(&itemID, &itemCode, &locCode, &status, &ordered, &picked, &allocated, &balanceID)
		} else {
			err = tx.QueryRow(c.Context(), `
				SELECT id, item_code, COALESCE(location_code,''), COALESCE(status,'pending'),
				       COALESCE(ordered_qty,0), COALESCE(picked_qty,0), COALESCE(allocated_qty,0), balance_id
				FROM pick_list_items
				WHERE pick_list_id=$1 AND item_code=$2
				  AND COALESCE(status,'pending') IN ('pending','partial','in_progress')
				  AND ($3='' OR location_code=$3 OR location_code IS NULL)
				ORDER BY
				  CASE WHEN location_code = $3 THEN 0 ELSE 1 END,
				  expiry_date NULLS LAST, id
				LIMIT 1`,
				body.PickListID, body.ItemCode, body.ScannedBin).
				Scan(&itemID, &itemCode, &locCode, &status, &ordered, &picked, &allocated, &balanceID)
		}
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "no pending pick line for item")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if status == "shortage" {
			return shared.Err(c, fiber.StatusBadRequest, "cannot pick shortage line — no stock allocated")
		}

		target := allocated
		if target <= 0 {
			target = ordered
		}
		if picked+body.Quantity > target+0.0001 {
			return shared.Err(c, fiber.StatusBadRequest, fmt.Sprintf("over-pick: %.0f of %.0f already allocated", picked, target))
		}

		expected := body.ExpectedBin
		if expected == "" {
			expected = locCode
		}
		locationDrift := body.ScannedBin != "" && expected != "" && body.ScannedBin != expected

		var logID int
		var logNo string
		err = tx.QueryRow(c.Context(),
			`INSERT INTO pick_scan_logs (log_no,pick_list_id,pick_list_item_id,item_code,scanned_bin,expected_bin,location_drift,quantity,scanned_by)
			 VALUES ('PS-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_scan_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,$5,$6,$7,$8)
			 RETURNING id, log_no`,
			body.PickListID, itemID, itemCode, body.ScannedBin, expected,
			locationDrift, body.Quantity, userID(c)).Scan(&logID, &logNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		newPicked := picked + body.Quantity
		newStatus := "in_progress"
		if newPicked+0.0001 >= target {
			newStatus = "picked"
		}
		if _, err := tx.Exec(c.Context(),
			`UPDATE pick_list_items SET picked_qty=$1, status=$2 WHERE id=$3`,
			newPicked, newStatus, itemID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Mark pick list open/in progress.
		_, _ = tx.Exec(c.Context(), `
			UPDATE pick_lists SET status='open' WHERE id=$1 AND status='draft'`, body.PickListID)

		// Auto-complete when all allocated lines are fully picked.
		var remaining int
		_ = tx.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM pick_list_items
			WHERE pick_list_id=$1 AND COALESCE(allocated_qty,0) > 0
			  AND COALESCE(picked_qty,0) < COALESCE(allocated_qty, ordered_qty)`).Scan(&remaining)
		if remaining == 0 {
			_, _ = tx.Exec(c.Context(), `UPDATE pick_lists SET status='completed' WHERE id=$1 AND COALESCE(stock_consumed,false)=false`, body.PickListID)
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{
			"id": logID, "log_no": logNo, "location_drift": locationDrift,
			"pick_list_item_id": itemID, "picked_qty": newPicked, "status": newStatus,
			"expected_bin": expected,
		})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
