package grn

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RegisterRFScan registers /api/receiving scan routes
func RegisterRFScan(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/scan-box", scanBoxHandler(db))
	r.Post("/confirm-box", confirmBoxHandler(db))
	r.Post("/sign-off-boxes", signOffBoxesHandler(db))
	r.Post("/scan-item", scanItemHandler(db))
	r.Post("/complete-box", completeBoxHandler(db))
	r.Post("/route-exception", routeExceptionHandler(db))
	r.Post("/override-route", overrideRouteHandler(db))
	r.Get("/stats", getStatsHandler(db))
	r.Get("/exceptions", listSessionExceptions(db))
}

type rfItemSummary struct {
	PartCode    string  `json:"part_code"`
	PartName    string  `json:"part_name"`
	ExpectedQty float64 `json:"expected_qty"`
	ScannedQty  float64 `json:"scanned_qty"`
	Status      string  `json:"status"`
}

func rfPhaseFromStatus(sessionStatus, requested string) string {
	req := strings.ToLower(strings.TrimSpace(requested))
	if req == "item_verify" || req == "box_verify" {
		return req
	}
	switch canonicalStatus(sessionStatus) {
	case "item_verification", "item_verification_complete", "exception_pending":
		return "item_verify"
	default:
		return "box_verify"
	}
}

func scanBoxHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID          int    `json:"session_id"`
			BoxNumber          string `json:"box_number"`
			AutoCompleteSingle bool   `json:"auto_complete_single"`
			DefaultRoute       string `json:"default_route"`
			Phase              string `json:"phase"`
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
		var boxType, status, deliveryNo, dealerName, plant, condition string
		err = tx.QueryRow(c.Context(), `
			SELECT id, COALESCE(box_type,''), status, COALESCE(delivery_no,''),
			       COALESCE(dealer_name,''), COALESCE(plant,''), COALESCE(condition,'ok')
			FROM grn_cartons
			WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))`,
			body.SessionID, strings.TrimSpace(body.BoxNumber),
		).Scan(&cartonID, &boxType, &status, &deliveryNo, &dealerName, &plant, &condition)
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

		// Lookup only — physical accept happens in confirm-box after the operator
		// answers OK vs damaged. Do not mark received here or a dismissed popup
		// would count the box as accepted.
		rows, err := tx.Query(c.Context(), `
			SELECT item_code, COALESCE(part_name, ''), expected_qty, scanned_qty, status
			FROM grn_lines WHERE grn_carton_id=$1`, cartonID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		var items []rfItemSummary
		for rows.Next() {
			var it rfItemSummary
			_ = rows.Scan(&it.PartCode, &it.PartName, &it.ExpectedQty, &it.ScannedQty, &it.Status)
			items = append(items, it)
		}
		rows.Close()
		if items == nil {
			items = []rfItemSummary{}
		}

		var sessStatus string
		_ = tx.QueryRow(c.Context(), `SELECT COALESCE(status,'') FROM grn_sessions WHERE id=$1`, body.SessionID).Scan(&sessStatus)
		phase := rfPhaseFromStatus(sessStatus, body.Phase)
		already := isDuplicateBoxStatus(status)

		next := "confirm_condition"
		msg := fmt.Sprintf("%s — confirm if the box is fine", body.BoxNumber)
		if status == "verified" {
			next = "already_verified"
			msg = fmt.Sprintf("%s already item-verified", body.BoxNumber)
		} else if already && phase == "item_verify" {
			next = "scan_items"
			msg = fmt.Sprintf("%s: %d items to verify — scan item QR codes", body.BoxNumber, itemCount)
		} else if already {
			next = "already_scanned"
			msg = fmt.Sprintf("%s already counted at the dock", body.BoxNumber)
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
			"box_status":     status,
			"condition":      condition,
			"duplicate":      already,
			"phase":          phase,
			"next_action":    next,
			"message":        msg,
		})
	}
}

func confirmBoxHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID int    `json:"session_id"`
			BoxNumber string `json:"box_number"`
			Condition string `json:"condition"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SessionID == 0 || strings.TrimSpace(body.BoxNumber) == "" {
			return shared.Err(c, fiber.StatusBadRequest, "session_id and box_number are required")
		}
		condition := normalizeBoxCondition(body.Condition)
		damaged := isDamagedCondition(condition)

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
		if !sessionWritable(sessStatus) {
			return shared.Err(c, fiber.StatusBadRequest, "session is closed")
		}

		var cartonID int
		var status string
		err = tx.QueryRow(c.Context(), `
			SELECT id, status FROM grn_cartons
			WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))
			FOR UPDATE`,
			body.SessionID, strings.TrimSpace(body.BoxNumber),
		).Scan(&cartonID, &status)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "Box not in packing list")
		}
		if status == "verified" {
			items, _ := loadCartonItemsTx(c.Context(), tx, cartonID)
			_ = tx.Rollback(c.Context())
			return shared.OK(c, fiber.Map{
				"box_number":  body.BoxNumber,
				"box_status":  "verified",
				"condition":   condition,
				"items":       items,
				"item_count":  len(items),
				"next_action": "already_verified",
				"message":     "Box already item-verified",
			})
		}

		uid := nullableUserID(c)
		_, err = tx.Exec(c.Context(), `
			UPDATE grn_cartons SET
				status = 'received',
				condition = $2,
				scanned_at = NOW(),
				scanned_by = $3
			WHERE id = $1`, cartonID, condition, uid)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		eventType := "BOX_RECEIVED"
		result := "received"
		if damaged {
			eventType = "BOX_DAMAGE_REPORTED"
			result = "damage"
		}
		payloadBytes, _ := json.Marshal(map[string]any{"condition": condition, "result": result})
		_, err = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, box_no, actor_id, device, payload)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
			body.SessionID, eventType, strings.TrimSpace(body.BoxNumber), uid, requestDevice(c), string(payloadBytes),
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to log box confirm: "+err.Error())
		}

		received, verified, cartonTotal, syncErr := syncSessionBoxCounts(c.Context(), tx, body.SessionID)
		if syncErr != nil {
			return shared.Err(c, fiber.StatusInternalServerError, syncErr.Error())
		}

		items, err := loadCartonItemsTx(c.Context(), tx, cartonID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var cartonNo string
		_ = tx.QueryRow(c.Context(), `SELECT carton_no FROM grn_cartons WHERE id=$1`, cartonID).Scan(&cartonNo)
		if cartonNo == "" {
			cartonNo = strings.TrimSpace(body.BoxNumber)
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if damaged {
			writeException(db, c, body.SessionID, "damage", fiber.Map{"box_no": cartonNo})
		}

		next := "scan_next_box"
		msg := fmt.Sprintf("%s accepted — scan the next box", cartonNo)
		if damaged {
			next = "scan_items"
			msg = fmt.Sprintf("%s damaged — scan items now", cartonNo)
		}

		progressPct := 0
		if cartonTotal > 0 {
			progressPct = int(math.Round(float64(received) / float64(cartonTotal) * 100))
		}

		return shared.OK(c, fiber.Map{
			"box_number":  cartonNo,
			"box_status":  "received",
			"condition":   condition,
			"damaged":     damaged,
			"items":       items,
			"item_count":  len(items),
			"next_action": next,
			"message":     msg,
			"delivery_progress": fiber.Map{
				"boxes_received": received,
				"boxes_verified": verified,
				"boxes_total":    cartonTotal,
				"progress_pct":   progressPct,
			},
		})
	}
}

func signOffBoxesHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			SessionID int `json:"session_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.SessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "session_id is required")
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
		if !sessionWritable(sessStatus) {
			return shared.Err(c, fiber.StatusBadRequest, "session is closed")
		}

		received, verified, cartonTotal, syncErr := syncSessionBoxCounts(c.Context(), tx, body.SessionID)
		if syncErr != nil {
			return shared.Err(c, fiber.StatusInternalServerError, syncErr.Error())
		}
		if received < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "scan at least one box before signing off the transporter")
		}

		missing := cartonTotal - received
		if missing < 0 {
			missing = 0
		}

		_, err = tx.Exec(c.Context(), `
			UPDATE grn_sessions SET status='item_verification', updated_at=NOW() WHERE id=$1`, body.SessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		payload := fmt.Sprintf(`{"boxes_received":%d,"boxes_total":%d,"missing":%d}`, received, cartonTotal, missing)
		_, err = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, actor_id, device, payload)
			VALUES ($1, 'TRANSPORT_SIGNED', $2, $3, $4::jsonb)`,
			body.SessionID, nullableUserID(c), requestDevice(c), payload)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to log sign-off: "+err.Error())
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		msg := fmt.Sprintf("Transporter signed off — %d of %d boxes received", received, cartonTotal)
		if missing > 0 {
			msg = fmt.Sprintf("Transporter signed off — %d boxes missing. Continue with item verification.", missing)
		}

		return shared.OK(c, fiber.Map{
			"session_id":     body.SessionID,
			"status":         "item_verification",
			"phase":          "item_verify",
			"boxes_received": received,
			"boxes_verified": verified,
			"boxes_total":    cartonTotal,
			"missing":        missing,
			"message":        msg,
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
		var cartonNo, cartonCond string
		err = tx.QueryRow(c.Context(), `
			SELECT id, carton_no, COALESCE(condition,'ok')
			FROM grn_cartons
			WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))
			FOR UPDATE`,
			body.SessionID, body.BoxNumber,
		).Scan(&cartonID, &cartonNo, &cartonCond)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "Box not found")
		}
		body.BoxNumber = cartonNo
		damagedBox := isDamagedCondition(cartonCond)

		// 2. Find matching line (trim/case, packed QR prefix, raw QR)
		lineID, expectedQty, scannedQty, _, actualItemCode, err := findCartonLine(c.Context(), tx, cartonID, itemCode, body.QRRaw)

		if err != nil {
			_, _ = tx.Exec(c.Context(), `
				INSERT INTO grn_exceptions (grn_session_id, exception_type, box_no, part_no, expected_qty, scanned_qty, variance, status)
				VALUES ($1, 'unknown_item', $2, $3, 0, $4, $4, 'open')`,
				body.SessionID, body.BoxNumber, itemCode, qty,
			)
			_ = tx.Commit(c.Context())
			return shared.Err(c, fiber.StatusNotFound, "Item not in this box")
		}

		// Item master completeness: block normal receiving, allow damaged-box inspection.
		exists, complete, _ := shared.ItemMasterComplete(c.Context(), db, actualItemCode)
		if (!exists || !complete) && !damagedBox {
			return shared.Err(c, fiber.StatusConflict, "item master incomplete — complete required fields before receiving")
		}

		// Over-receipt tolerance check (allow excess on damaged inspection)
		newScanned := scannedQty + qty
		if !damagedBox {
			if orErr := CheckOverReceipt(c.Context(), db, body.SessionID, actualItemCode, expectedQty, newScanned); orErr != nil {
				return shared.Err(c, fiber.StatusBadRequest, orErr.Error())
			}
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
		_, err = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, box_no, part_no, quantity, actor_id, device)
			VALUES ($1, 'ITEM_SCANNED', $2, $3, $4, $5, $6)`,
			body.SessionID, body.BoxNumber, actualItemCode, qty, nullableUserID(c), requestDevice(c),
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to log item scan: "+err.Error())
		}

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
			SELECT id, status FROM grn_cartons
			WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))
			FOR UPDATE`,
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
			cartonID, nullableUserID(c),
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

		boxesReceived, boxesVerified, totalBoxes, syncErr := syncSessionBoxCounts(c.Context(), tx, body.SessionID)
		if syncErr != nil {
			return shared.Err(c, fiber.StatusInternalServerError, syncErr.Error())
		}

		// Log session event
		_, err = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, box_no, actor_id, device)
			VALUES ($1, 'BOX_VERIFIED', $2, $3, $4)`,
			body.SessionID, body.BoxNumber, nullableUserID(c), requestDevice(c),
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to log box verify: "+err.Error())
		}

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		progressPct := 0
		if totalBoxes > 0 {
			progressPct = int(math.Round(float64(boxesVerified) / float64(totalBoxes) * 100))
		}
		allVerified := totalBoxes > 0 && boxesVerified >= totalBoxes

		return shared.OK(c, fiber.Map{
			"box_number":      body.BoxNumber,
			"status":          "verified",
			"box_route":       body.DefaultRoute,
			"items_summary":   lines,
			"has_exceptions":  hasExceptions,
			"exception_count": exceptionCount,
			"all_verified":    allVerified,
			"delivery_progress": fiber.Map{
				"boxes_received": boxesReceived,
				"boxes_verified": boxesVerified,
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
			SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))`,
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

		var deliveryNo, sessionNo, poName, packingListNo, packingListFile, sessStatus string
		var boxesTotal, boxesReceived int
		var createdAt time.Time
		err := db.QueryRow(c.Context(), `
			SELECT COALESCE(delivery_no, ''), COALESCE(session_no, ''), COALESCE(boxes_total,0), COALESCE(boxes_received,0), created_at,
			       COALESCE(purchase_receipt_no, ''), COALESCE(packing_list_no, ''), COALESCE(packing_list_filename, ''), COALESCE(status, '')
			FROM grn_sessions WHERE id = $1`, sessionID,
		).Scan(&deliveryNo, &sessionNo, &boxesTotal, &boxesReceived, &createdAt, &poName, &packingListNo, &packingListFile, &sessStatus)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		var cartonCount, boxesVerified, boxesDamaged int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*),
			       COUNT(*) FILTER (WHERE status IN ('received','verified','accounted','exception')),
			       COUNT(*) FILTER (WHERE status = 'verified'),
			       COUNT(*) FILTER (WHERE COALESCE(condition,'ok') IN ('damaged','wet','crushed'))
			FROM grn_cartons WHERE grn_session_id=$1`, sessionID,
		).Scan(&cartonCount, &boxesReceived, &boxesVerified, &boxesDamaged)
		if cartonCount > boxesTotal {
			boxesTotal = cartonCount
		}

		phase := rfPhaseFromStatus(sessStatus, "")

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
		boxProgressPct := 0
		itemProgressPct := 0
		if boxesTotal > 0 {
			boxProgressPct = int(math.Round(float64(boxesReceived) / float64(boxesTotal) * 100))
			itemProgressPct = int(math.Round(float64(boxesVerified) / float64(boxesTotal) * 100))
			if phase == "item_verify" {
				progressPct = itemProgressPct
			} else {
				progressPct = boxProgressPct
			}
		}

		return shared.OK(c, fiber.Map{
			"session_id":            sessionID,
			"session_no":            sessionNo,
			"session_status":        canonicalStatus(sessStatus),
			"phase":                 phase,
			"delivery_no":           deliveryNo,
			"total_boxes":           boxesTotal,
			"boxes_received":        boxesReceived,
			"boxes_verified":        boxesVerified,
			"boxes_damaged":         boxesDamaged,
			"single_item_boxes":     singleItemCount,
			"multi_item_boxes":      multiItemCount,
			"overall_progress_pct":  progressPct,
			"box_progress_pct":      boxProgressPct,
			"item_progress_pct":     itemProgressPct,
			"total_items":           itemsCount,
			"items_full_match":      itemsFullMatch,
			"items_shortage":        itemsShortage,
			"items_excess":          itemsExcess,
			"items_unknown":         itemsUnknown,
			"total_qty_expected":    totalQtyExpected,
			"total_qty_scanned":     totalQtyScanned,
			"exceptions_open":       exceptionsOpen,
			"elapsed_time_sec":      elapsedSec,
			"est_remaining_sec":     estRemainingSec,
			"po_name":               poName,
			"packing_list_no":       packingListNo,
			"packing_list_filename": packingListFile,
		})
	}
}

func findCartonLine(ctx context.Context, tx pgx.Tx, cartonID int, itemCode, qrRaw string) (id int, expected, scanned float64, status, code string, err error) {
	code = strings.TrimSpace(itemCode)
	raw := strings.TrimSpace(qrRaw)
	scanLine := func(cond string, arg string) error {
		return tx.QueryRow(ctx, `
			SELECT id, expected_qty, scanned_qty, status, item_code
			FROM grn_lines
			WHERE grn_carton_id=$1 AND (`+cond+`)
			ORDER BY CASE WHEN status IN ('pending','shortage') THEN 0 ELSE 1 END, id
			LIMIT 1
			FOR UPDATE`, cartonID, arg).Scan(&id, &expected, &scanned, &status, &code)
	}
	err = scanLine(`item_code=$2 OR supplier_sku=$2`, code)
	if err == nil {
		return
	}
	err = scanLine(`lower(btrim(item_code))=lower(btrim($2)) OR lower(btrim(COALESCE(supplier_sku,'')))=lower(btrim($2))`, code)
	if err == nil {
		return
	}
	if raw != "" && raw != code {
		err = scanLine(`item_code=$2 OR supplier_sku=$2`, raw)
		if err == nil {
			return
		}
		err = scanLine(`lower(btrim(item_code))=lower(btrim($2)) OR lower(btrim(COALESCE(supplier_sku,'')))=lower(btrim($2))`, raw)
		if err == nil {
			return
		}
	}
	if raw != "" {
		err = scanLine(`lower(btrim($2)) LIKE lower(btrim(item_code)) || '-%'`, raw)
	}
	return
}

func loadCartonItemsTx(ctx context.Context, tx pgx.Tx, cartonID int) ([]rfItemSummary, error) {
	rows, err := tx.Query(ctx, `
		SELECT item_code, COALESCE(part_name, ''), expected_qty, scanned_qty, status
		FROM grn_lines WHERE grn_carton_id=$1`, cartonID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []rfItemSummary
	for rows.Next() {
		var it rfItemSummary
		if err := rows.Scan(&it.PartCode, &it.PartName, &it.ExpectedQty, &it.ScannedQty, &it.Status); err != nil {
			continue
		}
		items = append(items, it)
	}
	if items == nil {
		items = []rfItemSummary{}
	}
	return items, nil
}

func syncSessionBoxCounts(ctx context.Context, tx pgx.Tx, sessionID int) (received, verified, total int, err error) {
	err = tx.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE status IN ('received','verified','accounted','exception')),
			COUNT(*) FILTER (WHERE status = 'verified'),
			COUNT(*)
		FROM grn_cartons WHERE grn_session_id=$1`, sessionID).Scan(&received, &verified, &total)
	if err != nil {
		return 0, 0, 0, err
	}
	var sessionTotal int
	_ = tx.QueryRow(ctx, `SELECT COALESCE(boxes_total,0) FROM grn_sessions WHERE id=$1`, sessionID).Scan(&sessionTotal)
	if sessionTotal > total {
		total = sessionTotal
	}
	_, _ = tx.Exec(ctx, `UPDATE grn_sessions SET boxes_received=$2 WHERE id=$1`, sessionID, received)
	return received, verified, total, nil
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
