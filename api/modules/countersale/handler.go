package countersale

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/fulfillment"
	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires counter-sale routes under /counter-sale.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Use(rbac.RequirePermission("counter_sale.access"))
	r.Post("/", createSession(db))
	r.Get("/invoice/:name/pdf", downloadInvoicePDF(db))
	r.Get("/:id", getSession(db))
	r.Post("/:id/scan", scanLine(db))
	r.Post("/:id/complete", completeSession(db))
	r.Post("/:id/cancel", cancelSession(db))
}

type cartLine struct {
	ItemCode string  `json:"item_code"`
	Qty      float64 `json:"qty"`
	Discount float64 `json:"discount_pct"`
}

func createSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			CustomerID  int        `json:"customer_id"`
			Customer    string     `json:"customer_name"`
			WarehouseID int        `json:"warehouse_id"`
			GSTIN       string     `json:"customer_gstin"`
			PlaceOfSupply string   `json:"place_of_supply"`
			Lines       []cartLine `json:"lines"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Lines) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "lines required")
		}

		whID, err := shared.ResolveWarehouseID(c.Context(), db, &body.WarehouseID)
		if err != nil || whID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse_id required")
		}

		customerName := strings.TrimSpace(body.Customer)
		if body.CustomerID > 0 {
			_ = db.QueryRow(c.Context(), `SELECT name FROM customers WHERE id=$1`, body.CustomerID).Scan(&customerName)
		}
		if customerName == "" {
			_ = db.QueryRow(c.Context(), `SELECT name FROM customers WHERE lower(name)='walk-in' LIMIT 1`).Scan(&customerName)
			if customerName == "" {
				customerName = "Walk-in"
			}
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var soName string
		err = tx.QueryRow(c.Context(), `
			SELECT 'CS-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('counter_sale_no_seq')::TEXT,5,'0')`).Scan(&soName)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var soID int
		err = tx.QueryRow(c.Context(), `
			INSERT INTO sales_orders
			  (name, customer_name, status, wms_status, order_type, warehouse_id, priority, priority_label, net_total, grand_total)
			VALUES ($1,$2,'Confirmed','picking','Counter',$3,1,'Counter',0,0)
			RETURNING id`, soName, customerName, whID).Scan(&soID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		type priced struct {
			ItemCode, ItemName, HSN string
			Qty, MRP, DiscPct, Rate, GST float64
			Amount, Tax float64
		}
		pricedLines := make([]priced, 0, len(body.Lines))
		var netTotal, taxTotal float64
		for _, ln := range body.Lines {
			code := strings.TrimSpace(ln.ItemCode)
			if code == "" || ln.Qty <= 0 {
				continue
			}
			var name, hsn string
			var mrp, maxDisc, gst float64
			err = tx.QueryRow(c.Context(), `
				SELECT COALESCE(name,code), COALESCE(hsn_no,''), COALESCE(mrp,0),
				       COALESCE(max_rate_discount,0), COALESCE(gst_percentage,0)
				FROM items WHERE upper(code)=upper($1)`, code).
				Scan(&name, &hsn, &mrp, &maxDisc, &gst)
			if err != nil {
				return shared.Err(c, fiber.StatusBadRequest, "item not found: "+code)
			}
			disc := ln.Discount
			if disc < 0 {
				disc = 0
			}
			if maxDisc > 0 && disc > maxDisc {
				disc = maxDisc
			}
			rate := mrp * (1 - disc/100)
			amt := rate * ln.Qty
			tax := amt * gst / 100
			pricedLines = append(pricedLines, priced{
				ItemCode: code, ItemName: name, HSN: hsn,
				Qty: ln.Qty, MRP: mrp, DiscPct: disc, Rate: rate, GST: gst,
				Amount: amt, Tax: tax,
			})
			netTotal += amt
			taxTotal += tax
			_, err = tx.Exec(c.Context(), `
				INSERT INTO sales_order_items
				  (sales_order_id, item_code, item_name, qty, rate, amount, discount_percentage)
				VALUES ($1,$2,$3,$4,$5,$6,$7)`,
				soID, code, name, ln.Qty, rate, amt, disc)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if len(pricedLines) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "no valid lines")
		}
		grand := netTotal + taxTotal
		_, _ = tx.Exec(c.Context(), `
			UPDATE sales_orders SET net_total=$1, grand_total=$2, rounded_total=$2 WHERE id=$3`,
			netTotal, grand, soID)

		var whName string
		_ = tx.QueryRow(c.Context(), `SELECT COALESCE(name,code) FROM warehouses WHERE id=$1`, whID).Scan(&whName)
		packLocID, err := fulfillment.ResolvePackingLocationID(c.Context(), tx, whID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "packing location: "+err.Error())
		}

		var pickID int
		var pickName string
		err = tx.QueryRow(c.Context(), `
			INSERT INTO pick_lists
			  (name, sales_order_no, customer, warehouse_id, status, picking_mode, fulfillment_type, packing_location_id)
			VALUES (
			  'PL-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('pick_lists_id_seq')::TEXT,5,'0'),
			  $1,$2,$3,'open','scan','counter',$4)
			RETURNING id, name`, soName, customerName, whID, packLocID).Scan(&pickID, &pickName)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		type walkLine struct {
			ID           int     `json:"id"`
			ItemCode     string  `json:"item_code"`
			ItemName     string  `json:"item_name"`
			LocationCode string  `json:"location_code"`
			AllocatedQty float64 `json:"allocated_qty"`
			PickedQty    float64 `json:"picked_qty"`
			BatchNo      string  `json:"batch_no"`
			Status       string  `json:"status"`
		}
		walk := make([]walkLine, 0)
		shortages := make([]shared.ShortageLine, 0)
		allocatedAny := false

		for _, pl := range pricedLines {
			cands, err := shared.ListFEFOCandidates(c.Context(), tx, whID, pl.ItemCode, true)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			remaining := pl.Qty
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
				var lineID int
				err = tx.QueryRow(c.Context(), `
					INSERT INTO pick_list_items (
						pick_list_id, item_code, warehouse, ordered_qty, picked_qty,
						allocated_qty, status, batch_no, location_id, location_code,
						balance_id, expiry_date, shortage_qty
					) VALUES ($1,$2,$3,$4,0,$4,'pending',$5,$6,$7,$8,$9,0)
					RETURNING id`,
					pickID, pl.ItemCode, whName, take, batch, locID, cand.LocationCode, balID, expiry).Scan(&lineID)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				walk = append(walk, walkLine{
					ID: lineID, ItemCode: pl.ItemCode, ItemName: pl.ItemName,
					LocationCode: cand.LocationCode, AllocatedQty: take, Status: "pending",
					BatchNo: cand.BatchNo,
				})
				allocatedAny = true
				remaining -= take
			}
			if remaining > 0 {
				shortages = append(shortages, shared.ShortageLine{ItemCode: pl.ItemCode, Qty: remaining})
			}
		}
		if !allocatedAny {
			return shared.Err(c, fiber.StatusConflict, "no stock available — adjust cart quantities")
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		type priceRow struct {
			ItemCode string  `json:"item_code"`
			ItemName string  `json:"item_name"`
			HSN      string  `json:"hsn_no"`
			Qty      float64 `json:"qty"`
			MRP      float64 `json:"mrp"`
			DiscPct  float64 `json:"discount_pct"`
			Rate     float64 `json:"rate"`
			GST      float64 `json:"gst_percentage"`
			Amount   float64 `json:"amount"`
			Tax      float64 `json:"tax_amount"`
		}
		prices := make([]priceRow, 0, len(pricedLines))
		for _, p := range pricedLines {
			prices = append(prices, priceRow{
				ItemCode: p.ItemCode, ItemName: p.ItemName, HSN: p.HSN,
				Qty: p.Qty, MRP: p.MRP, DiscPct: p.DiscPct, Rate: p.Rate,
				GST: p.GST, Amount: p.Amount, Tax: p.Tax,
			})
		}

		return shared.OK(c, fiber.Map{
			"id":                pickID,
			"pick_list_id":      pickID,
			"pick_list_name":    pickName,
			"sales_order_id":    soID,
			"sales_order_no":    soName,
			"customer_name":     customerName,
			"customer_gstin":    body.GSTIN,
			"place_of_supply":   body.PlaceOfSupply,
			"warehouse_id":      whID,
			"fulfillment_type":  "counter",
			"walk_list":         walk,
			"shortages":         shortages,
			"pricing":           prices,
			"net_total":         netTotal,
			"total_taxes":       taxTotal,
			"grand_total":       grand,
		})
	}
}

func getSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var name, soNo, customer, status, ft string
		var whID, packLoc *int
		err = db.QueryRow(c.Context(), `
			SELECT name, COALESCE(sales_order_no,''), COALESCE(customer,''),
			       COALESCE(status,'open'), COALESCE(fulfillment_type,''),
			       warehouse_id, packing_location_id
			FROM pick_lists WHERE id=$1`, id).
			Scan(&name, &soNo, &customer, &status, &ft, &whID, &packLoc)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if ft != "counter" {
			return shared.Err(c, fiber.StatusBadRequest, "not a counter-sale session")
		}

		rows, err := db.Query(c.Context(), `
			SELECT pli.id, pli.item_code, COALESCE(i.name, pli.item_code),
			       COALESCE(pli.location_code,''), COALESCE(pli.allocated_qty,0),
			       COALESCE(pli.picked_qty,0), COALESCE(pli.batch_no,''), COALESCE(pli.status,'pending')
			FROM pick_list_items pli
			LEFT JOIN items i ON i.code = pli.item_code
			WHERE pli.pick_list_id=$1
			ORDER BY pli.location_code NULLS LAST, pli.id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type line struct {
			ID           int     `json:"id"`
			ItemCode     string  `json:"item_code"`
			ItemName     string  `json:"item_name"`
			LocationCode string  `json:"location_code"`
			AllocatedQty float64 `json:"allocated_qty"`
			PickedQty    float64 `json:"picked_qty"`
			BatchNo      string  `json:"batch_no"`
			Status       string  `json:"status"`
		}
		var walk []line
		var totalAlloc, totalPicked float64
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.ID, &l.ItemCode, &l.ItemName, &l.LocationCode,
				&l.AllocatedQty, &l.PickedQty, &l.BatchNo, &l.Status); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			walk = append(walk, l)
			totalAlloc += l.AllocatedQty
			totalPicked += l.PickedQty
		}
		return shared.OK(c, fiber.Map{
			"id": id, "pick_list_name": name, "sales_order_no": soNo,
			"customer_name": customer, "status": status, "warehouse_id": whID,
			"packing_location_id": packLoc, "walk_list": walk,
			"allocated_qty": totalAlloc, "picked_qty": totalPicked,
		})
	}
}

func scanLine(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
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

		res, err := fulfillment.ConfirmPick(c.Context(), tx, fulfillment.ConfirmPickInput{
			PickListID:     id,
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
			return shared.Err(c, fiber.StatusConflict, err.Error())
		}
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"picked_qty": res.PickedQty, "status": res.Status,
			"list_completed": res.ListCompleted, "pick_list_item_id": res.PickListItemID,
		})
	}
}

func completeSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			PaymentMode   string `json:"payment_mode"`
			CustomerGSTIN string `json:"customer_gstin"`
			PlaceOfSupply string `json:"place_of_supply"`
			BoxLabel      string `json:"box_label"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.PaymentMode == "" {
			body.PaymentMode = "Cash"
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var soNo, customer, ft string
		var whID, packLoc *int
		err = tx.QueryRow(c.Context(), `
			SELECT COALESCE(sales_order_no,''), COALESCE(customer,''),
			       COALESCE(fulfillment_type,''), warehouse_id, packing_location_id
			FROM pick_lists WHERE id=$1 FOR UPDATE`, id).
			Scan(&soNo, &customer, &ft, &whID, &packLoc)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if ft != "counter" {
			return shared.Err(c, fiber.StatusBadRequest, "not a counter-sale session")
		}

		var open float64
		_ = tx.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(GREATEST(COALESCE(allocated_qty,0)-COALESCE(picked_qty,0),0)),0)
			FROM pick_list_items WHERE pick_list_id=$1 AND COALESCE(status,'') <> 'shortage'`, id).Scan(&open)
		if open > 0.0001 {
			return shared.Err(c, fiber.StatusConflict, "finish picking before completing sale")
		}

		label := strings.TrimSpace(body.BoxLabel)
		if label == "" {
			label = fmt.Sprintf("CS-%s-%d", time.Now().Format("150405"), id)
		}
		var boxID int
		err = tx.QueryRow(c.Context(), `
			INSERT INTO boxes (label, pick_list_id, warehouse_id, packing_location_id)
			VALUES ($1,$2,$3,$4) RETURNING id`,
			label, id, whID, packLoc).Scan(&boxID)
		if err != nil {
			return shared.Err(c, fiber.StatusConflict, "box label: "+err.Error())
		}

		rows, err := tx.Query(c.Context(), `
			SELECT item_code, SUM(COALESCE(picked_qty,0))
			FROM pick_list_items WHERE pick_list_id=$1
			GROUP BY item_code HAVING SUM(COALESCE(picked_qty,0)) > 0`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		type packNeed struct {
			Code string
			Qty  float64
		}
		var needs []packNeed
		for rows.Next() {
			var n packNeed
			if err := rows.Scan(&n.Code, &n.Qty); err != nil {
				rows.Close()
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			needs = append(needs, n)
		}
		rows.Close()

		for _, n := range needs {
			if _, _, err := fulfillment.AssignToBox(c.Context(), tx, fulfillment.AssignToBoxInput{
				BoxID: boxID, PickListID: id, ItemCode: n.Code, Quantity: n.Qty, ScannedBy: userID(c),
			}); err != nil {
				return shared.Err(c, fiber.StatusConflict, err.Error())
			}
		}
		if err := fulfillment.ShipBox(c.Context(), tx, boxID); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		inv, err := issueGSTInvoice(c.Context(), tx, invoiceInput{
			SalesOrderNo:  soNo,
			CustomerName:  customer,
			CustomerGSTIN: body.CustomerGSTIN,
			PlaceOfSupply: body.PlaceOfSupply,
			PaymentMode:   body.PaymentMode,
			WarehouseID:   whID,
			PickListID:    id,
		})
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "invoice: "+err.Error())
		}

		_, _ = tx.Exec(c.Context(), `UPDATE pick_lists SET status='completed' WHERE id=$1`, id)
		_, _ = tx.Exec(c.Context(), `
			UPDATE sales_orders SET wms_status='delivered', delivery_status='Delivered',
			  per_delivered=100, per_billed=100, updated_at=NOW()
			WHERE name=$1`, soNo)

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"box_id": boxID, "box_label": label,
			"invoice": inv, "payment_mode": body.PaymentMode,
		})
	}
}

func cancelSession(db *pgxpool.Pool) fiber.Handler {
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

		var ft, soNo string
		err = tx.QueryRow(c.Context(), `
			SELECT COALESCE(fulfillment_type,''), COALESCE(sales_order_no,'')
			FROM pick_lists WHERE id=$1 FOR UPDATE`, id).Scan(&ft, &soNo)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if ft != "counter" {
			return shared.Err(c, fiber.StatusBadRequest, "not a counter-sale session")
		}
		if err := fulfillment.ReleaseReservations(c.Context(), tx, id); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		_, _ = tx.Exec(c.Context(), `UPDATE pick_lists SET status='cancelled' WHERE id=$1`, id)
		_, _ = tx.Exec(c.Context(), `
			UPDATE sales_orders SET wms_status='cancelled', status='Cancelled', updated_at=NOW()
			WHERE name=$1 AND order_type='Counter'`, soNo)
		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"cancelled": true, "id": id})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
