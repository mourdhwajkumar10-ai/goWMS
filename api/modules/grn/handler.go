package grn

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/notifications"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires GRN routes. Primary shapes match the React client in api.ts;
// path-param aliases are kept for older callers.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createSession(db))
	r.Get("/sessions", listSessions(db))
	r.Get("/session/:id", getSession(db))
	r.Post("/carton", scanCartonBody(db))
	r.Post("/line", scanLineBody(db))
	r.Post("/close", closeSessionBody(db))
	// Direct placement is disabled; all stock movement goes through putaway sessions.

	// Path-param aliases
	r.Post("/session/:id/cartons", scanCartonParam(db))
	r.Get("/session/:id/cartons", listCartons(db))
	r.Post("/:id/carton", scanCartonParam(db))
	r.Post("/carton/:id/line", scanLineParam(db))
	r.Post("/:id/close", closeSessionParam(db))

	registerWorkflowRoutes(r, db)
}

func createSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			WarehouseID          int    `json:"warehouse_id"`
			PurchaseReceiptNo    string `json:"purchase_receipt_no"`
			SupplierName         string `json:"supplier_name"`
			PurchaseOrderID      int    `json:"purchase_order_id"`
			ReceivingMode        string `json:"receiving_mode"`
			PackingListAvailable *bool  `json:"packing_list_available"`
			TruckNo              string `json:"truck_no"`
			DriverName           string `json:"driver_name"`
			DriverPhone          string `json:"driver_phone"`
			ArrivalAt            string `json:"arrival_at"`
			ExpectedBoxes        int    `json:"expected_boxes"`
			Notes                string `json:"notes"`
			Plant                string `json:"plant"`
			Dock                 string `json:"dock"`
			InvoiceNos           string `json:"invoice_nos"`
			AsDraft              bool   `json:"as_draft"`
			ArrivalAttachmentID  int    `json:"arrival_attachment_id"`
			DocumentsToFollow    bool   `json:"documents_to_follow"`
			ExpectedDeliveryAt   string `json:"expected_delivery_at"`
			SupplierBarcode      string `json:"supplier_barcode"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		if body.PurchaseOrderID > 0 && body.PurchaseReceiptNo == "" {
			_ = db.QueryRow(c.Context(),
				`SELECT name FROM purchase_orders WHERE id=$1`, body.PurchaseOrderID).
				Scan(&body.PurchaseReceiptNo)
		}
		if body.PurchaseOrderID > 0 && body.SupplierName == "" {
			_ = db.QueryRow(c.Context(),
				`SELECT COALESCE(supplier_name,'') FROM purchase_orders WHERE id=$1`, body.PurchaseOrderID).
				Scan(&body.SupplierName)
		}

		if body.WarehouseID == 0 {
			if wid, werr := shared.EnsureDefaultWarehouse(c.Context(), db); werr == nil {
				body.WarehouseID = wid
			}
		}

		mode := strings.ToLower(strings.TrimSpace(body.ReceivingMode))
		if body.PackingListAvailable != nil {
			if *body.PackingListAvailable {
				mode = "packing_list"
			} else {
				mode = "invoice_only"
			}
		}
		if mode == "" {
			mode = "packing_list"
		}
		if mode != "packing_list" && mode != "invoice_only" {
			return shared.Err(c, fiber.StatusBadRequest, "receiving_mode must be packing_list or invoice_only")
		}
		plAvail := mode == "packing_list"
		if body.PackingListAvailable != nil {
			plAvail = *body.PackingListAvailable
		}

		status := "receiving"
		if body.AsDraft {
			status = "draft"
		}

		// Do not reuse $5 in SQL: Postgres 42P08 fires when the same placeholder
		// is deduced as both varchar (status) and text/timestamptz (draft check).
		arrivalStr := strings.TrimSpace(body.ArrivalAt)
		if arrivalStr == "" && status != "draft" {
			arrivalStr = time.Now().Format(time.RFC3339)
		}

		var id int
		var sessionNo string
		err := db.QueryRow(c.Context(), `
			INSERT INTO grn_sessions (
				session_no, warehouse_id, purchase_receipt_no, supplier_name, created_by,
				status, receiving_mode, truck_no, driver_name, driver_phone,
				expected_boxes, notes, plant, dock, invoice_nos,
				arrival_at, packing_list_available, arrival_attachment_id
			) VALUES (
				'GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),
				NULLIF($1, 0)::int, $2::text, $3::text, NULLIF($4, 0)::int, $5::text, $6::text,
				NULLIF($7, '')::text, NULLIF($8, '')::text, NULLIF($9, '')::text,
				$10::int, NULLIF($11, '')::text, NULLIF($12, '')::text, NULLIF($13, '')::text,
				NULLIF($14, '')::text, NULLIF($15, '')::timestamptz, $16::boolean, NULLIF($17, 0)::int
			) RETURNING id, session_no`,
			body.WarehouseID, body.PurchaseReceiptNo, body.SupplierName, userID(c), status,
			mode, body.TruckNo, body.DriverName, body.DriverPhone,
			body.ExpectedBoxes, body.Notes, body.Plant, body.Dock,
			body.InvoiceNos, arrivalStr, plAvail, body.ArrivalAttachmentID,
		).Scan(&id, &sessionNo)
		if err != nil {
			// Fallback for DBs before migration 018/022
			if strings.Contains(err.Error(), "receiving_mode") || strings.Contains(err.Error(), "truck_no") ||
				strings.Contains(err.Error(), "packing_list_available") || strings.Contains(err.Error(), "arrival_attachment") ||
				strings.Contains(err.Error(), "42P08") || strings.Contains(err.Error(), "inconsistent types") {
				err = db.QueryRow(c.Context(),
					`INSERT INTO grn_sessions (
						session_no, warehouse_id, purchase_receipt_no, supplier_name, created_by,
						status, receiving_mode, truck_no, driver_name, driver_phone,
						expected_boxes, notes, plant, dock, invoice_nos, arrival_at
					) VALUES (
						'GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),
						NULLIF($1, 0)::int, $2::text, $3::text, NULLIF($4, 0)::int, $5::text, $6::text,
						NULLIF($7, '')::text, NULLIF($8, '')::text, NULLIF($9, '')::text,
						$10::int, NULLIF($11, '')::text, NULLIF($12, '')::text, NULLIF($13, '')::text,
						NULLIF($14, '')::text, NOW()
					) RETURNING id, session_no`,
					body.WarehouseID, body.PurchaseReceiptNo, body.SupplierName, userID(c), status,
					mode, body.TruckNo, body.DriverName, body.DriverPhone,
					body.ExpectedBoxes, body.Notes, body.Plant, body.Dock,
					body.InvoiceNos).Scan(&id, &sessionNo)
			}
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		writeEvent(db, c, id, "TRUCK_CREATED", fiber.Map{
			"result": status,
			"payload": fiber.Map{
				"truck_no": body.TruckNo, "driver_name": body.DriverName, "driver_phone": body.DriverPhone,
				"arrival_at": body.ArrivalAt, "expected_boxes": body.ExpectedBoxes,
			},
		})
		writeEvent(db, c, id, "GRN_CREATED", fiber.Map{
			"payload": fiber.Map{"receiving_mode": mode, "truck_no": body.TruckNo, "status": status},
		})
		plNo := strings.Replace(sessionNo, "GRN-", "PL-", 1)
		poID := body.PurchaseOrderID
		if poID == 0 && strings.TrimSpace(body.PurchaseReceiptNo) != "" {
			_ = db.QueryRow(c.Context(), `SELECT id FROM purchase_orders WHERE name=$1`, body.PurchaseReceiptNo).Scan(&poID)
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET
				packing_list_no = COALESCE(NULLIF(packing_list_no,''), $2),
				purchase_order_id = COALESCE(NULLIF($3,0), purchase_order_id)
			WHERE id=$1`, id, plNo, poID)
		if mode == "invoice_only" {
			autoSeedInvoiceExpected(c, db, id, body.PurchaseOrderID, body.InvoiceNos)
		}
		arrivalFlags := autoArrivalChecks(c, db, id, body.DocumentsToFollow, body.InvoiceNos, body.ArrivalAt, body.ExpectedDeliveryAt, body.PurchaseReceiptNo, body.WarehouseID, body.SupplierBarcode)
		shared.UpsertTransport(c.Context(), db, body.TruckNo, body.DriverName, body.DriverPhone)
		shared.WriteAudit(db, c.Context(), userID(c), "grn.create", "grn", id, nil, fiber.Map{
			"session_no": sessionNo, "receiving_mode": mode, "status": status,
		})
		return shared.OK(c, fiber.Map{
			"id":                     id,
			"session_no":             sessionNo,
			"status":                 status,
			"receiving_mode":         mode,
			"packing_list_available": plAvail,
			"purchase_receipt_no":    body.PurchaseReceiptNo,
			"purchase_order_id":      body.PurchaseOrderID,
			"supplier_name":          body.SupplierName,
			"truck_no":               body.TruckNo,
			"driver_name":            body.DriverName,
			"driver_phone":           body.DriverPhone,
			"expected_boxes":         body.ExpectedBoxes,
			"auto_flags":             arrivalFlags,
		})
	}
}

func nullEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func listSessions(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT
				s.id, s.session_no, s.supplier_name, s.purchase_receipt_no, s.status, s.created_at,
				COALESCE(s.receiving_mode,'packing_list'), COALESCE(s.truck_no,''),
				COALESCE(s.is_followup,false), COALESCE(s.parent_grn_id,0),
				COALESCE(s.delivery_no,''),
				COALESCE(s.packing_list_no,''), COALESCE(s.packing_list_filename,''), COALESCE(s.purchase_order_id,0),
				(SELECT COUNT(*) FROM grn_cartons c WHERE c.grn_session_id = s.id) AS box_count,
				(SELECT COUNT(*) FROM grn_cartons c WHERE c.grn_session_id = s.id AND c.status IN ('received','box_verified','item_verified','completed','verified')) AS boxes_received,
				(SELECT COUNT(*) FROM grn_lines l JOIN grn_cartons c ON c.id = l.grn_carton_id WHERE c.grn_session_id = s.id) AS item_count,
				(SELECT COALESCE(SUM(l.scanned_qty),0) FROM grn_lines l JOIN grn_cartons c ON c.id = l.grn_carton_id WHERE c.grn_session_id = s.id) AS items_scanned,
				(SELECT COUNT(*) FROM grn_exceptions e WHERE e.grn_session_id = s.id AND e.status = 'open') AS exceptions_open
			FROM grn_sessions s
			WHERE EXISTS (SELECT 1 FROM grn_cartons c WHERE c.grn_session_id = s.id)
			   OR EXISTS (
				SELECT 1 FROM grn_lines l
				WHERE l.grn_session_id = s.id
				  AND COALESCE(l.expected_qty,0) + COALESCE(l.scanned_qty,0) > 0
			   )
			ORDER BY s.created_at DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		list := []fiber.Map{}
		for rows.Next() {
			var id int
			var sessionNo, status string
			var supplier, receipt *string
			var created time.Time
			var mode, truck, deliveryNo, packingListNo, packingListFile string
			var isFollowup bool
			var parentID, poID, boxCount, boxesReceived, itemCount, exceptionsOpen int
			var itemsScanned float64
			if err := rows.Scan(&id, &sessionNo, &supplier, &receipt, &status, &created,
				&mode, &truck, &isFollowup, &parentID, &deliveryNo,
				&packingListNo, &packingListFile, &poID,
				&boxCount, &boxesReceived, &itemCount, &itemsScanned, &exceptionsOpen); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			poNo := ""
			if receipt != nil {
				poNo = *receipt
			}
			list = append(list, fiber.Map{
				"id": id, "session_no": sessionNo, "supplier": supplier,
				"purchase_receipt_no": receipt, "po_no": poNo,
				"packing_list_no": packingListNo, "packing_list_filename": packingListFile,
				"purchase_order_id": poID,
				"status":            canonicalStatus(status),
				"status_label":      specStatusLabel(status), "created_at": created,
				"receiving_mode": mode, "truck_no": truck,
				"is_followup": isFollowup, "parent_grn_id": parentID,
				"delivery_no": deliveryNo,
				"box_count":   boxCount, "boxes_received": boxesReceived,
				"item_count": itemCount, "items_scanned": int(itemsScanned),
				"exceptions_open": exceptionsOpen,
			})
		}
		return shared.OK(c, list)
	}
}

func getSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}

		var sess struct {
			ID                int        `json:"id"`
			SessionNo         string     `json:"session_no"`
			SupplierName      *string    `json:"supplier_name"`
			PurchaseReceiptNo *string    `json:"purchase_receipt_no"`
			Status            string     `json:"status"`
			ClosedAt          *time.Time `json:"closed_at"`
			CreatedAt         time.Time  `json:"created_at"`
			WarehouseID       *int       `json:"warehouse_id"`
		}
		err = db.QueryRow(c.Context(), `
			SELECT id, session_no, supplier_name, purchase_receipt_no, status, closed_at, created_at, warehouse_id
			FROM grn_sessions WHERE id=$1`, sessionID).
			Scan(&sess.ID, &sess.SessionNo, &sess.SupplierName, &sess.PurchaseReceiptNo,
				&sess.Status, &sess.ClosedAt, &sess.CreatedAt, &sess.WarehouseID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "session not found")
		}

		extra := fiber.Map{}
		var mode, truck, driver, phone, notes, plant, dock, invoices string
		var expectedBoxes int
		var arrival *time.Time
		var podID, parentID, activeVerify, arrivalDoc *int
		var isFollowup, plAvail bool
		var podSummary []byte
		if err2 := db.QueryRow(c.Context(), `
			SELECT COALESCE(receiving_mode,'packing_list'), COALESCE(truck_no,''), COALESCE(driver_name,''),
			       COALESCE(driver_phone,''), arrival_at, COALESCE(expected_boxes,0), COALESCE(notes,''),
			       COALESCE(plant,''), COALESCE(dock,''), COALESCE(invoice_nos,''),
			       pod_attachment_id, parent_grn_id, COALESCE(is_followup,false), active_verify_carton_id,
			       COALESCE(packing_list_available, receiving_mode <> 'invoice_only'),
			       arrival_attachment_id, pod_box_summary
			FROM grn_sessions WHERE id=$1`, sessionID).
			Scan(&mode, &truck, &driver, &phone, &arrival, &expectedBoxes, &notes, &plant, &dock, &invoices,
				&podID, &parentID, &isFollowup, &activeVerify, &plAvail, &arrivalDoc, &podSummary); err2 == nil {
			extra = fiber.Map{
				"receiving_mode": mode, "truck_no": truck, "driver_name": driver, "driver_phone": phone,
				"arrival_at": arrival, "expected_boxes": expectedBoxes, "notes": notes,
				"plant": plant, "dock": dock, "invoice_nos": invoices,
				"pod_attachment_id": podID, "parent_grn_id": parentID, "is_followup": isFollowup,
				"active_verify_carton_id": activeVerify,
				"packing_list_available":  plAvail, "arrival_attachment_id": arrivalDoc,
			}
			if len(podSummary) > 0 {
				var parsed any
				if json.Unmarshal(podSummary, &parsed) == nil {
					extra["pod_box_summary"] = parsed
				}
			}
			if parentID != nil && *parentID > 0 {
				var parentNo string
				if err := db.QueryRow(c.Context(), `SELECT session_no FROM grn_sessions WHERE id=$1`, *parentID).Scan(&parentNo); err == nil {
					extra["parent_session_no"] = parentNo
				}
			}
		} else {
			extra = fiber.Map{"receiving_mode": "packing_list"}
		}

		rows, err := db.Query(c.Context(), `
			SELECT id, carton_no, status, scanned_at
			FROM grn_cartons WHERE grn_session_id=$1 ORDER BY id ASC`, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type line struct {
			ID          int      `json:"id"`
			ItemCode    string   `json:"item_code"`
			ExpectedQty *float64 `json:"expected_qty"`
			ScannedQty  *float64 `json:"scanned_qty"`
			DamagedQty  float64  `json:"damaged_qty"`
			Status      string   `json:"status"`
			BatchNo     *string  `json:"batch_no"`
			RequiresQI  bool     `json:"requires_qi"`
			Notes       *string  `json:"notes"`
		}
		type carton struct {
			ID        int        `json:"id"`
			CartonNo  string     `json:"carton_no"`
			Status    string     `json:"status"`
			ScannedAt *time.Time `json:"scanned_at"`
			Lines     []line     `json:"lines"`
		}

		var cartons []carton
		for rows.Next() {
			var ct carton
			if err := rows.Scan(&ct.ID, &ct.CartonNo, &ct.Status, &ct.ScannedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			ct.Lines = []line{}
			cartons = append(cartons, ct)
		}

		for i := range cartons {
			lrows, err := db.Query(c.Context(), `
				SELECT id, item_code, expected_qty, scanned_qty, COALESCE(damaged_qty,0), status, batch_no, COALESCE(requires_qi,false), notes
				FROM grn_lines WHERE grn_carton_id=$1 ORDER BY id ASC`, cartons[i].ID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			for lrows.Next() {
				var l line
				if err := lrows.Scan(&l.ID, &l.ItemCode, &l.ExpectedQty, &l.ScannedQty, &l.DamagedQty, &l.Status, &l.BatchNo, &l.RequiresQI, &l.Notes); err != nil {
					lrows.Close()
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				cartons[i].Lines = append(cartons[i].Lines, l)
			}
			lrows.Close()
		}

		out := fiber.Map{
			"id":                  sess.ID,
			"session_no":          sess.SessionNo,
			"supplier_name":       sess.SupplierName,
			"purchase_receipt_no": sess.PurchaseReceiptNo,
			"status":              canonicalStatus(sess.Status),
			"status_label":        specStatusLabel(sess.Status),
			"closed_at":           sess.ClosedAt,
			"created_at":          sess.CreatedAt,
			"warehouse_id":        sess.WarehouseID,
			"cartons":             cartons,
		}
		for k, v := range extra {
			out[k] = v
		}
		return shared.OK(c, out)
	}
}

func scanCartonBody(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			GRNSessionID   int    `json:"grn_session_id"`
			CartonNo       string `json:"carton_no"`
			Condition      string `json:"condition"`
			ParentCartonNo string `json:"parent_carton_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.GRNSessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "grn_session_id required")
		}
		return doScanCarton(c, db, body.GRNSessionID, body.CartonNo, body.Condition, body.ParentCartonNo)
	}
}

func scanCartonParam(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			CartonNo       string `json:"carton_no"`
			Condition      string `json:"condition"`
			ParentCartonNo string `json:"parent_carton_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		return doScanCarton(c, db, sessionID, body.CartonNo, body.Condition, body.ParentCartonNo)
	}
}

func doScanCarton(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, cartonNo, condition, parentCartonNo string) error {
	cartonNo = strings.TrimSpace(cartonNo)
	if cartonNo == "" {
		return shared.Err(c, fiber.StatusBadRequest, "carton_no required")
	}
	if isInvalidBoxBarcode(cartonNo) {
		writeEvent(db, c, sessionID, "BOX_INVALID_SCANNED", fiber.Map{
			"box_no": cartonNo, "result": "invalid",
		})
		return shared.OK(c, fiber.Map{
			"invalid": true, "carton_no": cartonNo,
			"message": "INVALID BARCODE",
		})
	}
	condition = normalizeBoxCondition(condition)

	var status string
	err := db.QueryRow(c.Context(),
		`SELECT status FROM grn_sessions WHERE id=$1`, sessionID).Scan(&status)
	if err != nil {
		return shared.Err(c, fiber.StatusNotFound, "session not found")
	}
	if !sessionAcceptsBoxReceive(status) && !sessionWritable(status) {
		return shared.Err(c, fiber.StatusBadRequest, "session is not open for box receiving")
	}
	if !sessionWritable(status) {
		return shared.Err(c, fiber.StatusBadRequest, "session is closed")
	}

	var existingID int
	var existingStatus string
	var isExpected bool
	err = db.QueryRow(c.Context(),
		`SELECT id, status, COALESCE(is_expected,false) FROM grn_cartons
		 WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))`,
		sessionID, cartonNo).Scan(&existingID, &existingStatus, &isExpected)
	if err == nil {
		st := strings.ToLower(existingStatus)
		writeEvent(db, c, sessionID, "BOX_SCANNED", fiber.Map{
			"box_no": cartonNo, "result": st,
		})
		if isDuplicateBoxStatus(st) {
			writeEvent(db, c, sessionID, "BOX_DUPLICATE_SCANNED", fiber.Map{
				"box_no": cartonNo, "result": "duplicate",
			})
			writeException(db, c, sessionID, "duplicate_box", fiber.Map{
				"box_no": cartonNo,
			})
			return shared.OK(c, fiber.Map{
				"id": existingID, "carton_no": cartonNo, "status": existingStatus,
				"duplicate": true, "already_scanned": true,
				"message": "BOX ALREADY SCANNED",
			})
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_cartons SET status='received', scanned_at=NOW(), scanned_by=$2, condition=$3 WHERE id=$1`,
			existingID, userID(c), condition)
		writeEvent(db, c, sessionID, "BOX_RECEIVED", fiber.Map{
			"box_no": cartonNo, "result": "received",
		})
		out := fiber.Map{
			"id": existingID, "carton_no": cartonNo, "status": "received",
			"expected": true, "message": "Expected box received", "condition": condition,
		}
		if isDamagedCondition(condition) {
			writeException(db, c, sessionID, "damage", fiber.Map{"box_no": cartonNo})
			writeEvent(db, c, sessionID, "BOX_DAMAGE_REPORTED", fiber.Map{
				"box_no": cartonNo, "result": "damage", "reason": condition,
			})
			out["damaged"] = true
			out["message"] = "DAMAGED BOX — exception created"
		}
		attachNestedBox(c, db, sessionID, cartonNo, parentCartonNo, out)
		return shared.OK(c, out)
	}

	var hasExpectedList bool
	var expectedBoxes, alreadyReceived int
	_ = db.QueryRow(c.Context(), `
		SELECT
			EXISTS(SELECT 1 FROM grn_cartons WHERE grn_session_id=$1 AND COALESCE(is_expected,false)=true),
			COALESCE((SELECT expected_boxes FROM grn_sessions WHERE id=$1),0),
			(SELECT COUNT(*) FROM grn_cartons WHERE grn_session_id=$1 AND status IN ('received','accounted','box_verified','item_verified','completed','verified','exception','excess'))
	`, sessionID).Scan(&hasExpectedList, &expectedBoxes, &alreadyReceived)

	newStatus, excess := classifyNewBox(hasExpectedList, expectedBoxes, alreadyReceived)
	var id int
	err = db.QueryRow(c.Context(),
		`INSERT INTO grn_cartons (grn_session_id,carton_no,status,scanned_at,scanned_by,is_expected,condition)
		 VALUES ($1,$2,$3,NOW(),$4,false,$5) RETURNING id`,
		sessionID, cartonNo, newStatus, userID(c), condition).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "is_expected") || strings.Contains(err.Error(), "condition") || strings.Contains(err.Error(), "excess") {
			err = db.QueryRow(c.Context(),
				`INSERT INTO grn_cartons (grn_session_id,carton_no,status,scanned_at,scanned_by) VALUES ($1,$2,'accounted',NOW(),$3) RETURNING id`,
				sessionID, cartonNo, userID(c)).Scan(&id)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "carton_no": cartonNo, "status": "accounted"})
	}
	writeEvent(db, c, sessionID, "BOX_SCANNED", fiber.Map{
		"box_no": cartonNo, "result": newStatus,
	})
	out := fiber.Map{
		"id": id, "carton_no": cartonNo, "status": newStatus, "condition": condition,
		"excess": excess, "message": "Box received",
	}
	if excess {
		writeEvent(db, c, sessionID, "BOX_EXCESS_DETECTED", fiber.Map{
			"box_no": cartonNo, "result": "excess",
		})
		writeException(db, c, sessionID, "excess_box", fiber.Map{"box_no": cartonNo})
		if hasExpectedList {
			writeException(db, c, sessionID, "unknown_box", fiber.Map{"box_no": cartonNo})
			writeEvent(db, c, sessionID, "UNKNOWN_BOX", fiber.Map{"box_no": cartonNo, "result": "unknown_box"})
			out["unknown_box"] = true
			out["message"] = "UNKNOWN BOX — not on packing list or any PO"
		} else {
			out["message"] = "EXCESS BOX — not on packing list / over expected count"
		}
	} else {
		writeEvent(db, c, sessionID, "BOX_RECEIVED", fiber.Map{
			"box_no": cartonNo, "result": "received",
		})
		out["message"] = "Box accepted"
	}
	if isDamagedCondition(condition) {
		writeException(db, c, sessionID, "damage", fiber.Map{"box_no": cartonNo})
		writeEvent(db, c, sessionID, "BOX_DAMAGE_REPORTED", fiber.Map{
			"box_no": cartonNo, "result": "damage", "reason": condition,
		})
		out["damaged"] = true
		out["message"] = "DAMAGED BOX — exception created"
	}
	attachNestedBox(c, db, sessionID, cartonNo, parentCartonNo, out)
	return shared.OK(c, out)
}

func listCartons(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}

		rows, err := db.Query(c.Context(), `
			SELECT id, carton_no, status, scanned_at
			FROM grn_cartons WHERE grn_session_id=$1 ORDER BY id ASC`,
			sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type carton struct {
			ID        int        `json:"id"`
			CartonNo  string     `json:"carton_no"`
			Status    string     `json:"status"`
			ScannedAt *time.Time `json:"scanned_at"`
		}
		var list []carton
		for rows.Next() {
			var ctn carton
			if err := rows.Scan(&ctn.ID, &ctn.CartonNo, &ctn.Status, &ctn.ScannedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, ctn)
		}
		return shared.OK(c, list)
	}
}

func scanLineBody(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			GRNCartonID int     `json:"grn_carton_id"`
			ItemCode    string  `json:"item_code"`
			ExpQty      float64 `json:"expected_qty"`
			ScanQty     float64 `json:"scanned_qty"`
			DamagedQty  float64 `json:"damaged_qty"`
			Batch       string  `json:"batch_no"`
			ExpiryDate  string  `json:"expiry_date"`
			Notes       string  `json:"notes"`
			RequiresQI  bool    `json:"requires_qi"`
			Status      string  `json:"status"`
			UnitPrice   float64 `json:"unit_price"`
			Amount      float64 `json:"amount"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.GRNCartonID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "grn_carton_id required")
		}
		return doScanLine(c, db, scanLineInput{
			CartonID: body.GRNCartonID, ItemCode: body.ItemCode,
			ExpQty: body.ExpQty, ScanQty: body.ScanQty, DamagedQty: body.DamagedQty,
			Batch: body.Batch, ExpiryDate: body.ExpiryDate, Notes: body.Notes,
			RequiresQI: body.RequiresQI, Status: body.Status,
			UnitPrice: body.UnitPrice, Amount: body.Amount,
		})
	}
}

func scanLineParam(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		cartonID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid carton id")
		}
		var body struct {
			ItemCode   string  `json:"item_code"`
			ExpQty     float64 `json:"expected_qty"`
			ScanQty    float64 `json:"scanned_qty"`
			DamagedQty float64 `json:"damaged_qty"`
			Batch      string  `json:"batch_no"`
			ExpiryDate string  `json:"expiry_date"`
			Notes      string  `json:"notes"`
			RequiresQI bool    `json:"requires_qi"`
			Status     string  `json:"status"`
			UnitPrice  float64 `json:"unit_price"`
			Amount     float64 `json:"amount"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		return doScanLine(c, db, scanLineInput{
			CartonID: cartonID, ItemCode: body.ItemCode,
			ExpQty: body.ExpQty, ScanQty: body.ScanQty, DamagedQty: body.DamagedQty,
			Batch: body.Batch, ExpiryDate: body.ExpiryDate, Notes: body.Notes,
			RequiresQI: body.RequiresQI, Status: body.Status,
			UnitPrice: body.UnitPrice, Amount: body.Amount,
		})
	}
}

type scanLineInput struct {
	CartonID   int
	ItemCode   string
	ExpQty     float64
	ScanQty    float64
	DamagedQty float64
	Batch      string
	ExpiryDate string
	Notes      string
	RequiresQI bool
	Status     string
	UnitPrice  float64
	Amount     float64
}

func doScanLine(c *fiber.Ctx, db *pgxpool.Pool, in scanLineInput) error {
	itemCode := strings.TrimSpace(in.ItemCode)
	if itemCode == "" {
		return shared.Err(c, fiber.StatusBadRequest, "item_code required")
	}
	if label, ok := shared.ParsePackedItemQRDetails(itemCode); ok {
		itemCode = label.Item
		in.ScanQty = label.Qty
		if in.ExpQty <= 0 {
			in.ExpQty = label.Qty
		}
		if label.Amount > 0 {
			in.UnitPrice = label.UnitPrice
			in.Amount = label.Amount
		}
	}
	if in.ScanQty <= 0 {
		in.ScanQty = 1
	}
	if in.DamagedQty < 0 {
		in.DamagedQty = 0
	}
	if in.DamagedQty > in.ScanQty {
		return shared.Err(c, fiber.StatusBadRequest, "damaged_qty cannot exceed scanned_qty")
	}

	exists, complete, err := shared.ItemMasterComplete(c.Context(), db, itemCode)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	if !exists || !complete {
		return shared.Err(c, fiber.StatusConflict, "item master incomplete — complete required fields before receiving")
	}

	// Fix #7: Use nullable pointer to distinguish NULL (use default) from 0 (no limit).
	var maxPctPtr *float64
	_ = db.QueryRow(c.Context(), `
		SELECT poi.max_overreceipt_pct
		FROM grn_cartons gc
		JOIN grn_sessions gs ON gs.id = gc.grn_session_id
		JOIN purchase_orders po ON po.name = gs.purchase_receipt_no
		JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND poi.item_code = $1
		WHERE gc.id = $2 LIMIT 1`, itemCode, in.CartonID).Scan(&maxPctPtr)

	const defaultOverReceiptPct = 10.0
	var tolerance float64
	if maxPctPtr == nil {
		tolerance = defaultOverReceiptPct
	} else if *maxPctPtr <= 0 {
		tolerance = 0
	} else {
		tolerance = *maxPctPtr
	}

	if tolerance >= 0 && in.ExpQty > 0 {
		over := (in.ScanQty - in.ExpQty) / in.ExpQty * 100
		if over > tolerance {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("Over-receipt blocked: %.1f%% exceeds max %.1f%%", over, tolerance))
		}
	}

	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "full_match"
		switch {
		case in.DamagedQty > 0 && in.DamagedQty >= in.ScanQty:
			status = "damage"
		case in.DamagedQty > 0:
			status = "damage"
		case in.ExpQty > 0 && in.ScanQty < in.ExpQty:
			status = "shortage"
		case in.ExpQty > 0 && in.ScanQty > in.ExpQty:
			status = "excess"
		}
	}

	var expiry any
	if in.ExpiryDate != "" {
		expiry = in.ExpiryDate
	}

	var unitPrice, lineAmount any
	if in.UnitPrice > 0 {
		unitPrice = in.UnitPrice
	}
	if in.Amount > 0 {
		lineAmount = in.Amount
	} else if in.UnitPrice > 0 {
		lineAmount = in.UnitPrice * in.ScanQty
	}

	var id int
	err = db.QueryRow(c.Context(),
		`INSERT INTO grn_lines (grn_carton_id,item_code,expected_qty,scanned_qty,damaged_qty,status,batch_no,expiry_date,notes,requires_qi,unit_price,line_amount)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
		in.CartonID, itemCode, in.ExpQty, in.ScanQty, in.DamagedQty, status, in.Batch, expiry, nullStr(in.Notes), in.RequiresQI, unitPrice, lineAmount).Scan(&id)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}

	goodQty := in.ScanQty - in.DamagedQty
	variance := 0.0
	if in.ExpQty > 0 {
		variance = in.ScanQty - in.ExpQty
	}
	return shared.OK(c, fiber.Map{
		"id": id, "status": status, "scanned_qty": in.ScanQty,
		"damaged_qty": in.DamagedQty, "good_qty": goodQty, "variance_qty": variance,
		"expected_qty": in.ExpQty, "requires_qi": in.RequiresQI,
	})
}

func nullStr(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func closeSessionBody(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			GRNSessionID int `json:"grn_session_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.GRNSessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "grn_session_id required")
		}
		return doCloseSession(c, db, body.GRNSessionID)
	}
}

func closeSessionParam(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		return doCloseSession(c, db, sessionID)
	}
}

func doCloseSession(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) error {
	var warehouseID *int
	var poName *string
	var status string
	err := db.QueryRow(c.Context(),
		`SELECT warehouse_id, purchase_receipt_no, status FROM grn_sessions WHERE id=$1`, sessionID).
		Scan(&warehouseID, &poName, &status)
	if err != nil {
		return shared.Err(c, fiber.StatusNotFound, "session not found")
	}
	if status == "closed" || status == "completed" {
		return shared.Err(c, fiber.StatusBadRequest, "session already closed")
	}

	wid, err := shared.ResolveWarehouseID(c.Context(), db, warehouseID)
	if err != nil {
		return shared.Err(c, fiber.StatusBadRequest, "no warehouse configured for GRN — add one under Warehouses")
	}
	if warehouseID == nil || *warehouseID < 1 {
		_, _ = db.Exec(c.Context(), `UPDATE grn_sessions SET warehouse_id=$2 WHERE id=$1 AND warehouse_id IS NULL`, sessionID, wid)
	}

	incomingID, incomingCode, err := shared.EnsureLocation(c.Context(), db, wid, "INCOMING-01", "incoming")
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, "incoming location: "+err.Error())
	}
	holdID, holdCode, err := shared.EnsureLocation(c.Context(), db, wid, "HOLD-01", "hold")
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, "hold location: "+err.Error())
	}
	dmgID, dmgCode, err := shared.EnsureLocation(c.Context(), db, wid, "DAMAGED-01", "damaged")
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, "damaged location: "+err.Error())
	}

	claim, err := db.Exec(c.Context(),
		`UPDATE grn_sessions SET stock_posted_at=now()
		 WHERE id=$1 AND stock_posted_at IS NULL AND status NOT IN ('closed','completed')`, sessionID)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	if claim.RowsAffected() == 0 {
		return shared.Err(c, fiber.StatusBadRequest, "stock already posted")
	}

	// Per-line posting so batch / damage / QI routing is preserved.
	rows, err := db.Query(c.Context(), `
		SELECT gl.id, gl.item_code, COALESCE(gl.expected_qty,0), COALESCE(gl.scanned_qty,0),
		       COALESCE(gl.damaged_qty,0), COALESCE(gl.batch_no,''), COALESCE(gl.requires_qi,false), gl.status
		FROM grn_lines gl
		JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
		WHERE gc.grn_session_id = $1 AND COALESCE(gl.scanned_qty,0) > 0
		ORDER BY gl.id`, sessionID)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	type line struct {
		id         int
		itemCode   string
		expected   float64
		scanned    float64
		damaged    float64
		batch      string
		requiresQI bool
		status     string
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.id, &l.itemCode, &l.expected, &l.scanned, &l.damaged, &l.batch, &l.requiresQI, &l.status); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		lines = append(lines, l)
	}

	whCode := "MAIN"
	_ = db.QueryRow(c.Context(), `SELECT code FROM warehouses WHERE id=$1`, wid).Scan(&whCode)

	voucherNo := fmt.Sprintf("GRN-%d", sessionID)
	postedIncoming := 0
	postedHold := 0
	postedDamaged := 0
	qiCreated := 0
	variances := []fiber.Map{}

	for _, l := range lines {
		// Fix #3: Use min(scanned, damaged) for DAMAGED location to prevent phantom stock
		// when damaged_qty > scanned_qty (e.g. manual edit or data entry error).
		dmgPost := l.damaged
		if dmgPost > l.scanned {
			dmgPost = l.scanned
		}
		goodQty := l.scanned - dmgPost
		if goodQty < 0 {
			goodQty = 0
		}

		if l.expected > 0 && l.scanned != l.expected {
			variances = append(variances, fiber.Map{
				"item_code": l.itemCode, "expected_qty": l.expected,
				"scanned_qty": l.scanned, "variance_qty": l.scanned - l.expected,
				"status": l.status,
			})
		}

		// Damaged → DAMAGED location (not sellable, not putaway queue for storage).
		// Fix #3: Post min(scanned, damaged) to avoid phantom stock.
		if dmgPost > 0 {
			if err := shared.AdjustLocationQty(c.Context(), db, l.itemCode, wid, dmgID, l.batch, dmgPost); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			postedDamaged++
		}

		if goodQty > 0 {
			targetID := incomingID
			targetCode := incomingCode
			if l.requiresQI || l.status == "damage" && goodQty > 0 && l.requiresQI {
				targetID = holdID
				targetCode = holdCode
			}
			if l.requiresQI {
				targetID = holdID
				targetCode = holdCode
			}

			if err := shared.AdjustLocationQty(c.Context(), db, l.itemCode, wid, targetID, l.batch, goodQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			if targetID == holdID {
				postedHold++
			} else {
				postedIncoming++
			}

			if l.requiresQI {
				var qiID int
				var qiNo string
				err = db.QueryRow(c.Context(), `
					INSERT INTO quality_inspections (
						inspection_no, reference_type, reference_name, item_code, sample_size, status,
						warehouse_id, location_id, qty, grn_session_id, batch_no
					) VALUES (
						'QI-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('quality_inspections_id_seq')::TEXT,5,'0'),
						'GRN', $1, $2, $3, 'pending', $4, $5, $3, $6, NULLIF($7,'')
					) RETURNING id, inspection_no`,
					voucherNo, l.itemCode, goodQty, wid, holdID, sessionID, l.batch,
				).Scan(&qiID, &qiNo)
				if err == nil {
					qiCreated++
				}
				_ = targetCode
			}
		}

		// Stock ledger entry (audit trail only — stock_location_balances is the single truth).
		// Fix #12: Compute running balance for qty_after_transaction.
		batchArg := any(nil)
		if l.batch != "" {
			batchArg = l.batch
		}
		var runningBal float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
			WHERE item_code=$1 AND warehouse_id=$2`, l.itemCode, wid).Scan(&runningBal)
		if _, err := db.Exec(c.Context(), `
			INSERT INTO stock_ledger_entries (item_code, warehouse, actual_qty, qty_after_transaction, voucher_type, voucher_no, posting_date, creation, batch_no)
			VALUES ($1,$2,$3,$4,'GRN',$5,CURRENT_DATE,NOW(),$6)`,
			l.itemCode, whCode, l.scanned, runningBal, voucherNo, batchArg); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
	}

	// Backfill item weight from packing-list "Calculated Part Weight" where the
	// item master has none — feeds the weight-based putaway fit layer.
	_, _ = db.Exec(c.Context(), `
		UPDATE items i SET
			weight_per_unit = COALESCE(NULLIF(i.weight_per_unit,0), sub.w),
			weight_uom = COALESCE(NULLIF(i.weight_uom,''),'Kg')
		FROM (
			SELECT UPPER(item_code) ic, MAX(unit_weight_kg) w
			FROM grn_lines
			WHERE grn_session_id=$1 AND COALESCE(unit_weight_kg,0) > 0
			GROUP BY UPPER(item_code)
		) sub
		WHERE UPPER(i.code)=sub.ic`, sessionID)

	// Update linked Purchase Order (purchase_receipt_no stores PO name).
	// Fix #1: Only update PO received_qty when stock was just posted (not on re-entry).
	poUpdate := fiber.Map{}
	if claim.RowsAffected() > 0 && poName != nil && *poName != "" {
		var poID int
		var perBilled float64
		err = db.QueryRow(c.Context(),
			`SELECT id, COALESCE(per_billed,0) FROM purchase_orders WHERE name=$1`, *poName).
			Scan(&poID, &perBilled)
		if err == nil {
			// Aggregate received by item for PO update.
			agg := map[string]float64{}
			for _, l := range lines {
				agg[l.itemCode] += l.scanned
			}
			for itemCode, qty := range agg {
				if _, err := db.Exec(c.Context(), `
					UPDATE purchase_order_items
					SET received_qty = COALESCE(received_qty,0) + $1
					WHERE purchase_order_id=$2 AND item_code=$3`,
					qty, poID, itemCode); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
			}

			var totalQty, totalRecv float64
			_ = db.QueryRow(c.Context(), `
				SELECT COALESCE(SUM(qty),0), COALESCE(SUM(received_qty),0)
				FROM purchase_order_items WHERE purchase_order_id=$1`, poID).
				Scan(&totalQty, &totalRecv)

			perReceived := 0.0
			if totalQty > 0 {
				perReceived = totalRecv / totalQty * 100
				if perReceived > 100 {
					perReceived = 100
				}
			}

			newStatus := "To Receive and Bill"
			switch {
			case perReceived >= 100 && perBilled >= 100:
				newStatus = "Completed"
			case perReceived >= 100:
				newStatus = "To Bill"
			case perReceived > 0 && perBilled >= 100:
				newStatus = "To Receive"
			case perReceived > 0:
				newStatus = "To Receive and Bill"
			}

			if _, err := db.Exec(c.Context(),
				`UPDATE purchase_orders SET per_received=$1, status=$2, last_synced_at=NOW() WHERE id=$3`,
				perReceived, newStatus, poID); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}

			poUpdate = fiber.Map{
				"po_name":        *poName,
				"po_id":          poID,
				"per_received":   perReceived,
				"status":         newStatus,
				"total_qty":      totalQty,
				"total_received": totalRecv,
			}
		}
	}

	finalStatus := "closed"
	if v, ok := c.Locals("grnCloseStatus").(string); ok && v != "" {
		finalStatus = v
	}
	if _, err := db.Exec(c.Context(),
		`UPDATE grn_sessions SET status=$3, closed_at=NOW(), stock_posted_at=COALESCE(stock_posted_at,NOW()),
		 warehouse_id=COALESCE(warehouse_id,$2), updated_at=now() WHERE id=$1`,
		sessionID, wid, finalStatus); err != nil {
		// Pre-020 without stock_posted_at
		if _, err2 := db.Exec(c.Context(),
			`UPDATE grn_sessions SET status=$3, closed_at=NOW(), warehouse_id=COALESCE(warehouse_id,$2) WHERE id=$1`,
			sessionID, wid, finalStatus); err2 != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
	}

	var supplierName string
	_ = db.QueryRow(c.Context(), `SELECT COALESCE(supplier_name,'') FROM grn_sessions WHERE id=$1`, sessionID).Scan(&supplierName)
	notifications.EmitGRNClosed(c.Context(), db, sessionID, supplierName)

	// Alert open backorders for items just received
	for _, l := range lines {
		var openQty float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(qty),0) FROM backorder_lines_v2
			WHERE status='pending' AND item_code=$1`, l.itemCode).Scan(&openQty)
		if openQty > 0 {
			notifications.EmitOpenBOsForItem(c.Context(), db, l.itemCode, openQty)
		}
	}

	result := fiber.Map{
		"id":                sessionID,
		"status":            finalStatus,
		"items_posted":      len(lines),
		"sle_count":         len(lines),
		"posted_incoming":   postedIncoming,
		"posted_hold":       postedHold,
		"posted_damaged":    postedDamaged,
		"qi_created":        qiCreated,
		"variances":         variances,
		"incoming_location": incomingCode,
		"hold_location":     holdCode,
		"damaged_location":  dmgCode,
		"warehouse_id":      wid,
		"po":                poUpdate,
		"putaway_ready":     postedIncoming > 0,
	}
	if silent, _ := c.Locals("grnCloseSilent").(bool); silent {
		c.Locals("grnCloseResult", result)
		return nil
	}
	return shared.OK(c, result)
}

func userID(c *fiber.Ctx) int {
	switch v := c.Locals("user_id").(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	default:
		return 0
	}
}

func nullableUserID(c *fiber.Ctx) any {
	id := userID(c)
	if id <= 0 {
		return nil
	}
	return id
}
