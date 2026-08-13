package grn

import (
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
	r.Post("/putaway", putawayAlias(db))

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
			WarehouseID       int    `json:"warehouse_id"`
			PurchaseReceiptNo string `json:"purchase_receipt_no"`
			SupplierName      string `json:"supplier_name"`
			PurchaseOrderID   int    `json:"purchase_order_id"`
			ReceivingMode     string `json:"receiving_mode"`
			TruckNo           string `json:"truck_no"`
			DriverName        string `json:"driver_name"`
			DriverPhone       string `json:"driver_phone"`
			ExpectedBoxes     int    `json:"expected_boxes"`
			Notes             string `json:"notes"`
			Plant             string `json:"plant"`
			Dock              string `json:"dock"`
			InvoiceNos        string `json:"invoice_nos"`
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

		mode := strings.ToLower(strings.TrimSpace(body.ReceivingMode))
		if mode == "" {
			mode = "packing_list"
		}
		if mode != "packing_list" && mode != "invoice_only" {
			return shared.Err(c, fiber.StatusBadRequest, "receiving_mode must be packing_list or invoice_only")
		}

		var warehouseID any
		if body.WarehouseID != 0 {
			warehouseID = body.WarehouseID
		}

		var id int
		var sessionNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO grn_sessions (
				session_no, warehouse_id, purchase_receipt_no, supplier_name, created_by,
				status, receiving_mode, truck_no, driver_name, driver_phone,
				expected_boxes, notes, plant, dock, invoice_nos, arrival_at
			) VALUES (
				'GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),
				$1,$2,$3,$4,'receiving',$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()
			) RETURNING id, session_no`,
			warehouseID, body.PurchaseReceiptNo, body.SupplierName, userID(c),
			mode, nullEmpty(body.TruckNo), nullEmpty(body.DriverName), nullEmpty(body.DriverPhone),
			body.ExpectedBoxes, nullEmpty(body.Notes), nullEmpty(body.Plant), nullEmpty(body.Dock),
			nullEmpty(body.InvoiceNos),
		).Scan(&id, &sessionNo)
		if err != nil {
			// Fallback for DBs before migration 018
			if strings.Contains(err.Error(), "receiving_mode") || strings.Contains(err.Error(), "truck_no") {
				err = db.QueryRow(c.Context(),
					`INSERT INTO grn_sessions (session_no,warehouse_id,purchase_receipt_no,supplier_name,created_by)
					 VALUES ('GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),$1,$2,$3,$4)
					 RETURNING id, session_no`,
					warehouseID, body.PurchaseReceiptNo, body.SupplierName, userID(c)).Scan(&id, &sessionNo)
			}
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		writeEvent(db, c.Context(), id, userID(c), "GRN_CREATED", fiber.Map{
			"payload": fiber.Map{"receiving_mode": mode, "truck_no": body.TruckNo},
		})
		shared.WriteAudit(db, c.Context(), userID(c), "grn.create", "grn", id, nil, fiber.Map{
			"session_no": sessionNo, "receiving_mode": mode,
		})
		return shared.OK(c, fiber.Map{
			"id":                  id,
			"session_no":          sessionNo,
			"status":              "receiving",
			"receiving_mode":      mode,
			"purchase_receipt_no": body.PurchaseReceiptNo,
			"purchase_order_id":   body.PurchaseOrderID,
			"supplier_name":       body.SupplierName,
			"truck_no":            body.TruckNo,
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
			SELECT id, session_no, supplier_name, purchase_receipt_no, status, created_at,
			       COALESCE(receiving_mode,'packing_list'), COALESCE(truck_no,'')
			FROM grn_sessions ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			if strings.Contains(err.Error(), "receiving_mode") {
				rows, err = db.Query(c.Context(), `
					SELECT id, session_no, supplier_name, purchase_receipt_no, status, created_at
					FROM grn_sessions ORDER BY created_at DESC LIMIT 50`)
			}
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		defer rows.Close()

		list := []fiber.Map{}
		for rows.Next() {
			var id int
			var sessionNo, status string
			var supplier, receipt *string
			var created time.Time
			var mode, truck string
			// Try extended scan first via column count - use two-path by checking FieldDescriptions
			cols := rows.FieldDescriptions()
			if len(cols) >= 8 {
				if err := rows.Scan(&id, &sessionNo, &supplier, &receipt, &status, &created, &mode, &truck); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
			} else {
				if err := rows.Scan(&id, &sessionNo, &supplier, &receipt, &status, &created); err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				mode = "packing_list"
			}
			list = append(list, fiber.Map{
				"id": id, "session_no": sessionNo, "supplier": supplier,
				"purchase_receipt_no": receipt, "status": status, "created_at": created,
				"receiving_mode": mode, "truck_no": truck,
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
		var podID, parentID, activeVerify *int
		var isFollowup bool
		if err2 := db.QueryRow(c.Context(), `
			SELECT COALESCE(receiving_mode,'packing_list'), COALESCE(truck_no,''), COALESCE(driver_name,''),
			       COALESCE(driver_phone,''), arrival_at, COALESCE(expected_boxes,0), COALESCE(notes,''),
			       COALESCE(plant,''), COALESCE(dock,''), COALESCE(invoice_nos,''),
			       pod_attachment_id, parent_grn_id, COALESCE(is_followup,false), active_verify_carton_id
			FROM grn_sessions WHERE id=$1`, sessionID).
			Scan(&mode, &truck, &driver, &phone, &arrival, &expectedBoxes, &notes, &plant, &dock, &invoices,
				&podID, &parentID, &isFollowup, &activeVerify); err2 == nil {
			extra = fiber.Map{
				"receiving_mode": mode, "truck_no": truck, "driver_name": driver, "driver_phone": phone,
				"arrival_at": arrival, "expected_boxes": expectedBoxes, "notes": notes,
				"plant": plant, "dock": dock, "invoice_nos": invoices,
				"pod_attachment_id": podID, "parent_grn_id": parentID, "is_followup": isFollowup,
				"active_verify_carton_id": activeVerify,
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
			"status":              sess.Status,
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
			GRNSessionID int    `json:"grn_session_id"`
			CartonNo     string `json:"carton_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.GRNSessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "grn_session_id required")
		}
		return doScanCarton(c, db, body.GRNSessionID, body.CartonNo)
	}
}

func scanCartonParam(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			CartonNo string `json:"carton_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		return doScanCarton(c, db, sessionID, body.CartonNo)
	}
}

func doScanCarton(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, cartonNo string) error {
	if cartonNo == "" {
		return shared.Err(c, fiber.StatusBadRequest, "carton_no required")
	}

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
		`SELECT id, status, COALESCE(is_expected,false) FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`,
		sessionID, cartonNo).Scan(&existingID, &existingStatus, &isExpected)
	if err == nil {
		st := strings.ToLower(existingStatus)
		if st == "received" || st == "accounted" || st == "verified" {
			writeEvent(db, c.Context(), sessionID, userID(c), "BOX_DUPLICATE_SCANNED", fiber.Map{
				"box_no": cartonNo, "result": "duplicate",
			})
			writeException(db, c.Context(), sessionID, userID(c), "duplicate_box", fiber.Map{
				"box_no": cartonNo,
			})
			return shared.OK(c, fiber.Map{
				"id": existingID, "carton_no": cartonNo, "status": existingStatus,
				"duplicate": true, "message": "BOX ALREADY SCANNED",
			})
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_cartons SET status='received', scanned_at=NOW(), scanned_by=$2 WHERE id=$1`,
			existingID, userID(c))
		writeEvent(db, c.Context(), sessionID, userID(c), "BOX_RECEIVED", fiber.Map{
			"box_no": cartonNo, "result": "received",
		})
		return shared.OK(c, fiber.Map{
			"id": existingID, "carton_no": cartonNo, "status": "received",
			"expected": true, "message": "Expected box received",
		})
	}

	// Unexpected / excess box
	var id int
	err = db.QueryRow(c.Context(),
		`INSERT INTO grn_cartons (grn_session_id,carton_no,status,scanned_at,scanned_by,is_expected)
		 VALUES ($1,$2,'excess',NOW(),$3,false) RETURNING id`,
		sessionID, cartonNo, userID(c)).Scan(&id)
	if err != nil {
		// Pre-018 fallback
		if strings.Contains(err.Error(), "is_expected") || strings.Contains(err.Error(), "excess") {
			err = db.QueryRow(c.Context(),
				`INSERT INTO grn_cartons (grn_session_id,carton_no,status,scanned_at,scanned_by) VALUES ($1,$2,'accounted',NOW(),$3) RETURNING id`,
				sessionID, cartonNo, userID(c)).Scan(&id)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "carton_no": cartonNo, "status": "accounted"})
	}
	writeEvent(db, c.Context(), sessionID, userID(c), "BOX_EXCESS_DETECTED", fiber.Map{
		"box_no": cartonNo, "result": "excess",
	})
	writeException(db, c.Context(), sessionID, userID(c), "excess_box", fiber.Map{
		"box_no": cartonNo,
	})
	return shared.OK(c, fiber.Map{
		"id": id, "carton_no": cartonNo, "status": "excess",
		"excess": true, "message": "EXCESS BOX",
	})
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
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		return doScanLine(c, db, scanLineInput{
			CartonID: cartonID, ItemCode: body.ItemCode,
			ExpQty: body.ExpQty, ScanQty: body.ScanQty, DamagedQty: body.DamagedQty,
			Batch: body.Batch, ExpiryDate: body.ExpiryDate, Notes: body.Notes,
			RequiresQI: body.RequiresQI, Status: body.Status,
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
}

func doScanLine(c *fiber.Ctx, db *pgxpool.Pool, in scanLineInput) error {
	itemCode := strings.TrimSpace(in.ItemCode)
	if itemCode == "" {
		return shared.Err(c, fiber.StatusBadRequest, "item_code required")
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

	var maxPct float64
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE(poi.max_overreceipt_pct, 0)
		FROM grn_cartons gc
		JOIN grn_sessions gs ON gs.id = gc.grn_session_id
		JOIN purchase_orders po ON po.name = gs.purchase_receipt_no
		JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND poi.item_code = $1
		WHERE gc.id = $2 LIMIT 1`, itemCode, in.CartonID).Scan(&maxPct)

	if maxPct > 0 && in.ExpQty > 0 {
		over := (in.ScanQty - in.ExpQty) / in.ExpQty * 100
		if over > maxPct {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("Over-receipt blocked: %.1f%% exceeds max %.1f%%", over, maxPct))
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

	var id int
	err = db.QueryRow(c.Context(),
		`INSERT INTO grn_lines (grn_carton_id,item_code,expected_qty,scanned_qty,damaged_qty,status,batch_no,expiry_date,notes,requires_qi)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
		in.CartonID, itemCode, in.ExpQty, in.ScanQty, in.DamagedQty, status, in.Batch, expiry, nullStr(in.Notes), in.RequiresQI).Scan(&id)
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
		return shared.Err(c, fiber.StatusBadRequest, "no warehouse configured for GRN")
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
		goodQty := l.scanned - l.damaged
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
		if l.damaged > 0 {
			if err := shared.AdjustLocationQty(c.Context(), db, l.itemCode, wid, dmgID, l.batch, l.damaged); err != nil {
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

		// Warehouse-level bin + SLE (legacy aggregate).
		var qtyAfter float64
		_ = db.QueryRow(c.Context(),
			`SELECT COALESCE(actual_qty,0) FROM bins WHERE item_code=$1 AND warehouse=$2`,
			l.itemCode, whCode).Scan(&qtyAfter)
		qtyAfter += l.scanned

		batchArg := any(nil)
		if l.batch != "" {
			batchArg = l.batch
		}
		if _, err := db.Exec(c.Context(), `
			INSERT INTO stock_ledger_entries (item_code, warehouse, actual_qty, qty_after_transaction, voucher_type, voucher_no, posting_date, creation, batch_no)
			VALUES ($1,$2,$3,$4,'GRN', $5, CURRENT_DATE, NOW(), $6)`,
			l.itemCode, whCode, l.scanned, qtyAfter, voucherNo, batchArg); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if _, err := db.Exec(c.Context(), `
			INSERT INTO bins (item_code, warehouse, actual_qty, projected_qty, last_synced_at)
			VALUES ($1,$2,$3,$3,NOW())
			ON CONFLICT (item_code, warehouse)
			DO UPDATE SET actual_qty = bins.actual_qty + EXCLUDED.actual_qty,
			              projected_qty = bins.projected_qty + EXCLUDED.actual_qty,
			              last_synced_at = NOW()`,
			l.itemCode, whCode, l.scanned); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
	}

	// Update linked Purchase Order (purchase_receipt_no stores PO name).
	poUpdate := fiber.Map{}
	if poName != nil && *poName != "" {
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

// putawayAlias lets the GRN page call POST /grn/putaway — delegates to location-aware putaway.
func putawayAlias(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			ItemCode         string  `json:"item_code"`
			SourceWarehouse  string  `json:"source_warehouse"`
			SourceLocation   string  `json:"source_location"`
			TargetLocation   string  `json:"target_location"`
			TargetLocationID int     `json:"target_location_id"`
			WarehouseID      int     `json:"warehouse_id"`
			Quantity         float64 `json:"quantity"`
			BatchNo          string  `json:"batch_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || (body.TargetLocation == "" && body.TargetLocationID == 0) {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and target_location required")
		}
		if body.Quantity <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "quantity must be > 0")
		}

		exists, complete, err := shared.ItemMasterComplete(c.Context(), db, body.ItemCode)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if !exists || !complete {
			return shared.Err(c, fiber.StatusConflict, "item master incomplete")
		}

		var targetID, warehouseID int
		var targetCode string
		if body.TargetLocationID > 0 {
			err = db.QueryRow(c.Context(), `
				SELECT id, code, warehouse_id FROM warehouse_locations
				WHERE id=$1 AND COALESCE(disabled,false)=false`, body.TargetLocationID).
				Scan(&targetID, &targetCode, &warehouseID)
		} else {
			err = db.QueryRow(c.Context(), `
				SELECT id, code, warehouse_id FROM warehouse_locations
				WHERE code=$1 AND COALESCE(disabled,false)=false
				  AND ($2=0 OR warehouse_id=$2)
				ORDER BY id LIMIT 1`, body.TargetLocation, body.WarehouseID).
				Scan(&targetID, &targetCode, &warehouseID)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "target location not found")
		}

		srcCode := body.SourceLocation
		if srcCode == "" {
			srcCode = "INCOMING-01"
		}
		var sourceID int
		_ = db.QueryRow(c.Context(), `
			SELECT id FROM warehouse_locations WHERE code=$1 AND warehouse_id=$2`,
			srcCode, warehouseID).Scan(&sourceID)
		if sourceID > 0 {
			_ = shared.AdjustLocationQty(c.Context(), db, body.ItemCode, warehouseID, sourceID, body.BatchNo, -body.Quantity)
		}
		if err := shared.AdjustLocationQty(c.Context(), db, body.ItemCode, warehouseID, targetID, body.BatchNo, body.Quantity); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE stock_location_balances SET allocation_status='allocatable', updated_at=now()
			WHERE item_code=$1 AND location_id=$2`, body.ItemCode, targetID)

		var id int
		var logNo string
		err = db.QueryRow(c.Context(),
			`INSERT INTO putaway_logs (log_no,item_code,batch_no,source_warehouse,target_location,quantity,placed_at,placed_by)
			 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,$5,NOW(),$6)
			 RETURNING id, log_no`,
			body.ItemCode, nullStr(body.BatchNo), body.SourceWarehouse, targetCode, body.Quantity, userID(c)).
			Scan(&id, &logNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": id, "log_no": logNo, "item_code": body.ItemCode,
			"quantity": body.Quantity, "target_location": targetCode,
			"target_location_id": targetID, "warehouse_id": warehouseID,
		})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
