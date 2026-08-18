package grn

import (
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterRFScan registers /api/receiving scan routes
func RegisterRFScan(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/scan-box", scanBoxHandler(db))
	r.Post("/scan-item", scanItemHandler(db))
	r.Post("/complete-box", completeBoxHandler(db))
	r.Post("/route-exception", routeExceptionHandler(db))
	r.Post("/override-route", overrideRouteHandler(db))
	r.Get("/stats", getStatsHandler(db))
	r.Get("/exceptions", listSessionExceptions(db))
}

func scanBoxHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID          int    `json:"session_id"`
			BoxNumber          string `json:"box_number"`
			AutoCompleteSingle bool   `json:"auto_complete_single"`
			DefaultRoute       string `json:"default_route"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SessionID == 0 || body.BoxNumber == "" {
			return shared.Err(c, fiber.StatusBadRequest, "session_id and box_number are required")
		}
		if body.DefaultRoute == "" {
			body.DefaultRoute = "INCOMING-01"
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		// 1. Get Carton
		var cartonID int
		var boxType, status, deliveryNo, dealerName, plant string
		err = tx.QueryRow(c.Context(), `
			SELECT id, COALESCE(box_type,''), status, COALESCE(delivery_no,''),
			       COALESCE(dealer_name,''), COALESCE(plant,'')
			FROM grn_cartons
			WHERE grn_session_id=$1 AND carton_no=$2`,
			body.SessionID, strings.TrimSpace(body.BoxNumber),
		).Scan(&cartonID, &boxType, &status, &deliveryNo, &dealerName, &plant)
		if err != nil {
			fmt.Printf("[scan-box] session=%d box=%q err=%v\n", body.SessionID, body.BoxNumber, err)
			return shared.Err(c, fiber.StatusNotFound, "Box not in packing list")
		}

		// 2. Count items
		var itemCount int
		err = tx.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_lines WHERE grn_carton_id=$1`, cartonID).Scan(&itemCount)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Get total boxes and index for progress display
		var totalBoxes, boxesReceived int
		_ = tx.QueryRow(c.Context(), `
			SELECT boxes_total, boxes_received FROM grn_sessions WHERE id=$1`, body.SessionID).
			Scan(&totalBoxes, &boxesReceived)

		var boxIndex int
		_ = tx.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_cartons WHERE grn_session_id=$1 AND carton_no <= $2`,
			body.SessionID, body.BoxNumber,
		).Scan(&boxIndex)

		// 3. Auto-complete single-item carton
		if itemCount == 1 && body.AutoCompleteSingle {
			var lineID int
			var partCode, partName string
			var expectedQty float64
			err = tx.QueryRow(c.Context(), `
				SELECT id, item_code, COALESCE(part_name, ''), expected_qty
				FROM grn_lines WHERE grn_carton_id=$1`, cartonID).Scan(&lineID, &partCode, &partName, &expectedQty)
			if err == nil {
				// Mark line verified
				_, err = tx.Exec(c.Context(), `
					UPDATE grn_lines SET
						scanned_qty = expected_qty,
						status = 'full_match',
						route_location = $2,
						routed_at = NOW()
					WHERE id = $1`, lineID, body.DefaultRoute)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}

				// Mark carton verified
				_, err = tx.Exec(c.Context(), `
					UPDATE grn_cartons SET
						status = 'verified',
						scanned_at = NOW(),
						scanned_by = $2
					WHERE id = $1`, cartonID, userID(c))
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}

				// Log event
				payloadBytes, _ := json.Marshal(map[string]any{
					"box_number":     body.BoxNumber,
					"item_code":      partCode,
					"qty":            expectedQty,
					"route_location": body.DefaultRoute,
				})
				payload := string(payloadBytes)
				_, _ = tx.Exec(c.Context(), `
					INSERT INTO grn_events (grn_session_id, event_type, box_no, part_no, quantity, actor_id, device, payload)
					VALUES ($1, 'BOX_VERIFIED', $2, $3, $4, $5, $6, $7::jsonb)`,
					body.SessionID, body.BoxNumber, partCode, expectedQty, userID(c), requestDevice(c), payload,
				)

				// Update boxes_received on session
				if status != "verified" && status != "received" {
					boxesReceived++
					_, _ = tx.Exec(c.Context(), `
						UPDATE grn_sessions SET boxes_received = boxes_received + 1 WHERE id = $1`, body.SessionID)
				}

				if err = tx.Commit(c.Context()); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}

				progressPct := 0
				if totalBoxes > 0 {
					progressPct = int(math.Round(float64(boxesReceived) / float64(totalBoxes) * 100))
				}

				msg := fmt.Sprintf("✅ %s: %s × %.0f → %s",
					body.BoxNumber[strings.LastIndex(body.BoxNumber, "-")+1:],
					partName, expectedQty, body.DefaultRoute,
				)

				return shared.OK(c, fiber.Map{
					"box_number":     body.BoxNumber,
					"box_type":       boxType,
					"box_index":      boxIndex,
					"total_boxes":    totalBoxes,
					"auto_completed": true,
					"item_summary": []fiber.Map{
						{
							"part_code":      partCode,
							"part_name":      partName,
							"expected_qty":   expectedQty,
							"scanned_qty":    expectedQty,
							"status":         "full_match",
							"route_location": body.DefaultRoute,
						},
					},
					"box_status": "verified",
					"delivery_progress": fiber.Map{
						"boxes_received": boxesReceived,
						"boxes_total":    totalBoxes,
						"progress_pct":   progressPct,
					},
					"next_action": "scan_next_box",
					"message":     msg,
				})
			}
		}

		// Otherwise: multi-item box or auto_complete_single is false
		// Update box to received
		_, err = tx.Exec(c.Context(), `
			UPDATE grn_cartons SET
				status = 'received',
				scanned_at = NOW(),
				scanned_by = $2
			WHERE id = $1`, cartonID, userID(c))
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Fetch items list
		rows, err := tx.Query(c.Context(), `
			SELECT item_code, COALESCE(part_name, ''), expected_qty, scanned_qty, status
			FROM grn_lines WHERE grn_carton_id=$1`, cartonID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type itemSummary struct {
			PartCode    string  `json:"part_code"`
			PartName    string  `json:"part_name"`
			ExpectedQty float64 `json:"expected_qty"`
			ScannedQty  float64 `json:"scanned_qty"`
			Status      string  `json:"status"`
		}

		var items []itemSummary
		for rows.Next() {
			var it itemSummary
			_ = rows.Scan(&it.PartCode, &it.PartName, &it.ExpectedQty, &it.ScannedQty, &it.Status)
			items = append(items, it)
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{
			"box_number":     body.BoxNumber,
			"box_type":       boxType,
			"box_index":      boxIndex,
			"total_boxes":    totalBoxes,
			"auto_completed": false,
			"item_count":     itemCount,
			"items":          items,
			"next_action":    "scan_items",
			"message":        fmt.Sprintf("📦 %s: %d items to verify — scan item QR codes", body.BoxNumber, itemCount),
		})
	}
}

func scanItemHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID int    `json:"session_id"`
			BoxNumber string `json:"box_number"`
			QRRaw     string `json:"qr_raw"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SessionID == 0 || body.BoxNumber == "" || body.QRRaw == "" {
			return shared.Err(c, fiber.StatusBadRequest, "session_id, box_number, and qr_raw are required")
		}

		// 1. Parse QR code using shared parser
		qr, ok := shared.ParsePackedItemQRDetails(body.QRRaw)
		var itemCode string
		var qty, unitPrice float64
		if ok {
			itemCode = qr.Item
			qty = qr.Qty
			unitPrice = qr.UnitPrice
		} else {
			// Fallback: treat raw string as item code with qty 1
			itemCode = strings.TrimSpace(body.QRRaw)
			qty = 1
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var sessStatus string
		err = tx.QueryRow(c.Context(),
			`SELECT status FROM grn_sessions WHERE id=$1 FOR UPDATE`, body.SessionID).Scan(&sessStatus)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		st := strings.ToLower(sessStatus)
		if st == "closed" || st == "completed" {
			return shared.Err(c, fiber.StatusBadRequest, "session already closed")
		}

		// Find carton
		var cartonID int
		err = tx.QueryRow(c.Context(), `
			SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2 FOR UPDATE`,
			body.SessionID, body.BoxNumber,
		).Scan(&cartonID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "Box not found")
		}

		// 2. Find matching line
		var lineID int
		var expectedQty, scannedQty float64
		var currentStatus string
		var actualItemCode string

		err = tx.QueryRow(c.Context(), `
			SELECT id, expected_qty, scanned_qty, status, item_code
			FROM grn_lines
			WHERE grn_carton_id=$1 AND (item_code=$2 OR supplier_sku=$2)
			ORDER BY CASE WHEN status IN ('pending','shortage') THEN 0 ELSE 1 END, id
			LIMIT 1
			FOR UPDATE`,
			cartonID, itemCode,
		).Scan(&lineID, &expectedQty, &scannedQty, &currentStatus, &actualItemCode)

		// Try case-insensitive fallback if not found
		if err != nil {
			err = tx.QueryRow(c.Context(), `
				SELECT id, expected_qty, scanned_qty, status, item_code
				FROM grn_lines
				WHERE grn_carton_id=$1 AND (LOWER(item_code)=LOWER($2) OR LOWER(supplier_sku)=LOWER($2))
				ORDER BY CASE WHEN status IN ('pending','shortage') THEN 0 ELSE 1 END, id
				LIMIT 1
				FOR UPDATE`,
				cartonID, itemCode,
			).Scan(&lineID, &expectedQty, &scannedQty, &currentStatus, &actualItemCode)
		}

		// Try full raw QR string as itemCode fallback if not found
		if err != nil {
			err = tx.QueryRow(c.Context(), `
				SELECT id, expected_qty, scanned_qty, status, item_code
				FROM grn_lines
				WHERE grn_carton_id=$1 AND (item_code=$2 OR supplier_sku=$2)
				ORDER BY CASE WHEN status IN ('pending','shortage') THEN 0 ELSE 1 END, id
				LIMIT 1
				FOR UPDATE`,
				cartonID, body.QRRaw,
			).Scan(&lineID, &expectedQty, &scannedQty, &currentStatus, &actualItemCode)
			if err == nil {
				itemCode = body.QRRaw
			}
		}

		if err != nil {
			_, _ = tx.Exec(c.Context(), `
				INSERT INTO grn_exceptions (grn_session_id, exception_type, box_no, part_no, expected_qty, scanned_qty, variance, status)
				VALUES ($1, 'unknown_item', $2, $3, 0, $4, $4, 'open')`,
				body.SessionID, body.BoxNumber, itemCode, qty,
			)
			_ = tx.Commit(c.Context())
			return shared.Err(c, fiber.StatusNotFound, "Item not in this box")
		}

		// Item master completeness check
		exists, complete, _ := shared.ItemMasterComplete(c.Context(), db, actualItemCode)
		if !exists || !complete {
			return shared.Err(c, fiber.StatusConflict, "item master incomplete — complete required fields before receiving")
		}

		// Over-receipt tolerance check
		newScanned := scannedQty + qty
		if orErr := CheckOverReceipt(c.Context(), db, body.SessionID, actualItemCode, expectedQty, newScanned); orErr != nil {
			return shared.Err(c, fiber.StatusBadRequest, orErr.Error())
		}

		// Status classification
		status := "pending"
		if newScanned == expectedQty {
			status = "full_match"
		} else if newScanned < expectedQty {
			status = "shortage"
		} else {
			status = "excess"
		}

		// Keep unit_price updated if valid
		var updateErr error
		if unitPrice > 0 {
			_, updateErr = tx.Exec(c.Context(), `
				UPDATE grn_lines SET
					scanned_qty = $2,
					status = $3,
					unit_price = $4
				WHERE id = $1`, lineID, newScanned, status, unitPrice)
		} else {
			_, updateErr = tx.Exec(c.Context(), `
				UPDATE grn_lines SET
					scanned_qty = $2,
					status = $3
				WHERE id = $1`, lineID, newScanned, status)
		}
		if updateErr != nil {
			return shared.Err(c, fiber.StatusInternalServerError, updateErr.Error())
		}

		// Log Scan Event
		_, _ = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, box_no, part_no, quantity, actor_id, device)
			VALUES ($1, 'ITEM_SCANNED', $2, $3, $4, $5, $6)`,
			body.SessionID, body.BoxNumber, actualItemCode, qty, userID(c), requestDevice(c),
		)

		// Get updated box stats
		var itemsTotal, itemsScanned int
		_ = tx.QueryRow(c.Context(), `SELECT COUNT(*) FROM grn_lines WHERE grn_carton_id=$1`, cartonID).Scan(&itemsTotal)
		_ = tx.QueryRow(c.Context(), `SELECT COUNT(*) FROM grn_lines WHERE grn_carton_id=$1 AND status='full_match'`, cartonID).Scan(&itemsScanned)

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		progressPct := 0
		if itemsTotal > 0 {
			progressPct = int(math.Round(float64(itemsScanned) / float64(itemsTotal) * 100))
		}

		msg := fmt.Sprintf("✓ %s — %.0f of %.0f received", actualItemCode, newScanned, expectedQty)
		nextAction := "scan_next_item"
		boxComplete := itemsTotal > 0 && itemsScanned == itemsTotal && status != "excess"
		if status == "excess" {
			msg = fmt.Sprintf("⚠ %s — %.0f scanned, only %.0f expected (%.0f excess)", actualItemCode, newScanned, expectedQty, newScanned-expectedQty)
			nextAction = "confirm_excess_or_scan_next"
		} else if boxComplete {
			msg = fmt.Sprintf("✓ %s — %.0f of %.0f received. Box complete", actualItemCode, newScanned, expectedQty)
			nextAction = "complete_box"
		}

		return shared.OK(c, fiber.Map{
			"parsed": fiber.Map{
				"item_code": actualItemCode,
				"qty":       qty,
				"price":     unitPrice,
			},
			"match": fiber.Map{
				"expected": expectedQty,
				"scanned":  newScanned,
				"status":   status,
				"message":  msg,
			},
			"box_progress": fiber.Map{
				"items_scanned": itemsScanned,
				"items_total":   itemsTotal,
				"progress_pct":  progressPct,
			},
			"box_complete": boxComplete,
			"next_action":  nextAction,
		})
	}
}

func completeBoxHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID    int    `json:"session_id"`
			BoxNumber    string `json:"box_number"`
			DefaultRoute string `json:"default_route"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SessionID == 0 || body.BoxNumber == "" {
			return shared.Err(c, fiber.StatusBadRequest, "session_id and box_number are required")
		}
		if body.DefaultRoute == "" {
			body.DefaultRoute = "INCOMING-01"
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var sessStatus string
		err = tx.QueryRow(c.Context(),
			`SELECT status FROM grn_sessions WHERE id=$1 FOR UPDATE`, body.SessionID).Scan(&sessStatus)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		st := strings.ToLower(sessStatus)
		if st == "closed" || st == "completed" {
			return shared.Err(c, fiber.StatusBadRequest, "session already closed")
		}

		// Find Carton
		var cartonID int
		var status string
		err = tx.QueryRow(c.Context(), `
			SELECT id, status FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2 FOR UPDATE`,
			body.SessionID, body.BoxNumber,
		).Scan(&cartonID, &status)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "Box not found")
		}

		// Idempotent: already verified — return success without re-processing
		if status == "verified" {
			_ = tx.Rollback(c.Context())
			return shared.OK(c, fiber.Map{
				"box_number": body.BoxNumber,
				"status":     "verified",
				"message":    "Box already verified",
			})
		}

		_, err = tx.Exec(c.Context(), `
			UPDATE grn_cartons SET status = 'verified', verified_at = NOW(), verified_by = $2 WHERE id = $1 AND status <> 'verified'`,
			cartonID, userID(c),
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		rows, err := tx.Query(c.Context(), `
			SELECT id, item_code, expected_qty, scanned_qty, status, route_location, invoice_no,
			       COALESCE(requires_qi, false) AS qi
			FROM grn_lines WHERE grn_carton_id = $1`, cartonID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		type lineSummary struct {
			ID            int     `json:"id"`
			PartCode      string  `json:"part_code"`
			Expected      float64 `json:"expected"`
			Scanned       float64 `json:"scanned"`
			Status        string  `json:"status"`
			RouteLocation string  `json:"route"`
			RequiresQI    bool    `json:"requires_qi"`
			InvoiceNo     string
		}

		type pendingExc struct {
			Type     string
			Invoice  string
			Part     string
			Expected float64
			Scanned  float64
			Variance float64
		}

		var lines []lineSummary
		var exceptions []pendingExc
		hasQI := false

		for rows.Next() {
			var l lineSummary
			var routeLoc sqlNullString
			var invoiceNo sqlNullString
			if err = rows.Scan(&l.ID, &l.PartCode, &l.Expected, &l.Scanned, &l.Status, &routeLoc, &invoiceNo, &l.RequiresQI); err != nil {
				continue
			}
			l.RouteLocation = routeLoc.String
			l.InvoiceNo = invoiceNo.String
			lines = append(lines, l)
			if l.RequiresQI {
				hasQI = true
			}
			if l.Scanned != l.Expected {
				excType := "excess"
				variance := l.Scanned - l.Expected
				if l.Scanned < l.Expected {
					excType = "shortage"
					variance = l.Expected - l.Scanned
				}
				exceptions = append(exceptions, pendingExc{
					Type: excType, Invoice: l.InvoiceNo, Part: l.PartCode,
					Expected: l.Expected, Scanned: l.Scanned, Variance: variance,
				})
			}
		}
		rows.Close()

		for _, e := range exceptions {
			if _, err = tx.Exec(c.Context(), `
				INSERT INTO grn_exceptions (
					grn_session_id, exception_type, invoice_no, box_no, part_no, expected_qty, scanned_qty, variance, status
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')`,
				body.SessionID, e.Type, e.Invoice, body.BoxNumber, e.Part, e.Expected, e.Scanned, e.Variance); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		for i := range lines {
			l := &lines[i]
			if l.RouteLocation == "" {
				if l.Status == "damage" {
					l.RouteLocation = "REJECT-01"
				} else if l.RequiresQI {
					l.RouteLocation = "QUALITY_INSPECTION-01"
				} else if hasQI && l.Status != "shortage" && l.Status != "excess" {
					l.RouteLocation = "QUALITY_INSPECTION-01"
				} else {
					l.RouteLocation = body.DefaultRoute
				}
			}
			if _, err = tx.Exec(c.Context(), `
				UPDATE grn_lines SET route_location = $2, routed_at = NOW() WHERE id = $1`,
				l.ID, l.RouteLocation); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		hasExceptions := len(exceptions) > 0
		exceptionCount := len(exceptions)

		// Increment boxes_received if not already verified
		var boxesReceived int
		if status != "verified" {
			_, _ = tx.Exec(c.Context(), `
				UPDATE grn_sessions SET boxes_received = boxes_received + 1 WHERE id = $1`, body.SessionID)
		}

		var totalBoxes int
		_ = tx.QueryRow(c.Context(), `
			SELECT boxes_total, boxes_received FROM grn_sessions WHERE id=$1`, body.SessionID).
			Scan(&totalBoxes, &boxesReceived)

		// Log session event
		_, _ = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, box_no, actor_id, device)
			VALUES ($1, 'BOX_VERIFIED', $2, $3, $4)`,
			body.SessionID, body.BoxNumber, userID(c), requestDevice(c),
		)

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		progressPct := 0
		if totalBoxes > 0 {
			progressPct = int(math.Round(float64(boxesReceived) / float64(totalBoxes) * 100))
		}

		return shared.OK(c, fiber.Map{
			"box_number":      body.BoxNumber,
			"status":          "verified",
			"box_route":       body.DefaultRoute,
			"items_summary":   lines,
			"has_exceptions":  hasExceptions,
			"exception_count": exceptionCount,
			"delivery_progress": fiber.Map{
				"boxes_received": boxesReceived,
				"boxes_total":    totalBoxes,
				"progress_pct":   progressPct,
			},
		})
	}
}

func routeExceptionHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID int `json:"session_id"`
			Routes    []struct {
				GRNLineID int    `json:"grn_line_id"`
				Location  string `json:"location"`
			} `json:"routes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Routes) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "routes are required")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		locationsMap := map[string]bool{}
		routedCount := 0

		for _, route := range body.Routes {
			if route.Location != "" {
				_, err = tx.Exec(c.Context(), `
					UPDATE grn_lines SET route_location = $2, routed_at = NOW() WHERE id = $1`,
					route.GRNLineID, route.Location,
				)
				if err == nil {
					routedCount++
					locationsMap[route.Location] = true
				}
			}
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var locs []string
		for loc := range locationsMap {
			locs = append(locs, loc)
		}

		return shared.OK(c, fiber.Map{
			"routed_count":   routedCount,
			"locations_used": locs,
		})
	}
}

func overrideRouteHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID int    `json:"session_id"`
			BoxNumber string `json:"box_number"`
			NewRoute  string `json:"new_route"`
			LineIDs   []int  `json:"line_ids"` // optional: override specific lines only
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SessionID == 0 || body.BoxNumber == "" || body.NewRoute == "" {
			return shared.Err(c, fiber.StatusBadRequest, "session_id, box_number, and new_route are required")
		}

		var cartonID int
		err := db.QueryRow(c.Context(), `
			SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`,
			body.SessionID, body.BoxNumber).Scan(&cartonID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "Box not found")
		}

		var affected int64
		if len(body.LineIDs) > 0 {
			tag, execErr := db.Exec(c.Context(), `
				UPDATE grn_lines SET route_location=$3, routed_at=NOW()
				WHERE grn_carton_id=$1 AND id=ANY($2)`, cartonID, body.LineIDs, body.NewRoute)
			if execErr != nil {
				return shared.Err(c, fiber.StatusInternalServerError, execErr.Error())
			}
			affected = tag.RowsAffected()
		} else {
			tag, execErr := db.Exec(c.Context(), `
				UPDATE grn_lines SET route_location=$3, routed_at=NOW()
				WHERE grn_carton_id=$1 AND route_location IS DISTINCT FROM $3`, cartonID, body.NewRoute)
			if execErr != nil {
				return shared.Err(c, fiber.StatusInternalServerError, execErr.Error())
			}
			affected = tag.RowsAffected()
		}

		writeEvent(db, c, body.SessionID, "ROUTE_OVERRIDE", fiber.Map{
			"box_no": body.BoxNumber, "new_route": body.NewRoute, "lines_affected": affected,
		})

		return shared.OK(c, fiber.Map{
			"box_number": body.BoxNumber, "new_route": body.NewRoute, "lines_affected": affected,
		})
	}
}

func listSessionExceptions(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, _ := strconv.Atoi(c.Query("session_id"))
		if sessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "session_id required")
		}

		rows, err := db.Query(c.Context(), `
			SELECT id, exception_type, box_no, part_no,
			       COALESCE(expected_qty,0), COALESCE(scanned_qty,0), COALESCE(variance,0),
			       status, COALESCE(resolution,''), COALESCE(created_at::text,'')
			FROM grn_exceptions WHERE grn_session_id=$1
			ORDER BY id DESC LIMIT 50`, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type excRow struct {
			ID         int     `json:"id"`
			Type       string  `json:"type"`
			BoxNo      string  `json:"box_no"`
			PartNo     string  `json:"part_no"`
			Expected   float64 `json:"expected_qty"`
			Scanned    float64 `json:"scanned_qty"`
			Variance   float64 `json:"variance"`
			Status     string  `json:"status"`
			Resolution string  `json:"resolution"`
			CreatedAt  string  `json:"created_at"`
		}

		var list []excRow
		for rows.Next() {
			var r excRow
			if err := rows.Scan(&r.ID, &r.Type, &r.BoxNo, &r.PartNo,
				&r.Expected, &r.Scanned, &r.Variance,
				&r.Status, &r.Resolution, &r.CreatedAt); err != nil {
				continue
			}
			list = append(list, r)
		}
		if list == nil {
			list = []excRow{}
		}
		return shared.OK(c, list)
	}
}

func getStatsHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, _ := strconv.Atoi(c.Query("session_id"))
		if sessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "session_id required")
		}

		var deliveryNo, sessionNo, poName string
		var boxesTotal, boxesReceived int
		var createdAt time.Time
		err := db.QueryRow(c.Context(), `
			SELECT COALESCE(delivery_no, ''), COALESCE(session_no, ''), COALESCE(boxes_total,0), COALESCE(boxes_received,0), created_at,
			       COALESCE(purchase_receipt_no, '')
			FROM grn_sessions WHERE id = $1`, sessionID,
		).Scan(&deliveryNo, &sessionNo, &boxesTotal, &boxesReceived, &createdAt, &poName)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		var cartonCount int
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM grn_cartons WHERE grn_session_id=$1`, sessionID).Scan(&cartonCount)
		if cartonCount > boxesTotal {
			boxesTotal = cartonCount
		}

		// Counts
		var singleItemCount, multiItemCount int
		_ = db.QueryRow(c.Context(), `
			SELECT 
				COUNT(CASE WHEN item_count = 1 THEN 1 END),
				COUNT(CASE WHEN item_count > 1 THEN 1 END)
			FROM (
				SELECT COUNT(l.id) as item_count
				FROM grn_cartons c
				LEFT JOIN grn_lines l ON l.grn_carton_id = c.id
				WHERE c.grn_session_id = $1
				GROUP BY c.id
			) box_counts`, sessionID,
		).Scan(&singleItemCount, &multiItemCount)

		// Item-level counts
		var itemsCount, itemsFullMatch, itemsShortage, itemsExcess, itemsUnknown int
		var totalQtyExpected, totalQtyScanned float64

		_ = db.QueryRow(c.Context(), `
			SELECT 
				COUNT(*),
				COUNT(CASE WHEN status = 'full_match' THEN 1 END),
				COUNT(CASE WHEN status = 'shortage' THEN 1 END),
				COUNT(CASE WHEN status = 'excess' THEN 1 END),
				COUNT(CASE WHEN status = 'unknown' THEN 1 END),
				COALESCE(SUM(expected_qty), 0),
				COALESCE(SUM(scanned_qty), 0)
			FROM grn_lines
			WHERE grn_session_id = $1`, sessionID,
		).Scan(&itemsCount, &itemsFullMatch, &itemsShortage, &itemsExcess, &itemsUnknown, &totalQtyExpected, &totalQtyScanned)

		var exceptionsOpen int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_exceptions WHERE grn_session_id = $1 AND status = 'open'`, sessionID,
		).Scan(&exceptionsOpen)

		elapsedSec := int(time.Since(createdAt).Seconds())
		estRemainingSec := 0
		if boxesReceived > 0 && boxesTotal > boxesReceived {
			rate := float64(elapsedSec) / float64(boxesReceived)
			estRemainingSec = int(rate * float64(boxesTotal-boxesReceived))
		}

		progressPct := 0
		if boxesTotal > 0 {
			progressPct = int(math.Round(float64(boxesReceived) / float64(boxesTotal) * 100))
		}

		return shared.OK(c, fiber.Map{
			"session_id":           sessionID,
			"session_no":           sessionNo,
			"delivery_no":          deliveryNo,
			"total_boxes":          boxesTotal,
			"boxes_received":       boxesReceived,
			"single_item_boxes":    singleItemCount,
			"multi_item_boxes":     multiItemCount,
			"overall_progress_pct": progressPct,
			"total_items":          itemsCount,
			"items_full_match":     itemsFullMatch,
			"items_shortage":       itemsShortage,
			"items_excess":         itemsExcess,
			"items_unknown":        itemsUnknown,
			"total_qty_expected":   totalQtyExpected,
			"total_qty_scanned":    totalQtyScanned,
			"exceptions_open":      exceptionsOpen,
			"elapsed_time_sec":     elapsedSec,
			"est_remaining_sec":    estRemainingSec,
			"po_name":              poName,
		})
	}
}

// sqlNullString helper for standard SQL conversions
type sqlNullString struct {
	String string
	Valid  bool
}

func (s *sqlNullString) Scan(value any) error {
	if value == nil {
		s.String, s.Valid = "", false
		return nil
	}
	s.Valid = true
	switch v := value.(type) {
	case string:
		s.String = v
	case []byte:
		s.String = string(v)
	default:
		s.String = fmt.Sprint(v)
	}
	return nil
}
