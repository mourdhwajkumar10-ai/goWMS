package consolidate

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"goWMS/api/modules/fulfillment"
	"goWMS/api/modules/notifications"
	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var errNoPackingContext = errors.New("wave has no packing_location_id/warehouse_id set — cannot move leftover stock")

// Register wires wave consolidation under /consolidate.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/scan-item", scanItem(db))
	r.Post("/place", place(db))
	r.Get("/:waveId/status", status(db))
	r.Post("/:waveId/reconcile", reconcile(db))
	r.Get("/:waveId/reconciliations", listReconciliations(db))
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

type waveOrderRow struct {
	SalesOrderID    int     `json:"sales_order_id"`
	SalesOrderNo    string  `json:"sales_order_no"`
	Customer        string  `json:"customer"`
	Priority        int     `json:"priority"`
	RequiredQty     float64 `json:"required_qty"`
	ConsolidatedQty float64 `json:"consolidated_qty"`
	Complete        bool    `json:"complete"`
	HasAllocation   bool    `json:"has_allocation"`
	ShortQty        float64 `json:"short_qty"`
}

type leftoverLine struct {
	ItemCode string  `json:"item_code"`
	Qty      float64 `json:"qty"`
}

// waveOrders loads per-SO required/consolidated totals for a wave. Orders
// with required_qty == 0 are excluded from "complete" scoring (nothing was
// ever attributed to them — not a packing shortfall).
func waveOrders(ctx context.Context, db shared.DBTX, waveID int) ([]waveOrderRow, error) {
	rows, err := db.Query(ctx, `
		SELECT wol.sales_order_id, so.name, COALESCE(so.customer_name,''), COALESCE(so.priority,99),
		       SUM(wol.required_qty), SUM(wol.consolidated_qty)
		FROM wave_order_lines wol
		JOIN sales_orders so ON so.id = wol.sales_order_id
		WHERE wol.pick_list_id=$1
		GROUP BY wol.sales_order_id, so.name, so.customer_name, so.priority
		ORDER BY COALESCE(so.priority,99), so.name`, waveID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var orders []waveOrderRow
	for rows.Next() {
		var o waveOrderRow
		if err := rows.Scan(&o.SalesOrderID, &o.SalesOrderNo, &o.Customer, &o.Priority,
			&o.RequiredQty, &o.ConsolidatedQty); err != nil {
			return nil, err
		}
		o.HasAllocation = o.RequiredQty > 0.0001
		o.ShortQty = o.RequiredQty - o.ConsolidatedQty
		if o.ShortQty < 0 {
			o.ShortQty = 0
		}
		o.Complete = !o.HasAllocation || o.ShortQty <= 0.0001
		orders = append(orders, o)
	}
	return orders, rows.Err()
}

// leftoverBreakdown reports, per item, how much picked stock is still sitting
// unconsolidated at the packing location for this wave.
func leftoverBreakdown(ctx context.Context, db shared.DBTX, waveID int) ([]leftoverLine, float64, error) {
	rows, err := db.Query(ctx, `
		SELECT item_code, SUM(GREATEST(COALESCE(picked_qty,0)-COALESCE(packed_qty,0),0)) AS qty
		FROM pick_list_items
		WHERE pick_list_id=$1
		GROUP BY item_code
		HAVING SUM(GREATEST(COALESCE(picked_qty,0)-COALESCE(packed_qty,0),0)) > 0.0001
		ORDER BY item_code`, waveID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	var lines []leftoverLine
	var total float64
	for rows.Next() {
		var l leftoverLine
		if err := rows.Scan(&l.ItemCode, &l.Qty); err != nil {
			return nil, 0, err
		}
		lines = append(lines, l)
		total += l.Qty
	}
	return lines, total, rows.Err()
}

func status(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		waveID, err := strconv.Atoi(c.Params("waveId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid wave id")
		}
		orders, err := waveOrders(c.Context(), db, waveID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		allDone := true
		var incomplete []waveOrderRow
		for _, o := range orders {
			if !o.Complete {
				allDone = false
				incomplete = append(incomplete, o)
			}
		}

		leftoverLines, leftover, err := leftoverBreakdown(c.Context(), db, waveID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if leftoverLines == nil {
			leftoverLines = []leftoverLine{}
		}
		if incomplete == nil {
			incomplete = []waveOrderRow{}
		}

		var waveStatus string
		_ = db.QueryRow(c.Context(), `SELECT COALESCE(status,'') FROM pick_lists WHERE id=$1`, waveID).Scan(&waveStatus)

		return shared.OK(c, fiber.Map{
			"wave_id": waveID, "orders": orders, "all_complete": allDone,
			"leftover_qty": leftover, "leftover_breakdown": leftoverLines,
			"incomplete_orders": incomplete,
			"ready_to_reconcile": allDone && leftover <= 0.0001,
			"wave_status": waveStatus,
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
			Force      bool   `json:"force"`
			Note       string `json:"note"`
			Resolution string `json:"resolution"` // return_to_stock | write_off | none
		}
		_ = shared.Bind(c, &body)
		if body.Resolution == "" {
			body.Resolution = "none"
		}

		var waveStatus string
		var whID, packLocID *int
		if err := db.QueryRow(c.Context(), `
			SELECT COALESCE(status,''), warehouse_id, packing_location_id
			FROM pick_lists WHERE id=$1`, waveID).Scan(&waveStatus, &whID, &packLocID); err != nil {
			if err == pgx.ErrNoRows {
				return shared.Err(c, fiber.StatusNotFound, "wave not found")
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if waveStatus == "completed" {
			return shared.OK(c, fiber.Map{"wave_id": waveID, "reconciled": true, "already": true})
		}

		orders, err := waveOrders(c.Context(), db, waveID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		var incomplete []waveOrderRow
		for _, o := range orders {
			if !o.Complete {
				incomplete = append(incomplete, o)
			}
		}
		leftoverLines, leftover, err := leftoverBreakdown(c.Context(), db, waveID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		clean := leftover <= 0.0001 && len(incomplete) == 0
		if !clean {
			if !body.Force {
				if leftoverLines == nil {
					leftoverLines = []leftoverLine{}
				}
				if incomplete == nil {
					incomplete = []waveOrderRow{}
				}
				return c.Status(fiber.StatusConflict).JSON(fiber.Map{
					"ok":    false,
					"error": "wave not ready — leftover stock or incomplete orders. Force reconcile with a reason to close it out.",
					"data": fiber.Map{
						"leftover_qty":       leftover,
						"leftover_breakdown": leftoverLines,
						"incomplete_orders":  incomplete,
					},
				})
			}
			if strings.TrimSpace(body.Note) == "" {
				return shared.Err(c, fiber.StatusBadRequest, "reason required to force reconcile")
			}
			if !rbac.HasPermission(c, "picking.override") {
				return shared.Err(c, fiber.StatusForbidden, "picking.override required to force reconcile")
			}
			if leftover > 0.0001 && body.Resolution == "none" {
				return shared.Err(c, fiber.StatusBadRequest, "resolution required for leftover stock: return_to_stock or write_off")
			}
		} else {
			body.Resolution = "none"
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		if leftover > 0.0001 {
			switch body.Resolution {
			case "return_to_stock":
				if err := returnLeftoverToStock(c.Context(), tx, waveID, whID, packLocID, leftoverLines); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, "return to stock: "+err.Error())
				}
			case "write_off":
				if err := writeOffLeftover(c.Context(), tx, waveID, whID, packLocID, leftoverLines); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, "write off: "+err.Error())
				}
			}
		}

		// Any order still short after reconciliation gets its shortfall
		// captured as a proper item-level backorder so demand isn't silently
		// dropped (and doesn't collide with other waves' backorder lines).
		var whName string
		if whID != nil {
			_ = tx.QueryRow(c.Context(), `SELECT COALESCE(name,code) FROM warehouses WHERE id=$1`, *whID).Scan(&whName)
		}
		for _, o := range incomplete {
			if o.ShortQty <= 0.0001 {
				continue
			}
			shortLines, err := waveOrderShortageLines(c.Context(), tx, waveID, o.SalesOrderID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, "shortage lines: "+err.Error())
			}
			if _, _, err := shared.CreateBackorderFromShortages(c.Context(), tx, waveID, o.SalesOrderNo, o.Customer, whName, shortLines); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, "backorder shortfall: "+err.Error())
			}
		}

		leftoverJSON, _ := json.Marshal(leftoverLines)
		incompleteJSON, _ := json.Marshal(incomplete)
		if _, err := tx.Exec(c.Context(), `
			INSERT INTO wave_reconciliations (
				pick_list_id, leftover_qty, leftover_breakdown, incomplete_orders,
				resolution, forced, reason, resolved_by
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
			waveID, leftover, leftoverJSON, incompleteJSON, body.Resolution, !clean, body.Note, userID(c)); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "audit log: "+err.Error())
		}

		if _, err := tx.Exec(c.Context(), `
			UPDATE pick_lists SET status='completed' WHERE id=$1`, waveID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if !clean {
			notifications.Emit(c.Context(), db, "warning", "Wave force-reconciled",
				"Wave "+strconv.Itoa(waveID)+" closed with "+body.Resolution+" — "+body.Note, 0)
		}

		return shared.OK(c, fiber.Map{
			"wave_id": waveID, "reconciled": true, "forced": !clean,
			"leftover_qty": leftover, "resolution": body.Resolution,
			"incomplete_orders": len(incomplete),
		})
	}
}

// returnLeftoverToStock moves unconsolidated picked stock from the packing
// location back into a storage location in the same warehouse, so it isn't
// stranded at packing and isn't lost from stock either.
func returnLeftoverToStock(ctx context.Context, tx shared.DBTX, waveID int, whID, packLocID *int, lines []leftoverLine) error {
	if packLocID == nil || whID == nil {
		return errNoPackingContext
	}
	for _, l := range lines {
		if l.Qty <= 0 {
			continue
		}
		var storageLocID int
		// Prefer a location already holding this item (put it back where it came from).
		err := tx.QueryRow(ctx, `
			SELECT wl.id FROM stock_location_balances slb
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			WHERE slb.item_code=$1 AND wl.warehouse_id=$2 AND wl.location_type IN ('storage','pick_face')
			  AND COALESCE(wl.disabled,false)=false
			ORDER BY slb.actual_qty DESC LIMIT 1`, l.ItemCode, *whID).Scan(&storageLocID)
		if err != nil {
			err = tx.QueryRow(ctx, `
				SELECT id FROM warehouse_locations
				WHERE warehouse_id=$1 AND location_type='storage' AND COALESCE(disabled,false)=false
				ORDER BY id LIMIT 1`, *whID).Scan(&storageLocID)
		}
		if err != nil {
			return err
		}
		if err := shared.AdjustLocationQtyTx(ctx, tx, l.ItemCode, *whID, *packLocID, "", -l.Qty); err != nil {
			return err
		}
		if err := shared.AdjustLocationQtyTx(ctx, tx, l.ItemCode, *whID, storageLocID, "", l.Qty); err != nil {
			return err
		}
	}
	return nil
}

// writeOffLeftover removes stranded leftover stock from the books entirely
// (shrinkage / miscount write-off) and posts a ledger entry for traceability.
func writeOffLeftover(ctx context.Context, tx shared.DBTX, waveID int, whID, packLocID *int, lines []leftoverLine) error {
	if packLocID == nil || whID == nil {
		return errNoPackingContext
	}
	var whName string
	_ = tx.QueryRow(ctx, `SELECT COALESCE(name,code) FROM warehouses WHERE id=$1`, *whID).Scan(&whName)
	for _, l := range lines {
		if l.Qty <= 0 {
			continue
		}
		if err := shared.AdjustLocationQtyTx(ctx, tx, l.ItemCode, *whID, *packLocID, "", -l.Qty); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO stock_ledger_entries (
				item_code, warehouse, actual_qty, voucher_type, voucher_no,
				posting_date, posting_datetime, creation
			) VALUES ($1,$2,$3,'Wave Reconcile Write-off',$4,CURRENT_DATE,NOW(),NOW())`,
			l.ItemCode, whName, -l.Qty, "WAVE-"+strconv.Itoa(waveID)); err != nil {
			return err
		}
	}
	return nil
}

// waveOrderShortageLines returns the per-item shortfall (required minus
// consolidated) for one sales order within a wave, for backorder creation.
func waveOrderShortageLines(ctx context.Context, db shared.DBTX, waveID, salesOrderID int) ([]shared.ShortageLine, error) {
	rows, err := db.Query(ctx, `
		SELECT item_code, SUM(required_qty) - SUM(consolidated_qty) AS short_qty
		FROM wave_order_lines
		WHERE pick_list_id=$1 AND sales_order_id=$2
		GROUP BY item_code
		HAVING SUM(required_qty) - SUM(consolidated_qty) > 0.0001`, waveID, salesOrderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lines []shared.ShortageLine
	for rows.Next() {
		var l shared.ShortageLine
		if err := rows.Scan(&l.ItemCode, &l.Qty); err != nil {
			return nil, err
		}
		lines = append(lines, l)
	}
	return lines, rows.Err()
}

func listReconciliations(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		waveID, err := strconv.Atoi(c.Params("waveId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid wave id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT id, leftover_qty, COALESCE(leftover_breakdown,'[]'), COALESCE(incomplete_orders,'[]'),
			       resolution, forced, COALESCE(reason,''), resolved_by, resolved_at::text
			FROM wave_reconciliations WHERE pick_list_id=$1 ORDER BY resolved_at DESC`, waveID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error()+" — apply migrations/052_wave_reconciliations.sql")
		}
		defer rows.Close()
		type row struct {
			ID                int             `json:"id"`
			LeftoverQty       float64         `json:"leftover_qty"`
			LeftoverBreakdown json.RawMessage `json:"leftover_breakdown"`
			IncompleteOrders  json.RawMessage `json:"incomplete_orders"`
			Resolution        string          `json:"resolution"`
			Forced            bool            `json:"forced"`
			Reason            string          `json:"reason"`
			ResolvedBy        *int            `json:"resolved_by"`
			ResolvedAt        string          `json:"resolved_at"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.LeftoverQty, &r.LeftoverBreakdown, &r.IncompleteOrders,
				&r.Resolution, &r.Forced, &r.Reason, &r.ResolvedBy, &r.ResolvedAt); err != nil {
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

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
