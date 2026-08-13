package grn

import (
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerCompletionRoutes(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/session/:id/invoice-expected", seedInvoiceExpected(db))
	r.Get("/session/:id/invoice-expected", listInvoiceExpected(db))
	r.Get("/session/:id/item-summary", itemSummary(db))
	r.Post("/session/:id/complete-verification", completeItemVerification(db))
	r.Post("/session/:id/finalize", finalizeGRN(db))
	r.Get("/exceptions", listAllExceptions(db))
	r.Get("/follow-ups", listAllFollowUps(db))
}

// seedInvoiceExpected accepts invoice expected lines for invoice-only mode and
// materializes them on a CONSOLIDATED carton for verifyInvoiceOnly.
func seedInvoiceExpected(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			Lines []struct {
				InvoiceNo string  `json:"invoice_no"`
				PartNo    string  `json:"part_no"`
				ItemCode  string  `json:"item_code"`
				Qty       float64 `json:"qty"`
				Expected  float64 `json:"expected_qty"`
			} `json:"lines"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Lines) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "lines required")
		}
		var mode, status string
		if err := db.QueryRow(c.Context(), `
			SELECT COALESCE(receiving_mode,'packing_list'), status FROM grn_sessions WHERE id=$1`, sessionID).
			Scan(&mode, &status); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if !sessionWritable(status) {
			return shared.Err(c, fiber.StatusBadRequest, "session is closed")
		}

		var cartonID int
		_ = db.QueryRow(c.Context(), `
			SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no='CONSOLIDATED'`, sessionID).Scan(&cartonID)
		if cartonID == 0 {
			err = db.QueryRow(c.Context(), `
				INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected)
				VALUES ($1,'CONSOLIDATED','received',false) RETURNING id`, sessionID).Scan(&cartonID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}

		created, updated := 0, 0
		for _, ln := range body.Lines {
			part := strings.TrimSpace(ln.PartNo)
			if part == "" {
				part = strings.TrimSpace(ln.ItemCode)
			}
			qty := ln.Qty
			if qty <= 0 {
				qty = ln.Expected
			}
			inv := strings.TrimSpace(ln.InvoiceNo)
			if part == "" || qty <= 0 {
				continue
			}
			if inv == "" {
				inv = "INV"
			}
			_, _ = db.Exec(c.Context(), `
				INSERT INTO grn_invoice_lines (grn_session_id, invoice_no, part_no, expected_qty)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (grn_session_id, invoice_no, part_no)
				DO UPDATE SET expected_qty = grn_invoice_lines.expected_qty + EXCLUDED.expected_qty`,
				sessionID, inv, part, qty)

			var lineID int
			err = db.QueryRow(c.Context(), `
				SELECT id FROM grn_lines WHERE grn_session_id=$1 AND item_code=$2
				  AND COALESCE(invoice_no,'') = $3
				ORDER BY id LIMIT 1`, sessionID, part, inv).Scan(&lineID)
			if err != nil {
				err = db.QueryRow(c.Context(), `
					INSERT INTO grn_lines (
						grn_carton_id, grn_session_id, item_code, expected_qty, scanned_qty,
						status, invoice_no, verification_method
					) VALUES ($1,$2,$3,$4,0,'pending',$5,'invoice_only') RETURNING id`,
					cartonID, sessionID, part, qty, inv).Scan(&lineID)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				created++
			} else {
				_, _ = db.Exec(c.Context(), `
					UPDATE grn_lines SET expected_qty = COALESCE(expected_qty,0) + $2 WHERE id=$1`, lineID, qty)
				updated++
			}
			_, _ = db.Exec(c.Context(), `
				INSERT INTO grn_invoices (grn_session_id, invoice_no)
				VALUES ($1,$2) ON CONFLICT (grn_session_id, invoice_no) DO NOTHING`, sessionID, inv)
		}

		writeEvent(db, c.Context(), sessionID, userID(c), "INVOICE_EXPECTED_SEEDED", fiber.Map{
			"payload": fiber.Map{"created": created, "updated": updated, "mode": mode},
		})
		return shared.OK(c, fiber.Map{
			"created": created, "updated": updated, "carton_id": cartonID,
		})
	}
}

func listInvoiceExpected(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT id, invoice_no, part_no, expected_qty
			FROM grn_invoice_lines WHERE grn_session_id=$1 ORDER BY invoice_no, part_no`, sessionID)
		if err != nil {
			rows2, err2 := db.Query(c.Context(), `
				SELECT id, COALESCE(invoice_no,''), item_code, COALESCE(expected_qty,0)
				FROM grn_lines WHERE grn_session_id=$1 AND verification_method='invoice_only'
				ORDER BY item_code`, sessionID)
			if err2 != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			defer rows2.Close()
			out := []fiber.Map{}
			for rows2.Next() {
				var id int
				var inv, part string
				var qty float64
				_ = rows2.Scan(&id, &inv, &part, &qty)
				out = append(out, fiber.Map{"id": id, "invoice_no": inv, "part_no": part, "expected_qty": qty})
			}
			return shared.OK(c, out)
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var id int
			var inv, part string
			var qty float64
			if err := rows.Scan(&id, &inv, &part, &qty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{"id": id, "invoice_no": inv, "part_no": part, "expected_qty": qty})
		}
		return shared.OK(c, out)
	}
}

func itemSummary(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		sum, err := itemSummaryData(db, c, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		var putawayStatus, sessionStatus string
		var podID *int
		_ = db.QueryRow(c.Context(), `
			SELECT status, COALESCE(putaway_status,'pending'), pod_attachment_id
			FROM grn_sessions WHERE id=$1`, sessionID).Scan(&sessionStatus, &putawayStatus, &podID)
		sum["putaway_status"] = putawayStatus
		sum["status"] = sessionStatus
		sum["pod_attachment_id"] = podID
		return shared.OK(c, sum)
	}
}

func completeItemVerification(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var status string
		if err := db.QueryRow(c.Context(), `SELECT status FROM grn_sessions WHERE id=$1`, sessionID).Scan(&status); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if !sessionWritable(status) {
			return shared.Err(c, fiber.StatusBadRequest, "session is closed")
		}

		rows, err := db.Query(c.Context(), `
			SELECT gl.id, COALESCE(gc.carton_no,''), gl.item_code, COALESCE(gl.invoice_no,''),
			       COALESCE(gl.expected_qty,0), COALESCE(gl.scanned_qty,0)
			FROM grn_lines gl
			LEFT JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
			WHERE gl.grn_session_id=$1
			  AND COALESCE(gl.scanned_qty,0) < COALESCE(gl.expected_qty,0)
			  AND COALESCE(gl.expected_qty,0) > 0`, sessionID)
		shortCount := 0
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var lid int
				var box, part, inv string
				var exp, scan float64
				_ = rows.Scan(&lid, &box, &part, &inv, &exp, &scan)
				_, _ = db.Exec(c.Context(), `
					UPDATE grn_lines SET status='shortage',
						qty_short = GREATEST(COALESCE(expected_qty,0)-COALESCE(scanned_qty,0),0)
					WHERE id=$1`, lid)
				ensureShortageException(db, c, sessionID, inv, box, part, exp, scan)
				writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_SHORT_RECORDED", fiber.Map{
					"invoice_no": inv, "box_no": box, "part_no": part, "quantity": exp - scan, "result": "shortage",
				})
				shortCount++
			}
		}

		var openExc int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_exceptions WHERE grn_session_id=$1 AND status='open'`, sessionID).Scan(&openExc)

		next := "item_verification_complete"
		if openExc > 0 {
			next = "exception_pending"
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET status=$2, active_verify_carton_id=NULL, updated_at=now() WHERE id=$1`, sessionID, next)
		writeEvent(db, c.Context(), sessionID, userID(c), "ITEM_VERIFICATION_COMPLETE", fiber.Map{
			"result": next, "payload": fiber.Map{"shortages": shortCount, "open_exceptions": openExc},
		})
		return shared.OK(c, fiber.Map{
			"id": sessionID, "status": next, "shortages_recorded": shortCount, "open_exceptions": openExc,
		})
	}
}

func ensureShortageException(db *pgxpool.Pool, c *fiber.Ctx, sessionID int, inv, box, part string, exp, scan float64) {
	var exists int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_exceptions
		WHERE grn_session_id=$1 AND exception_type='shortage' AND status='open'
		  AND COALESCE(box_no,'')=$2 AND COALESCE(part_no,'')=$3`, sessionID, box, part).Scan(&exists)
	if exists > 0 {
		return
	}
	writeException(db, c.Context(), sessionID, userID(c), "shortage", fiber.Map{
		"invoice_no": inv, "box_no": box, "part_no": part,
		"expected_qty": exp, "scanned_qty": scan, "variance": scan - exp,
	})
}

func finalizeGRN(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			Force bool `json:"force"`
		}
		_ = shared.Bind(c, &body)

		var status string
		var stockPosted *string
		if err := db.QueryRow(c.Context(), `
			SELECT status, stock_posted_at::text FROM grn_sessions WHERE id=$1`, sessionID).
			Scan(&status, &stockPosted); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if status == "completed" || status == "closed" {
			return shared.Err(c, fiber.StatusBadRequest, "session already finalized")
		}
		if stockPosted != nil && *stockPosted != "" {
			return shared.Err(c, fiber.StatusBadRequest, "stock already posted")
		}

		st := strings.ToLower(status)
		okStatus := st == "item_verification_complete" || st == "exception_pending" ||
			st == "putaway_pending" || st == "item_verification"
		if !okStatus && !body.Force {
			return shared.Err(c, fiber.StatusBadRequest,
				"complete item verification first")
		}

		var openExc int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_exceptions WHERE grn_session_id=$1 AND status='open'`, sessionID).Scan(&openExc)
		if openExc > 0 && !body.Force {
			return shared.Err(c, fiber.StatusBadRequest,
				"resolve open exceptions before finalize (or force as supervisor)")
		}

		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET putaway_status='deferred', updated_at=now() WHERE id=$1`, sessionID)

		c.Locals("grnCloseStatus", "completed")
		c.Locals("grnCloseSilent", true)
		if err := doCloseSession(c, db, sessionID); err != nil {
			return err
		}
		writeEvent(db, c.Context(), sessionID, userID(c), "GRN_COMPLETED", fiber.Map{
			"result": "completed", "payload": fiber.Map{"putaway": "deferred"},
		})

		posted, _ := c.Locals("grnCloseResult").(fiber.Map)
		sum := fiber.Map{}
		if r, err := itemSummaryData(db, c, sessionID); err == nil {
			sum = r
		}
		var boxExp, boxRecv, boxMiss, boxExcess int
		_ = db.QueryRow(c.Context(), `
			SELECT
			  COUNT(*) FILTER (WHERE COALESCE(is_expected,false) OR status IN ('expected','missing','received','accounted','verified','exception')),
			  COUNT(*) FILTER (WHERE status IN ('received','accounted','verified','exception')),
			  COUNT(*) FILTER (WHERE status='missing'),
			  COUNT(*) FILTER (WHERE status='excess')
			FROM grn_cartons WHERE grn_session_id=$1 AND carton_no <> 'CONSOLIDATED'`, sessionID).
			Scan(&boxExp, &boxRecv, &boxMiss, &boxExcess)

		return shared.OK(c, fiber.Map{
			"id": sessionID, "status": "completed",
			"putaway_status": "deferred",
			"posted":         posted,
			"summary": fiber.Map{
				"boxes_expected": boxExp, "boxes_received": boxRecv,
				"boxes_missing": boxMiss, "boxes_excess": boxExcess,
				"items": sum,
			},
		})
	}
}

func itemSummaryData(db *pgxpool.Pool, c *fiber.Ctx, sessionID int) (fiber.Map, error) {
	var exp, recv, short, excess float64
	err := db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(expected_qty),0), COALESCE(SUM(scanned_qty),0),
		       COALESCE(SUM(GREATEST(COALESCE(expected_qty,0)-COALESCE(scanned_qty,0),0)),0),
		       COALESCE(SUM(GREATEST(COALESCE(scanned_qty,0)-COALESCE(expected_qty,0),0)),0)
		FROM grn_lines WHERE grn_session_id=$1`, sessionID).Scan(&exp, &recv, &short, &excess)
	if err != nil {
		return nil, err
	}
	var openExc, resolvedExc int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FILTER (WHERE status='open'), COUNT(*) FILTER (WHERE status='resolved')
		FROM grn_exceptions WHERE grn_session_id=$1`, sessionID).Scan(&openExc, &resolvedExc)
	var auditStatus string
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE((SELECT status FROM grn_audits WHERE grn_session_id=$1 ORDER BY id DESC LIMIT 1),'none')`,
		sessionID).Scan(&auditStatus)
	return fiber.Map{
		"expected_qty": exp, "received_qty": recv, "short_qty": short, "excess_qty": excess,
		"exceptions_open": openExc, "exceptions_resolved": resolvedExc, "audit_status": auditStatus,
	}, nil
}

func listAllExceptions(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		status := strings.TrimSpace(c.Query("status", "open"))
		q := `
			SELECT e.id, e.grn_session_id, s.session_no, e.exception_type, COALESCE(e.box_no,''),
			       COALESCE(e.part_no,''), e.expected_qty, e.scanned_qty, e.variance, e.status,
			       COALESCE(e.resolution,''), e.created_at::text, COALESCE(s.supplier_name,'')
			FROM grn_exceptions e
			JOIN grn_sessions s ON s.id = e.grn_session_id`
		args := []any{}
		if status != "" && status != "all" {
			q += ` WHERE e.status=$1`
			args = append(args, status)
		}
		q += ` ORDER BY e.id DESC LIMIT 200`
		rows, err := db.Query(c.Context(), q, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var id, sid int
			var sno, et, box, part, st, res, created, supplier string
			var exp, scan, vari *float64
			if err := rows.Scan(&id, &sid, &sno, &et, &box, &part, &exp, &scan, &vari, &st, &res, &created, &supplier); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": id, "grn_session_id": sid, "session_no": sno, "exception_type": et,
				"box_no": box, "part_no": part, "expected_qty": exp, "scanned_qty": scan,
				"variance": vari, "status": st, "resolution": res, "created_at": created,
				"supplier_name": supplier,
			})
		}
		return shared.OK(c, out)
	}
}

func listAllFollowUps(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT f.id, f.session_no, f.status, f.parent_grn_id, p.session_no, f.created_at::text,
			       COALESCE(f.supplier_name,'')
			FROM grn_sessions f
			LEFT JOIN grn_sessions p ON p.id = f.parent_grn_id
			WHERE COALESCE(f.is_followup,false)=true
			ORDER BY f.id DESC LIMIT 200`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var id int
			var no, st, created, supplier string
			var parentID *int
			var parentNo *string
			if err := rows.Scan(&id, &no, &st, &parentID, &parentNo, &created, &supplier); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": id, "session_no": no, "status": st, "parent_grn_id": parentID,
				"parent_session_no": parentNo, "created_at": created, "supplier_name": supplier,
			})
		}
		return shared.OK(c, out)
	}
}
