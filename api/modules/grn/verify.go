package grn

import (
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
	r.Post("/session/:id/close-box", forceCloseBox(db))
	r.Post("/exceptions/:id/resolve", resolveException(db))
	r.Post("/session/:id/audit/start", startAudit(db))
	r.Get("/session/:id/audits", listAudits(db))
	r.Post("/audit-items/:id/check", checkAuditItem(db))
	r.Post("/session/:id/audit/:auditId/complete", completeAudit(db))
	r.Post("/session/:id/follow-up", createFollowUp(db))
	r.Get("/session/:id/follow-ups", listFollowUps(db))
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
		writeEvent(db, c.Context(), id, userID(c), "POD_CAPTURED", fiber.Map{
			"payload": fiber.Map{"attachment_id": body.AttachmentID},
		})
		return shared.OK(c, fiber.Map{"id": id, "pod_attachment_id": body.AttachmentID})
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
		cartonNo := strings.TrimSpace(body.CartonNo)
		var cartonID int
		var status, cNo string
		if body.CartonID > 0 {
			err = db.QueryRow(c.Context(), `
				SELECT id, carton_no, status FROM grn_cartons WHERE id=$1 AND grn_session_id=$2`,
				body.CartonID, sessionID).Scan(&cartonID, &cNo, &status)
		} else if cartonNo != "" {
			err = db.QueryRow(c.Context(), `
				SELECT id, carton_no, status FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`,
				sessionID, cartonNo).Scan(&cartonID, &cNo, &status)
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
		if st == "verified" {
			return shared.OK(c, fiber.Map{"id": cartonID, "carton_no": cNo, "status": status, "already_verified": true})
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET active_verify_carton_id=$2, status='item_verification', updated_at=now()
			WHERE id=$1 AND status NOT IN ('closed','completed')`, sessionID, cartonID)
		writeEvent(db, c.Context(), sessionID, userID(c), "BOX_OPENED_FOR_VERIFY", fiber.Map{"box_no": cNo})
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
		SELECT id, item_code, COALESCE(expected_qty,0), COALESCE(scanned_qty,0), COALESCE(damaged_qty,0), status,
		       COALESCE(invoice_no,'')
		FROM grn_lines WHERE grn_carton_id=$1 ORDER BY id`, cartonID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []fiber.Map{}
	for rows.Next() {
		var id int
		var code, st, inv string
		var exp, scan, dmg float64
		if err := rows.Scan(&id, &code, &exp, &scan, &dmg, &st, &inv); err != nil {
			return nil, err
		}
		out = append(out, fiber.Map{
			"id": id, "item_code": code, "expected_qty": exp, "scanned_qty": scan,
			"damaged_qty": dmg, "status": st, "invoice_no": inv,
			"remaining": exp - scan,
		})
	}
	return out, nil
}

// verifyItemScan increments scans against the active box (packing-list) or session lines (invoice-only).
func verifyItemScan(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			ItemCode string  `json:"item_code"`
			Qty      float64 `json:"qty"`
			CartonID int     `json:"carton_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		itemCode := strings.TrimSpace(body.ItemCode)
		if itemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}
		if body.Qty <= 0 {
			body.Qty = 1
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
			return verifyAgainstBox(c, db, sessionID, cartonID, itemCode, body.Qty)
		}
		return verifyInvoiceOnly(c, db, sessionID, itemCode, body.Qty)
	}
}

func verifyAgainstBox(c *fiber.Ctx, db *pgxpool.Pool, sessionID, cartonID int, itemCode string, qty float64) error {
	var boxNo string
	if err := db.QueryRow(c.Context(), `SELECT carton_no FROM grn_cartons WHERE id=$1 AND grn_session_id=$2`,
		cartonID, sessionID).Scan(&boxNo); err != nil {
		return shared.Err(c, fiber.StatusNotFound, "box not found")
	}

	var lineID int
	var expected, scanned float64
	var lineStatus string
	err := db.QueryRow(c.Context(), `
		SELECT id, COALESCE(expected_qty,0), COALESCE(scanned_qty,0), status
		FROM grn_lines WHERE grn_carton_id=$1 AND item_code=$2
		ORDER BY CASE WHEN status IN ('pending','shortage') THEN 0 ELSE 1 END, id
		LIMIT 1`, cartonID, itemCode).Scan(&lineID, &expected, &scanned, &lineStatus)
	if err == pgx.ErrNoRows {
		writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_WRONG_SCANNED", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": "wrong_item",
		})
		writeException(db, c.Context(), sessionID, userID(c), "wrong_item", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "scanned_qty": qty, "expected_qty": 0, "variance": qty,
		})
		_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status='exception' WHERE id=$1 AND status <> 'verified'`, cartonID)
		return shared.OK(c, fiber.Map{
			"ok": false, "wrong_item": true, "message": "WRONG ITEM — not expected in this box",
			"item_code": itemCode, "box_no": boxNo,
		})
	}
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}

	newScanned := scanned + qty
	newStatus := "pending"
	excess := 0.0
	if expected > 0 && newScanned > expected {
		excess = newScanned - expected
		newStatus = "excess"
		writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_EXCESS_DETECTED", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": "excess",
		})
		writeException(db, c.Context(), sessionID, userID(c), "excess", fiber.Map{
			"box_no": boxNo, "part_no": itemCode, "expected_qty": expected, "scanned_qty": newScanned, "variance": excess,
		})
		_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status='exception' WHERE id=$1 AND status <> 'verified'`, cartonID)
	} else if expected > 0 && newScanned < expected {
		newStatus = "shortage"
		var exists int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_exceptions
			WHERE grn_session_id=$1 AND exception_type='shortage' AND status='open'
			  AND COALESCE(box_no,'')=$2 AND COALESCE(part_no,'')=$3`, sessionID, boxNo, itemCode).Scan(&exists)
		if exists == 0 {
			ensureShortageException(db, c, sessionID, "", boxNo, itemCode, expected, newScanned)
			writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_SHORT_RECORDED", fiber.Map{
				"box_no": boxNo, "part_no": itemCode, "quantity": expected - newScanned, "result": "shortage",
			})
		}
	} else if expected > 0 && newScanned == expected {
		newStatus = "full_match"
	} else {
		newStatus = "full_match"
	}

	_, err = db.Exec(c.Context(), `
		UPDATE grn_lines SET scanned_qty=$2, status=$3,
			qty_short = GREATEST(COALESCE(expected_qty,0)-$2,0),
			qty_excess = GREATEST($2-COALESCE(expected_qty,0),0)
		WHERE id=$1`, lineID, newScanned, newStatus)
	if err != nil {
		_, err = db.Exec(c.Context(), `UPDATE grn_lines SET scanned_qty=$2, status=$3 WHERE id=$1`, lineID, newScanned, newStatus)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
	}

	writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_SCANNED", fiber.Map{
		"box_no": boxNo, "part_no": itemCode, "quantity": qty, "result": newStatus,
	})

	closed, closeMsg := tryAutoCloseBox(db, c, sessionID, cartonID, boxNo)
	contents, _ := loadBoxContents(db, c, cartonID)
	return shared.OK(c, fiber.Map{
		"ok": true, "line_id": lineID, "item_code": itemCode, "scanned_qty": newScanned,
		"expected_qty": expected, "status": newStatus, "box_auto_closed": closed,
		"box_message": closeMsg, "lines": contents, "box_no": boxNo,
	})
}

func tryAutoCloseBox(db *pgxpool.Pool, c *fiber.Ctx, sessionID, cartonID int, boxNo string) (bool, string) {
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
		UPDATE grn_cartons SET status='verified', verified_at=now(), verified_by=$2 WHERE id=$1`,
		cartonID, userID(c))
	_, _ = db.Exec(c.Context(), `
		UPDATE grn_sessions SET active_verify_carton_id=NULL WHERE id=$1 AND active_verify_carton_id=$2`,
		sessionID, cartonID)
	writeEvent(db, c.Context(), sessionID, userID(c), "BOX_AUTO_VERIFIED", fiber.Map{
		"box_no": boxNo, "result": "verified",
	})
	return true, "BOX VERIFIED — no discrepancy — next box ready"
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
				writeException(db, c.Context(), sessionID, userID(c), "shortage", fiber.Map{
					"box_no": boxNo, "part_no": code, "expected_qty": exp, "scanned_qty": scan, "variance": scan - exp,
				})
				writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_SHORT_RECORDED", fiber.Map{
					"box_no": boxNo, "part_no": code, "quantity": exp - scan, "reason": body.Reason,
				})
			}
		}
		_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status='exception', verified_at=now(), verified_by=$2 WHERE id=$1`, body.CartonID, userID(c))
		_, _ = db.Exec(c.Context(), `UPDATE grn_sessions SET active_verify_carton_id=NULL WHERE id=$1`, sessionID)
		writeEvent(db, c.Context(), sessionID, userID(c), "BOX_CLOSED", fiber.Map{"box_no": boxNo, "result": "exception", "reason": body.Reason})
		return shared.OK(c, fiber.Map{"id": body.CartonID, "status": "exception", "carton_no": boxNo})
	}
}

func verifyInvoiceOnly(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, itemCode string, qty float64) error {
	var lineID int
	var expected, scanned float64
	err := db.QueryRow(c.Context(), `
		SELECT id, COALESCE(expected_qty,0), COALESCE(scanned_qty,0)
		FROM grn_lines WHERE grn_session_id=$1 AND item_code=$2
		ORDER BY id LIMIT 1`, sessionID, itemCode).Scan(&lineID, &expected, &scanned)
	if err == pgx.ErrNoRows {
		// Create unexpected line
		err = db.QueryRow(c.Context(), `
			INSERT INTO grn_lines (grn_session_id, item_code, expected_qty, scanned_qty, status, verification_method)
			SELECT $1, $2, 0, $3, 'excess', 'invoice_only'
			WHERE NOT EXISTS (SELECT 1 FROM grn_lines WHERE grn_session_id=$1 AND item_code=$2)
			RETURNING id`, sessionID, itemCode, qty).Scan(&lineID)
		if err != nil {
			// Need a carton for FK — use/create CONSOLIDATED
			var cartonID int
			_ = db.QueryRow(c.Context(), `
				SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no='CONSOLIDATED'`, sessionID).Scan(&cartonID)
			if cartonID == 0 {
				_ = db.QueryRow(c.Context(), `
					INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected)
					VALUES ($1,'CONSOLIDATED','received',false) RETURNING id`, sessionID).Scan(&cartonID)
			}
			err = db.QueryRow(c.Context(), `
				INSERT INTO grn_lines (grn_carton_id, grn_session_id, item_code, expected_qty, scanned_qty, status, verification_method)
				VALUES ($1,$2,$3,0,$4,'excess','invoice_only') RETURNING id`,
				cartonID, sessionID, itemCode, qty).Scan(&lineID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		writeException(db, c.Context(), sessionID, userID(c), "excess", fiber.Map{
			"part_no": itemCode, "expected_qty": 0, "scanned_qty": qty, "variance": qty,
		})
		writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_EXCESS_DETECTED", fiber.Map{
			"part_no": itemCode, "quantity": qty, "result": "excess",
		})
		return shared.OK(c, fiber.Map{"ok": true, "status": "excess", "item_code": itemCode, "scanned_qty": qty})
	}
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	newScanned := scanned + qty
	st := "full_match"
	if expected > 0 && newScanned < expected {
		st = "shortage"
		var exists int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_exceptions
			WHERE grn_session_id=$1 AND exception_type='shortage' AND status='open'
			  AND COALESCE(part_no,'')=$2`, sessionID, itemCode).Scan(&exists)
		if exists == 0 {
			ensureShortageException(db, c, sessionID, "", "", itemCode, expected, newScanned)
			writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_SHORT_RECORDED", fiber.Map{
				"part_no": itemCode, "quantity": expected - newScanned, "result": "shortage",
			})
		}
	} else if expected > 0 && newScanned > expected {
		st = "excess"
		writeException(db, c.Context(), sessionID, userID(c), "excess", fiber.Map{
			"part_no": itemCode, "expected_qty": expected, "scanned_qty": newScanned, "variance": newScanned - expected,
		})
	}
	_, _ = db.Exec(c.Context(), `UPDATE grn_lines SET scanned_qty=$2, status=$3 WHERE id=$1`, lineID, newScanned, st)
	writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_SCANNED", fiber.Map{
		"part_no": itemCode, "quantity": qty, "result": st,
	})
	return shared.OK(c, fiber.Map{
		"ok": true, "line_id": lineID, "item_code": itemCode, "scanned_qty": newScanned,
		"expected_qty": expected, "status": st,
	})
}

func resolveException(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid exception id")
		}
		var body struct {
			Resolution string `json:"resolution"`
			Status     string `json:"status"`
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
		writeEvent(db, c.Context(), sessionID, userID(c), "EXCEPTION_RESOLVED", fiber.Map{
			"reason": body.Resolution, "result": st, "payload": fiber.Map{"exception_id": id},
		})
		return shared.OK(c, fiber.Map{"id": id, "status": st})
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
		writeEvent(db, c.Context(), sessionID, userID(c), "AUDIT_STARTED", fiber.Map{
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
			writeEvent(db, c.Context(), sessionID, userID(c), "AUDIT_DISCREPANCY_FOUND", fiber.Map{
				"part_no": part, "quantity": body.PhysicalQty, "result": "fail",
				"payload": fiber.Map{"system_qty": sys, "physical_qty": body.PhysicalQty},
			})
		} else {
			writeEvent(db, c.Context(), sessionID, userID(c), "AUDIT_ITEM_CHECKED", fiber.Map{
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
		writeEvent(db, c.Context(), sessionID, userID(c), "AUDIT_COMPLETED", fiber.Map{
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
		var supplier *string
		var warehouseID *int
		var mode string
		err = db.QueryRow(c.Context(), `
			SELECT supplier_name, warehouse_id, COALESCE(receiving_mode,'packing_list')
			FROM grn_sessions WHERE id=$1`, parentID).Scan(&supplier, &warehouseID, &mode)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "parent GRN not found")
		}
		var id int
		var sessionNo string
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
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		// Copy open shortage lines as expected on follow-up
		rows, _ := db.Query(c.Context(), `
			SELECT COALESCE(gl.invoice_no,''), gc.carton_no, gl.item_code,
			       GREATEST(COALESCE(gl.expected_qty,0)-COALESCE(gl.scanned_qty,0), COALESCE(gl.qty_short,0))
			FROM grn_lines gl
			JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
			WHERE gl.grn_session_id=$1 AND (
				gl.status='shortage' OR COALESCE(gl.scanned_qty,0) < COALESCE(gl.expected_qty,0)
			)`, parentID)
		created := 0
		if rows != nil {
			defer rows.Close()
			cartonCache := map[string]int{}
			for rows.Next() {
				var inv, box, part string
				var shortQty float64
				if err := rows.Scan(&inv, &box, &part, &shortQty); err != nil || shortQty <= 0 {
					continue
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
		}
		writeEvent(db, c.Context(), parentID, userID(c), "FOLLOWUP_RECEIPT_CREATED", fiber.Map{
			"payload": fiber.Map{"followup_id": id, "session_no": sessionNo, "lines": created},
		})
		writeEvent(db, c.Context(), id, userID(c), "GRN_CREATED", fiber.Map{
			"payload": fiber.Map{"parent_grn_id": parentID, "is_followup": true},
		})
		return shared.OK(c, fiber.Map{
			"id": id, "session_no": sessionNo, "parent_grn_id": parentID, "lines_seeded": created,
		})
	}
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
