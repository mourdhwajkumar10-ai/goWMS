package packinglist

import (
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

// RegisterManagement adds the management endpoints for packing lists
func RegisterManagement(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/import-file", importPackingListFile(db))
	r.Get("/list", listPackingLists(db))
	r.Post("/:id/approve", rbac.RequirePermission("receiving.approve"), approvePackingList(db))
	r.Delete("/:id", deletePackingList(db))
	r.Get("/:id", getPackingList(db))
}

// deletePackingList removes a draft/open GRN packing-list session before receiving starts.
// Only draft/open (and empty progress) — blocks once boxes have been counted or status advances.
func deletePackingList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		var status string
		var boxesReceived int
		err = db.QueryRow(c.Context(), `
			SELECT COALESCE(status,''), COALESCE(boxes_received,0)
			FROM grn_sessions WHERE id=$1`, id).Scan(&status, &boxesReceived)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "packing list not found")
		}

		st := strings.ToLower(strings.TrimSpace(status))
		if st != "draft" && st != "open" {
			return shared.Err(c, fiber.StatusBadRequest, "only draft or open packing lists can be deleted")
		}
		if boxesReceived > 0 {
			return shared.Err(c, fiber.StatusBadRequest, "cannot delete: receiving has already started")
		}

		// Extra guard: any scanned qty means progress past a discardable draft
		var scanned float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(scanned_qty),0) FROM grn_lines WHERE grn_session_id=$1`, id).Scan(&scanned)
		if scanned > 0 {
			return shared.Err(c, fiber.StatusBadRequest, "cannot delete: items have already been scanned")
		}

		tag, err := db.Exec(c.Context(), `DELETE FROM grn_sessions WHERE id=$1 AND status IN ('draft','open')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "packing list not found or no longer deletable")
		}
		return shared.OK(c, fiber.Map{"deleted": true, "id": id})
	}
}

// listPackingLists returns all GRN sessions with packing list data
func listPackingLists(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := `
			SELECT 
				gs.id,
				gs.session_no as name,
				COALESCE(gs.supplier_name, '') as supplier_name,
				gs.status,
				COALESCE(gs.boxes_total, 0) as total_boxes,
				(SELECT COUNT(*) FROM grn_lines gl WHERE gl.grn_session_id = gs.id) as total_items,
				COALESCE((SELECT SUM(gl.expected_qty) FROM grn_lines gl WHERE gl.grn_session_id = gs.id), 0) as total_qty,
				COALESCE(gs.driver_name, '') as driver_name,
				COALESCE(gs.driver_phone, '') as driver_phone,
				COALESCE(gs.transporter, '') as transporter,
				gs.created_at,
				COALESCE(gs.created_by, 0) as created_by,
				COALESCE(gs.purchase_receipt_no, '') as po_no,
				COALESCE(gs.packing_list_no, '') as packing_list_no,
				COALESCE(gs.packing_list_filename, '') as packing_list_filename,
				COALESCE(gs.purchase_order_id, 0) as purchase_order_id
			FROM grn_sessions gs
			WHERE (
			   gs.receiving_mode = 'packing_list'
			   OR gs.packing_list_available = true
			   OR EXISTS (SELECT 1 FROM grn_cartons gc WHERE gc.grn_session_id = gs.id AND gc.is_expected = true)
			) AND (
			   EXISTS (SELECT 1 FROM grn_cartons gc WHERE gc.grn_session_id = gs.id)
			   OR EXISTS (SELECT 1 FROM grn_lines gl WHERE gl.grn_session_id = gs.id AND COALESCE(gl.expected_qty,0)+COALESCE(gl.scanned_qty,0) > 0)
			)
			ORDER BY gs.created_at DESC
			LIMIT 100`

		rows, err := db.Query(c.Context(), q)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type packingListInfo struct {
			ID                  int       `json:"id"`
			Name                string    `json:"name"`
			SupplierName        string    `json:"supplier_name"`
			Status              string    `json:"status"`
			TotalBoxes          int       `json:"total_boxes"`
			TotalItems          int       `json:"total_items"`
			TotalQty            float64   `json:"total_qty"`
			DriverName          string    `json:"driver_name"`
			DriverPhone         string    `json:"driver_phone"`
			Transporter         string    `json:"transporter"`
			CreatedAt           time.Time `json:"created_at"`
			CreatedBy           int       `json:"created_by"`
			PoNo                string    `json:"po_no"`
			PackingListNo       string    `json:"packing_list_no"`
			PackingListFilename string    `json:"packing_list_filename"`
			PurchaseOrderID     int       `json:"purchase_order_id"`
		}

		var list []packingListInfo
		for rows.Next() {
			var p packingListInfo
			if err := rows.Scan(&p.ID, &p.Name, &p.SupplierName, &p.Status, &p.TotalBoxes,
				&p.TotalItems, &p.TotalQty, &p.DriverName, &p.DriverPhone, &p.Transporter,
				&p.CreatedAt, &p.CreatedBy, &p.PoNo, &p.PackingListNo, &p.PackingListFilename, &p.PurchaseOrderID); err != nil {
				continue
			}
			list = append(list, p)
		}
		if list == nil {
			list = []packingListInfo{}
		}
		return shared.OK(c, list)
	}
}

// getPackingList returns a specific GRN session with its cartons and lines
func getPackingList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		// Lazy backfill: sessions started from a PO (no packing-list file) that
		// have no expected boxes yet get them from the PO items on first view,
		// so details and scanning work even for sessions created before backfill.
		var poName string
		var boxTotal int
		_ = db.QueryRow(c.Context(), `SELECT COALESCE(purchase_receipt_no,''), COALESCE(boxes_total,0) FROM grn_sessions WHERE id=$1`, id).Scan(&poName, &boxTotal)
		if boxTotal == 0 && poName != "" {
			tx, terr := db.Begin(c.Context())
			if terr == nil {
				boxes, _ := backfillBoxesFromPO(c.Context(), tx, id, poName)
				if boxes > 0 {
					_, _ = tx.Exec(c.Context(), `UPDATE grn_sessions SET boxes_total=$2 WHERE id=$1`, id, boxes)
				}
				_ = tx.Commit(c.Context())
			}
		}

		// Get session info
		var session struct {
			ID                  int       `json:"id"`
			Name                string    `json:"name"`
			SupplierName        string    `json:"supplier_name"`
			Status              string    `json:"status"`
			TotalBoxes          int       `json:"total_boxes"`
			TotalItems          int       `json:"total_items"`
			TotalQty            float64   `json:"total_qty"`
			DriverName          string    `json:"driver_name"`
			DriverPhone         string    `json:"driver_phone"`
			Transporter         string    `json:"transporter"`
			CreatedAt           time.Time `json:"created_at"`
			CreatedBy           int       `json:"created_by"`
			PoNo                string    `json:"po_no"`
			PackingListNo       string    `json:"packing_list_no"`
			PackingListFilename string    `json:"packing_list_filename"`
			PurchaseOrderID     int       `json:"purchase_order_id"`
		}

		err = db.QueryRow(c.Context(), `
			SELECT 
				gs.id,
				gs.session_no as name,
				COALESCE(gs.supplier_name, '') as supplier_name,
				gs.status,
				COALESCE(gs.boxes_total, 0) as total_boxes,
				(SELECT COUNT(*) FROM grn_lines gl WHERE gl.grn_session_id = gs.id) as total_items,
				COALESCE((SELECT SUM(gl.expected_qty) FROM grn_lines gl WHERE gl.grn_session_id = gs.id), 0) as total_qty,
				COALESCE(gs.driver_name, '') as driver_name,
				COALESCE(gs.driver_phone, '') as driver_phone,
				COALESCE(gs.transporter, '') as transporter,
				gs.created_at,
				COALESCE(gs.created_by, 0) as created_by,
				COALESCE(gs.purchase_receipt_no, ''),
				COALESCE(gs.packing_list_no, ''),
				COALESCE(gs.packing_list_filename, ''),
				COALESCE(gs.purchase_order_id, 0)
			FROM grn_sessions gs
			WHERE gs.id = $1`, id).Scan(
			&session.ID, &session.Name, &session.SupplierName, &session.Status, &session.TotalBoxes,
			&session.TotalItems, &session.TotalQty, &session.DriverName, &session.DriverPhone,
			&session.Transporter, &session.CreatedAt, &session.CreatedBy,
			&session.PoNo, &session.PackingListNo, &session.PackingListFilename, &session.PurchaseOrderID)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "packing list not found")
		}

		// Get items (cartons with lines)
		type itemInfo struct {
			ID            int        `json:"id"`
			BoxNumber     string     `json:"box_number"`
			PartCode      string     `json:"part_code"`
			PartName      string     `json:"part_name"`
			ExpectedQty   float64    `json:"expected_qty"`
			ScannedQty    float64    `json:"scanned_qty"`
			DamagedQty    float64    `json:"damaged_qty"`
			BatchNo       string     `json:"batch_no"`
			InvoiceNo     string     `json:"invoice_no"`
			DealerCode    string     `json:"dealer_code"`
			DealerName    string     `json:"dealer_name"`
			DeliveryNo    string     `json:"delivery_no"`
			Plant         string     `json:"plant"`
			Branch        string     `json:"branch"`
			InvoiceDate   *time.Time `json:"invoice_date"`
			DeliveryDate  *time.Time `json:"delivery_date"`
			BoxNoFrom     string     `json:"box_no_from"`
			BoxNoTo       string     `json:"box_no_to"`
			UnitWeight    float64    `json:"unit_weight_kg"`
			Status        string     `json:"status"`
			RouteLocation string     `json:"route_location"`
			BoxStatus     string     `json:"box_status"`
			BoxCondition  string     `json:"box_condition"`
		}

		rows, err := db.Query(c.Context(), `
			SELECT 
				gl.id,
				COALESCE(gc.carton_no, '') as box_number,
				gl.item_code as part_code,
				COALESCE(gl.part_name, '') as part_name,
				gl.expected_qty,
				COALESCE(gl.scanned_qty, 0) as scanned_qty,
				COALESCE(gl.damaged_qty, 0) as damaged_qty,
				COALESCE(gl.batch_no, '') as batch_no,
				COALESCE(gl.invoice_no, '') as invoice_no,
				COALESCE(gc.dealer_code, '') as dealer_code,
				COALESCE(gc.dealer_name, '') as dealer_name,
				COALESCE(gc.delivery_no, '') as delivery_no,
				COALESCE(gc.plant, '') as plant,
				COALESCE(gc.branch, '') as branch,
				gc.invoice_date,
				gc.delivery_date,
				COALESCE(gc.box_no_from, '') as box_no_from,
				COALESCE(gc.box_no_to, '') as box_no_to,
				COALESCE(gl.unit_weight_kg, 0) as unit_weight_kg,
				COALESCE(gl.status, 'pending') as status,
				COALESCE(
					(SELECT wl.code
					 FROM stock_location_balances slb
					 JOIN warehouse_locations wl ON wl.id = slb.location_id
					 WHERE UPPER(slb.item_code) = UPPER(gl.item_code)
					   AND slb.actual_qty > 0
					 ORDER BY
					   CASE WHEN COALESCE(wl.location_type,'') IN ('incoming','hold','staging','damaged') THEN 1 ELSE 0 END,
					   slb.actual_qty DESC,
					   wl.code
					 LIMIT 1),
					(SELECT pl.target_location
					 FROM putaway_logs pl
					 WHERE UPPER(pl.item_code) = UPPER(gl.item_code)
					   AND NULLIF(BTRIM(pl.target_location),'') IS NOT NULL
					 ORDER BY pl.placed_at DESC NULLS LAST, pl.id DESC
					 LIMIT 1),
					NULLIF(BTRIM(gl.route_location), ''),
					''
				) as route_location,
				COALESCE(gc.status, 'pending') as box_status,
				COALESCE(gc.condition, 'ok') as box_condition
			FROM grn_lines gl
			LEFT JOIN grn_cartons gc ON gl.grn_carton_id = gc.id
			WHERE gl.grn_session_id = $1
			ORDER BY gc.carton_no, gl.item_code`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		var items []itemInfo
		for rows.Next() {
			var item itemInfo
			if err := rows.Scan(&item.ID, &item.BoxNumber, &item.PartCode, &item.PartName,
				&item.ExpectedQty, &item.ScannedQty, &item.DamagedQty, &item.BatchNo, &item.InvoiceNo,
				&item.DealerCode, &item.DealerName, &item.DeliveryNo, &item.Plant,
				&item.Branch, &item.InvoiceDate, &item.DeliveryDate,
				&item.BoxNoFrom, &item.BoxNoTo,
				&item.UnitWeight, &item.Status, &item.RouteLocation,
				&item.BoxStatus, &item.BoxCondition); err != nil {
				continue
			}
			items = append(items, item)
		}
		if items == nil {
			items = []itemInfo{}
		}

		type cartonMeta struct {
			Status    string
			Condition string
			Scanned   bool
		}
		cartonByNo := map[string]cartonMeta{}
		cr, cErr := db.Query(c.Context(), `
			SELECT COALESCE(carton_no,''), COALESCE(status,'expected'), COALESCE(condition,'ok'), scanned_at IS NOT NULL
			FROM grn_cartons WHERE grn_session_id=$1`, id)
		if cErr == nil {
			for cr.Next() {
				var no, st, cond string
				var scanned bool
				if err := cr.Scan(&no, &st, &cond, &scanned); err != nil {
					continue
				}
				cartonByNo[strings.ToLower(strings.TrimSpace(no))] = cartonMeta{Status: st, Condition: cond, Scanned: scanned}
			}
			cr.Close()
		}

		for i := range items {
			if meta, ok := cartonByNo[strings.ToLower(strings.TrimSpace(items[i].BoxNumber))]; ok {
				items[i].BoxStatus = meta.Status
				items[i].BoxCondition = meta.Condition
			}
		}

		awaiting, counted, damaged, verified := 0, 0, 0, 0
		if len(cartonByNo) > 0 {
			for _, meta := range cartonByNo {
				switch packingBoxStageEx(meta.Status, meta.Condition, meta.Scanned) {
				case "verified":
					verified++
				case "damaged":
					damaged++
				case "counted":
					counted++
				default:
					awaiting++
				}
			}
		} else {
			boxStage := map[string]string{}
			for _, it := range items {
				if _, ok := boxStage[it.BoxNumber]; !ok {
					boxStage[it.BoxNumber] = packingBoxStage(it.BoxStatus, it.BoxCondition)
				}
			}
			for _, st := range boxStage {
				switch st {
				case "verified":
					verified++
				case "damaged":
					damaged++
				case "counted":
					counted++
				default:
					awaiting++
				}
			}
		}
		pending, scanning, matched, shortage, excess := 0, 0, 0, 0, 0
		for _, it := range items {
			switch packingItemStage(it.Status, it.ExpectedQty, it.ScannedQty) {
			case "excess":
				excess++
			case "shortage":
				shortage++
			case "matched":
				matched++
			case "scanning":
				scanning++
			default:
				pending++
			}
		}
		boxesTotal := session.TotalBoxes
		if n := len(cartonByNo); n > boxesTotal {
			boxesTotal = n
		}
		progress := fiber.Map{
			"boxes_total":    boxesTotal,
			"boxes_awaiting": awaiting,
			"boxes_counted":  counted,
			"boxes_damaged":  damaged,
			"boxes_verified": verified,
			"items_total":    len(items),
			"items_pending":  pending,
			"items_scanning": scanning,
			"items_matched":  matched,
			"items_shortage": shortage,
			"items_excess":   excess,
		}

		return shared.OK(c, fiber.Map{
			"id":                    session.ID,
			"name":                  session.Name,
			"session_no":            session.Name,
			"supplier_name":         session.SupplierName,
			"status":                session.Status,
			"total_boxes":           session.TotalBoxes,
			"total_items":           session.TotalItems,
			"total_qty":             session.TotalQty,
			"driver_name":           session.DriverName,
			"driver_phone":          session.DriverPhone,
			"transporter":           session.Transporter,
			"created_at":            session.CreatedAt,
			"created_by":            session.CreatedBy,
			"po_no":                 session.PoNo,
			"purchase_receipt_no":   session.PoNo,
			"packing_list_no":       session.PackingListNo,
			"packing_list_filename": session.PackingListFilename,
			"purchase_order_id":     session.PurchaseOrderID,
			"items":                 items,
			"progress":              progress,
		})
	}
}

// approvePackingList updates the status of a GRN session to "receiving"
func approvePackingList(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}

		// Update status to receiving
		_, err = db.Exec(c.Context(), `
			UPDATE grn_sessions 
			SET status = 'receiving', 
				updated_at = NOW()
			WHERE id = $1 AND status IN ('open', 'draft', 'pending_approval')`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Log event
		uid := 0
		if v, ok := c.Locals("user_id").(int); ok {
			uid = v
		}
		_, _ = db.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, actor_id, device, payload)
			VALUES ($1, 'PACKING_LIST_APPROVED', $2, $3, $4::jsonb)`, id, uid, eventDevice(c),
			mustJSON(map[string]any{"status": "receiving"}))

		return shared.OK(c, fiber.Map{"message": "Packing list approved"})
	}
}

func packingDamaged(cond string) bool {
	switch strings.ToLower(strings.TrimSpace(cond)) {
	case "damaged", "damage", "broken", "wet", "crushed", "torn":
		return true
	default:
		return false
	}
}

func packingBoxStage(status, condition string) string {
	return packingBoxStageEx(status, condition, false)
}

func packingBoxStageEx(status, condition string, physicallyScanned bool) string {
	st := strings.ToLower(strings.TrimSpace(status))
	dmg := packingDamaged(condition)
	if st == "verified" {
		return "verified"
	}
	if st == "received" || st == "accounted" || st == "exception" || st == "excess" || st == "scanned" {
		if dmg {
			return "damaged"
		}
		return "counted"
	}
	if dmg {
		return "damaged"
	}
	if physicallyScanned && (st == "" || st == "expected" || st == "pending" || st == "open") {
		return "counted"
	}
	return "awaiting"
}

func packingItemStage(status string, expected, scanned float64) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "excess":
		return "excess"
	case "shortage":
		return "shortage"
	case "full_match", "completed", "received":
		return "matched"
	}
	if scanned > 0 && expected > 0 && scanned < expected {
		return "scanning"
	}
	if expected > 0 && scanned >= expected {
		return "matched"
	}
	return "pending"
}

// importPackingListFile imports an XLSX file and creates a new GRN session
func importPackingListFile(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		driverName := strings.TrimSpace(c.FormValue("driver_name"))
		driverPhone := strings.TrimSpace(c.FormValue("driver_phone"))
		transporter := strings.TrimSpace(c.FormValue("transporter"))
		supplierName := strings.TrimSpace(c.FormValue("supplier_name"))
		poName := strings.TrimSpace(c.FormValue("po_name"))

		fileHeader, err := c.FormFile("file")
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "file required (.xlsx)")
		}
		f, err := fileHeader.Open()
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "failed to open file: "+err.Error())
		}
		defer f.Close()

		xlsx, err := excelize.OpenReader(f)
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid xlsx format: "+err.Error())
		}
		defer xlsx.Close()

		sheets := xlsx.GetSheetList()
		if len(sheets) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "workbook has no sheets")
		}
		rows, err := xlsx.GetRows(sheets[0])
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to read rows: "+err.Error())
		}
		if len(rows) < 2 {
			return shared.Err(c, fiber.StatusBadRequest, "no data rows")
		}

		// Setup header mappings
		headers := rows[0]
		colIdx := map[string]int{}
		for i, h := range headers {
			colIdx[strings.TrimSpace(h)] = i
		}

		colMap := map[string]string{
			"part_code":     "Part Code",
			"part_name":     "Part Name",
			"qty":           "Qty",
			"box_number":    "Box Number",
			"invoice_no":    "InvoiceNo",
			"branch":        "Branch",
			"invoice_date":  "Invoice Date",
			"delivery_date": "Delivery Date",
			"box_no_from":   "Box No From",
			"box_no_to":     "Box No To",
		}

		getCell := func(row []string, logical string) string {
			key := colMap[logical]
			idx, ok := colIdx[key]
			if !ok {
				// Fallback keys
				fallbackKeys := map[string][]string{
					"part_code":  {"Part No", "PartCode", "PartNo", "part_no"},
					"invoice_no": {"Invoice No", "Invoice_No"},
					"box_number": {"Box Number", "BoxNo", "Box_No"},
				}
				if fks, exists := fallbackKeys[logical]; exists {
					for _, fk := range fks {
						if idx, ok = colIdx[fk]; ok {
							break
						}
					}
				}
			}
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		// Begin transaction
		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		// Create new GRN session
		warehouseID, err := shared.EnsureDefaultWarehouse(c.Context(), db)
		if err != nil {
			warehouseID = 1
		}

		var sessionID int
		var sessionNo string
		err = tx.QueryRow(c.Context(), `
			INSERT INTO grn_sessions (
				session_no, warehouse_id, status, receiving_mode, packing_list_available,
				supplier_name, driver_name, driver_phone, transporter, arrival_at
			) VALUES (
				'GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),
				$1, 'open', 'packing_list', true,
				NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NOW()
			) RETURNING id, session_no`, warehouseID, supplierName, driverName, driverPhone, transporter,
		).Scan(&sessionID, &sessionNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to create session: "+err.Error())
		}
		mapInboundDocs(c.Context(), tx, sessionID, poName, fileHeader.Filename)

		// Parse and insert rows
		boxItemCount := map[string]int{}
		cartonIDs := map[string]int{}
		parsedRows := 0
		skippedRows := 0

		for i := 1; i < len(rows); i++ {
			row := rows[i]
			boxNo := getCell(row, "box_number")
			partCode := getCell(row, "part_code")

			if boxNo == "" || partCode == "" {
				skippedRows++
				continue
			}

			qty, _ := strconv.ParseFloat(getCell(row, "qty"), 64)
			if qty <= 0 {
				skippedRows++
				continue
			}

			partName := getCell(row, "part_name")
			invoiceNo := getCell(row, "invoice_no")
			branch := getCell(row, "branch")
			invoiceDate := getCell(row, "invoice_date")
			deliveryDate := getCell(row, "delivery_date")
			boxNoFrom := getCell(row, "box_no_from")
			boxNoTo := getCell(row, "box_no_to")

			boxItemCount[boxNo]++

			// Insert carton if not exists
			cartonID, ok := cartonIDs[boxNo]
			if !ok {
				err = tx.QueryRow(c.Context(), `
				INSERT INTO grn_cartons (
					grn_session_id, carton_no, status, is_expected,
					dealer_code, dealer_name, delivery_no, plant, branch,
					invoice_date, delivery_date, box_no_from, box_no_to
				) VALUES (
					$1, $2, 'expected', true,
					NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''),
					NULLIF($8, '')::timestamptz, NULLIF($9, '')::timestamptz, NULLIF($10, ''), NULLIF($11, '')
				) RETURNING id`,
					sessionID, boxNo,
					getCell(row, "dealer_code"), getCell(row, "dealer_name"),
					getCell(row, "delivery_no"), getCell(row, "plant"), branch,
					invoiceDate, deliveryDate, boxNoFrom, boxNoTo,
				).Scan(&cartonID)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, "failed to insert carton: "+err.Error())
				}
				cartonIDs[boxNo] = cartonID
			}

			// Insert line
			var notes *string
			if partName != "" {
				notes = &partName
			}
			var inv *string
			if invoiceNo != "" {
				inv = &invoiceNo
			}

			_, err = tx.Exec(c.Context(), `
				INSERT INTO grn_lines (
					grn_carton_id, item_code, expected_qty, scanned_qty, status,
					verification_method, grn_session_id, notes, invoice_no
				) VALUES ($1, $2, $3, 0, 'pending', 'import', $4, $5, $6)`,
				cartonID, partCode, qty, sessionID, notes, inv)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, "failed to insert line: "+err.Error())
			}
			parsedRows++
		}

		// Update session stats
		_, err = tx.Exec(c.Context(), `
			UPDATE grn_sessions SET boxes_total = $2 WHERE id = $1`, sessionID, len(boxItemCount))
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to update session: "+err.Error())
		}

		// Log event
		uid := 0
		if v, ok := c.Locals("user_id").(int); ok {
			uid = v
		}
		_, _ = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, actor_id, device, payload)
			VALUES ($1, 'PACKING_LIST_IMPORTED', $2, 'web', $3::jsonb)`, sessionID, uid,
			mustJSON(map[string]any{"cartons": len(boxItemCount), "lines": parsedRows, "skipped": skippedRows}))

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{
			"grn_session_id":  sessionID,
			"session_no":      sessionNo,
			"packing_list_no": strings.Replace(sessionNo, "GRN-", "PL-", 1),
			"po_name":         poName,
			"import_summary": fiber.Map{
				"rows_imported": parsedRows,
				"rows_skipped":  skippedRows,
				"total_boxes":   len(boxItemCount),
				"total_qty":     0,
			},
		})
	}
}
