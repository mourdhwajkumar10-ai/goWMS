package packinglist

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

// RegisterReceiving registers routing for /api/receiving endpoints
func RegisterReceiving(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/start", rbac.RequirePermission("receiving.start"), startReceivingSession(db))
	r.Post("/import", importReceiving(db))
	r.Get("/invoices", listReceivingInvoices(db))
	r.Get("/delivery-notes", listReceivingDeliveryNotes(db))
	r.Get("/boxes", listReceivingBoxes(db))
	r.Get("/drivers", listDrivers(db))
	r.Get("/pending-pos", listPendingPOs(db))
}

// startReceivingSession creates or resumes a GRN session for a purchase order.
// DockReceiving posts { purchase_order_id } and expects { id, expected_boxes|total_boxes }.
func startReceivingSession(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			PurchaseOrderID int    `json:"purchase_order_id"`
			ReceivingMode   string `json:"receiving_mode"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.PurchaseOrderID <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "purchase_order_id required")
		}

		var poName, supplierName string
		err := db.QueryRow(c.Context(),
			`SELECT name, COALESCE(supplier_name,'') FROM purchase_orders WHERE id=$1`,
			body.PurchaseOrderID).Scan(&poName, &supplierName)
		if err != nil {
			return shared.Err(c, fiber.StatusNotFound, "purchase order not found")
		}

		mode := strings.ToLower(strings.TrimSpace(body.ReceivingMode))
		if mode == "" {
			mode = "packing_list"
		}
		if mode != "packing_list" && mode != "invoice_only" {
			return shared.Err(c, fiber.StatusBadRequest, "receiving_mode must be packing_list or invoice_only")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var sessionID int
		var sessionNo string
		var boxesTotal int
		err = tx.QueryRow(c.Context(), `
			SELECT id, session_no, COALESCE(boxes_total, 0)
			FROM grn_sessions
			WHERE (purchase_order_id = $1 OR purchase_receipt_no = $2)
			  AND status NOT IN ('closed','completed')
			ORDER BY id DESC LIMIT 1`, body.PurchaseOrderID, poName).
			Scan(&sessionID, &sessionNo, &boxesTotal)
		if err == nil && sessionID > 0 {
			if boxesTotal == 0 {
				n, _ := backfillBoxesFromPO(c.Context(), tx, sessionID, poName)
				if n > 0 {
					boxesTotal = n
					_, _ = tx.Exec(c.Context(),
						`UPDATE grn_sessions SET boxes_total=$2 WHERE id=$1 AND COALESCE(boxes_total,0) < $2`,
						sessionID, n)
				}
			}
			if err = tx.Commit(c.Context()); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			return shared.OK(c, fiber.Map{
				"id":             sessionID,
				"session_no":     sessionNo,
				"expected_boxes": boxesTotal,
				"total_boxes":    boxesTotal,
				"resumed":        true,
			})
		}

		warehouseID, werr := shared.EnsureDefaultWarehouse(c.Context(), db)
		if werr != nil {
			warehouseID = 1
		}

		err = tx.QueryRow(c.Context(), `
			INSERT INTO grn_sessions (
				session_no, warehouse_id, status, receiving_mode, packing_list_available,
				purchase_receipt_no, supplier_name, purchase_order_id, arrival_at, created_by
			) VALUES (
				'GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),
				$1, 'receiving', $2, $3,
				$4, $5, $6, NOW(), NULLIF($7, 0)
			) RETURNING id, session_no`,
			warehouseID, mode, mode == "packing_list",
			poName, supplierName, body.PurchaseOrderID, userID(c),
		).Scan(&sessionID, &sessionNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to create session: "+err.Error())
		}

		createdBoxes, _ := backfillBoxesFromPO(c.Context(), tx, sessionID, poName)
		if createdBoxes > 0 {
			boxesTotal = createdBoxes
			_, _ = tx.Exec(c.Context(), `UPDATE grn_sessions SET boxes_total=$2 WHERE id=$1`, sessionID, createdBoxes)
		}

		plNo := strings.Replace(sessionNo, "GRN-", "PL-", 1)
		_, _ = tx.Exec(c.Context(), `
			UPDATE grn_sessions SET packing_list_no = COALESCE(NULLIF(packing_list_no,''), $2) WHERE id=$1`,
			sessionID, plNo)

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		return shared.OK(c, fiber.Map{
			"id":             sessionID,
			"session_no":     sessionNo,
			"expected_boxes": boxesTotal,
			"total_boxes":    boxesTotal,
			"resumed":        false,
		})
	}
}

func importReceiving(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// 1. Get request params
		sessionID, _ := strconv.Atoi(c.FormValue("grn_session_id"))
		driverName := strings.TrimSpace(c.FormValue("driver_name"))
		driverPhone := strings.TrimSpace(c.FormValue("driver_phone"))
		transporter := strings.TrimSpace(c.FormValue("transporter"))
		defaultRoute := strings.TrimSpace(c.FormValue("default_route"))
		if defaultRoute == "" {
			defaultRoute = "INCOMING-01"
		}
		poName := strings.TrimSpace(c.FormValue("po_name"))
		supplierName := strings.TrimSpace(c.FormValue("supplier_name"))

		// 2. Open the file (optional — when no file is sent, just create an empty session for PO-based receiving)
		fileHeader, fileErr := c.FormFile("file")
		hasFile := fileErr == nil && fileHeader != nil && fileHeader.Size > 0

		var rows [][]string
		if hasFile {
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
			rows, err = xlsx.GetRows(sheets[0])
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, "failed to read rows: "+err.Error())
			}
			if len(rows) < 2 {
				return shared.Err(c, fiber.StatusBadRequest, "no data rows")
			}
		}

		// 3. Setup header mappings (only when file data is present)
		var colIdx map[string]int
		var colMap map[string]string
		if hasFile && len(rows) > 0 {
			headers := rows[0]
			colIdx = map[string]int{}
			for i, h := range headers {
				colIdx[strings.TrimSpace(h)] = i
			}
		}

		colMap = map[string]string{
			"part_code":     "Part Code",
			"part_name":     "Part Name",
			"qty":           "Qty",
			"box_number":    "Box Number",
			"invoice_no":    "InvoiceNo",
			"delivery_no":   "Delivery No",
			"dealer_code":   "Dealer Code",
			"dealer_name":   "Dealer",
			"plant":         "Plant",
			"invoice_date":  "InvoiceDate",
			"delivery_date": "Delivery date",
			"unit_weight":   "Calculated Part Weight(in KG)",
			"branch":        "Branch",
			"box_no_from":   "Box No.From",
			"box_no_to":     "Box No.To",
		}

		getCell := func(row []string, logical string) string {
			if colIdx == nil {
				return ""
			}
			key := colMap[logical]
			if key == "" {
				key = logical
			}
			idx, ok := colIdx[key]
			if !ok {
				// Fallback keys to support alternative spellings
				fallbackKeys := map[string][]string{
					"part_code":    {"Part No", "PartCode", "PartNo", "part_no"},
					"invoice_no":   {"Invoice No", "Invoice_No"},
					"box_number":   {"Box Number", "BoxNo", "Box_No"},
					"unit_weight":  {"Calculated Part Weight(in KG)", "Weight", "Unit Weight"},
					"supplier_sku": {"Part Code", "Part No", "PartNo"},
				}
				if fks, exists := fallbackKeys[logical]; exists {
					for _, fk := range fks {
						if idx, ok = colIdx[fk]; ok {
							break
						}
					}
				}
			}
			if !ok {
				for h, i := range colIdx {
					if strings.EqualFold(h, key) || strings.EqualFold(h, logical) {
						idx, ok = i, true
						break
					}
				}
			}
			if !ok || idx >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[idx])
		}

		// 4. Begin transaction
		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		// Generate or verify grn_session
		var sessionNo string
		var warehouseID int
		createdNew := false
		if sessionID > 0 {
			err = tx.QueryRow(c.Context(), `
				SELECT session_no, warehouse_id FROM grn_sessions WHERE id=$1`, sessionID).Scan(&sessionNo, &warehouseID)
			if err != nil {
				return shared.Err(c, fiber.StatusNotFound, "grn session not found")
			}
		} else {
			// Single session per receiving: if an open session already exists for this
			// PO, reuse it instead of creating a duplicate.
			if poName != "" {
				var existingID int
				err = tx.QueryRow(c.Context(), `
					SELECT id FROM grn_sessions
					WHERE purchase_receipt_no = $1 AND status NOT IN ('closed','completed')
					ORDER BY id DESC LIMIT 1`, poName).Scan(&existingID)
				if err == nil {
					sessionID = existingID
					err = tx.QueryRow(c.Context(), `SELECT session_no FROM grn_sessions WHERE id=$1`, existingID).Scan(&sessionNo)
					if err != nil {
						return shared.Err(c, fiber.StatusInternalServerError, "failed to load session: "+err.Error())
					}
				}
			}
			if sessionID == 0 {
				warehouseID, err = shared.EnsureDefaultWarehouse(c.Context(), db)
				if err != nil {
					warehouseID = 1
				}
				err = tx.QueryRow(c.Context(), `
					INSERT INTO grn_sessions (
						session_no, warehouse_id, status, receiving_mode, packing_list_available,
						driver_name, driver_phone, transporter, default_route_location, arrival_at,
						purchase_receipt_no, supplier_name
					) VALUES (
						'GRN-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('grn_sessions_id_seq')::TEXT,5,'0'),
						$1, 'open', 'packing_list', $6,
						NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), $5, NOW(),
						NULLIF($7, ''), NULLIF($8, '')
					) RETURNING id, session_no`,
					warehouseID, driverName, driverPhone, transporter, defaultRoute,
					hasFile, poName, supplierName,
				).Scan(&sessionID, &sessionNo)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, "failed to create session: "+err.Error())
				}
				createdNew = true
			}
		}

		filename := ""
		if hasFile && fileHeader != nil {
			filename = fileHeader.Filename
		}
		mapInboundDocs(c.Context(), tx, sessionID, poName, filename)

		// If no file uploaded, auto-create expected boxes from the linked PO items
		// (so RF workers have box numbers to scan and the wizard can suggest top boxes)
		if !hasFile {
			createdBoxes, createdLines := backfillBoxesFromPO(c.Context(), tx, sessionID, poName)
			if createdBoxes == 0 {
				if createdNew {
					_, _ = tx.Exec(c.Context(), `DELETE FROM grn_sessions WHERE id=$1`, sessionID)
				}
				return shared.Err(c, fiber.StatusBadRequest, "this PO has no packing list or quantity to receive")
			}
			_, _ = tx.Exec(c.Context(), `
				UPDATE grn_sessions SET
					supplier_name = COALESCE(NULLIF($2,''), supplier_name),
					purchase_receipt_no = COALESCE(NULLIF($3,''), purchase_receipt_no),
					boxes_total = $4
				WHERE id=$1`, sessionID, supplierName, poName, createdBoxes)

			if err := tx.Commit(c.Context()); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			return shared.OK(c, fiber.Map{
				"grn_session_id": sessionID,
				"session_no":     sessionNo,
				"import_summary": fiber.Map{
					"rows_imported": createdLines,
					"rows_skipped":  0,
					"total_boxes":   createdBoxes,
					"total_qty":     0,
				},
			})
		}

		uniqueInvoices := map[string]bool{}
		uniqueDeliveries := map[string]bool{}
		boxItemCount := map[string]int{}
		boxTypeMap := map[string]string{}
		boxDealerCode := map[string]string{}
		boxDealerName := map[string]string{}
		boxPlant := map[string]string{}

		type rowData struct {
			partCode     string
			partName     string
			qty          float64
			boxNumber    string
			invoiceNo    string
			invoiceDate  string
			deliveryNo   string
			deliveryDate string
			dealerCode   string
			dealerName   string
			plant        string
			unitWeight   float64
		}

		var parsedRows []rowData
		totalQtyParsed := 0.0
		skippedRows := 0

		for i := 1; i < len(rows); i++ {
			row := rows[i]
			boxNo := getCell(row, "box_number")
			partCode := getCell(row, "part_code")
			boxNoTo := getCell(row, "box_no_to")

			// Check for summary row or empty row
			if boxNoTo == "MIN=" || boxNo == "" || partCode == "" {
				skippedRows++
				continue
			}

			qty, _ := strconv.ParseFloat(getCell(row, "qty"), 64)
			if qty <= 0 {
				skippedRows++
				continue
			}

			unitWeight, _ := strconv.ParseFloat(getCell(row, "unit_weight"), 64)

			invoiceNo := getCell(row, "invoice_no")
			deliveryNo := getCell(row, "delivery_no")
			dealerCode := getCell(row, "dealer_code")
			dealerName := getCell(row, "dealer_name")
			plant := getCell(row, "plant")

			// Clean dealer name - might contain the dealer code inside parens
			if idx := strings.Index(dealerName, "("); idx != -1 {
				dealerName = strings.TrimSpace(dealerName[:idx])
			}

			boxType := "carton"
			if strings.Contains(boxNo, "-E") {
				boxType = "envelope"
			}

			boxItemCount[boxNo]++
			boxTypeMap[boxNo] = boxType
			boxDealerCode[boxNo] = dealerCode
			boxDealerName[boxNo] = dealerName
			boxPlant[boxNo] = plant

			if invoiceNo != "" {
				uniqueInvoices[invoiceNo] = true
			}
			if deliveryNo != "" {
				uniqueDeliveries[deliveryNo] = true
			}

			totalQtyParsed += qty

			parsedRows = append(parsedRows, rowData{
				partCode:     partCode,
				partName:     getCell(row, "part_name"),
				qty:          qty,
				boxNumber:    boxNo,
				invoiceNo:    invoiceNo,
				invoiceDate:  getCell(row, "invoice_date"),
				deliveryNo:   deliveryNo,
				deliveryDate: getCell(row, "delivery_date"),
				dealerCode:   dealerCode,
				dealerName:   dealerName,
				plant:        plant,
				unitWeight:   unitWeight,
			})
		}

		// Insert cartons and lines
		if len(parsedRows) == 0 {
			if createdNew {
				return shared.Err(c, fiber.StatusBadRequest, "packing list has no quantity to import")
			}
			return shared.Err(c, fiber.StatusBadRequest, "no data rows")
		}

		// Reuse an open GRN that already has these box numbers instead of
		// creating another copy of the same packing list.
		var sampleBox string
		for boxNo := range boxItemCount {
			sampleBox = boxNo
			break
		}
		if sampleBox != "" {
			var existingID int
			var existingNo string
			err = tx.QueryRow(c.Context(), `
				SELECT gs.id, gs.session_no
				FROM grn_cartons c
				JOIN grn_sessions gs ON gs.id = c.grn_session_id
				WHERE c.carton_no = $1 AND gs.status NOT IN ('closed','completed') AND gs.id <> $2
				ORDER BY gs.id DESC LIMIT 1`, sampleBox, sessionID).Scan(&existingID, &existingNo)
			if err == nil && existingID > 0 {
				if createdNew {
					if _, delErr := tx.Exec(c.Context(), `DELETE FROM grn_sessions WHERE id=$1`, sessionID); delErr != nil {
						return shared.Err(c, fiber.StatusInternalServerError, delErr.Error())
					}
				}
				sessionID = existingID
				sessionNo = existingNo
				createdNew = false
				var existingCartons int
				_ = tx.QueryRow(c.Context(), `SELECT COUNT(*) FROM grn_cartons WHERE grn_session_id=$1`, sessionID).Scan(&existingCartons)
				if existingCartons > 0 {
					if err = tx.Commit(c.Context()); err != nil {
						return shared.Err(c, fiber.StatusInternalServerError, err.Error())
					}
					return shared.OK(c, fiber.Map{
						"grn_session_id": sessionID,
						"session_no":     sessionNo,
						"reused":         true,
						"import_summary": fiber.Map{
							"rows_imported": 0,
							"rows_skipped":  skippedRows,
							"total_boxes":   existingCartons,
							"total_qty":     totalQtyParsed,
						},
					})
				}
			}
		}

		cartonIDs := map[string]int{}
		for boxNo, itemCnt := range boxItemCount {
			var cartonID int
			err2 := tx.QueryRow(c.Context(), `
				SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`, sessionID, boxNo).Scan(&cartonID)
			if err2 != nil {
				err = tx.QueryRow(c.Context(), `
					INSERT INTO grn_cartons (
						grn_session_id, carton_no, status, is_expected, delivery_no, dealer_code, dealer_name, plant, box_type
					) VALUES ($1, $2, 'expected', true, $3, $4, $5, $6, $7) RETURNING id`,
					sessionID, boxNo, strings.Split(boxNo, "-")[0], boxDealerCode[boxNo], boxDealerName[boxNo], boxPlant[boxNo], boxTypeMap[boxNo],
				).Scan(&cartonID)
				if err != nil {
					return shared.Err(c, fiber.StatusInternalServerError, "failed to insert carton: "+err.Error())
				}
			}
			cartonIDs[boxNo] = cartonID
			_ = itemCnt
		}

		for _, pr := range parsedRows {
			cartonID := cartonIDs[pr.boxNumber]
			_, err = tx.Exec(c.Context(), `
				INSERT INTO grn_lines (
					grn_carton_id, item_code, expected_qty, scanned_qty, status,
					verification_method, grn_session_id, part_name, invoice_no, unit_weight_kg
				) VALUES ($1, $2, $3, 0, 'pending', 'import-xlsx', $4, $5, $6, $7)`,
				cartonID, pr.partCode, pr.qty, sessionID, pr.partName, pr.invoiceNo, pr.unitWeight,
			)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, "failed to insert line: "+err.Error())
			}
		}

		// 5. Update session stats
		invoicesList := []string{}
		for inv := range uniqueInvoices {
			invoicesList = append(invoicesList, inv)
		}
		deliveryList := []string{}
		for del := range uniqueDeliveries {
			deliveryList = append(deliveryList, del)
		}

		mainDelivery := ""
		if len(deliveryList) > 0 {
			mainDelivery = deliveryList[0]
		}
		mainPlant := ""
		if len(parsedRows) > 0 {
			mainPlant = parsedRows[0].plant
		}

		_, err = tx.Exec(c.Context(), `
			UPDATE grn_sessions SET
				invoice_nos = $2,
				delivery_no = $3,
				plant = COALESCE(NULLIF(plant, ''), $4),
				boxes_total = $5,
				driver_name = COALESCE(NULLIF(driver_name, ''), $6),
				driver_phone = COALESCE(NULLIF(driver_phone, ''), $7),
				transporter = COALESCE(NULLIF(transporter, ''), $8)
			WHERE id=$1`,
			sessionID, strings.Join(invoicesList, ","), mainDelivery, mainPlant, len(boxItemCount),
			driverName, driverPhone, transporter,
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, "failed to update session: "+err.Error())
		}

		// Log event
		payloadBytes, _ := json.Marshal(map[string]any{
			"cartons_created": len(boxItemCount),
			"lines_created":   len(parsedRows),
			"skipped":         skippedRows,
			"format":          "xlsx",
			"delivery_no":     mainDelivery,
		})
		payload := string(payloadBytes)
		device := strings.TrimSpace(c.Get("X-Device"))
		if device == "" {
			device = strings.TrimSpace(c.Get("User-Agent"))
		}
		if len(device) > 100 {
			device = device[:100]
		}
		_, _ = tx.Exec(c.Context(), `
			INSERT INTO grn_events (grn_session_id, event_type, actor_id, device, payload)
			VALUES ($1, 'PACKING_LIST_IMPORTED', $2, $3, $4::jsonb)`,
			sessionID, userID(c), device, payload,
		)

		if err = tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Compute single item vs multi item counts
		singleItemCount := 0
		multiItemCount := 0
		for _, cnt := range boxItemCount {
			if cnt == 1 {
				singleItemCount++
			} else {
				multiItemCount++
			}
		}

		autoSkip := len(uniqueInvoices) == 1 && len(uniqueDeliveries) == 1
		autoInvoice := ""
		autoDN := ""
		if autoSkip {
			for inv := range uniqueInvoices {
				autoInvoice = inv
			}
			for dn := range uniqueDeliveries {
				autoDN = dn
			}
		}

		dealerStr := ""
		if len(parsedRows) > 0 {
			dealerStr = parsedRows[0].dealerName
		}

		var plNo, poNo string
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(packing_list_no,''), COALESCE(purchase_receipt_no,'')
			FROM grn_sessions WHERE id=$1`, sessionID).Scan(&plNo, &poNo)

		return shared.OK(c, fiber.Map{
			"grn_session_id":  sessionID,
			"session_no":      sessionNo,
			"packing_list_no": plNo,
			"po_name":         poNo,
			"import_summary": fiber.Map{
				"total_rows":          len(rows) - 1,
				"rows_imported":       len(parsedRows),
				"rows_skipped":        skippedRows,
				"unique_invoices":     invoicesList,
				"unique_delivery_nos": deliveryList,
				"total_boxes":         len(boxItemCount),
				"single_item_boxes":   singleItemCount,
				"multi_item_boxes":    multiItemCount,
				"total_unique_items":  len(parsedRows), // approximate/simple key count
				"total_qty":           totalQtyParsed,
				"dealer":              dealerStr,
				"plant":               mainPlant,
			},
			"auto_skip":             autoSkip,
			"auto_selected_invoice": autoInvoice,
			"auto_selected_dn":      autoDN,
		})
	}
}

func listReceivingInvoices(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, _ := strconv.Atoi(c.Query("session_id"))
		if sessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "session_id required")
		}

		q := `
			SELECT 
				l.invoice_no,
				COUNT(DISTINCT c.delivery_no) as delivery_count,
				COUNT(DISTINCT c.id) as box_count,
				COALESCE(SUM(l.expected_qty), 0) as total_qty
			FROM grn_lines l
			JOIN grn_cartons c ON l.grn_carton_id = c.id
			WHERE l.grn_session_id = $1 AND l.invoice_no IS NOT NULL AND l.invoice_no <> ''
			GROUP BY l.invoice_no
			ORDER BY l.invoice_no`

		rows, err := db.Query(c.Context(), q, sessionID)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type invoiceSummary struct {
			InvoiceNo     string  `json:"invoice_no"`
			InvoiceDate   string  `json:"invoice_date"`
			DeliveryCount int     `json:"delivery_count"`
			BoxCount      int     `json:"box_count"`
			TotalQty      float64 `json:"total_qty"`
		}

		var summaries []invoiceSummary
		for rows.Next() {
			var s invoiceSummary
			err := rows.Scan(&s.InvoiceNo, &s.DeliveryCount, &s.BoxCount, &s.TotalQty)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			s.InvoiceDate = time.Now().Format("2006-01-02") // Fallback / mock since we don't store header-level invoice date separately
			summaries = append(summaries, s)
		}
		if summaries == nil {
			summaries = []invoiceSummary{}
		}

		return shared.OK(c, summaries)
	}
}

func listReceivingDeliveryNotes(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, _ := strconv.Atoi(c.Query("session_id"))
		invoiceNo := c.Query("invoice_no")
		if sessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "session_id required")
		}

		q := `
			SELECT 
				c.delivery_no,
				MAX(c.plant) as plant,
				MAX(c.dealer_name) as dealer,
				COUNT(DISTINCT c.id) as box_count,
				COALESCE(SUM(l.expected_qty), 0) as total_qty,
				COUNT(DISTINCT CASE WHEN c.status = 'verified' THEN c.id END) as boxes_received
			FROM grn_cartons c
			JOIN grn_lines l ON l.grn_carton_id = c.id
			WHERE l.grn_session_id = $1`
		args := []any{sessionID}

		if invoiceNo != "" {
			q += ` AND l.invoice_no = $2`
			args = append(args, invoiceNo)
		}

		q += ` GROUP BY c.delivery_no ORDER BY c.delivery_no`

		rows, err := db.Query(c.Context(), q, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type dnSummary struct {
			DeliveryNo    string  `json:"delivery_no"`
			DeliveryDate  string  `json:"delivery_date"`
			Plant         string  `json:"plant"`
			Dealer        string  `json:"dealer"`
			BoxCount      int     `json:"box_count"`
			TotalQty      float64 `json:"total_qty"`
			BoxesReceived int     `json:"boxes_received"`
		}

		var summaries []dnSummary
		for rows.Next() {
			var s dnSummary
			err := rows.Scan(&s.DeliveryNo, &s.Plant, &s.Dealer, &s.BoxCount, &s.TotalQty, &s.BoxesReceived)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			s.DeliveryDate = time.Now().Format("2006-01-02")
			summaries = append(summaries, s)
		}
		if summaries == nil {
			summaries = []dnSummary{}
		}

		return shared.OK(c, summaries)
	}
}

func listReceivingBoxes(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, _ := strconv.Atoi(c.Query("session_id"))
		deliveryNo := c.Query("delivery_no")
		if sessionID == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "session_id required")
		}

		var poName string
		var cartonCount int
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(purchase_receipt_no, ''),
			       (SELECT COUNT(*) FROM grn_cartons c WHERE c.grn_session_id = gs.id)
			FROM grn_sessions gs WHERE gs.id=$1`, sessionID).Scan(&poName, &cartonCount)
		if cartonCount == 0 && poName != "" {
			if tx, txErr := db.Begin(c.Context()); txErr == nil {
				n, _ := backfillBoxesFromPO(c.Context(), tx, sessionID, poName)
				if n > 0 {
					_, _ = tx.Exec(c.Context(), `UPDATE grn_sessions SET boxes_total=$2 WHERE id=$1 AND COALESCE(boxes_total,0) < $2`, sessionID, n)
					_ = tx.Commit(c.Context())
				} else {
					_ = tx.Rollback(c.Context())
				}
			}
		}

		// 1. Get box list
		q := `
			SELECT 
				c.id, c.carton_no, COALESCE(c.box_type, '') as box_type, COALESCE(c.status, '') as status,
				COALESCE(c.condition, 'ok') as condition,
				COUNT(l.id) as item_count,
				COALESCE(SUM(l.expected_qty), 0) as total_qty,
				COALESCE(SUM(l.scanned_qty), 0) as scanned_qty
			FROM grn_cartons c
			LEFT JOIN grn_lines l ON l.grn_carton_id = c.id
			WHERE c.grn_session_id = $1`
		args := []any{sessionID}

		if deliveryNo != "" {
			q += ` AND c.delivery_no = $2`
			args = append(args, deliveryNo)
		}

		q += ` GROUP BY c.id, c.carton_no, c.box_type, c.status, c.condition ORDER BY c.carton_no`

		rows, err := db.Query(c.Context(), q, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type itemInfo struct {
			PartCode     string  `json:"part_code"`
			PartName     string  `json:"part_name"`
			ExpectedQty  float64 `json:"expected_qty"`
			ScannedQty   float64 `json:"scanned_qty"`
			UnitWeightKg float64 `json:"unit_weight_kg"`
			Status       string  `json:"status"`
		}

		type boxInfo struct {
			ID           int        `json:"id"`
			BoxNumber    string     `json:"box_number"`
			BoxType      string     `json:"box_type"`
			Status       string     `json:"status"`
			Condition    string     `json:"condition"`
			ItemCount    int        `json:"item_count"`
			IsSingleItem bool       `json:"is_single_item"`
			TotalQty     float64    `json:"total_qty"`
			ScannedQty   float64    `json:"scanned_qty"`
			Items        []itemInfo `json:"items"`
		}

		var boxes []boxInfo
		var boxIDs []int

		for rows.Next() {
			var b boxInfo
			err := rows.Scan(&b.ID, &b.BoxNumber, &b.BoxType, &b.Status, &b.Condition, &b.ItemCount, &b.TotalQty, &b.ScannedQty)
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			b.IsSingleItem = b.ItemCount == 1
			b.Items = []itemInfo{}
			boxes = append(boxes, b)
			boxIDs = append(boxIDs, b.ID)
		}

		// 2. Load items for all boxes in batch if we have boxes
		if len(boxIDs) > 0 {
			// standard pgx batching / helper
			itemsMap := map[int][]itemInfo{}
			itemRows, err := db.Query(c.Context(), `
				SELECT grn_carton_id, item_code, COALESCE(part_name, ''), expected_qty, scanned_qty, COALESCE(unit_weight_kg, 0), COALESCE(status, '')
				FROM grn_lines
				WHERE grn_carton_id = ANY($1)`, boxIDs)
			if err == nil {
				defer itemRows.Close()
				for itemRows.Next() {
					var cid int
					var it itemInfo
					if err := itemRows.Scan(&cid, &it.PartCode, &it.PartName, &it.ExpectedQty, &it.ScannedQty, &it.UnitWeightKg, &it.Status); err == nil {
						itemsMap[cid] = append(itemsMap[cid], it)
					}
				}
			}
			for i, b := range boxes {
				if itms, ok := itemsMap[b.ID]; ok {
					boxes[i].Items = itms
				}
			}
		}

		if boxes == nil {
			boxes = []boxInfo{}
		}

		// 3. Count progress
		totalBoxes := len(boxes)
		boxesReceived := 0
		for _, b := range boxes {
			if b.Status == "verified" {
				boxesReceived++
			}
		}
		progressPct := 0
		if totalBoxes > 0 {
			progressPct = int(math.Round(float64(boxesReceived) / float64(totalBoxes) * 100))
		}

		return shared.OK(c, fiber.Map{
			"delivery_no":          deliveryNo,
			"total_boxes":          totalBoxes,
			"boxes_received":       boxesReceived,
			"overall_progress_pct": progressPct,
			"boxes":                boxes,
		})
	}
}

func listDrivers(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := c.Query("q")

		rows, err := db.Query(c.Context(), `
			SELECT DISTINCT
				COALESCE(NULLIF(TRIM(driver_name), ''), NULL) as name,
				COALESCE(NULLIF(TRIM(driver_phone), ''), NULL) as phone,
				COALESCE(NULLIF(TRIM(transporter), ''), NULL) as transporter,
				MAX(created_at) as last_used
			FROM grn_sessions
			WHERE driver_name IS NOT NULL AND TRIM(driver_name) <> ''
			GROUP BY driver_name, driver_phone, transporter
			ORDER BY last_used DESC
			LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type driverInfo struct {
			Name        string `json:"name"`
			Phone       string `json:"phone"`
			Transporter string `json:"transporter"`
			LastUsed    string `json:"last_used"`
		}

		var drivers []driverInfo
		for rows.Next() {
			var d driverInfo
			var lastUsed time.Time
			if err := rows.Scan(&d.Name, &d.Phone, &d.Transporter, &lastUsed); err != nil {
				continue
			}
			d.LastUsed = lastUsed.Format("2006-01-02")
			if q != "" {
				lq := strings.ToLower(q)
				if !strings.Contains(strings.ToLower(d.Name), lq) &&
					!strings.Contains(strings.ToLower(d.Phone), lq) &&
					!strings.Contains(strings.ToLower(d.Transporter), lq) {
					continue
				}
			}
			drivers = append(drivers, d)
		}
		if drivers == nil {
			drivers = []driverInfo{}
		}

		return shared.OK(c, drivers)
	}
}

func listPendingPOs(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT
				po.id, po.name, po.supplier_name, po.status,
				COALESCE(po.grand_total, 0) AS grand_total,
				COALESCE(po.schedule_date::text, '') AS schedule_date,
				(SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS item_count,
				(SELECT COALESCE(SUM(qty), 0) FROM purchase_order_items WHERE purchase_order_id = po.id) AS total_qty,
				(SELECT COALESCE(SUM(received_qty), 0) FROM purchase_order_items WHERE purchase_order_id = po.id) AS received_qty,
				(SELECT COUNT(*) FROM grn_sessions gs
				  WHERE (gs.purchase_receipt_no = po.name OR gs.purchase_order_id = po.id)
				    AND gs.status NOT IN ('closed','completed','cancelled')) AS open_sessions,
				(SELECT gs.id FROM grn_sessions gs
				  WHERE (gs.purchase_receipt_no = po.name OR gs.purchase_order_id = po.id)
				    AND gs.status NOT IN ('closed','completed','cancelled')
				  ORDER BY COALESCE(gs.boxes_total, 0) DESC, gs.id DESC
				  LIMIT 1) AS resume_session_id,
				(SELECT gs.session_no FROM grn_sessions gs
				  WHERE (gs.purchase_receipt_no = po.name OR gs.purchase_order_id = po.id)
				    AND gs.status NOT IN ('closed','completed','cancelled')
				  ORDER BY COALESCE(gs.boxes_total, 0) DESC, gs.id DESC
				  LIMIT 1) AS session_no,
				(SELECT COALESCE(gs.packing_list_no,'') FROM grn_sessions gs
				  WHERE (gs.purchase_receipt_no = po.name OR gs.purchase_order_id = po.id)
				    AND gs.status NOT IN ('closed','completed','cancelled')
				  ORDER BY COALESCE(gs.boxes_total, 0) DESC, gs.id DESC
				  LIMIT 1) AS packing_list_no,
				(SELECT COALESCE(
					NULLIF(gs.boxes_total, 0),
					(SELECT COUNT(*) FROM grn_cartons gc WHERE gc.grn_session_id = gs.id),
					0
				 ) FROM grn_sessions gs
				  WHERE (gs.purchase_receipt_no = po.name OR gs.purchase_order_id = po.id)
				    AND gs.status NOT IN ('closed','completed','cancelled')
				  ORDER BY COALESCE(gs.boxes_total, 0) DESC, gs.id DESC
				  LIMIT 1) AS boxes_total
			FROM purchase_orders po
			WHERE po.status IN ('draft','submitted','To Receive and Bill','To Receive','Partially Received','open')
			  AND COALESCE(po.per_received, 0) < 100
			  AND EXISTS (
				SELECT 1 FROM purchase_order_items poi
				WHERE poi.purchase_order_id = po.id AND COALESCE(poi.qty,0) > 0
			  )
			ORDER BY po.schedule_date ASC NULLS LAST, po.name ASC
			LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type poInfo struct {
			ID              int     `json:"id"`
			Name            string  `json:"name"`
			SupplierName    string  `json:"supplier_name"`
			Status          string  `json:"status"`
			GrandTotal      float64 `json:"grand_total"`
			ScheduleDate    string  `json:"schedule_date"`
			ItemCount       int     `json:"item_count"`
			TotalQty        float64 `json:"total_qty"`
			ReceivedQty     float64 `json:"received_qty"`
			OpenSessions    int     `json:"open_sessions"`
			ResumeSessionID *int    `json:"resume_session_id"`
			SessionNo       string  `json:"session_no"`
			PackingListNo   string  `json:"packing_list_no"`
			BoxesTotal      int     `json:"boxes_total"`
		}

		var list []poInfo
		for rows.Next() {
			var p poInfo
			var sessionNo, packingListNo *string
			var boxesTotal *int
			if err := rows.Scan(&p.ID, &p.Name, &p.SupplierName, &p.Status, &p.GrandTotal,
				&p.ScheduleDate, &p.ItemCount, &p.TotalQty, &p.ReceivedQty, &p.OpenSessions, &p.ResumeSessionID,
				&sessionNo, &packingListNo, &boxesTotal); err != nil {
				continue
			}
			if sessionNo != nil {
				p.SessionNo = *sessionNo
			}
			if packingListNo != nil {
				p.PackingListNo = *packingListNo
			}
			if boxesTotal != nil {
				p.BoxesTotal = *boxesTotal
			}
			list = append(list, p)
		}
		if list == nil {
			list = []poInfo{}
		}
		return shared.OK(c, list)
	}
}

// backfillBoxesFromPO creates one expected carton per PO item for sessions that
// were started from a PO without a packing-list file. It is idempotent: sessions
// that already have cartons are left untouched. Returns (createdBoxes, createdLines).
func backfillBoxesFromPO(ctx context.Context, tx pgx.Tx, sessionID int, poName string) (int, int) {
	var existingCartons int
	_ = tx.QueryRow(ctx, `SELECT COUNT(*) FROM grn_cartons WHERE grn_session_id=$1`, sessionID).Scan(&existingCartons)
	if existingCartons > 0 {
		return existingCartons, 0
	}
	if poName == "" {
		return 0, 0
	}
	var poID int
	if err := tx.QueryRow(ctx, `SELECT id FROM purchase_orders WHERE name=$1`, poName).Scan(&poID); err != nil {
		return 0, 0
	}

	itemRows, err := tx.Query(ctx, `
		SELECT item_code, COALESCE(item_name, ''), qty
		FROM purchase_order_items
		WHERE purchase_order_id=$1 AND qty > 0
		ORDER BY id`, poID)
	if err != nil {
		return 0, 0
	}
	type poItem struct {
		code, name string
		qty        float64
	}
	var items []poItem
	for itemRows.Next() {
		var it poItem
		if err := itemRows.Scan(&it.code, &it.name, &it.qty); err != nil {
			continue
		}
		items = append(items, it)
	}
	itemRows.Close()
	if err := itemRows.Err(); err != nil || len(items) == 0 {
		return 0, 0
	}

	createdBoxes, createdLines := 0, 0
	for i, it := range items {
		boxNo := fmt.Sprintf("%s-B%03d", poName, i+1)
		var cartonID int
		err := tx.QueryRow(ctx, `
			SELECT id FROM grn_cartons WHERE grn_session_id=$1 AND carton_no=$2`, sessionID, boxNo).Scan(&cartonID)
		if err != nil {
			err = tx.QueryRow(ctx, `
				INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected)
				VALUES ($1,$2,'expected',true) RETURNING id`,
				sessionID, boxNo).Scan(&cartonID)
			if err != nil {
				continue
			}
		}
		tag, err := tx.Exec(ctx, `
			INSERT INTO grn_lines (
				grn_carton_id, item_code, expected_qty, scanned_qty, status,
				verification_method, grn_session_id, part_name
			)
			SELECT $1,$2,$3,0,'pending','po-import',$4,$5
			WHERE NOT EXISTS (
				SELECT 1 FROM grn_lines WHERE grn_carton_id=$1 AND UPPER(item_code)=UPPER($2)
			)`, cartonID, it.code, it.qty, sessionID, it.name)
		if err != nil {
			tag, err = tx.Exec(ctx, `
				INSERT INTO grn_lines (
					grn_carton_id, item_code, expected_qty, scanned_qty, status,
					verification_method, grn_session_id
				)
				SELECT $1,$2,$3,0,'pending','po-import',$4
				WHERE NOT EXISTS (
					SELECT 1 FROM grn_lines WHERE grn_carton_id=$1 AND UPPER(item_code)=UPPER($2)
				)`, cartonID, it.code, it.qty, sessionID)
		}
		if err == nil && tag.RowsAffected() > 0 {
			createdLines++
		}
		createdBoxes++
	}
	return createdBoxes, createdLines
}
