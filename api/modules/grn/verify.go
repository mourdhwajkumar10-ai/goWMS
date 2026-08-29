package grn

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerVerifyRoutes(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/session/:id/pod", attachPOD(db))
	r.Post("/session/:id/open-box", openBoxForVerify(db))
	r.Get("/session/:id/active-box", activeBoxContents(db))
	r.Post("/session/:id/verify-item", verifyItemScan(db))
	r.Patch("/session/:id/line/:lineId", patchVerifyLine(db))
	r.Post("/session/:id/undo-item", undoLastItemScan(db))
	r.Post("/session/:id/undo-box", undoLastBoxHandler(db))
	r.Post("/session/:id/close-box", forceCloseBox(db))
	r.Post("/session/:id/discrepancy", reportDiscrepancy(db))
	r.Post("/exceptions/:id/resolve", resolveException(db))
	r.Post("/session/:id/audit/start", startAudit(db))
	r.Get("/session/:id/audits", listAudits(db))
	r.Post("/audit-items/:id/check", checkAuditItem(db))
	r.Post("/session/:id/audit/:auditId/complete", completeAudit(db))
	r.Post("/session/:id/follow-up", createFollowUp(db))
	r.Get("/session/:id/follow-ups", listFollowUps(db))
	r.Post("/session/:id/presence", pingPresence(db))
	r.Get("/session/:id/presence", listPresence(db))
}

func attachPOD(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			AttachmentID int `json:"attachment_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.AttachmentID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "attachment_id required — upload via /attachments first")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE grn_sessions SET pod_attachment_id=$2, pod_captured_at=now(), pod_captured_by=$3, updated_at=now()
			WHERE id=$1`, id, body.AttachmentID, userID(c))
		if err != nil {
			tag, err = db.Exec(c.Context(), `
				UPDATE grn_sessions SET pod_attachment_id=$2, updated_at=now() WHERE id=$1`, id, body.AttachmentID)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		summary := snapshotBoxCounts(db, c, id)
		if b, err := json.Marshal(summary); err == nil {
			_, _ = db.Exec(c.Context(), `UPDATE grn_sessions SET pod_box_summary=$2::jsonb WHERE id=$1`, id, string(b))
		}
		writeEvent(db, c, id, "POD_CAPTURED", fiber.Map{
			"payload": fiber.Map{"attachment_id": body.AttachmentID, "box_summary": summary},
		})
		return shared.OK(c, fiber.Map{"id": id, "pod_attachment_id": body.AttachmentID, "box_summary": summary})
	}
}

func openBoxForVerify(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			CartonNo string `json:"carton_no"`
			CartonID int    `json:"carton_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		cartonNo := shared.CanonicalBoxNo(body.CartonNo)
		if cartonNo == "" {
			cartonNo = strings.TrimSpace(body.CartonNo)
		}
		var cartonID int
		var status, cNo string
		if body.CartonID > 0 {
			err = db.QueryRow(c.Context(), `
				SELECT id, carton_no, status FROM grn_cartons WHERE id=$1 AND grn_session_id=$2`,
				body.CartonID, sessionID).Scan(&cartonID, &cNo, &status)
		} else if cartonNo != "" {
			// Try canonical first, then regex fallbacks
			candidates := shared.ExtractBoxCandidates(body.CartonNo)
			// Ensure canonical is first
			if len(candidates) == 0 {
				candidates = []string{cartonNo}
			}
			var found bool
			for _, cand := range candidates {
				err = db.QueryRow(c.Context(), `
					SELECT id, carton_no, status FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`,
					sessionID, cand).Scan(&cartonID, &cNo, &status)
				if err == nil {
					found = true
					break
				}
				// Also try UPPER match for case-insensitive (DB may have lowercase)
				err = db.QueryRow(c.Context(), `
					SELECT id, carton_no, status FROM grn_cartons WHERE grn_session_id=$1 AND UPPER(carton_no)=UPPER($2)`,
					sessionID, cand).Scan(&cartonID, &cNo, &status)
				if err == nil {
					found = true
					break
				}
			}
			if !found {
				err = pgx.ErrNoRows
			}
		} else {
			return shared.Err(c, fiber.StatusBadRequest, "carton_no or carton_id required")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "box not found on this GRN")
		}
		st := strings.ToLower(status)
		if st == "missing" || st == "expected" || st == "pending" {
			return shared.Err(c, fiber.StatusBadRequest, "box not received yet — scan during box receiving first")
		}
		if st == "item_verified" || st == "verified" || st == "completed" {
			return shared.Err(c, fiber.StatusConflict, "box already item verified")
		}
		if st == "exception" || st == "rejected" || st == "excess" {
			return shared.Err(c, fiber.StatusConflict, "box requires review before verification")
		}
		if st != "received" && st != "box_verified" {
			return shared.Err(c, fiber.StatusConflict, "box is not ready for item verification")
		}
		if st == "received" {
			if _, err := db.Exec(c.Context(), `
				UPDATE grn_cartons SET status='box_verified', verified_at=NULL, verified_by=NULL
				WHERE id=$1 AND grn_session_id=$2 AND status='received'`, cartonID, sessionID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			status = "box_verified"
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET active_verify_carton_id=$2, status='item_verification', updated_at=now()
			WHERE id=$1 AND status NOT IN ('closed','completed')`, sessionID, cartonID)
		writeEvent(db, c, sessionID, "BOX_OPENED_FOR_VERIFY", fiber.Map{"box_no": cNo, "result": "box_verified"})
		contents, _ := loadBoxContents(db, c, cartonID)
		return shared.OK(c, fiber.Map{
			"id": cartonID, "carton_no": cNo, "status": status, "lines": contents,
		})
	}
}

func activeBoxContents(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var cartonID *int
		_ = db.QueryRow(c.Context(), `SELECT active_verify_carton_id FROM grn_sessions WHERE id=$1`, sessionID).Scan(&cartonID)
		if cartonID == nil || *cartonID < 1 {
			return shared.OK(c, fiber.Map{"active": false})
		}
		var cNo, status string
		if err := db.QueryRow(c.Context(), `
			SELECT carton_no, status FROM grn_cartons WHERE id=$1`, *cartonID).Scan(&cNo, &status); err != nil {
			return shared.OK(c, fiber.Map{"active": false})
		}
		contents, _ := loadBoxContents(db, c, *cartonID)
		return shared.OK(c, fiber.Map{
			"active": true, "id": *cartonID, "carton_no": cNo, "status": status, "lines": contents,
		})
	}
}

func loadBoxContents(db *pgxpool.Pool, c *fiber.Ctx, cartonID int) ([]fiber.Map, error) {
	rows, err := db.Query(c.Context(), `
		SELECT gl.id, gl.item_code, COALESCE(i.name,''),
		       COALESCE(gl.expected_qty,0), COALESCE(gl.scanned_qty,0), COALESCE(gl.damaged_qty,0), gl.status,
		       COALESCE(gl.invoice_no,''),
		       COALESCE(gl.unit_price,0), COALESCE(gl.line_amount,0),
		       COALESCE(gl.verification_method,'')
		FROM grn_lines gl
		LEFT JOIN items i ON UPPER(i.code) = UPPER(gl.item_code) AND COALESCE(i.disabled,false)=false
		WHERE gl.grn_carton_id=$1
		ORDER BY gl.id`, cartonID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id int
		var code, name, st, inv, method string
		var exp, scan, dmg, unitPrice, lineAmount float64
		if err := rows.Scan(&id, &code, &name, &exp, &scan, &dmg, &st, &inv, &unitPrice, &lineAmount, &method); err != nil {
			return nil, err
		}
		if lineAmount == 0 && unitPrice > 0 {
			lineAmount = unitPrice * scan
		}
		remaining := exp - scan
		if exp <= 0 {
			remaining = 0
		}
		out = append(out, fiber.Map{
			"id": id, "item_code": code, "item_name": name, "expected_qty": exp, "scanned_qty": scan,
			"damaged_qty": dmg, "status": st, "invoice_no": inv,
			"remaining":  remaining,
			"unit_price": unitPrice, "line_amount": lineAmount,
			"verification_method": method,
		})
	}
	return out, nil
}

type itemScanExtras struct {
	ItemCode         string  `json:"item_code"`
	Qty              float64 `json:"qty"`
	CartonID         int     `json:"carton_id"`
	Variant          string  `json:"variant"`
	ExpectedVariant  string  `json:"expected_variant"`
	Revision         string  `json:"revision"`
	ExpectedRevision string  `json:"expected_revision"`
	SerialNo         string  `json:"serial_no"`
	Substitute       bool    `json:"substitute"`
	UnitPrice        float64 `json:"unit_price"`
	Amount           float64 `json:"amount"`
}

// savePriceFromLabel stores the price decoded from an item QR on the line.
// Nothing is written when the label carried no price, so a manual re-scan can
// never blank out a price that was already captured.
func savePriceFromLabel(c *fiber.Ctx, db *pgxpool.Pool, lineID int, extra itemScanExtras) {
	if lineID < 1 || (extra.UnitPrice <= 0 && extra.Amount <= 0) {
		return
	}
	unit, amount := extra.UnitPrice, extra.Amount
	_, _ = db.Exec(c.Context(), `
		UPDATE grn_lines
		SET unit_price = COALESCE(NULLIF($2,0), unit_price),
		    line_amount = COALESCE(NULLIF($3,0), line_amount)
		WHERE id=$1`, lineID, unit, amount)
}

// verifyItemScan increments scans against the active box (packing-list) or session lines (invoice-only).
func verifyItemScan(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body itemScanExtras
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		itemCode := strings.TrimSpace(body.ItemCode)
		if itemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}
		packQty := 0.0
		if label, ok := shared.ParsePackedItemQRDetails(itemCode); ok {
			itemCode = label.Item
			packQty = label.Qty
			body.Qty = label.Qty
			// The label is authoritative for pricing when it carries an amount.
			if label.Amount > 0 {
				body.Amount = label.Amount
				body.UnitPrice = label.UnitPrice
			}
		} else if body.Qty <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "quantity must be at least 1")
		}

		var mode string
		var activeCarton *int
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(receiving_mode,'packing_list'), active_verify_carton_id
			FROM grn_sessions WHERE id=$1`, sessionID).Scan(&mode, &activeCarton)

		cartonID := body.CartonID
		if cartonID < 1 && activeCarton != nil {
			cartonID = *activeCarton
		}

		if mode == "packing_list" {
			if cartonID < 1 {
				return shared.Err(c, fiber.StatusBadRequest, "open a box first (scan box for item verification)")
			}
			return verifyAgainstBox(c, db, sessionID, cartonID, itemCode, body.Qty, packQty, body)
		}
		return verifyInvoiceOnly(c, db, sessionID, itemCode, body.Qty, packQty, body)
	}
}

func applyScanExtras(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, boxNo, itemCode string, extra itemScanExtras) fiber.Map {
	flags := fiber.Map{}
	ev := strings.TrimSpace(extra.ExpectedVariant)
	v := strings.TrimSpace(extra.Variant)
	if ev != "" && v != "" && !strings.EqualFold(ev, v) {
		writeException(db, c, sessionID, "wrong_variant", fiber.Map{"box_no": boxNo, "part_no": itemCode})
		writeEvent(db, c, sessionID, "WRONG_VARIANT", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "result": "wrong_variant",
			"payload": fiber.Map{"expected": ev, "received": v},
		})
		flags["wrong_variant"] = true
		flags["message"] = "WRONG VARIANT — expected " + ev + ", received " + v
	}
	er := strings.TrimSpace(extra.ExpectedRevision)
	r := strings.TrimSpace(extra.Revision)
	if er != "" && r != "" && !strings.EqualFold(er, r) {
		writeException(db, c, sessionID, "wrong_revision", fiber.Map{"box_no": boxNo, "part_no": itemCode})
		writeEvent(db, c, sessionID, "WRONG_REVISION", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "result": "wrong_revision",
			"payload": fiber.Map{"expected": er, "received": r},
		})
		flags["wrong_revision"] = true
		flags["message"] = "WRONG REVISION — expected " + er + ", received " + r
	}
	sn := strings.TrimSpace(extra.SerialNo)
	if sn != "" {
		var n int
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM serial_numbers WHERE serial_no=$1`, sn).Scan(&n)
		if n == 0 {
			writeException(db, c, sessionID, "counterfeit", fiber.Map{"box_no": boxNo, "part_no": itemCode, "scanned_qty": 1})
			writeEvent(db, c, sessionID, "COUNTERFEIT_SERIAL", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "result": "counterfeit",
				"payload": fiber.Map{"serial_no": sn},
			})
			flags["counterfeit"] = true
			flags["message"] = "COUNTERFEIT / GRAY MARKET — serial " + sn + " not in manufacturer records"
		}
	}
	return flags
}

func verifyAgainstBox(c *fiber.Ctx, db *pgxpool.Pool, sessionID, cartonID int, itemCode string, qty, packQty float64, extra itemScanExtras) error {
	var boxNo string
	if err := db.QueryRow(c.Context(), `SELECT carton_no FROM grn_cartons WHERE id=$1 AND grn_session_id=$2`,
		cartonID, sessionID).Scan(&boxNo); err != nil {
		return shared.Err(c, fiber.StatusNotFound, "box not found")
	}

	hasPackingList := cartonHasPackingListLines(c, db, cartonID)

	tx, txErr := db.Begin(c.Context())
	if txErr != nil {
		return shared.Err(c, fiber.StatusInternalServerError, txErr.Error())
	}
	defer tx.Rollback(c.Context())

	var lineID int
	var expected, scanned float64
	var lineMethod string
	err := tx.QueryRow(c.Context(), `
		SELECT id, COALESCE(expected_qty,0), COALESCE(scanned_qty,0), COALESCE(verification_method,'')
		FROM grn_lines WHERE grn_carton_id=$1 AND UPPER(item_code)=UPPER($2)
		ORDER BY CASE WHEN status IN ('pending','shortage') THEN 0 ELSE 1 END, id
		LIMIT 1
		FOR UPDATE`, cartonID, itemCode).Scan(&lineID, &expected, &scanned, &lineMethod)
	if err != nil && err != pgx.ErrNoRows {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	if err == nil {
		_, _ = tx.Exec(c.Context(), `
			UPDATE grn_lines SET requires_qi=true
			WHERE id=$1 AND EXISTS (SELECT 1 FROM items WHERE UPPER(code)=UPPER($2) AND COALESCE(requires_qi,false)=true)`,
			lineID, itemCode)
	}
	if err == pgx.ErrNoRows {
		// Fix #4: Roll back the FOR UPDATE query but keep the transaction alive
		// using a savepoint, so acceptScanAgainstPO can insert within the same tx
		// and concurrent scans cannot create duplicate PO-fallback lines.
		_, _ = tx.Exec(c.Context(), `SAVEPOINT sp_no_line`)
		_, _ = tx.Exec(c.Context(), `ROLLBACK TO SAVEPOINT sp_no_line`)
		onThisPO := itemOnThisGRNPO(c, db, sessionID, itemCode)
		otherPO, onOther := otherPOForItem(c, db, sessionID, itemCode)
		switch decideMissingBoxLine(hasPackingList, extra.Substitute, onThisPO, onOther) {
		case itemDecisionSubstitute:
			writeException(db, c, sessionID, "substitute", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "scanned_qty": qty, "expected_qty": 0,
			})
			writeEvent(db, c, sessionID, "SUBSTITUTE_ITEM", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": "substitute",
			})
			return shared.OK(c, fiber.Map{
				"ok": false, "substitute": true, "message": "SUBSTITUTE ITEM — needs supervisor approval",
				"item_code": itemCode, "box_no": boxNo, "pack_qty": packQty, "scan_qty": qty,
			})
		case itemDecisionWrongPO:
			writeException(db, c, sessionID, "wrong_po", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "scanned_qty": qty,
			})
			writeEvent(db, c, sessionID, "ITEM_WRONG_PO", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": "wrong_po",
				"payload": fiber.Map{"other_po": otherPO},
			})
			return shared.OK(c, fiber.Map{
				"ok": false, "wrong_po": true, "other_po": otherPO,
				"message":   "ITEM FROM DIFFERENT PO — belongs to " + otherPO + ", not this GRN",
				"item_code": itemCode, "box_no": boxNo, "pack_qty": packQty, "scan_qty": qty,
			})
		case itemDecisionAcceptPO:
			// Fix #4: Commit the transaction before calling acceptScanAgainstPO
			// so the FOR UPDATE lock is released cleanly.
			_ = tx.Commit(c.Context())
			return acceptScanAgainstPO(c, db, sessionID, cartonID, boxNo, itemCode, qty, packQty, extra)
		default:
			writeEvent(db, c, sessionID, "ITEM_WRONG_SCANNED", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": "wrong_item",
			})
			writeException(db, c, sessionID, "wrong_item", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "scanned_qty": qty, "expected_qty": 0, "variance": qty,
			})
			if hasPackingList {
				writeException(db, c, sessionID, "mixed_items", fiber.Map{
					"box_no": boxNo, "part_no": itemCode, "scanned_qty": qty,
				})
				writeEvent(db, c, sessionID, "MIXED_ITEMS", fiber.Map{
					"box_no": boxNo, "part_no": itemCode, "result": "mixed_items",
				})
			}
			_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status='exception' WHERE id=$1 AND status <> 'verified'`, cartonID)
			msg := "WRONG ITEM — not expected in this box"
			if hasPackingList {
				msg = "MIXED ITEMS — box contains parts that were not expected together"
			} else {
				msg = "WRONG ITEM — not on this purchase order"
			}
			return shared.OK(c, fiber.Map{
				"ok": false, "wrong_item": true, "mixed_items": hasPackingList,
				"message":   msg,
				"item_code": itemCode, "box_no": boxNo, "pack_qty": packQty, "scan_qty": qty,
			})
		}
	}
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}

	newScanned := scanned + qty
	poFallback := !hasPackingList || lineMethod == verifyMethodPOFallback
	newStatus, excess := classifyItemScan(expected, newScanned, poFallback)
	if poFallback {
		po := lookupPOItemForSession(c, db, sessionID, itemCode)
		sessionTotal := sessionScannedQtyForItem(c, db, sessionID, itemCode, lineID) + newScanned
		if po.OnPO && po.Remaining > 0 && sessionTotal > po.Remaining {
			excess = sessionTotal - po.Remaining
			newStatus = "excess"
		}
	}

	// Fix #7: Use nullable pointer to distinguish NULL (use default) from 0 (no limit).
	const defaultOverReceiptPct = 10.0
	if expected > 0 && newScanned > expected {
		var maxPctPtr *float64
		_ = db.QueryRow(c.Context(), `
			SELECT poi.max_overreceipt_pct
			FROM grn_sessions gs
			JOIN purchase_orders po ON po.name = gs.purchase_receipt_no
			JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND UPPER(poi.item_code)=UPPER($2)
			WHERE gs.id=$1 LIMIT 1`, sessionID, itemCode).Scan(&maxPctPtr)
		var tolerance float64
		if maxPctPtr == nil {
			tolerance = defaultOverReceiptPct
		} else if *maxPctPtr <= 0 {
			tolerance = 0
		} else {
			tolerance = *maxPctPtr
		}
		if tolerance >= 0 {
			overPct := (newScanned - expected) / expected * 100
			if overPct > tolerance {
				return shared.Err(c, fiber.StatusBadRequest,
					fmt.Sprintf("Over-receipt blocked: %.1f%% exceeds max %.1f%%", overPct, tolerance))
			}
		}
	}
	if excess > 0 {
		writeEvent(db, c, sessionID, "ITEM_EXCESS_DETECTED", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": "excess",
		})
		writeException(db, c, sessionID, "excess", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "expected_qty": expected, "scanned_qty": newScanned, "variance": excess,
		})
		_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status='exception' WHERE id=$1 AND status <> 'verified'`, cartonID)
	}

	_, err = tx.Exec(c.Context(), `
		UPDATE grn_lines SET scanned_qty=$2, status=$3,
			qty_short = GREATEST(COALESCE(expected_qty,0)-$2,0),
			qty_excess = GREATEST($2-COALESCE(expected_qty,0),0)
		WHERE id=$1`, lineID, newScanned, newStatus)
	if err != nil {
		_, err = tx.Exec(c.Context(), `UPDATE grn_lines SET scanned_qty=$2, status=$3 WHERE id=$1`, lineID, newScanned, newStatus)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
	}
	if err = tx.Commit(c.Context()); err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}

	savePriceFromLabel(c, db, lineID, extra)

	writeEvent(db, c, sessionID, "ITEM_SCANNED", fiber.Map{
		"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": newStatus,
	})
	applyFollowUpToParent(c, db, sessionID, boxNo, itemCode, qty)

	closed, closeMsg := tryAutoCloseBox(db, c, sessionID, cartonID, boxNo)
	contents, _ := loadBoxContents(db, c, cartonID)
	out := fiber.Map{
		"ok": true, "line_id": lineID, "item_code": itemCode, "scanned_qty": newScanned,
		"expected_qty": expected, "status": newStatus, "box_auto_closed": closed,
		"box_message": closeMsg, "lines": contents, "box_no": boxNo,
		"pack_qty": packQty, "scan_qty": qty, "excess": newStatus == "excess",
		"shortage":    false,
		"po_fallback": poFallback,
		"unit_price":  extra.UnitPrice, "amount": extra.Amount,
	}
	for k, v := range applyScanExtras(c, db, sessionID, boxNo, itemCode, extra) {
		out[k] = v
	}
	return shared.OK(c, out)
}

func classifyItemScan(expected, newScanned float64, poFallback bool) (status string, excess float64) {
	if poFallback || expected <= 0 {
		return "full_match", 0
	}
	if newScanned > expected {
		return "excess", newScanned - expected
	}
	if newScanned < expected {
		return "pending", 0
	}
	return "full_match", 0
}

func acceptScanAgainstPO(c *fiber.Ctx, db *pgxpool.Pool, sessionID, cartonID int, boxNo, itemCode string, qty, packQty float64, extra itemScanExtras) error {
	po := lookupPOItemForSession(c, db, sessionID, itemCode)
	canonical := po.Code
	if canonical == "" {
		canonical = itemCode
	}
	already := sessionScannedQtyForItem(c, db, sessionID, canonical, 0)
	sessionTotal := already + qty
	status := "full_match"
	var excess float64
	if po.OnPO && po.Remaining > 0 && sessionTotal > po.Remaining {
		status = "excess"
		excess = sessionTotal - po.Remaining
	}
	lineID, err := insertPOFallbackLine(c, db, sessionID, cartonID, canonical, qty)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	if status == "excess" {
		_, _ = db.Exec(c.Context(), `UPDATE grn_lines SET status='excess' WHERE id=$1`, lineID)
		writeException(db, c, sessionID, "excess", fiber.Map{
			"box_no": boxNo, "part_no": canonical, "expected_qty": po.Remaining, "scanned_qty": sessionTotal, "variance": excess,
		})
		writeEvent(db, c, sessionID, "ITEM_EXCESS_DETECTED", fiber.Map{
			"box_no": boxNo, "part_no": canonical, "quantity": qty, "result": "excess",
		})
		_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status='exception' WHERE id=$1 AND status <> 'verified'`, cartonID)
	}
	savePriceFromLabel(c, db, lineID, extra)
	writeEvent(db, c, sessionID, "ITEM_SCANNED", fiber.Map{
		"box_no": boxNo, "part_no": canonical, "quantity": qty, "result": status,
		"payload": fiber.Map{"verification_method": verifyMethodPOFallback, "po_remaining": po.Remaining},
	})
	applyFollowUpToParent(c, db, sessionID, boxNo, canonical, qty)
	contents, _ := loadBoxContents(db, c, cartonID)
	out := fiber.Map{
		"ok": true, "line_id": lineID, "item_code": canonical, "scanned_qty": qty,
		"expected_qty": po.Remaining, "status": status, "box_auto_closed": false,
		"lines": contents, "box_no": boxNo,
		"pack_qty": packQty, "scan_qty": qty, "excess": status == "excess",
		"shortage": false, "po_fallback": true,
		"unit_price": extra.UnitPrice, "amount": extra.Amount,
		"message": "Checked against PO — this box has no packing-list lines",
	}
	for k, v := range applyScanExtras(c, db, sessionID, boxNo, canonical, extra) {
		out[k] = v
	}
	return shared.OK(c, out)
}

func tryAutoCloseBox(db *pgxpool.Pool, c *fiber.Ctx, sessionID, cartonID int, boxNo string) (bool, string) {
	if !cartonHasPackingListLines(c, db, cartonID) {
		return false, ""
	}
	var pending int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_lines
		WHERE grn_carton_id=$1 AND (
			COALESCE(scanned_qty,0) < COALESCE(expected_qty,0)
			OR status IN ('excess','damage','exception')
			OR COALESCE(scanned_qty,0) > COALESCE(expected_qty,0)
		)`, cartonID).Scan(&pending)
	if pending > 0 {
		return false, ""
	}
	var lineCount int
	_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM grn_lines WHERE grn_carton_id=$1`, cartonID).Scan(&lineCount)
	if lineCount == 0 {
		return false, ""
	}
	_, _ = db.Exec(c.Context(), `
		UPDATE grn_cartons SET status='item_verified', verified_at=now(), verified_by=$2 WHERE id=$1 AND status IN ('box_verified','received')`,
		cartonID, userID(c))
	_, _ = db.Exec(c.Context(), `
		UPDATE grn_sessions SET active_verify_carton_id=NULL WHERE id=$1 AND active_verify_carton_id=$2`,
		sessionID, cartonID)
	writeEvent(db, c, sessionID, "BOX_AUTO_VERIFIED", fiber.Map{
		"box_no": boxNo, "result": "verified",
	})
	return true, "BOX VERIFIED — no discrepancy — next box ready"
}

func patchVerifyLine(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		lineID, err := strconv.Atoi(c.Params("lineId"))
		if err != nil || lineID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "invalid line id")
		}
		var body struct {
			ScannedQty *float64 `json:"scanned_qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ScannedQty == nil {
			return shared.Err(c, fiber.StatusBadRequest, "scanned_qty required")
		}
		qty := *body.ScannedQty
		if qty < 0 {
			return shared.Err(c, fiber.StatusBadRequest, "scanned_qty cannot be negative")
		}
		var cartonID int
		var itemCode, method string
		var expected, scanned float64
		err = db.QueryRow(c.Context(), `
			SELECT gl.grn_carton_id, gl.item_code, COALESCE(gl.expected_qty,0), COALESCE(gl.scanned_qty,0),
			       COALESCE(gl.verification_method,'')
			FROM grn_lines gl
			WHERE gl.id=$1 AND gl.grn_session_id=$2`, lineID, sessionID).
			Scan(&cartonID, &itemCode, &expected, &scanned, &method)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "line not found on this GRN")
		}
		if qty == 0 {
			_, _ = db.Exec(c.Context(), `DELETE FROM grn_lines WHERE id=$1`, lineID)
			writeEvent(db, c, sessionID, "ITEM_SCAN_UNDONE", fiber.Map{
				"part_no": itemCode, "quantity": scanned, "result": "removed",
			})
			_, _ = db.Exec(c.Context(), `
				UPDATE grn_exceptions SET status='resolved', resolution='Qty edited to 0', resolved_at=now()
				WHERE grn_session_id=$1 AND exception_type IN ('excess','wrong_item') AND status='open'
				  AND COALESCE(part_no,'')=$2`, sessionID, itemCode)
			contents, _ := loadBoxContents(db, c, cartonID)
			return shared.OK(c, fiber.Map{"ok": true, "removed": true, "item_code": itemCode, "lines": contents})
		}
		poFallback := method == verifyMethodPOFallback || expected <= 0
		st, _ := classifyItemScan(expected, qty, poFallback)
		if poFallback {
			po := lookupPOItemForSession(c, db, sessionID, itemCode)
			sessionTotal := sessionScannedQtyForItem(c, db, sessionID, itemCode, lineID) + qty
			if po.OnPO && po.Remaining > 0 && sessionTotal > po.Remaining {
				st = "excess"
			} else if po.OnPO {
				st = "full_match"
				_, _ = db.Exec(c.Context(), `
					UPDATE grn_exceptions SET status='resolved', resolution='Qty edited within PO', resolved_at=now()
					WHERE grn_session_id=$1 AND exception_type='excess' AND status='open'
					  AND COALESCE(part_no,'')=$2`, sessionID, itemCode)
			}
		}
		_, _ = db.Exec(c.Context(), `UPDATE grn_lines SET scanned_qty=$2, status=$3 WHERE id=$1`, lineID, qty, st)
		writeEvent(db, c, sessionID, "ITEM_QTY_EDITED", fiber.Map{
			"part_no": itemCode, "quantity": qty, "result": st,
			"payload": fiber.Map{"previous": scanned},
		})
		contents, _ := loadBoxContents(db, c, cartonID)
		return shared.OK(c, fiber.Map{
			"ok": true, "line_id": lineID, "item_code": itemCode, "scanned_qty": qty,
			"status": st, "lines": contents,
		})
	}
}

func undoLastItemScan(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var lineID, cartonID int
		var itemCode string
		var scanned float64
		err = db.QueryRow(c.Context(), `
			SELECT id, grn_carton_id, item_code, COALESCE(scanned_qty,0)
			FROM grn_lines WHERE grn_session_id=$1 AND COALESCE(scanned_qty,0) > 0
			ORDER BY id DESC LIMIT 1`, sessionID).Scan(&lineID, &cartonID, &itemCode, &scanned)
		if err != nil || lineID < 1 {
			return shared.Err(c, fiber.StatusNotFound, "no item scan to undo")
		}
		_, _ = db.Exec(c.Context(), `DELETE FROM grn_lines WHERE id=$1`, lineID)
		writeEvent(db, c, sessionID, "ITEM_SCAN_UNDONE", fiber.Map{
			"part_no": itemCode, "quantity": scanned, "result": "undone",
		})
		contents, _ := loadBoxContents(db, c, cartonID)
		return shared.OK(c, fiber.Map{"ok": true, "item_code": itemCode, "undone_qty": scanned, "lines": contents})
	}
}

func undoLastBoxHandler(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		undone, ok := undoLastBoxScan(c, db, sessionID)
		if !ok {
			return shared.Err(c, fiber.StatusNotFound, "no received box scan to undo")
		}
		return shared.OK(c, fiber.Map{"ok": true, "carton_no": undone})
	}
}

func forceCloseBox(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			CartonID int    `json:"carton_id"`
			Reason   string `json:"reason"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.CartonID < 1 {
			return shared.Err(c, fiber.StatusBadRequest, "carton_id required")
		}
		var boxNo string
		if err := db.QueryRow(c.Context(), `SELECT carton_no FROM grn_cartons WHERE id=$1 AND grn_session_id=$2`,
			body.CartonID, sessionID).Scan(&boxNo); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "box not found")
		}
		hasPL := cartonHasPackingListLines(c, db, body.CartonID)
		if hasPL {
			rows, err := db.Query(c.Context(), `
			SELECT id, item_code, COALESCE(expected_qty,0), COALESCE(scanned_qty,0)
			FROM grn_lines WHERE grn_carton_id=$1 AND COALESCE(scanned_qty,0) < COALESCE(expected_qty,0)`, body.CartonID)
			if err == nil {
				defer rows.Close()
				for rows.Next() {
					var lid int
					var code string
					var exp, scan float64
					_ = rows.Scan(&lid, &code, &exp, &scan)
					_, _ = db.Exec(c.Context(), `UPDATE grn_lines SET status='shortage' WHERE id=$1`, lid)
					writeException(db, c, sessionID, "shortage", fiber.Map{
						"box_no": boxNo, "part_no": code, "expected_qty": exp, "scanned_qty": scan, "variance": scan - exp,
					})
					writeEvent(db, c, sessionID, "ITEM_SHORT_RECORDED", fiber.Map{
						"box_no": boxNo, "part_no": code, "quantity": exp - scan, "reason": body.Reason,
					})
				}
			}
		}
		reason := strings.ToLower(strings.TrimSpace(body.Reason))
		empty := reason == "empty" || reason == "empty_box"
		status := "exception"
		if !hasPL && !empty {
			status = "item_verified"
		}
		_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status=$3, verified_at=now(), verified_by=$2 WHERE id=$1`, body.CartonID, userID(c), status)
		_, _ = db.Exec(c.Context(), `UPDATE grn_sessions SET active_verify_carton_id=NULL WHERE id=$1`, sessionID)
		writeEvent(db, c, sessionID, "BOX_CLOSED", fiber.Map{"box_no": boxNo, "result": status, "reason": body.Reason})
		if empty {
			writeEvent(db, c, sessionID, "EMPTY_BOX", fiber.Map{"box_no": boxNo, "result": "empty_box"})
			writeException(db, c, sessionID, "empty_box", fiber.Map{"box_no": boxNo})
		}
		return shared.OK(c, fiber.Map{"id": body.CartonID, "status": status, "carton_no": boxNo, "empty_box": empty, "po_fallback": !hasPL})
	}
}

func verifyInvoiceOnly(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, itemCode string, qty, packQty float64, extra itemScanExtras) error {
	var lineID int
	var expected, scanned float64
	err := db.QueryRow(c.Context(), `
		SELECT id, COALESCE(expected_qty,0), COALESCE(scanned_qty,0)
		FROM grn_lines WHERE grn_session_id=$1 AND UPPER(item_code)=UPPER($2)
		ORDER BY id LIMIT 1`, sessionID, itemCode).Scan(&lineID, &expected, &scanned)
	if err == pgx.ErrNoRows {
		if extra.Substitute {
			writeException(db, c, sessionID, "substitute", fiber.Map{"part_no": itemCode, "scanned_qty": qty})
			writeEvent(db, c, sessionID, "SUBSTITUTE_ITEM", fiber.Map{
				"part_no": itemCode, "quantity": qty, "result": "substitute",
			})
			return shared.OK(c, fiber.Map{"ok": false, "substitute": true, "item_code": itemCode,
				"message": "SUBSTITUTE ITEM — needs supervisor approval", "scan_qty": qty})
		}
		if otherPO, ok := otherPOForItem(c, db, sessionID, itemCode); ok && !itemOnThisGRNPO(c, db, sessionID, itemCode) {
			writeException(db, c, sessionID, "wrong_po", fiber.Map{"part_no": itemCode, "scanned_qty": qty})
			writeEvent(db, c, sessionID, "ITEM_WRONG_PO", fiber.Map{
				"part_no": itemCode, "quantity": qty, "result": "wrong_po",
				"payload": fiber.Map{"other_po": otherPO},
			})
			return shared.OK(c, fiber.Map{
				"ok": false, "wrong_po": true, "other_po": otherPO, "item_code": itemCode,
				"message": "ITEM FROM DIFFERENT PO — belongs to " + otherPO + ", not this GRN",
			})
		}
		po := lookupPOItemForSession(c, db, sessionID, itemCode)
		canonical := itemCode
		expQty := 0.0
		st := "excess"
		if po.OnPO {
			canonical = po.Code
			expQty = po.Remaining
			st = "pending"
			if qty > expQty && expQty > 0 {
				st = "excess"
			} else if qty == expQty && expQty > 0 {
				st = "full_match"
			} else if expQty <= 0 {
				st = "excess"
			}
		}
		// Fix #8: Use UPSERT pattern to handle concurrent scans of the same item.
		var cartonID int
		_ = db.QueryRow(c.Context(), `
			SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no='CONSOLIDATED'`, sessionID).Scan(&cartonID)
		if cartonID == 0 {
			_ = db.QueryRow(c.Context(), `
				INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected)
				VALUES ($1,'CONSOLIDATED','received',false)
				ON CONFLICT DO NOTHING RETURNING id`, sessionID).Scan(&cartonID)
			if cartonID == 0 {
				_ = db.QueryRow(c.Context(), `
					SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no='CONSOLIDATED'`, sessionID).Scan(&cartonID)
			}
		}
		err = db.QueryRow(c.Context(), `
			INSERT INTO grn_lines (grn_carton_id, grn_session_id, item_code, expected_qty, scanned_qty, status, verification_method)
			VALUES ($1,$2,$3,$5,$4,$6,'invoice_only')
			ON CONFLICT (grn_session_id, item_code) WHERE verification_method = 'invoice_only'
			DO UPDATE SET scanned_qty = grn_lines.scanned_qty + EXCLUDED.scanned_qty
			RETURNING id`,
			cartonID, sessionID, canonical, qty, expQty, st).Scan(&lineID)
		if err != nil {
			err = db.QueryRow(c.Context(), `
				INSERT INTO grn_lines (grn_carton_id, grn_session_id, item_code, expected_qty, scanned_qty, status, verification_method)
				VALUES ($1,$2,$3,$5,$4,$6,'invoice_only') RETURNING id`,
				cartonID, sessionID, canonical, qty, expQty, st).Scan(&lineID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		savePriceFromLabel(c, db, lineID, extra)
		if st == "excess" {
			writeException(db, c, sessionID, "excess", fiber.Map{
				"part_no": canonical, "expected_qty": expQty, "scanned_qty": qty, "variance": qty - expQty,
			})
			writeEvent(db, c, sessionID, "ITEM_EXCESS_DETECTED", fiber.Map{
				"part_no": canonical, "quantity": qty, "result": "excess",
			})
		} else {
			writeEvent(db, c, sessionID, "ITEM_SCANNED", fiber.Map{
				"part_no": canonical, "quantity": qty, "result": st,
			})
		}
		out := fiber.Map{"ok": true, "status": st, "item_code": canonical, "scanned_qty": qty, "expected_qty": expQty,
			"pack_qty": packQty, "scan_qty": qty, "excess": st == "excess",
			"unit_price": extra.UnitPrice, "amount": extra.Amount}
		for k, v := range applyScanExtras(c, db, sessionID, "", canonical, extra) {
			out[k] = v
		}
		return shared.OK(c, out)
	}
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	newScanned := scanned + qty

	// Fix #7: Use nullable pointer to distinguish NULL (use default) from 0 (no limit).
	const defaultOverReceiptPct = 10.0
	po := lookupPOItemForSession(c, db, sessionID, itemCode)
	poQty := expected
	if po.OnPO && po.Remaining+scanned > 0 {
		poQty = po.Remaining + scanned // total PO line qty for this item
	}
	if poQty > 0 && newScanned > poQty {
		var maxPctPtr *float64
		_ = db.QueryRow(c.Context(), `
			SELECT poi.max_overreceipt_pct
			FROM grn_sessions gs
			JOIN purchase_orders po ON po.name = gs.purchase_receipt_no
			JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND UPPER(poi.item_code)=UPPER($2)
			WHERE gs.id=$1 LIMIT 1`, sessionID, itemCode).Scan(&maxPctPtr)
		var tolerance float64
		if maxPctPtr == nil {
			tolerance = defaultOverReceiptPct
		} else if *maxPctPtr <= 0 {
			tolerance = 0
		} else {
			tolerance = *maxPctPtr
		}
		if tolerance >= 0 {
			overPct := (newScanned - poQty) / poQty * 100
			if overPct > tolerance {
				return shared.Err(c, fiber.StatusBadRequest,
					fmt.Sprintf("Over-receipt blocked: %.1f%% exceeds max %.1f%%", overPct, tolerance))
			}
		}
	}

	st := "full_match"
	if expected > 0 && newScanned < expected {
		st = "pending"
	} else if expected > 0 && newScanned > expected {
		st = "excess"
		writeException(db, c, sessionID, "excess", fiber.Map{
			"part_no": itemCode, "expected_qty": expected, "scanned_qty": newScanned, "variance": newScanned - expected,
		})
	} else if expected <= 0 {
		st = "excess"
		writeException(db, c, sessionID, "excess", fiber.Map{
			"part_no": itemCode, "expected_qty": expected, "scanned_qty": newScanned, "variance": newScanned,
		})
	}
	_, _ = db.Exec(c.Context(), `UPDATE grn_lines SET scanned_qty=$2, status=$3 WHERE id=$1`, lineID, newScanned, st)
	savePriceFromLabel(c, db, lineID, extra)
	writeEvent(db, c, sessionID, "ITEM_SCANNED", fiber.Map{
		"part_no": itemCode, "quantity": qty, "result": st,
	})
	applyFollowUpToParent(c, db, sessionID, "", itemCode, qty)
	out := fiber.Map{
		"ok": true, "line_id": lineID, "item_code": itemCode, "scanned_qty": newScanned,
		"expected_qty": expected, "status": st, "pack_qty": packQty, "scan_qty": qty,
		"excess": st == "excess", "shortage": false,
		"unit_price": extra.UnitPrice, "amount": extra.Amount,
	}
	for k, v := range applyScanExtras(c, db, sessionID, "", itemCode, extra) {
		out[k] = v
	}
	return shared.OK(c, out)
}

func resolveException(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid exception id")
		}
		var body struct {
			Resolution     string `json:"resolution"`
			Status         string `json:"status"`
			CreateFollowUp bool   `json:"create_followup"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		st := strings.ToLower(strings.TrimSpace(body.Status))
		if st == "" {
			st = "resolved"
		}
		var sessionID int
		err = db.QueryRow(c.Context(), `
			UPDATE grn_exceptions SET status=$2, resolution=$3, resolved_by=$4, resolved_at=now()
			WHERE id=$1 RETURNING grn_session_id`, id, st, body.Resolution, userID(c)).Scan(&sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "exception not found")
		}
		writeEvent(db, c, sessionID, "EXCEPTION_RESOLVED", fiber.Map{
			"reason": body.Resolution, "result": st, "payload": fiber.Map{"exception_id": id},
		})
		maybeAdvanceAfterExceptions(c, db, sessionID)
		out := fiber.Map{"id": id, "status": st, "grn_session_id": sessionID}
		if body.CreateFollowUp {
			fid, sno, n, ferr := seedFollowUpFromParent(c, db, sessionID)
			if ferr != nil {
				out["followup_error"] = ferr.Error()
			} else {
				out["followup_id"] = fid
				out["followup_session_no"] = sno
				out["followup_lines"] = n
			}
		}
		return shared.OK(c, out)
	}
}

func startAudit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			SampleSize int `json:"sample_size"`
		}
		_ = shared.Bind(c, &body)
		if body.SampleSize < 1 {
			body.SampleSize = 5
		}
		if body.SampleSize > 100 {
			body.SampleSize = 100
		}
		var auditID int
		err = db.QueryRow(c.Context(), `
			INSERT INTO grn_audits (grn_session_id, sample_size, started_by)
			VALUES ($1,$2,$3) RETURNING id`, sessionID, body.SampleSize, userID(c)).Scan(&auditID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		// Pick random distinct parts from session lines
		rows, err := db.Query(c.Context(), `
			SELECT item_code, SUM(COALESCE(scanned_qty,0)) AS qty
			FROM grn_lines WHERE grn_session_id=$1
			GROUP BY item_code
			ORDER BY random()
			LIMIT $2`, sessionID, body.SampleSize)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		items := []fiber.Map{}
		for rows.Next() {
			var code string
			var qty float64
			if err := rows.Scan(&code, &qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			var itemID int
			_ = db.QueryRow(c.Context(), `
				INSERT INTO grn_audit_items (audit_id, part_no, system_qty) VALUES ($1,$2,$3) RETURNING id`,
				auditID, code, qty).Scan(&itemID)
			items = append(items, fiber.Map{"id": itemID, "part_no": code, "system_qty": qty})
		}
		if len(items) == 0 {
			poRows, poErr := db.Query(c.Context(), `
				SELECT poi.item_code, COALESCE(poi.qty,0)
				FROM purchase_order_items poi
				JOIN purchase_orders po ON po.id = poi.purchase_order_id
				JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
				WHERE gs.id=$1
				ORDER BY random()
				LIMIT $2`, sessionID, body.SampleSize)
			if poErr == nil && poRows != nil {
				defer poRows.Close()
				for poRows.Next() {
					var code string
					var qty float64
					if err := poRows.Scan(&code, &qty); err != nil {
						continue
					}
					var itemID int
					_ = db.QueryRow(c.Context(), `
						INSERT INTO grn_audit_items (audit_id, part_no, system_qty) VALUES ($1,$2,$3) RETURNING id`,
						auditID, code, qty).Scan(&itemID)
					items = append(items, fiber.Map{"id": itemID, "part_no": code, "system_qty": qty})
				}
			}
		}
		writeEvent(db, c, sessionID, "AUDIT_STARTED", fiber.Map{
			"payload": fiber.Map{"audit_id": auditID, "sample_size": len(items)},
		})
		return shared.OK(c, fiber.Map{"id": auditID, "sample_size": len(items), "items": items})
	}
}

func listAudits(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT a.id, a.sample_size, a.status, a.started_at::text, a.completed_at::text,
			       (SELECT COUNT(*) FROM grn_audit_items i WHERE i.audit_id=a.id AND i.result IS NOT NULL) AS checked
			FROM grn_audits a WHERE a.grn_session_id=$1 ORDER BY a.id DESC`, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var id, sample, checked int
			var st string
			var started string
			var completed *string
			if err := rows.Scan(&id, &sample, &st, &started, &completed, &checked); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			items, _ := loadAuditItems(db, c, id)
			out = append(out, fiber.Map{
				"id": id, "sample_size": sample, "status": st, "started_at": started,
				"completed_at": completed, "checked": checked, "items": items,
			})
		}
		return shared.OK(c, out)
	}
}

func loadAuditItems(db *pgxpool.Pool, c *fiber.Ctx, auditID int) ([]fiber.Map, error) {
	rows, err := db.Query(c.Context(), `
		SELECT id, part_no, system_qty, physical_qty, COALESCE(result,''), checked_at::text
		FROM grn_audit_items WHERE audit_id=$1 ORDER BY id`, auditID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id int
		var part, result string
		var sys float64
		var phys *float64
		var checked *string
		if err := rows.Scan(&id, &part, &sys, &phys, &result, &checked); err != nil {
			return nil, err
		}
		out = append(out, fiber.Map{
			"id": id, "part_no": part, "system_qty": sys, "physical_qty": phys,
			"result": result, "checked_at": checked,
		})
	}
	return out, nil
}

func checkAuditItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			PhysicalQty float64 `json:"physical_qty"`
			Notes       string  `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		var sys float64
		var sessionID int
		var part string
		err = db.QueryRow(c.Context(), `
			SELECT i.system_qty, i.part_no, a.grn_session_id
			FROM grn_audit_items i JOIN grn_audits a ON a.id = i.audit_id
			WHERE i.id=$1`, id).Scan(&sys, &part, &sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "audit item not found")
		}
		result := "pass"
		if body.PhysicalQty != sys {
			result = "fail"
			writeEvent(db, c, sessionID, "AUDIT_DISCREPANCY_FOUND", fiber.Map{
				"part_no": part, "quantity": body.PhysicalQty, "result": "fail",
				"payload": fiber.Map{"system_qty": sys, "physical_qty": body.PhysicalQty},
			})
		} else {
			writeEvent(db, c, sessionID, "AUDIT_ITEM_CHECKED", fiber.Map{
				"part_no": part, "quantity": body.PhysicalQty, "result": "pass",
			})
		}
		_, err = db.Exec(c.Context(), `
			UPDATE grn_audit_items SET physical_qty=$2, result=$3, notes=$4, checked_by=$5, checked_at=now()
			WHERE id=$1`, id, body.PhysicalQty, result, nullStr(body.Notes), userID(c))
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "result": result, "system_qty": sys, "physical_qty": body.PhysicalQty})
	}
}

func completeAudit(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		auditID, err := strconv.Atoi(c.Params("auditId"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid audit id")
		}
		_, err = db.Exec(c.Context(), `
			UPDATE grn_audits SET status='completed', completed_at=now()
			WHERE id=$1 AND grn_session_id=$2`, auditID, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		writeEvent(db, c, sessionID, "AUDIT_COMPLETED", fiber.Map{
			"payload": fiber.Map{"audit_id": auditID},
		})
		return shared.OK(c, fiber.Map{"id": auditID, "status": "completed"})
	}
}

func createFollowUp(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		parentID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		id, sessionNo, created, err := seedFollowUpFromParent(c, db, parentID)
		if err != nil {
			if err == pgx.ErrNoRows {
				return shared.Err(c, fiber.StatusNotFound, "parent GRN not found")
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": id, "session_no": sessionNo, "parent_grn_id": parentID, "lines_seeded": created,
		})
	}
}

func seedFollowUpFromParent(c *fiber.Ctx, db *pgxpool.Pool, parentID int) (id int, sessionNo string, created int, err error) {
	var supplier *string
	var warehouseID *int
	var mode string
	err = db.QueryRow(c.Context(), `
		SELECT supplier_name, warehouse_id, COALESCE(receiving_mode,'packing_list')
		FROM grn_sessions WHERE id=$1`, parentID).Scan(&supplier, &warehouseID, &mode)
	if err != nil {
		return 0, "", 0, err
	}
	err = db.QueryRow(c.Context(), `
		INSERT INTO grn_sessions (
			session_no, warehouse_id, supplier_name, created_by, status, receiving_mode,
			parent_grn_id, is_followup, arrival_at
		) VALUES (
			'GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),
			$1,$2,$3,'receiving',$4,$5,true,NOW()
		) RETURNING id, session_no`,
		warehouseID, supplier, userID(c), mode, parentID).Scan(&id, &sessionNo)
	if err != nil {
		return 0, "", 0, err
	}
	cartonCache := map[string]int{}
	addFULine := func(inv, box, part string, shortQty float64) {
		if shortQty <= 0 || part == "" {
			return
		}
		if box == "" {
			box = "CONSOLIDATED"
		}
		cid, ok := cartonCache[box]
		if !ok {
			_ = db.QueryRow(c.Context(), `
				INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected, invoice_no)
				VALUES ($1,$2,'expected',true,$3) RETURNING id`, id, box, nullStr(inv)).Scan(&cid)
			cartonCache[box] = cid
		}
		_, _ = db.Exec(c.Context(), `
			INSERT INTO grn_lines (grn_carton_id, grn_session_id, item_code, expected_qty, scanned_qty, status, invoice_no, verification_method)
			VALUES ($1,$2,$3,$4,0,'pending',$5,'followup')`, cid, id, part, shortQty, nullStr(inv))
		created++
	}
	rows, qerr := db.Query(c.Context(), `
		SELECT COALESCE(gl.invoice_no,''), COALESCE(gc.carton_no,''), gl.item_code,
		       GREATEST(COALESCE(gl.expected_qty,0)-COALESCE(gl.scanned_qty,0), COALESCE(gl.qty_short,0))
		FROM grn_lines gl
		LEFT JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
		WHERE gl.grn_session_id=$1 AND (
			gl.status='shortage' OR COALESCE(gl.scanned_qty,0) < COALESCE(gl.expected_qty,0)
		)`, parentID)
	if qerr == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var inv, box, part string
			var shortQty float64
			if err := rows.Scan(&inv, &box, &part, &shortQty); err != nil || shortQty <= 0 {
				continue
			}
			addFULine(inv, box, part, shortQty)
		}
	}
	if created == 0 {
		exRows, _ := db.Query(c.Context(), `
			SELECT COALESCE(box_no,''), COALESCE(part_no,''),
			       GREATEST(COALESCE(expected_qty,0)-COALESCE(scanned_qty,0), ABS(COALESCE(variance,0)))
			FROM grn_exceptions
			WHERE grn_session_id=$1 AND status IN ('open','resolved')
			  AND exception_type IN ('shortage','missing_box')
			ORDER BY id`, parentID)
		if exRows != nil {
			defer exRows.Close()
			for exRows.Next() {
				var box, part string
				var qty float64
				if err := exRows.Scan(&box, &part, &qty); err != nil || qty <= 0 {
					continue
				}
				addFULine("", box, part, qty)
			}
		}
	}
	writeEvent(db, c, parentID, "FOLLOWUP_RECEIPT_CREATED", fiber.Map{
		"payload": fiber.Map{"followup_id": id, "session_no": sessionNo, "lines": created},
	})
	writeEvent(db, c, id, "GRN_CREATED", fiber.Map{
		"payload": fiber.Map{"parent_grn_id": parentID, "is_followup": true},
	})
	return id, sessionNo, created, nil
}

func listFollowUps(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		parentID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT id, session_no, status, created_at::text
			FROM grn_sessions WHERE parent_grn_id=$1 ORDER BY id DESC`, parentID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var id int
			var no, st, created string
			if err := rows.Scan(&id, &no, &st, &created); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{"id": id, "session_no": no, "status": st, "created_at": created})
		}
		return shared.OK(c, out)
	}
}

func parentOutstandingAfterFollowUp(parentExpected, parentScanned, followQty float64) (newScanned, outstanding float64) {
	newScanned = parentScanned + followQty
	if parentExpected > 0 && newScanned > parentExpected {
		newScanned = parentExpected
	}
	outstanding = parentExpected - newScanned
	if outstanding < 0 {
		outstanding = 0
	}
	return
}

func applyFollowUpToParent(c *fiber.Ctx, db *pgxpool.Pool, followupID int, boxNo, part string, qty float64) {
	if db == nil || followupID < 1 || part == "" || qty <= 0 {
		return
	}
	var parentID *int
	var isFU bool
	if err := db.QueryRow(c.Context(), `
		SELECT parent_grn_id, COALESCE(is_followup,false) FROM grn_sessions WHERE id=$1`, followupID).
		Scan(&parentID, &isFU); err != nil || !isFU || parentID == nil || *parentID < 1 {
		return
	}
	var lineID int
	var expected, scanned float64
	if boxNo != "" && boxNo != "CONSOLIDATED" {
		_ = db.QueryRow(c.Context(), `
			SELECT gl.id, COALESCE(gl.expected_qty,0), COALESCE(gl.scanned_qty,0)
			FROM grn_lines gl JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
			WHERE gl.grn_session_id=$1 AND gl.item_code=$2 AND gc.carton_no=$3
			ORDER BY CASE WHEN COALESCE(gl.scanned_qty,0) < COALESCE(gl.expected_qty,0) THEN 0 ELSE 1 END, gl.id
			LIMIT 1`, *parentID, part, boxNo).Scan(&lineID, &expected, &scanned)
	}
	if lineID < 1 {
		_ = db.QueryRow(c.Context(), `
			SELECT id, COALESCE(expected_qty,0), COALESCE(scanned_qty,0)
			FROM grn_lines WHERE grn_session_id=$1 AND item_code=$2
			ORDER BY CASE WHEN COALESCE(scanned_qty,0) < COALESCE(expected_qty,0) THEN 0 ELSE 1 END, id
			LIMIT 1`, *parentID, part).Scan(&lineID, &expected, &scanned)
	}
	if lineID < 1 {
		return
	}
	newScanned, outstanding := parentOutstandingAfterFollowUp(expected, scanned, qty)
	st := "shortage"
	if outstanding <= 0 {
		st = "full_match"
	}
	_, _ = db.Exec(c.Context(), `
		UPDATE grn_lines SET scanned_qty=$2, status=$3,
			qty_short = GREATEST(COALESCE(expected_qty,0)-$2,0),
			qty_excess = GREATEST($2-COALESCE(expected_qty,0),0)
		WHERE id=$1`, lineID, newScanned, st)
	if outstanding <= 0 {
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_exceptions SET status='resolved', resolution='Follow-up received',
				resolved_at=now(), resolved_by=$3
			WHERE grn_session_id=$1 AND exception_type='shortage' AND status='open'
			  AND COALESCE(part_no,'')=$2`, *parentID, part, userID(c))
	}
	fields := fiber.Map{
		"box_no": boxNo, "part_no": part, "quantity": qty, "result": st,
		"payload": fiber.Map{
			"parent_grn_id": *parentID, "followup_id": followupID,
			"parent_scanned": newScanned, "outstanding": outstanding,
		},
	}
	writeEvent(db, c, followupID, "FOLLOWUP_ITEM_RECEIVED", fields)
	writeEvent(db, c, *parentID, "FOLLOWUP_ITEM_RECEIVED", fields)
}

func snapshotBoxCounts(db *pgxpool.Pool, c *fiber.Ctx, sessionID int) fiber.Map {
	rows, err := db.Query(c.Context(), `
		SELECT carton_no, status, COALESCE(is_expected,false)
		FROM grn_cartons WHERE grn_session_id=$1 AND carton_no <> 'CONSOLIDATED'`, sessionID)
	if err != nil {
		return fiber.Map{}
	}
	defer rows.Close()
	expected, received, excess, missing := 0, 0, 0, 0
	boxes := []fiber.Map{}
	for rows.Next() {
		var no, st string
		var isExp bool
		if err := rows.Scan(&no, &st, &isExp); err != nil {
			continue
		}
		stl := strings.ToLower(st)
		switch stl {
		case "excess":
			excess++
		case "received", "accounted", "verified", "exception":
			received++
			expected++
		case "expected", "pending", "missing":
			expected++
			missing++
		default:
			if isExp {
				expected++
				missing++
			}
		}
		boxes = append(boxes, fiber.Map{"carton_no": no, "status": st, "is_expected": isExp})
	}
	var declared int
	_ = db.QueryRow(c.Context(), `SELECT COALESCE(expected_boxes,0) FROM grn_sessions WHERE id=$1`, sessionID).Scan(&declared)
	if expected < declared {
		expected = declared
	}
	return fiber.Map{
		"expected_boxes": expected, "received_boxes": received,
		"excess_boxes": excess, "missing_boxes": missing, "boxes": boxes,
	}
}

func maybeAdvanceAfterExceptions(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) {
	var openExc int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_exceptions WHERE grn_session_id=$1 AND status='open'`, sessionID).Scan(&openExc)
	if openExc > 0 {
		return
	}
	var status string
	_ = db.QueryRow(c.Context(), `SELECT status FROM grn_sessions WHERE id=$1`, sessionID).Scan(&status)
	if strings.ToLower(status) != "exception_pending" {
		return
	}
	_, _ = db.Exec(c.Context(), `
		UPDATE grn_sessions SET status='putaway_pending', updated_at=now() WHERE id=$1`, sessionID)
	writeEvent(db, c, sessionID, "STATUS_CHANGED", fiber.Map{"result": "putaway_pending", "reason": "exceptions_cleared"})
}

func pingPresence(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		uid := userID(c)
		device := requestDevice(c)
		_, err = db.Exec(c.Context(), `
			INSERT INTO grn_presence (grn_session_id, user_id, device, last_seen)
			VALUES ($1,$2,$3,now())
			ON CONFLICT (grn_session_id, user_id)
			DO UPDATE SET device=EXCLUDED.device, last_seen=now()`, sessionID, uid, nullStr(device))
		if err != nil && strings.Contains(err.Error(), "grn_presence") {
			return shared.OK(c, fiber.Map{"operators": []fiber.Map{}, "concurrent": false})
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		ops, concurrent := loadPresence(c, db, sessionID)
		return shared.OK(c, fiber.Map{"operators": ops, "concurrent": concurrent})
	}
}

func listPresence(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		ops, concurrent := loadPresence(c, db, sessionID)
		return shared.OK(c, fiber.Map{"operators": ops, "concurrent": concurrent})
	}
}

func loadPresence(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) ([]fiber.Map, bool) {
	rows, err := db.Query(c.Context(), `
		SELECT p.user_id, COALESCE(u.username, p.user_id::text), COALESCE(p.device,''), p.last_seen::text
		FROM grn_presence p
		LEFT JOIN users u ON u.id = p.user_id
		WHERE p.grn_session_id=$1 AND p.last_seen > now() - interval '2 minutes'
		ORDER BY p.last_seen DESC`, sessionID)
	if err != nil {
		return []fiber.Map{}, false
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var uid int
		var name, device, seen string
		if err := rows.Scan(&uid, &name, &device, &seen); err != nil {
			continue
		}
		out = append(out, fiber.Map{
			"user_id": uid, "username": name, "device": device, "last_seen": seen,
			"is_self": uid == userID(c),
		})
	}
	others := 0
	for _, o := range out {
		if isSelf, _ := o["is_self"].(bool); !isSelf {
			others++
		}
	}
	return out, others > 0
}
