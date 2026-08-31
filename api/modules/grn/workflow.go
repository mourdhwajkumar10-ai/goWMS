package grn

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// nextBoxVerificationStatus returns the only allowed forward transitions in
// the box verification workflow. Terminal and unknown states are fail-closed.
func boxStatusesPermitSessionCompletion(statuses []string) bool {
	for _, status := range statuses {
		switch strings.ToLower(strings.TrimSpace(status)) {
		case "item_verified", "completed", "verified":
			continue
		default:
			return false
		}
	}
	return true
}

func nextBoxVerificationStatus(from, action string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(from)) {
	case "received":
		if strings.EqualFold(strings.TrimSpace(action), "open") {
			return "box_verified", true
		}
	case "box_verified":
		if strings.EqualFold(strings.TrimSpace(action), "item_complete") {
			return "item_verified", true
		}
	}
	return "", false
}

func canonicalStatus(status string) string {
	s := strings.ToLower(strings.TrimSpace(status))
	switch s {
	case "open":
		return "receiving"
	case "closed":
		return "completed"
	default:
		return s
	}
}

func specStatusLabel(status string) string {
	s := canonicalStatus(status)
	if s == "" {
		return "RECEIVING"
	}
	return strings.ToUpper(s)
}

func sessionWritable(status string) bool {
	switch canonicalStatus(status) {
	case "closed", "completed":
		return false
	default:
		return true
	}
}

func sessionAcceptsBoxReceive(status string) bool {
	switch canonicalStatus(status) {
	case "open", "draft", "receiving", "box_reconciliation", "item_verification", "exception_pending", "partially_received":
		return true
	default:
		return false
	}
}

func requestDevice(c *fiber.Ctx) string {
	if c == nil {
		return ""
	}
	d := strings.TrimSpace(c.Get("X-Device"))
	if d == "" {
		d = strings.TrimSpace(c.Get("User-Agent"))
	}
	if len(d) > 100 {
		return d[:100]
	}
	return d
}

func writeEvent(db *pgxpool.Pool, c *fiber.Ctx, sessionID int, eventType string, fields fiber.Map) {
	if db == nil || sessionID < 1 || eventType == "" {
		return
	}
	ctx := context.Background()
	actorID := 0
	device := ""
	if c != nil {
		ctx = c.Context()
		actorID = userID(c)
		device = requestDevice(c)
	}
	var invoice, box, part, result, reason, payload any
	var qty any
	if fields != nil {
		invoice, box, part = fields["invoice_no"], fields["box_no"], fields["part_no"]
		qty, result, reason = fields["quantity"], fields["result"], fields["reason"]
		if v, ok := fields["device"]; ok && v != nil && strings.TrimSpace(fmt.Sprint(v)) != "" {
			device = fmt.Sprint(v)
		}
		if v, ok := fields["payload"]; ok {
			b, _ := json.Marshal(v)
			payload = string(b)
		}
	}
	var actor any
	if actorID > 0 {
		actor = actorID
	}
	var deviceVal any
	if strings.TrimSpace(device) != "" {
		deviceVal = device
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO grn_events (
			grn_session_id, event_type, invoice_no, box_no, part_no, quantity,
			result, reason, actor_id, device, payload
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
		sessionID, eventType, invoice, box, part, qty, result, reason, actor, deviceVal, payload)
}

func writeException(db *pgxpool.Pool, c *fiber.Ctx, sessionID int, excType string, fields fiber.Map) {
	if db == nil || sessionID < 1 || excType == "" {
		return
	}
	ctx := context.Background()
	actorID := 0
	device := requestDevice(c)
	if c != nil {
		ctx = c.Context()
		actorID = userID(c)
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
	var deviceVal any
	if strings.TrimSpace(device) != "" {
		deviceVal = device
	}
	_, err := db.Exec(ctx, `
		INSERT INTO grn_exceptions (
			grn_session_id, exception_type, invoice_no, box_no, part_no,
			expected_qty, scanned_qty, variance, status, actor_id, device
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10)`,
		sessionID, excType, get("invoice_no"), get("box_no"), get("part_no"),
		get("expected_qty"), get("scanned_qty"), get("variance"), actor, deviceVal)
	if err != nil && strings.Contains(err.Error(), "device") {
		// Fix #13: Log the missing column so the migration debt is visible.
		log.Printf("GRN [writeException] device column missing in grn_exceptions — run migration to add it.")
		_, _ = db.Exec(ctx, `
			INSERT INTO grn_exceptions (
				grn_session_id, exception_type, invoice_no, box_no, part_no,
				expected_qty, scanned_qty, variance, status, actor_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9)`,
			sessionID, excType, get("invoice_no"), get("box_no"), get("part_no"),
			get("expected_qty"), get("scanned_qty"), get("variance"), actor)
	}
	writeEvent(db, c, sessionID, "EXCEPTION_CREATED", fiber.Map{
		"invoice_no": get("invoice_no"), "box_no": get("box_no"), "part_no": get("part_no"),
		"quantity": get("scanned_qty"), "result": excType, "reason": excType,
		"payload": fiber.Map{
			"exception_type": excType,
			"expected_qty":   get("expected_qty"),
			"scanned_qty":    get("scanned_qty"),
			"variance":       get("variance"),
		},
	})
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
	r.Post("/session/:id/exceptions", createOtherException(db))
	r.Post("/session/:id/supporting-doc", attachSupportingDoc(db))
	r.Post("/session/:id/complete-putaway", completePutaway(db))
	registerVerifyRoutes(r, db)
	registerCompletionRoutes(r, db)
	registerEvidenceRoutes(r, db)
}

func updateSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			SupplierName         *string `json:"supplier_name"`
			ReceivingMode        *string `json:"receiving_mode"`
			PackingListAvailable *bool   `json:"packing_list_available"`
			TruckNo              *string `json:"truck_no"`
			DriverName           *string `json:"driver_name"`
			DriverPhone          *string `json:"driver_phone"`
			ArrivalAt            *string `json:"arrival_at"`
			ExpectedBoxes        *int    `json:"expected_boxes"`
			Notes                *string `json:"notes"`
			Plant                *string `json:"plant"`
			Dock                 *string `json:"dock"`
			InvoiceNos           *string `json:"invoice_nos"`
			WarehouseID          *int    `json:"warehouse_id"`
			ArrivalAttachmentID  *int    `json:"arrival_attachment_id"`
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
		if body.PackingListAvailable != nil && body.ReceivingMode == nil {
			m := "invoice_only"
			if *body.PackingListAvailable {
				m = "packing_list"
			}
			body.ReceivingMode = &m
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
				packing_list_available = COALESCE($14, packing_list_available),
				arrival_attachment_id = COALESCE($15, arrival_attachment_id),
				updated_at = now()
			WHERE id=$1`,
			id, body.SupplierName, body.ReceivingMode, body.TruckNo, body.DriverName, body.DriverPhone,
			arrival, body.ExpectedBoxes, body.Notes, body.Plant, body.Dock, body.InvoiceNos, body.WarehouseID,
			body.PackingListAvailable, body.ArrivalAttachmentID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if strings.EqualFold(status, "draft") && (body.TruckNo != nil || body.SupplierName != nil) {
			_, _ = db.Exec(c.Context(), `UPDATE grn_sessions SET status='receiving', arrival_at=COALESCE(arrival_at,now()), updated_at=now() WHERE id=$1 AND status='draft'`, id)
			writeEvent(db, c, id, "STATUS_CHANGED", fiber.Map{"result": "receiving", "reason": "draft_activated"})
		}
		writeEvent(db, c, id, "GRN_UPDATED", nil)
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
		writeEvent(db, c, id, "STATUS_CHANGED", fiber.Map{
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
			SELECT gc.id, gc.carton_no, gc.status, COALESCE(gc.is_expected,false), gc.scanned_at::text, COALESCE(gc.condition,'ok'),
			       COALESCE((SELECT SUM(COALESCE(expected_qty,0)) FROM grn_lines WHERE grn_carton_id=gc.id),0)
			FROM grn_cartons gc WHERE gc.grn_session_id=$1 ORDER BY gc.carton_no`, id)
		if err != nil && strings.Contains(err.Error(), "condition") {
			rows, err = db.Query(c.Context(), `
				SELECT id, carton_no, status, COALESCE(is_expected,false), scanned_at::text, 'ok', 0
				FROM grn_cartons WHERE grn_session_id=$1 ORDER BY carton_no`, id)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type box struct {
			ID          int     `json:"id"`
			CartonNo    string  `json:"carton_no"`
			Status      string  `json:"status"`
			IsExpected  bool    `json:"is_expected"`
			ScannedAt   *string `json:"scanned_at"`
			Condition   string  `json:"condition"`
			ExpectedQty float64 `json:"expected_qty"`
		}
		list := []box{}
		for rows.Next() {
			var b box
			if err := rows.Scan(&b.ID, &b.CartonNo, &b.Status, &b.IsExpected, &b.ScannedAt, &b.Condition, &b.ExpectedQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, b)
		}
		var expected, received, excess, missing, damaged int
		for _, b := range list {
			st := strings.ToLower(b.Status)
			if b.IsExpected {
				expected++
			}
			switch st {
			case "excess":
				excess++
				received++
			case "received", "accounted", "verified", "exception":
				received++
			case "missing", "expected", "pending":
				if b.IsExpected {
					missing++
				}
			}
			if isDamagedCondition(b.Condition) {
				damaged++
			}
		}
		return shared.OK(c, fiber.Map{
			"expected_boxes": expected,
			"received_boxes": received,
			"excess_boxes":   excess,
			"missing_boxes":  missing,
			"damaged_boxes":  damaged,
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
				writeException(db, c, id, "missing_box", fiber.Map{
					"box_no": cno, "expected_qty": 1, "scanned_qty": 0, "variance": -1,
				})
				writeEvent(db, c, id, "BOX_MISSING", fiber.Map{
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
		writeEvent(db, c, id, "BOX_RECONCILIATION_STARTED", fiber.Map{
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
			       COALESCE(u.username,''), e.created_at::text, COALESCE(e.device,'')
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
			var et, inv, box, part, result, reason, user, created, device string
			var qty *float64
			if err := rows.Scan(&eid, &et, &inv, &box, &part, &qty, &result, &reason, &actor, &user, &created, &device); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": eid, "event_type": et, "invoice_no": inv, "box_no": box, "part_no": part,
				"quantity": qty, "result": result, "reason": reason, "actor_id": actor,
				"actor_name": user, "created_at": created, "device": device,
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
			       expected_qty, scanned_qty, variance, status, COALESCE(resolution,''), created_at::text,
			       COALESCE(device,''),
			       COALESCE((SELECT COUNT(*) FROM attachments a WHERE a.entity_type='grn_exception' AND a.entity_id=grn_exceptions.id),0)
			FROM grn_exceptions WHERE grn_session_id=$1 ORDER BY id DESC`, id)
		if err != nil && strings.Contains(err.Error(), "device") {
			rows, err = db.Query(c.Context(), `
				SELECT id, exception_type, COALESCE(invoice_no,''), COALESCE(box_no,''), COALESCE(part_no,''),
				       expected_qty, scanned_qty, variance, status, COALESCE(resolution,''), created_at::text, '', 0
				FROM grn_exceptions WHERE grn_session_id=$1 ORDER BY id DESC`, id)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []fiber.Map{}
		for rows.Next() {
			var eid int
			var et, inv, box, part, st, res, created, device string
			var exp, scan, vari *float64
			var evidence int
			if err := rows.Scan(&eid, &et, &inv, &box, &part, &exp, &scan, &vari, &st, &res, &created, &device, &evidence); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": eid, "exception_type": et, "invoice_no": inv, "box_no": box, "part_no": part,
				"expected_qty": exp, "scanned_qty": scan, "variance": vari, "status": st,
				"resolution": res, "created_at": created, "device": device, "evidence_count": evidence,
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
		writeEvent(db, c, id, "INVOICE_ASSIGNED", fiber.Map{"invoice_no": body.InvoiceNo})
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
