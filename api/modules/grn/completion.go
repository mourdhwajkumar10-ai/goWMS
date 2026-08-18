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
	registerDocCompare(r, db)
	r.Post("/session/:id/complete-verification", completeItemVerification(db))
	r.Post("/session/:id/finalize", finalizeGRN(db))
	r.Get("/exceptions", listAllExceptions(db))
	r.Get("/follow-ups", listAllFollowUps(db))
	r.Get("/audits", listAllAudits(db))
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

		writeEvent(db, c, sessionID, "INVOICE_EXPECTED_SEEDED", fiber.Map{
			"payload": fiber.Map{"created": created, "updated": updated, "mode": mode},
		})
		cmp := applyInvoiceComparison(c, db, sessionID)
		return shared.OK(c, fiber.Map{
			"created": created, "updated": updated, "carton_id": cartonID,
			"comparison": cmp, "mismatch": cmp.Mismatch,
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
		healFalsePOExcess(c, db, sessionID)

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
				writeEvent(db, c, sessionID, "ITEM_SHORT_RECORDED", fiber.Map{
					"invoice_no": inv, "box_no": box, "part_no": part, "quantity": exp - scan, "result": "shortage",
				})
				shortCount++
			}
			rows.Close()
		}

		excessCount := 0
		exRows, exErr := db.Query(c.Context(), `
			SELECT gl.id, COALESCE(gc.carton_no,''), gl.item_code, COALESCE(gl.invoice_no,''),
			       COALESCE(gl.expected_qty,0), COALESCE(gl.scanned_qty,0)
			FROM grn_lines gl
			LEFT JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
			WHERE gl.grn_session_id=$1
			  AND COALESCE(gl.expected_qty,0) > 0
			  AND COALESCE(gl.scanned_qty,0) > COALESCE(gl.expected_qty,0)`, sessionID)
		if exErr == nil {
			for exRows.Next() {
				var lid int
				var box, part, inv string
				var exp, scan float64
				_ = exRows.Scan(&lid, &box, &part, &inv, &exp, &scan)
				_, _ = db.Exec(c.Context(), `UPDATE grn_lines SET status='excess' WHERE id=$1`, lid)
				ensureExcessException(db, c, sessionID, inv, box, part, exp, scan)
				writeEvent(db, c, sessionID, "ITEM_EXCESS_DETECTED", fiber.Map{
					"invoice_no": inv, "box_no": box, "part_no": part, "quantity": scan - exp, "result": "excess",
				})
				excessCount++
			}
			exRows.Close()
		}

		poShort, poExcess := reconcileSessionAgainstPO(db, c, sessionID)
		shortCount += poShort
		excessCount += poExcess

		var openExc int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_exceptions WHERE grn_session_id=$1 AND status='open'`, sessionID).Scan(&openExc)

		next := "putaway_pending"
		if openExc > 0 {
			next = "exception_pending"
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET status=$2, active_verify_carton_id=NULL, updated_at=now() WHERE id=$1`, sessionID, next)
		writeEvent(db, c, sessionID, "ITEM_VERIFICATION_COMPLETE", fiber.Map{
			"result": next, "payload": fiber.Map{
				"shortages": shortCount, "excesses": excessCount, "open_exceptions": openExc,
				"net_offset": shortCount > 0 && excessCount > 0,
			},
		})
		return shared.OK(c, fiber.Map{
			"id": sessionID, "status": next,
			"shortages_recorded": shortCount, "excesses_recorded": excessCount,
			"open_exceptions": openExc, "net_offset": shortCount > 0 && excessCount > 0,
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
	writeException(db, c, sessionID, "shortage", fiber.Map{
		"invoice_no": inv, "box_no": box, "part_no": part,
		"expected_qty": exp, "scanned_qty": scan, "variance": scan - exp,
	})
}

func ensureExcessException(db *pgxpool.Pool, c *fiber.Ctx, sessionID int, inv, box, part string, exp, scan float64) {
	var exists int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_exceptions
		WHERE grn_session_id=$1 AND exception_type='excess' AND status='open'
		  AND COALESCE(box_no,'')=$2 AND COALESCE(part_no,'')=$3`, sessionID, box, part).Scan(&exists)
	if exists > 0 {
		return
	}
	writeException(db, c, sessionID, "excess", fiber.Map{
		"invoice_no": inv, "box_no": box, "part_no": part,
		"expected_qty": exp, "scanned_qty": scan, "variance": scan - exp,
	})
}

// reconcileSessionAgainstPO records session-level short/excess when there is no
// packing list (skipped import). Items that already have expected packing-list
// or invoice lines are left to the per-line pass above.
func reconcileSessionAgainstPO(db *pgxpool.Pool, c *fiber.Ctx, sessionID int) (shortCount, excessCount int) {
	var imported int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_lines
		WHERE grn_session_id=$1 AND COALESCE(verification_method,'')='import'`, sessionID).Scan(&imported)
	if imported > 0 {
		return 0, 0
	}
	rows, err := db.Query(c.Context(), `
		SELECT MIN(poi.item_code),
		       SUM(GREATEST(COALESCE(poi.qty,0)-COALESCE(poi.received_qty,0),0))
		FROM purchase_order_items poi
		JOIN purchase_orders po ON po.id = poi.purchase_order_id
		JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
		WHERE gs.id=$1
		GROUP BY UPPER(poi.item_code)`, sessionID)
	if err != nil {
		return 0, 0
	}
	defer rows.Close()
	for rows.Next() {
		var part string
		var remaining float64
		if err := rows.Scan(&part, &remaining); err != nil || part == "" {
			continue
		}
		var mapped int
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM grn_lines
			WHERE grn_session_id=$1 AND UPPER(item_code)=UPPER($2)
			  AND (COALESCE(expected_qty,0) > 0 OR COALESCE(scanned_qty,0) > 0)
			  AND COALESCE(verification_method,'') NOT IN ('po_fallback')`, sessionID, part).Scan(&mapped)
		if mapped > 0 {
			continue
		}
		scanned := sessionScannedQtyForItem(c, db, sessionID, part, 0)
		if remaining > 0 && scanned < remaining {
			ensureShortageException(db, c, sessionID, "", "", part, remaining, scanned)
			writeEvent(db, c, sessionID, "ITEM_SHORT_RECORDED", fiber.Map{
				"part_no": part, "quantity": remaining - scanned, "result": "shortage",
				"payload": fiber.Map{"source": "po"},
			})
			shortCount++
		} else if remaining > 0 && scanned > remaining {
			ensureExcessException(db, c, sessionID, "", "", part, remaining, scanned)
			writeEvent(db, c, sessionID, "ITEM_EXCESS_DETECTED", fiber.Map{
				"part_no": part, "quantity": scanned - remaining, "result": "excess",
				"payload": fiber.Map{"source": "po"},
			})
			excessCount++
		}
	}
	return shortCount, excessCount
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
		healFalsePOExcess(c, db, sessionID)

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
		writeEvent(db, c, sessionID, "GRN_COMPLETED", fiber.Map{
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
	if exp == 0 {
		var poExp float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(GREATEST(COALESCE(poi.qty,0)-COALESCE(poi.received_qty,0),0)),0)
			FROM purchase_order_items poi
			JOIN purchase_orders po ON po.id = poi.purchase_order_id
			JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
			WHERE gs.id=$1`, sessionID).Scan(&poExp)
		if poExp > 0 {
			exp = poExp
			short = poExp - recv
			if short < 0 {
				excess = -short
				short = 0
			} else {
				excess = 0
			}
		}
	}
	var openExc, resolvedExc int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FILTER (WHERE status='open'), COUNT(*) FILTER (WHERE status='resolved')
		FROM grn_exceptions WHERE grn_session_id=$1`, sessionID).Scan(&openExc, &resolvedExc)
	var auditStatus string
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE((SELECT status FROM grn_audits WHERE grn_session_id=$1 ORDER BY id DESC LIMIT 1),'none')`,
		sessionID).Scan(&auditStatus)

	partRows, _ := db.Query(c.Context(), `
		SELECT COALESCE(gl.item_code,''), COALESCE(gc.carton_no,''),
		       SUM(COALESCE(gl.expected_qty,0)), SUM(COALESCE(gl.scanned_qty,0))
		FROM grn_lines gl
		LEFT JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
		WHERE gl.grn_session_id=$1
		GROUP BY gl.item_code, gc.carton_no
		ORDER BY gl.item_code, gc.carton_no`, sessionID)
	var partLines []partBoxQty
	if partRows != nil {
		defer partRows.Close()
		for partRows.Next() {
			var ln partBoxQty
			if err := partRows.Scan(&ln.PartNo, &ln.BoxNo, &ln.Expected, &ln.Scanned); err == nil {
				partLines = append(partLines, ln)
			}
		}
	}

	if exp == 0 || !sessionHasPackingListExpected(c, db, sessionID) {
		partLines = overlayPOExpectedParts(c, db, sessionID, partLines)
		if exp == 0 {
			var poExp, poScan float64
			for _, ln := range partLines {
				poExp += ln.Expected
				poScan += ln.Scanned
			}
			if poExp > 0 {
				exp = poExp
				recv = poScan
				short = poExp - recv
				if short < 0 {
					excess = -short
					short = 0
				} else {
					excess = 0
				}
			}
		}
	}

	return fiber.Map{
		"expected_qty": exp, "received_qty": recv, "short_qty": short, "excess_qty": excess,
		"exceptions_open": openExc, "exceptions_resolved": resolvedExc, "audit_status": auditStatus,
		"parts":      rollupPartReconciliation(partLines),
		"net_offset": short > 0 && excess > 0,
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
			       COALESCE(f.supplier_name,''),
			       COALESCE((SELECT SUM(expected_qty) FROM grn_lines WHERE grn_session_id=f.id),0),
			       COALESCE((SELECT SUM(scanned_qty) FROM grn_lines WHERE grn_session_id=f.id),0)
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
			var exp, recv float64
			if err := rows.Scan(&id, &no, &st, &parentID, &parentNo, &created, &supplier, &exp, &recv); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": id, "session_no": no, "status": st, "parent_grn_id": parentID,
				"parent_session_no": parentNo, "created_at": created, "supplier_name": supplier,
				"expected_qty": exp, "received_qty": recv, "outstanding_qty": exp - recv,
			})
		}
		return shared.OK(c, out)
	}
}

func listAllAudits(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT a.id, a.grn_session_id, s.session_no, a.sample_size, COALESCE(a.status,'open'),
			       a.started_at::text, COALESCE(s.supplier_name,'')
			FROM grn_audits a
			JOIN grn_sessions s ON s.id = a.grn_session_id
			ORDER BY a.id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var id, sid, sample int
			var sno, st, started, supplier string
			if err := rows.Scan(&id, &sid, &sno, &sample, &st, &started, &supplier); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": id, "grn_session_id": sid, "session_no": sno, "sample_size": sample,
				"status": st, "started_at": started, "supplier_name": supplier,
			})
		}
		return shared.OK(c, out)
	}
}

func autoSeedInvoiceExpected(c *fiber.Ctx, db *pgxpool.Pool, sessionID, poID int, invoiceNos string) {
	if db == nil || sessionID < 1 {
		return
	}
	type line struct {
		InvoiceNo string
		PartNo    string
		Qty       float64
	}
	lines := []line{}
	invList := []string{}
	for _, p := range strings.Split(invoiceNos, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			invList = append(invList, p)
		}
	}
	if len(invList) > 0 {
		rows, err := db.Query(c.Context(), `
			SELECT COALESCE(NULLIF(pi.name,''),'INV'), pii.item_code, COALESCE(pii.qty,0)
			FROM purchase_invoice_items pii
			JOIN purchase_invoices pi ON pi.id = pii.purchase_invoice_id
			WHERE pi.name = ANY($1) OR COALESCE(pi.bill_no,'') = ANY($1)`, invList)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var ln line
				if rows.Scan(&ln.InvoiceNo, &ln.PartNo, &ln.Qty) == nil && ln.PartNo != "" && ln.Qty > 0 {
					lines = append(lines, ln)
				}
			}
		}
	}
	if len(lines) == 0 && poID > 0 {
		inv := "INV"
		if len(invList) > 0 {
			inv = invList[0]
		}
		rows, err := db.Query(c.Context(), `
			SELECT item_code, GREATEST(COALESCE(qty,0)-COALESCE(received_qty,0),0)
			FROM purchase_order_items WHERE purchase_order_id=$1`, poID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var ln line
				ln.InvoiceNo = inv
				if rows.Scan(&ln.PartNo, &ln.Qty) == nil && ln.PartNo != "" && ln.Qty > 0 {
					lines = append(lines, ln)
				}
			}
		}
	}
	if len(lines) == 0 {
		return
	}
	payload := []struct {
		InvoiceNo string  `json:"invoice_no"`
		PartNo    string  `json:"part_no"`
		Qty       float64 `json:"qty"`
	}{}
	for _, ln := range lines {
		payload = append(payload, struct {
			InvoiceNo string  `json:"invoice_no"`
			PartNo    string  `json:"part_no"`
			Qty       float64 `json:"qty"`
		}{ln.InvoiceNo, ln.PartNo, ln.Qty})
	}
	seedInvoiceExpectedLines(c, db, sessionID, payload)
}

func seedInvoiceExpectedLines(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, lines []struct {
	InvoiceNo string  `json:"invoice_no"`
	PartNo    string  `json:"part_no"`
	Qty       float64 `json:"qty"`
}) {
	var cartonID int
	_ = db.QueryRow(c.Context(), `
		SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no='CONSOLIDATED'`, sessionID).Scan(&cartonID)
	if cartonID == 0 {
		_ = db.QueryRow(c.Context(), `
			INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected)
			VALUES ($1,'CONSOLIDATED','received',false) RETURNING id`, sessionID).Scan(&cartonID)
	}
	created := 0
	for _, ln := range lines {
		part := strings.TrimSpace(ln.PartNo)
		inv := strings.TrimSpace(ln.InvoiceNo)
		if inv == "" {
			inv = "INV"
		}
		if part == "" || ln.Qty <= 0 || cartonID == 0 {
			continue
		}
		_, _ = db.Exec(c.Context(), `
			INSERT INTO grn_invoice_lines (grn_session_id, invoice_no, part_no, expected_qty)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (grn_session_id, invoice_no, part_no)
			DO UPDATE SET expected_qty = grn_invoice_lines.expected_qty + EXCLUDED.expected_qty`,
			sessionID, inv, part, ln.Qty)
		var lineID int
		err := db.QueryRow(c.Context(), `
			SELECT id FROM grn_lines WHERE grn_session_id=$1 AND item_code=$2 AND COALESCE(invoice_no,'')=$3
			ORDER BY id LIMIT 1`, sessionID, part, inv).Scan(&lineID)
		if err != nil {
			err = db.QueryRow(c.Context(), `
				INSERT INTO grn_lines (grn_carton_id, grn_session_id, item_code, expected_qty, scanned_qty, status, invoice_no, verification_method)
				VALUES ($1,$2,$3,$4,0,'pending',$5,'invoice_only') RETURNING id`,
				cartonID, sessionID, part, ln.Qty, inv).Scan(&lineID)
			if err == nil {
				created++
			}
		}
		_, _ = db.Exec(c.Context(), `
			INSERT INTO grn_invoices (grn_session_id, invoice_no)
			VALUES ($1,$2) ON CONFLICT (grn_session_id, invoice_no) DO NOTHING`, sessionID, inv)
	}
	if created > 0 {
		writeEvent(db, c, sessionID, "INVOICE_EXPECTED_SEEDED", fiber.Map{
			"payload": fiber.Map{"created": created, "source": "auto"},
		})
	}
}

func recordPutawayProgress(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, itemCode string, qty float64, target string, complete bool) {
	var status, paStatus string
	_ = db.QueryRow(c.Context(), `
		SELECT status, COALESCE(putaway_status,'pending') FROM grn_sessions WHERE id=$1`, sessionID).Scan(&status, &paStatus)
	if status == "" {
		return
	}
	if complete {
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET putaway_status='completed', updated_at=now() WHERE id=$1`, sessionID)
		writeEvent(db, c, sessionID, "PUTAWAY_COMPLETED", fiber.Map{
			"part_no": itemCode, "quantity": qty, "result": "completed",
			"payload": fiber.Map{"target_location": target},
		})
		return
	}
	if paStatus == "pending" || paStatus == "deferred" || status == "putaway_pending" || status == "item_verification_complete" {
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET putaway_status='in_progress', status='putaway_in_progress', updated_at=now()
			WHERE id=$1 AND status NOT IN ('closed','completed')`, sessionID)
		writeEvent(db, c, sessionID, "PUTAWAY_STARTED", fiber.Map{
			"part_no": itemCode, "quantity": qty, "result": "started",
			"payload": fiber.Map{"target_location": target},
		})
		return
	}
	writeEvent(db, c, sessionID, "PUTAWAY_STARTED", fiber.Map{
		"part_no": itemCode, "quantity": qty, "result": "in_progress",
		"payload": fiber.Map{"target_location": target},
	})
}

func completePutaway(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		recordPutawayProgress(c, db, sessionID, "", 0, "", true)
		return shared.OK(c, fiber.Map{"id": sessionID, "putaway_status": "completed"})
	}
}

func attachSupportingDoc(db *pgxpool.Pool) fiber.Handler {
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
			return shared.Err(c, fiber.StatusBadRequest, "attachment_id required")
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE grn_sessions SET arrival_attachment_id=$2, updated_at=now() WHERE id=$1`, id, body.AttachmentID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		writeEvent(db, c, id, "TRUCK_CREATED", fiber.Map{
			"result": "supporting_doc", "payload": fiber.Map{"attachment_id": body.AttachmentID},
		})
		return shared.OK(c, fiber.Map{"id": id, "arrival_attachment_id": body.AttachmentID})
	}
}

func createOtherException(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			ExceptionType string  `json:"exception_type"`
			InvoiceNo     string  `json:"invoice_no"`
			BoxNo         string  `json:"box_no"`
			PartNo        string  `json:"part_no"`
			ExpectedQty   float64 `json:"expected_qty"`
			ScannedQty    float64 `json:"scanned_qty"`
			Notes         string  `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		et := strings.ToLower(strings.TrimSpace(body.ExceptionType))
		if et == "" {
			et = "other"
		}
		if !allowedGRNException(et) {
			return shared.Err(c, fiber.StatusBadRequest, "invalid exception_type")
		}
		writeException(db, c, sessionID, et, fiber.Map{
			"invoice_no": body.InvoiceNo, "box_no": body.BoxNo, "part_no": body.PartNo,
			"expected_qty": body.ExpectedQty, "scanned_qty": body.ScannedQty,
			"variance": body.ScannedQty - body.ExpectedQty,
		})
		if strings.TrimSpace(body.Notes) != "" {
			_, _ = db.Exec(c.Context(), `
				UPDATE grn_exceptions SET resolution=$2 WHERE id = (
					SELECT id FROM grn_exceptions WHERE grn_session_id=$1 ORDER BY id DESC LIMIT 1
				)`, sessionID, body.Notes)
		}
		return shared.OK(c, fiber.Map{"ok": true, "exception_type": et})
	}
}
