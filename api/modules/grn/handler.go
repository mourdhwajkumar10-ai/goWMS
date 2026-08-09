package grn

import (
	"fmt"
	"strconv"
	"time"

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
}

func createSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			WarehouseID       int    `json:"warehouse_id"`
			PurchaseReceiptNo string `json:"purchase_receipt_no"`
			SupplierName      string `json:"supplier_name"`
			PurchaseOrderID   int    `json:"purchase_order_id"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		// If PO id given but name blank, resolve name for purchase_receipt_no (PO link).
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

		var warehouseID any
		if body.WarehouseID != 0 {
			warehouseID = body.WarehouseID
		}

		var id int
		var sessionNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO grn_sessions (session_no,warehouse_id,purchase_receipt_no,supplier_name,created_by)
			 VALUES ('GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),$1,$2,$3,$4)
			 RETURNING id, session_no`,
			warehouseID, body.PurchaseReceiptNo, body.SupplierName, userID(c)).Scan(&id, &sessionNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id":                   id,
			"session_no":           sessionNo,
			"status":               "open",
			"purchase_receipt_no":  body.PurchaseReceiptNo,
			"purchase_order_id":    body.PurchaseOrderID,
			"supplier_name":        body.SupplierName,
		})
	}
}

func listSessions(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, session_no, supplier_name, purchase_receipt_no, status, created_at
			FROM grn_sessions ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type session struct {
			ID                int       `json:"id"`
			SessionNo         string    `json:"session_no"`
			Supplier          *string   `json:"supplier"`
			PurchaseReceiptNo *string   `json:"purchase_receipt_no"`
			Status            string    `json:"status"`
			CreatedAt         time.Time `json:"created_at"`
		}
		var list []session
		for rows.Next() {
			var s session
			if err := rows.Scan(&s.ID, &s.SessionNo, &s.Supplier, &s.PurchaseReceiptNo, &s.Status, &s.CreatedAt); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
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
			Status      string   `json:"status"`
			BatchNo     *string  `json:"batch_no"`
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
				SELECT id, item_code, expected_qty, scanned_qty, status, batch_no
				FROM grn_lines WHERE grn_carton_id=$1 ORDER BY id ASC`, cartons[i].ID)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			for lrows.Next() {
				var l line
				if err := lrows.Scan(&l.ID, &l.ItemCode, &l.ExpectedQty, &l.ScannedQty, &l.Status, &l.BatchNo); err != nil {
					lrows.Close()
					return shared.Err(c, fiber.StatusInternalServerError, err.Error())
				}
				cartons[i].Lines = append(cartons[i].Lines, l)
			}
			lrows.Close()
		}

		return shared.OK(c, fiber.Map{
			"id":                   sess.ID,
			"session_no":           sess.SessionNo,
			"supplier_name":        sess.SupplierName,
			"purchase_receipt_no":  sess.PurchaseReceiptNo,
			"status":               sess.Status,
			"closed_at":            sess.ClosedAt,
			"created_at":           sess.CreatedAt,
			"warehouse_id":         sess.WarehouseID,
			"cartons":              cartons,
		})
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
	if status != "open" {
		return shared.Err(c, fiber.StatusBadRequest, "session is not open")
	}

	var existingID int
	err = db.QueryRow(c.Context(),
		`SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`,
		sessionID, cartonNo).Scan(&existingID)
	if err == nil {
		return shared.OK(c, fiber.Map{"id": existingID, "carton_no": cartonNo, "status": "accounted"})
	}

	var id int
	err = db.QueryRow(c.Context(),
		`INSERT INTO grn_cartons (grn_session_id,carton_no,status,scanned_at,scanned_by) VALUES ($1,$2,'accounted',NOW(),$3) RETURNING id`,
		sessionID, cartonNo, userID(c)).Scan(&id)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	return shared.OK(c, fiber.Map{"id": id, "carton_no": cartonNo, "status": "accounted"})
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
			Batch       string  `json:"batch_no"`
			ExpiryDate  string  `json:"expiry_date"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.GRNCartonID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "grn_carton_id required")
		}
		return doScanLine(c, db, body.GRNCartonID, body.ItemCode, body.ExpQty, body.ScanQty, body.Batch, body.ExpiryDate)
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
			Batch      string  `json:"batch_no"`
			ExpiryDate string  `json:"expiry_date"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		return doScanLine(c, db, cartonID, body.ItemCode, body.ExpQty, body.ScanQty, body.Batch, body.ExpiryDate)
	}
}

func doScanLine(c *fiber.Ctx, db *pgxpool.Pool, cartonID int, itemCode string, expQty, scanQty float64, batch, expiryDate string) error {
	if itemCode == "" {
		return shared.Err(c, fiber.StatusBadRequest, "item_code required")
	}
	if scanQty <= 0 {
		scanQty = 1
	}

	var maxPct float64
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE(poi.max_overreceipt_pct, 0)
		FROM grn_cartons gc
		JOIN grn_sessions gs ON gs.id = gc.grn_session_id
		JOIN purchase_orders po ON po.name = gs.purchase_receipt_no
		JOIN purchase_order_items poi ON poi.purchase_order_id = po.id AND poi.item_code = $1
		WHERE gc.id = $2 LIMIT 1`, itemCode, cartonID).Scan(&maxPct)

	if maxPct > 0 && expQty > 0 {
		over := (scanQty - expQty) / expQty * 100
		if over > maxPct {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("Over-receipt blocked: %.1f%% exceeds max %.1f%%", over, maxPct))
		}
	}

	status := "full_match"
	switch {
	case expQty > 0 && scanQty < expQty:
		status = "shortage"
	case expQty > 0 && scanQty > expQty:
		status = "excess"
	case expQty == 0:
		status = "full_match"
	}

	var expiry any
	if expiryDate != "" {
		expiry = expiryDate
	}

	var id int
	err := db.QueryRow(c.Context(),
		`INSERT INTO grn_lines (grn_carton_id,item_code,expected_qty,scanned_qty,status,batch_no,expiry_date)
		 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		cartonID, itemCode, expQty, scanQty, status, batch, expiry).Scan(&id)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	return shared.OK(c, fiber.Map{"id": id, "status": status, "scanned_qty": scanQty})
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
	if status == "closed" {
		return shared.Err(c, fiber.StatusBadRequest, "session already closed")
	}

	// Post every scanned line with qty > 0 (ERPNext receives actual qty, not only full_match).
	rows, err := db.Query(c.Context(), `
		SELECT gl.item_code, SUM(gl.scanned_qty), MAX(gl.batch_no)
		FROM grn_lines gl
		JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
		WHERE gc.grn_session_id = $1 AND COALESCE(gl.scanned_qty,0) > 0
		GROUP BY gl.item_code`, sessionID)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()

	type line struct {
		itemCode string
		qty      float64
		batch    *string
	}
	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.itemCode, &l.qty, &l.batch); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		lines = append(lines, l)
	}

	whCode := "MAIN"
	if warehouseID != nil {
		_ = db.QueryRow(c.Context(),
			`SELECT code FROM warehouses WHERE id=$1`, *warehouseID).Scan(&whCode)
	}

	voucherNo := fmt.Sprintf("GRN-%d", sessionID)
	for _, l := range lines {
		var qtyAfter float64
		_ = db.QueryRow(c.Context(),
			`SELECT COALESCE(actual_qty,0) FROM bins WHERE item_code=$1 AND warehouse=$2`,
			l.itemCode, whCode).Scan(&qtyAfter)
		qtyAfter += l.qty

		if _, err := db.Exec(c.Context(), `
			INSERT INTO stock_ledger_entries (item_code, warehouse, actual_qty, qty_after_transaction, voucher_type, voucher_no, posting_date, creation, batch_no)
			VALUES ($1,$2,$3,$4,'GRN', $5, CURRENT_DATE, NOW(), $6)`,
			l.itemCode, whCode, l.qty, qtyAfter, voucherNo, l.batch); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if _, err := db.Exec(c.Context(), `
			INSERT INTO bins (item_code, warehouse, actual_qty, projected_qty, last_synced_at)
			VALUES ($1,$2,$3,$3,NOW())
			ON CONFLICT (item_code, warehouse)
			DO UPDATE SET actual_qty = bins.actual_qty + EXCLUDED.actual_qty,
			              projected_qty = bins.projected_qty + EXCLUDED.actual_qty,
			              last_synced_at = NOW()`,
			l.itemCode, whCode, l.qty); err != nil {
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
			for _, l := range lines {
				if _, err := db.Exec(c.Context(), `
					UPDATE purchase_order_items
					SET received_qty = COALESCE(received_qty,0) + $1
					WHERE purchase_order_id=$2 AND item_code=$3`,
					l.qty, poID, l.itemCode); err != nil {
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

			// ERPNext-compatible PO status (simplified, no billing docs yet).
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
				"po_name":       *poName,
				"po_id":         poID,
				"per_received":  perReceived,
				"status":        newStatus,
				"total_qty":     totalQty,
				"total_received": totalRecv,
			}
		}
	}

	if _, err := db.Exec(c.Context(),
		`UPDATE grn_sessions SET status='closed', closed_at=NOW() WHERE id=$1`, sessionID); err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}

	return shared.OK(c, fiber.Map{
		"id":           sessionID,
		"status":       "closed",
		"items_posted": len(lines),
		"sle_count":    len(lines),
		"po":           poUpdate,
	})
}

// putawayAlias lets the GRN page call POST /grn/putaway with the same body as /putaway/.
func putawayAlias(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			ItemCode        string  `json:"item_code"`
			SourceWarehouse string  `json:"source_warehouse"`
			TargetLocation  string  `json:"target_location"`
			Quantity        float64 `json:"quantity"`
			BatchNo         string  `json:"batch_no"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.ItemCode == "" || body.TargetLocation == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and target_location required")
		}

		var id int
		var logNo string
		err := db.QueryRow(c.Context(),
			`INSERT INTO putaway_logs (log_no,item_code,batch_no,source_warehouse,target_location,quantity,placed_at,placed_by)
			 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,$5,NOW(),$6)
			 RETURNING id, log_no`,
			body.ItemCode, body.BatchNo, body.SourceWarehouse, body.TargetLocation, body.Quantity, userID(c)).
			Scan(&id, &logNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id":              id,
			"log_no":          logNo,
			"item_code":       body.ItemCode,
			"quantity":        body.Quantity,
			"target_location": body.TargetLocation,
		})
	}
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
