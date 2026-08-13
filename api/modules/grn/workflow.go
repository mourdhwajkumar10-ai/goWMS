package grn

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func sessionWritable(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "closed", "completed":
		return false
	default:
		return true
	}
}

func sessionAcceptsBoxReceive(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "open", "draft", "receiving", "box_reconciliation":
		return true
	default:
		return false
	}
}

func writeEvent(db *pgxpool.Pool, ctx context.Context, sessionID, actorID int, eventType string, fields fiber.Map) {
	if db == nil || sessionID < 1 || eventType == "" {
		return
	}
	var invoice, box, part, result, reason, device, payload any
	var qty any
	if fields != nil {
		invoice, box, part = fields["invoice_no"], fields["box_no"], fields["part_no"]
		qty, result, reason, device = fields["quantity"], fields["result"], fields["reason"], fields["device"]
		if v, ok := fields["payload"]; ok {
			b, _ := json.Marshal(v)
			payload = string(b)
		}
	}
	var actor any
	if actorID > 0 {
		actor = actorID
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO grn_events (
			grn_session_id, event_type, invoice_no, box_no, part_no, quantity,
			result, reason, actor_id, device, payload
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
		sessionID, eventType, invoice, box, part, qty, result, reason, actor, device, payload)
}

func writeException(db *pgxpool.Pool, ctx context.Context, sessionID, actorID int, excType string, fields fiber.Map) {
	if db == nil || sessionID < 1 || excType == "" {
		return
	}
	get := func(k string) any {
		if fields == nil {
			return nil
		}
		return fields[k]
	}
	var actor any
	if actorID > 0 {
		actor = actorID
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO grn_exceptions (
			grn_session_id, exception_type, invoice_no, box_no, part_no,
			expected_qty, scanned_qty, variance, status, actor_id
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9)`,
		sessionID, excType, get("invoice_no"), get("box_no"), get("part_no"),
		get("expected_qty"), get("scanned_qty"), get("variance"), actor)
}

func registerWorkflowRoutes(r fiber.Router, db *pgxpool.Pool) {
	r.Patch("/session/:id", updateSession(db))
	r.Post("/session/:id/advance", advanceSession(db))
	r.Get("/session/:id/box-summary", boxSummary(db))
	r.Post("/session/:id/complete-box-receiving", completeBoxReceiving(db))
	r.Get("/session/:id/events", listEvents(db))
	r.Get("/session/:id/exceptions", listExceptions(db))
	r.Post("/session/:id/invoices", addInvoice(db))
	r.Get("/session/:id/invoices", listInvoices(db))
	registerVerifyRoutes(r, db)
	registerCompletionRoutes(r, db)
}

func updateSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			SupplierName  *string `json:"supplier_name"`
			ReceivingMode *string `json:"receiving_mode"`
			TruckNo       *string `json:"truck_no"`
			DriverName    *string `json:"driver_name"`
			DriverPhone   *string `json:"driver_phone"`
			ArrivalAt     *string `json:"arrival_at"`
			ExpectedBoxes *int    `json:"expected_boxes"`
			Notes         *string `json:"notes"`
			Plant         *string `json:"plant"`
			Dock          *string `json:"dock"`
			InvoiceNos    *string `json:"invoice_nos"`
			WarehouseID   *int    `json:"warehouse_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		var status string
		if err := db.QueryRow(c.Context(), `SELECT status FROM grn_sessions WHERE id=$1`, id).Scan(&status); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if !sessionWritable(status) {
			return shared.Err(c, fiber.StatusBadRequest, "session is closed")
		}
		if body.ReceivingMode != nil {
			m := strings.ToLower(strings.TrimSpace(*body.ReceivingMode))
			if m != "packing_list" && m != "invoice_only" {
				return shared.Err(c, fiber.StatusBadRequest, "receiving_mode must be packing_list or invoice_only")
			}
			*body.ReceivingMode = m
		}
		arrival := ""
		if body.ArrivalAt != nil {
			arrival = *body.ArrivalAt
		}
		_, err = db.Exec(c.Context(), `
			UPDATE grn_sessions SET
				supplier_name = COALESCE($2, supplier_name),
				receiving_mode = COALESCE($3, receiving_mode),
				truck_no = COALESCE($4, truck_no),
				driver_name = COALESCE($5, driver_name),
				driver_phone = COALESCE($6, driver_phone),
				arrival_at = COALESCE(NULLIF($7,'')::timestamptz, arrival_at),
				expected_boxes = COALESCE($8, expected_boxes),
				notes = COALESCE($9, notes),
				plant = COALESCE($10, plant),
				dock = COALESCE($11, dock),
				invoice_nos = COALESCE($12, invoice_nos),
				warehouse_id = COALESCE($13, warehouse_id),
				updated_at = now()
			WHERE id=$1`,
			id, body.SupplierName, body.ReceivingMode, body.TruckNo, body.DriverName, body.DriverPhone,
			arrival, body.ExpectedBoxes, body.Notes, body.Plant, body.Dock, body.InvoiceNos, body.WarehouseID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		writeEvent(db, c.Context(), id, userID(c), "GRN_UPDATED", nil)
		shared.WriteAudit(db, c.Context(), userID(c), "grn.update", "grn", id, nil, body)
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}

func advanceSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		next := strings.ToLower(strings.TrimSpace(body.Status))
		allowed := map[string]bool{
			"receiving": true, "box_reconciliation": true, "item_verification": true,
			"exception_pending": true, "item_verification_complete": true,
			"putaway_pending": true, "putaway_in_progress": true, "completed": true,
		}
		if !allowed[next] {
			return shared.Err(c, fiber.StatusBadRequest, "invalid target status")
		}
		var cur string
		if err := db.QueryRow(c.Context(), `SELECT status FROM grn_sessions WHERE id=$1`, id).Scan(&cur); err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}
		if !sessionWritable(cur) {
			return shared.Err(c, fiber.StatusBadRequest, "session is closed")
		}
		if _, err = db.Exec(c.Context(), `UPDATE grn_sessions SET status=$2, updated_at=now() WHERE id=$1`, id, next); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		writeEvent(db, c.Context(), id, userID(c), "STATUS_CHANGED", fiber.Map{
			"result": next, "payload": fiber.Map{"from": cur, "to": next},
		})
		return shared.OK(c, fiber.Map{"id": id, "status": next})
	}
}

func boxSummary(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT id, carton_no, status, COALESCE(is_expected,false), scanned_at::text
			FROM grn_cartons WHERE grn_session_id=$1 ORDER BY carton_no`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type box struct {
			ID         int     `json:"id"`
			CartonNo   string  `json:"carton_no"`
			Status     string  `json:"status"`
			IsExpected bool    `json:"is_expected"`
			ScannedAt  *string `json:"scanned_at"`
		}
		list := []box{}
		for rows.Next() {
			var b box
			if err := rows.Scan(&b.ID, &b.CartonNo, &b.Status, &b.IsExpected, &b.ScannedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, b)
		}
		var expected, received, excess, missing int
		for _, b := range list {
			st := strings.ToLower(b.Status)
			switch st {
			case "excess":
				excess++
			case "received", "accounted", "verified", "exception":
				received++
				expected++
			case "expected", "pending", "missing":
				expected++
				missing++
			default:
				if b.IsExpected {
					expected++
					missing++
				}
			}
		}
		return shared.OK(c, fiber.Map{
			"expected_boxes": expected,
			"received_boxes": received,
			"excess_boxes":   excess,
			"missing_boxes":  missing,
			"boxes":          list,
		})
	}
}

func completeBoxReceiving(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, _ := db.Query(c.Context(), `
			SELECT id, carton_no FROM grn_cartons
			WHERE grn_session_id=$1 AND COALESCE(is_expected,false)=true
			  AND status IN ('expected','pending')`, id)
		missing := []string{}
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var cid int
				var cno string
				_ = rows.Scan(&cid, &cno)
				missing = append(missing, cno)
				writeException(db, c.Context(), id, userID(c), "missing_box", fiber.Map{
					"box_no": cno, "expected_qty": 1, "scanned_qty": 0, "variance": -1,
				})
				writeEvent(db, c.Context(), id, userID(c), "BOX_MISSING", fiber.Map{
					"box_no": cno, "result": "missing",
				})
			}
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_cartons SET status='missing'
			WHERE grn_session_id=$1 AND COALESCE(is_expected,false)=true
			  AND status IN ('expected','pending')`, id)
		if _, err = db.Exec(c.Context(), `
			UPDATE grn_sessions SET status='box_reconciliation', updated_at=now() WHERE id=$1
			  AND status NOT IN ('closed','completed')`, id); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		writeEvent(db, c.Context(), id, userID(c), "BOX_RECONCILIATION_STARTED", fiber.Map{
			"payload": fiber.Map{"missing_boxes": missing},
		})
		return shared.OK(c, fiber.Map{"id": id, "status": "box_reconciliation", "missing_boxes": missing})
	}
}

func listEvents(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT e.id, e.event_type, COALESCE(e.invoice_no,''), COALESCE(e.box_no,''), COALESCE(e.part_no,''),
			       e.quantity, COALESCE(e.result,''), COALESCE(e.reason,''), COALESCE(e.actor_id,0),
			       COALESCE(u.username,''), e.created_at::text
			FROM grn_events e
			LEFT JOIN users u ON u.id = e.actor_id
			WHERE e.grn_session_id=$1
			ORDER BY e.created_at DESC, e.id DESC
			LIMIT 500`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var eid, actor int
			var et, inv, box, part, result, reason, user, created string
			var qty *float64
			if err := rows.Scan(&eid, &et, &inv, &box, &part, &qty, &result, &reason, &actor, &user, &created); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": eid, "event_type": et, "invoice_no": inv, "box_no": box, "part_no": part,
				"quantity": qty, "result": result, "reason": reason, "actor_id": actor,
				"actor_name": user, "created_at": created,
			})
		}
		return shared.OK(c, out)
	}
}

func listExceptions(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT id, exception_type, COALESCE(invoice_no,''), COALESCE(box_no,''), COALESCE(part_no,''),
			       expected_qty, scanned_qty, variance, status, COALESCE(resolution,''), created_at::text
			FROM grn_exceptions WHERE grn_session_id=$1 ORDER BY id DESC`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var eid int
			var et, inv, box, part, st, res, created string
			var exp, scan, vari *float64
			if err := rows.Scan(&eid, &et, &inv, &box, &part, &exp, &scan, &vari, &st, &res, &created); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": eid, "exception_type": et, "invoice_no": inv, "box_no": box, "part_no": part,
				"expected_qty": exp, "scanned_qty": scan, "variance": vari, "status": st,
				"resolution": res, "created_at": created,
			})
		}
		return shared.OK(c, out)
	}
}

func addInvoice(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			InvoiceNo    string  `json:"invoice_no"`
			InvoiceDate  *string `json:"invoice_date"`
			DeliveryNo   string  `json:"delivery_no"`
			DeliveryDate *string `json:"delivery_date"`
			Notes        string  `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.InvoiceNo = strings.TrimSpace(body.InvoiceNo)
		if body.InvoiceNo == "" {
			return shared.Err(c, fiber.StatusBadRequest, "invoice_no required")
		}
		invDate, delDate := "", ""
		if body.InvoiceDate != nil {
			invDate = *body.InvoiceDate
		}
		if body.DeliveryDate != nil {
			delDate = *body.DeliveryDate
		}
		var invID int
		err = db.QueryRow(c.Context(), `
			INSERT INTO grn_invoices (grn_session_id, invoice_no, invoice_date, delivery_no, delivery_date, notes)
			VALUES ($1,$2,NULLIF($3,'')::date,$4,NULLIF($5,'')::date,$6)
			ON CONFLICT (grn_session_id, invoice_no) DO UPDATE SET
				invoice_date = COALESCE(EXCLUDED.invoice_date, grn_invoices.invoice_date),
				delivery_no = COALESCE(NULLIF(EXCLUDED.delivery_no,''), grn_invoices.delivery_no),
				delivery_date = COALESCE(EXCLUDED.delivery_date, grn_invoices.delivery_date),
				notes = COALESCE(NULLIF(EXCLUDED.notes,''), grn_invoices.notes)
			RETURNING id`,
			id, body.InvoiceNo, invDate, body.DeliveryNo, delDate, body.Notes,
		).Scan(&invID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		writeEvent(db, c.Context(), id, userID(c), "INVOICE_ASSIGNED", fiber.Map{"invoice_no": body.InvoiceNo})
		return shared.OK(c, fiber.Map{"id": invID, "invoice_no": body.InvoiceNo})
	}
}

func listInvoices(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT id, invoice_no, invoice_date::text, COALESCE(delivery_no,''), delivery_date::text, COALESCE(notes,'')
			FROM grn_invoices WHERE grn_session_id=$1 ORDER BY id`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var iid int
			var no, delNo, notes string
			var invDate, delDate *string
			if err := rows.Scan(&iid, &no, &invDate, &delNo, &delDate, &notes); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": iid, "invoice_no": no, "invoice_date": invDate,
				"delivery_no": delNo, "delivery_date": delDate, "notes": notes,
			})
		}
		return shared.OK(c, out)
	}
}
