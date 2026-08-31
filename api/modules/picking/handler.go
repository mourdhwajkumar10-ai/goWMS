package picking

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/fulfillment"
	"goWMS/api/modules/notifications"
	"goWMS/api/modules/rbac"
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
	r.Get("/:id/print", printPickList(db))
	r.Post("/:id/cancel", cancelPickList(db))
	RegisterShortageFlags(r, db)
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
		packLocID, err := fulfillment.ResolvePackingLocationID(c.Context(), tx, whID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "packing location: "+err.Error())
		}
		err = tx.QueryRow(c.Context(),
			`INSERT INTO pick_lists (name,sales_order_no,customer,warehouse_id,status,picking_mode,fulfillment_type,packing_location_id)
			 VALUES ('PL-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_lists_id_seq')::TEXT,5,'0'),$1,$2,$3,'open','scan','single',$4)
			 RETURNING id, name`,
			body.SalesOrder, body.Customer, whID, packLocID).Scan(&id, &name)
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
			return shared.Err(c, fiber.StatusBadRequest,
				"no valid items to allocate — each item needs item_code and ordered_qty (or qty) > 0")
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
			shortageQty := 0.0
			if ln.Status == "shortage" {
				shortageQty = ln.OrderedQty
			}
			_, err = tx.Exec(c.Context(), `
				INSERT INTO pick_list_items (
					pick_list_id, item_code, warehouse, ordered_qty, picked_qty,
					allocated_qty, status, batch_no, location_id, location_code,
					balance_id, expiry_date, shortage_qty
				) VALUES (
					$1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12
				)`,
				id, ln.ItemCode, ln.Warehouse, ln.OrderedQty, ln.AllocatedQty,
				ln.Status, batch, ln.LocationID, nullEmpty(ln.LocationCode),
				ln.BalanceID, expiry, shortageQty)
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

		shortages := make([]shared.ShortageLine, 0)
		for _, ln := range lines {
			if ln.Status == "shortage" {
				shortages = append(shortages, shared.ShortageLine{ItemCode: ln.ItemCode, Qty: ln.OrderedQty})
			}
		}

		boCreated := false
		var boNo string
		if len(shortages) > 0 {
			// Fix #6: Create backorder inside main transaction for consistency
			boNo, boCreated, err = shared.CreateBackorderFromShortages(
				c.Context(), tx, id, body.SalesOrder, body.Customer, whName, shortages)
			if err != nil {
				boCreated = false
				boNo = ""
			}
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		notifications.EmitPickCreated(c.Context(), db, name, body.SalesOrder)

		for _, ln := range lines {
			if ln.Status == "shortage" {
				notifications.EmitShortage(c.Context(), db, name, ln.ItemCode)
			}
		}
		if boCreated {
			notifications.EmitBackorderCreated(c.Context(), db, boNo, len(shortages))
		}

		return shared.OK(c, fiber.Map{
			"id": id, "name": name, "status": "open", "warehouse_id": whID,
			"shortage_lines": len(shortages), "backorder_auto": boCreated, "backorder_no": boNo,
		})
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
			fulfillmentType      *string
			packingLocID         *int
		)
		err = db.QueryRow(c.Context(), `
			SELECT name, sales_order_no, customer, warehouse_id, COALESCE(status,'draft'),
			       COALESCE(picking_mode,'scan'), COALESCE(stock_consumed,false),
			       fulfillment_type, packing_location_id
			FROM pick_lists WHERE id=$1`, id).
			Scan(&name, &salesOrder, &customer, &warehouseID, &status, &mode, &stockConsumed,
				&fulfillmentType, &packingLocID)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "pick list not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		sortBy := strings.ToLower(c.Query("sort"))
		orderSQL := `ORDER BY pli.location_code NULLS LAST, pli.id`
		if sortBy == "item" || (customer != nil && strings.Contains(*customer, "[sort:item]")) {
			orderSQL = `ORDER BY pli.item_code, pli.location_code NULLS LAST, pli.id`
		}

		rows, err := db.Query(c.Context(), `
			SELECT pli.id, pli.item_code, COALESCE(i.name, pli.item_code),
			       COALESCE(pli.ordered_qty,0), COALESCE(pli.picked_qty,0), COALESCE(pli.allocated_qty,0),
			       COALESCE(pli.consumed_qty,0), COALESCE(pli.packed_qty,0), COALESCE(pli.status,'pending'),
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
			`+orderSQL, id)
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
			PackedQty    float64    `json:"packed_qty"`
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
				&it.ConsumedQty, &it.PackedQty, &it.Status, &it.LocationCode, &it.LocationID, &it.BatchNo, &expiry,
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

		ft := ""
		if fulfillmentType != nil {
			ft = *fulfillmentType
		}
		return shared.OK(c, fiber.Map{
			"id": id, "name": name, "sales_order_no": salesOrder, "customer": customer,
			"warehouse_id": warehouseID, "status": status, "picking_mode": mode,
			"stock_consumed": stockConsumed, "total_qty": total, "picked_qty": picked,
			"fulfillment_type": ft, "packing_location_id": packingLocID,
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
			Override       bool    `json:"override"`
			OverrideReason string  `json:"override_reason"`
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
		if body.Override {
			if strings.TrimSpace(body.OverrideReason) == "" {
				return shared.Err(c, fiber.StatusBadRequest, "override_reason required")
			}
			if !rbac.HasPermission(c, "picking.override") {
				return shared.Err(c, fiber.StatusForbidden, "supervisor override required — ask a supervisor to approve this scan")
			}
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		typed, err := fulfillment.IsTyped(c.Context(), tx, body.PickListID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return shared.Err(c, fiber.StatusNotFound, "pick list not found")
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if typed {
			res, err := fulfillment.ConfirmPick(c.Context(), tx, fulfillment.ConfirmPickInput{
				PickListID:     body.PickListID,
				PickListItemID: body.PickListItemID,
				ItemCode:       body.ItemCode,
				ScannedBin:     body.ScannedBin,
				ExpectedBin:    body.ExpectedBin,
				Quantity:       body.Quantity,
				ScannedBy:      userID(c),
				Override:       body.Override,
				OverrideBy:     userID(c),
				OverrideReason: body.OverrideReason,
			})
			if err != nil {
				switch {
				case errors.Is(err, fulfillment.ErrWrongLocation),
					errors.Is(err, fulfillment.ErrWrongItem),
					errors.Is(err, fulfillment.ErrOverPick),
					errors.Is(err, fulfillment.ErrLineNotPickable):
					_ = tx.Commit(c.Context()) // persist rejected scan log
					status := fiber.StatusConflict
					msg := err.Error()
					if errors.Is(err, fulfillment.ErrWrongLocation) {
						msg = "wrong location — scan the prompted bin (or override with reason)"
					} else if errors.Is(err, fulfillment.ErrWrongItem) {
						msg = "wrong item"
					} else if errors.Is(err, fulfillment.ErrLineNotPickable) {
						msg = "line not pickable"
					}
					return shared.Err(c, status, msg)
				default:
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
			}
			if err := tx.Commit(c.Context()); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			return shared.OK(c, fiber.Map{
				"id": res.LogID, "log_no": res.LogNo, "location_drift": res.LocationDrift,
				"pick_list_item_id": res.PickListItemID, "picked_qty": res.PickedQty, "status": res.Status,
				"list_completed": res.ListCompleted, "engine": "fulfillment",
			})
		}

		// Lock the pick list row so concurrent scans on the same list serialize.
		// This mirrors fulfillment.ConfirmPick's FOR UPDATE on pick_lists and
		// prevents two operators from reading the same picked_qty simultaneously.
		var lockWH int
		_ = tx.QueryRow(c.Context(),
			`SELECT warehouse_id FROM pick_lists WHERE id=$1 FOR UPDATE`,
			body.PickListID).Scan(&lockWH)

		var (
			itemID                     int
			itemCode, locCode, status  string
			ordered, picked, allocated float64
			balanceID                  *int
		)
		if body.PickListItemID > 0 {
			err = tx.QueryRow(c.Context(), `
				SELECT id, item_code, COALESCE(location_code,''), COALESCE(status,'pending'),
				       COALESCE(ordered_qty,0), COALESCE(picked_qty,0), COALESCE(allocated_qty,0), balance_id
				FROM pick_list_items WHERE id=$1 AND pick_list_id=$2
				FOR UPDATE`,
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
				LIMIT 1
				FOR UPDATE`,
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
	// Fix #9: Use relative tolerance instead of absolute 0.0001
	tolerance := target * 0.0001
	if picked+body.Quantity > target+tolerance {
		return shared.Err(c, fiber.StatusBadRequest, fmt.Sprintf("over-pick: %.0f of %.0f already allocated", picked, target))
	}

	// Fix #4: Legacy path stock movement — consume from source, add to packing location.
	var batchNo string
	var packingLocID *int
	var warehouseID *int
	if balanceID != nil && *balanceID > 0 {
		// Get batch_no for this line (not in SELECT above, fetch separately)
		_ = tx.QueryRow(c.Context(),
			`SELECT COALESCE(batch_no,'') FROM pick_list_items WHERE id=$1`, itemID).Scan(&batchNo)
		// Consume reserved + actual at source location
		if err := shared.ConsumeReserved(c.Context(), tx, *balanceID, body.Quantity); err != nil {
			return shared.Err(c, fiber.StatusConflict, err.Error())
		}
	}
	// Get packing location and warehouse from pick list
	_ = tx.QueryRow(c.Context(),
		`SELECT packing_location_id, warehouse_id FROM pick_lists WHERE id=$1`, body.PickListID).
		Scan(&packingLocID, &warehouseID)
	if packingLocID != nil && *packingLocID > 0 && warehouseID != nil && *warehouseID > 0 {
		if err := shared.AdjustLocationQtyTx(c.Context(), tx, itemCode, *warehouseID, *packingLocID, batchNo, body.Quantity); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
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
	// Fix #9: Use relative tolerance
	if newPicked+tolerance >= target {
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
		if err := tx.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM pick_list_items
			WHERE pick_list_id=$1 AND COALESCE(allocated_qty,0) > 0
			  AND COALESCE(picked_qty,0) < COALESCE(allocated_qty, ordered_qty)`,
			body.PickListID).Scan(&remaining); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if remaining == 0 {
			if _, err := tx.Exec(c.Context(),
				`UPDATE pick_lists SET status='completed'
				 WHERE id=$1 AND COALESCE(stock_consumed,false)=false`,
				body.PickListID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		// Keep sales-order progress honest. Free-form and wave lists have no
		// single owning order; the helper no-ops for those.
		var soNo string
		if err := tx.QueryRow(c.Context(),
			`SELECT COALESCE(sales_order_no,'') FROM pick_lists WHERE id=$1`,
			body.PickListID).Scan(&soNo); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := shared.SyncSalesOrderProgress(c.Context(), tx, soNo); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
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

func printPickList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var name string
		var so, customer *string
		err = db.QueryRow(c.Context(), `
			SELECT name, sales_order_no, customer FROM pick_lists WHERE id=$1`, id).Scan(&name, &so, &customer)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "pick list not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		rows, err := db.Query(c.Context(), `
			SELECT item_code, COALESCE(location_code,''), COALESCE(batch_no,''),
			       COALESCE(allocated_qty, ordered_qty), COALESCE(picked_qty,0), COALESCE(status,'pending')
			FROM pick_list_items WHERE pick_list_id=$1 ORDER BY location_code NULLS LAST, id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type line struct {
			ItemCode     string  `json:"item_code"`
			LocationCode string  `json:"location_code"`
			BatchNo      string  `json:"batch_no"`
			Qty          float64 `json:"qty"`
			PickedQty    float64 `json:"picked_qty"`
			Status       string  `json:"status"`
		}
		var items []line
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.ItemCode, &l.LocationCode, &l.BatchNo, &l.Qty, &l.PickedQty, &l.Status); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			items = append(items, l)
		}
		if items == nil {
			items = []line{}
		}
		soStr, custStr := "", ""
		if so != nil {
			soStr = *so
		}
		if customer != nil {
			custStr = *customer
		}
		html := "<html><body><h1>" + name + "</h1><p>SO: " + soStr + " · " + custStr + "</p><table border=1 cellpadding=4><tr><th>Loc</th><th>Item</th><th>Batch</th><th>Qty</th><th>✓</th></tr>"
		for _, it := range items {
			html += "<tr><td>" + it.LocationCode + "</td><td>" + it.ItemCode + "</td><td>" + it.BatchNo + "</td><td>" +
				strconv.FormatFloat(it.Qty, 'f', -1, 64) + "</td><td>□</td></tr>"
		}
		html += "</table></body></html>"
		return shared.OK(c, fiber.Map{"id": id, "name": name, "sales_order_no": so, "customer": customer, "items": items, "html": html})
	}
}

// cancelPickList releases FEFO reservations and marks the pick list cancelled.
// Refuses if stock was already consumed by pack/dispatch.
func cancelPickList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var status string
		err = db.QueryRow(c.Context(), `SELECT COALESCE(status,'') FROM pick_lists WHERE id=$1`, id).Scan(&status)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "pick list not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if strings.EqualFold(status, "cancelled") {
			return shared.OK(c, fiber.Map{"id": id, "status": "cancelled", "already": true})
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		if err := shared.ReleasePickListReservations(c.Context(), tx, id); err != nil {
			return shared.Err(c, fiber.StatusConflict, err.Error())
		}
		tag, err := tx.Exec(c.Context(),
			`UPDATE pick_lists SET status='cancelled' WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "pick list not found")
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "cancelled", "reservations_released": true})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
