package masterdata

// Item CSV import, item-groups CRUD, supplier get/update, carriers list.
// Kept in a separate file to avoid bloating handler.go further.

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/xuri/excelize/v2"
)

func registerGapRoutes(md fiber.Router, db *pgxpool.Pool) {
	manage := rbac.RequirePermission("masterdata.manage")
	md.Post("/items/import", manage, importItemsCSV(db))
	md.Post("/items/import-file", manage, importItemsFile(db))

	md.Get("/item-groups", listItemGroups(db))
	md.Post("/item-groups", manage, createItemGroup(db))
	md.Put("/item-groups/:id", manage, updateItemGroup(db))
	md.Delete("/item-groups/:id", manage, deleteItemGroup(db))

	md.Get("/suppliers/:id", getSupplier(db))
	md.Put("/suppliers/:id", manage, updateSupplier(db))
	md.Patch("/suppliers/:id", manage, updateSupplier(db))

	md.Get("/carriers", listCarriers(db))
	md.Post("/carriers", manage, createCarrier(db))

	registerTransportRoutes(md, db)
}

// RegisterCarriersRoot mounts /carriers at API root (QA/docs path).
func RegisterCarriersRoot(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/carriers", listCarriers(db))
	r.Post("/carriers", rbac.RequirePermission("masterdata.manage"), createCarrier(db))
}

func importItemsCSV(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Rows []map[string]string `json:"rows"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if len(body.Rows) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "rows required")
		}
		created, skipped, errors, err := importItemRows(c.Context(), db, body.Rows)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"created": created, "skipped": skipped, "errors": errors, "total": len(body.Rows),
		})
	}
}

func importItemsFile(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		fh, err := c.FormFile("file")
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "file required")
		}
		src, err := fh.Open()
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		defer src.Close()
		name := strings.ToLower(fh.Filename)
		if strings.HasSuffix(name, ".xls") && !strings.HasSuffix(name, ".xlsx") {
			return shared.Err(c, fiber.StatusBadRequest, "save the file as .xlsx or .csv and try again")
		}
		var rows []map[string]string
		if strings.HasSuffix(name, ".xlsx") {
			rows, err = rowsFromXLSX(src)
		} else {
			rows, err = rowsFromCSV(src)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		if len(rows) == 0 {
			return shared.Err(c, fiber.StatusBadRequest, "no data rows found")
		}
		created, skipped, errors, err := importItemRows(c.Context(), db, rows)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"created": created, "skipped": skipped, "errors": errors, "total": len(rows),
		})
	}
}

func importItemRows(ctx context.Context, db *pgxpool.Pool, rows []map[string]string) (created, skipped int, errors []string, err error) {
	codes := make([]string, 0, len(rows))
	for _, row := range rows {
		code := strings.ToUpper(itemCodeFrom(row))
		if code != "" {
			codes = append(codes, code)
		}
	}
	existing := map[string]bool{}
	if len(codes) > 0 {
		qrows, qerr := db.Query(ctx, `SELECT upper(code) FROM items WHERE upper(code) = ANY($1)`, codes)
		if qerr != nil {
			return 0, 0, nil, qerr
		}
		for qrows.Next() {
			var c string
			if qrows.Scan(&c) == nil {
				existing[c] = true
			}
		}
		qrows.Close()
	}

	for i, row := range rows {
		code := itemCodeFrom(row)
		name := itemNameFrom(row)
		if code == "" || name == "" {
			skipped++
			if len(errors) < 50 {
				errors = append(errors, "row "+strconv.Itoa(i+2)+": code and name required")
			}
			continue
		}
		if existing[strings.ToUpper(code)] {
			skipped++
			continue
		}
		brand := firstKey(row, "brand", "Brand")
		barcode := firstKey(row, "barcode", "Barcode")
		packType := "loose"
		if raw := firstKey(row, "pack_type", "pack_mode", "Pack Type"); raw != "" {
			pt, nerr := normalizePackType(raw)
			if nerr != nil {
				skipped++
				if len(errors) < 50 {
					errors = append(errors, "row "+strconv.Itoa(i+2)+": "+nerr.Error())
				}
				continue
			}
			packType = pt
		}
		controlMode := "item_controlled"
		if raw := firstKey(row, "control_mode", "Control Mode"); raw != "" {
			cm, nerr := normalizeControlMode(raw)
			if nerr != nil {
				skipped++
				if len(errors) < 50 {
					errors = append(errors, "row "+strconv.Itoa(i+2)+": "+nerr.Error())
				}
				continue
			}
			controlMode = cm
		}
		hasBatch := truthy(firstKey(row, "has_batch", "Has Batch"))
		hasSerial := truthy(firstKey(row, "has_serial", "Has Serial"))
		hasExpiry := truthy(firstKey(row, "has_expiry_date", "has_expiry", "Has Expiry"))
		safety, _ := strconv.ParseFloat(firstKey(row, "safety_stock", "min_stock", "Safety Stock"), 64)
		carton, _ := strconv.Atoi(firstKey(row, "carton_qty", "Carton Qty"))
		var shelf *int
		if s := firstKey(row, "shelf_life_in_days", "shelf_life", "Shelf Life"); s != "" {
			if v, aerr := strconv.Atoi(s); aerr == nil {
				shelf = &v
			}
		}
		// Sheet mapping (Bajaj spare parts price list):
		//   MRP - per unit      → mrp
		//   Basic Price - per   → valuation_rate (cost price / CP) — never selling price
		//   VEH_DLR Set Qty     → min_order_qty (MOQ)
		//   Distributor Set Qty → carton_qty
		mrp := parseFloatKey(row, "mrp", "MRP", "Mrp", "MRP - per unit")
		costPrice := parseFloatKey(row,
			"valuation_rate", "cost_price", "cp", "CP", "Basic Price", "Basic Price - per unit", "Basic Price - per")
		standardRate := parseFloatKey(row,
			"standard_rate", "unit_selling_price", "Unit Selling Price", "Selling Price", "Standard Rate")
		hsn := firstKey(row, "hsn_no", "hsn", "HSN_No", "HSN", "HSN Code")
		gst := parseFloatKey(row, "gst_percentage", "gst", "GST_Percentage", "GST", "GST %")
		vech := firstKey(row, "vech", "VECH")
		make := firstKey(row, "make", "MAKE")
		uom := firstKey(row, "uom", "Uom", "UOM")
		if uom == "" {
			uom = "PCS"
		}
		productGroup := firstKey(row, "product_group", "Product GROUP", "Product Group", "Item Segment")
		category := firstKey(row, "category", "Category", "Item Segment")
		partsMovement := firstKey(row, "parts_movement", "Parts Movement")
		partsPBO := firstKey(row, "parts_pbo", "Parts pbo", "Parts PBO")
		threshold := parseFloatKey(row, "threshold_value", "Threshold Value")
		maxDisc := parseFloatKey(row, "max_rate_discount", "Max Rate Discount")
		remark := firstKey(row, "remark", "Remark")
		desc := itemNameFrom(row)
		moq := parseFloatKey(row, "min_order_qty", "moq", "MOQ", "VEH_DLR Set Qty")
		weight := parseFloatKey(row, "weight_per_unit", "weight", "Weight")
		velocityTier := strings.ToLower(firstKey(row, "velocity_tier", "Velocity Tier", "velocity"))
		if velocityTier != "" && velocityTier != "fast" && velocityTier != "medium" && velocityTier != "slow" {
			velocityTier = "medium"
		}
		if velocityTier == "" {
			velocityTier = "medium"
		}
		if carton == 0 {
			if v := firstKey(row, "Distributor Set Qty", "carton_qty", "Carton Qty"); v != "" {
				carton, _ = strconv.Atoi(strings.Split(v, ".")[0])
			}
		}

		complete := itemMasterComplete(code, name, packType, controlMode, nil, hasExpiry, shelf)
		_, ierr := db.Exec(ctx, `
				INSERT INTO items (
					code, name, brand, has_serial, has_batch, has_expiry_date,
					pack_type, control_mode, barcode, carton_qty, shelf_life_in_days,
					safety_stock, master_complete, valuation_rate,
					mrp, standard_rate, hsn_no, gst_percentage, vech, make, uom, product_group, category,
					parts_movement, parts_pbo, threshold_value, max_rate_discount, remark,
					description, min_order_qty, weight_per_unit, velocity_tier
				) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
				          $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
			code, name, nullIfEmpty(brand), hasSerial, hasBatch, hasExpiry,
			packType, controlMode, nullIfEmpty(barcode), carton, shelf, safety, complete, costPrice,
			mrp, standardRate, nullIfEmpty(hsn), gst, nullIfEmpty(vech), nullIfEmpty(make), uom,
			nullIfEmpty(productGroup), nullIfEmpty(category), nullIfEmpty(partsMovement), nullIfEmpty(partsPBO),
			threshold, maxDisc, nullIfEmpty(remark), nullIfEmpty(desc), moq, weight, velocityTier)
		if ierr != nil {
			if len(errors) < 50 {
				errors = append(errors, code+": "+ierr.Error())
			}
			continue
		}
		existing[strings.ToUpper(code)] = true
		created++
	}
	return created, skipped, errors, nil
}

func listItemGroups(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, parent_id, COALESCE(is_group,false)
			FROM item_groups ORDER BY name`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type g struct {
			ID       int    `json:"id"`
			Name     string `json:"name"`
			ParentID *int   `json:"parent_id"`
			IsGroup  bool   `json:"is_group"`
		}
		list := []g{}
		for rows.Next() {
			var x g
			if err := rows.Scan(&x.ID, &x.Name, &x.ParentID, &x.IsGroup); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, x)
		}
		return shared.OK(c, list)
	}
}

func createItemGroup(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Name     string `json:"name"`
			ParentID *int   `json:"parent_id"`
			IsGroup  bool   `json:"is_group"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Name = strings.TrimSpace(body.Name)
		if body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "name required")
		}
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO item_groups (name, parent_id, is_group) VALUES ($1,$2,$3) RETURNING id`,
			body.Name, body.ParentID, body.IsGroup).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "name": body.Name})
	}
}

func updateItemGroup(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Name     *string `json:"name"`
			ParentID *int    `json:"parent_id"`
			IsGroup  *bool   `json:"is_group"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE item_groups SET
				name = COALESCE($2, name),
				parent_id = COALESCE($3, parent_id),
				is_group = COALESCE($4, is_group)
			WHERE id=$1`, id, body.Name, body.ParentID, body.IsGroup)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "item group not found")
		}
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func deleteItemGroup(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		tag, err := db.Exec(c.Context(), `DELETE FROM item_groups WHERE id=$1`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "item group not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "deleted": true})
	}
}

func getSupplier(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var name string
		var disabled, isT bool
		var sg, gstin, cc, phone, email, fleet, svc *string
		var vehicles []byte
		err = db.QueryRow(c.Context(), `
			SELECT name, supplier_group, gstin, disabled,
			       COALESCE(is_transporter,false), carrier_code, contact_phone, contact_email,
			       vehicle_fleet, default_service_level, COALESCE(vehicles::text,'[]')
			FROM suppliers WHERE id=$1`, id).Scan(
			&name, &sg, &gstin, &disabled, &isT, &cc, &phone, &email, &fleet, &svc, &vehicles)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "supplier not found")
		}
		if err != nil {
			err = db.QueryRow(c.Context(), `
				SELECT name, supplier_group, gstin, disabled,
				       COALESCE(is_transporter,false), carrier_code, contact_phone, contact_email,
				       vehicle_fleet, default_service_level
				FROM suppliers WHERE id=$1`, id).Scan(
				&name, &sg, &gstin, &disabled, &isT, &cc, &phone, &email, &fleet, &svc)
			if err == pgx.ErrNoRows {
				return shared.Err(c, fiber.StatusNotFound, "supplier not found")
			}
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			vehicles = []byte("[]")
		}
		var veh any
		_ = json.Unmarshal(vehicles, &veh)
		if veh == nil {
			veh = []any{}
		}
		return shared.OK(c, fiber.Map{
			"id": id, "name": name, "supplier_group": sg, "gstin": gstin, "disabled": disabled,
			"is_transporter": isT, "carrier_code": cc, "contact_phone": phone, "contact_email": email,
			"vehicle_fleet": fleet, "default_service_level": svc, "vehicles": veh,
		})
	}
}

func updateSupplier(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Name                *string `json:"name"`
			SupplierGroup       *string `json:"supplier_group"`
			GSTIN               *string `json:"gstin"`
			Disabled            *bool   `json:"disabled"`
			IsTransporter       *bool   `json:"is_transporter"`
			CarrierCode         *string `json:"carrier_code"`
			ContactPhone        *string `json:"contact_phone"`
			ContactEmail        *string `json:"contact_email"`
			VehicleFleet        *string `json:"vehicle_fleet"`
			DefaultServiceLevel *string `json:"default_service_level"`
			Barcode             *string `json:"barcode"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE suppliers SET
				name = COALESCE($2, name),
				supplier_group = COALESCE($3, supplier_group),
				gstin = COALESCE($4, gstin),
				disabled = COALESCE($5, disabled),
				is_transporter = COALESCE($6, is_transporter),
				carrier_code = COALESCE($7, carrier_code),
				contact_phone = COALESCE($8, contact_phone),
				contact_email = COALESCE($9, contact_email),
				vehicle_fleet = COALESCE($10, vehicle_fleet),
				default_service_level = COALESCE($11, default_service_level)
			WHERE id=$1`,
			id, body.Name, body.SupplierGroup, body.GSTIN, body.Disabled, body.IsTransporter,
			body.CarrierCode, body.ContactPhone, body.ContactEmail, body.VehicleFleet, body.DefaultServiceLevel)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "supplier not found")
		}
		if body.Barcode != nil {
			_, _ = db.Exec(c.Context(), `UPDATE suppliers SET barcode=$2 WHERE id=$1`, id, strings.TrimSpace(*body.Barcode))
		}
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}

func listCarriers(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, carrier_code, contact_phone, contact_email,
			       vehicle_fleet, default_service_level, COALESCE(vehicles::text,'[]')
			FROM suppliers
			WHERE disabled=false AND COALESCE(is_transporter,false)=true
			ORDER BY name`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		list := []fiber.Map{}
		for rows.Next() {
			var id int
			var name string
			var cc, phone, email, fleet, svc *string
			var vehRaw string
			if err := rows.Scan(&id, &name, &cc, &phone, &email, &fleet, &svc, &vehRaw); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			var veh any
			_ = json.Unmarshal([]byte(vehRaw), &veh)
			list = append(list, fiber.Map{
				"id": id, "name": name, "carrier_code": cc, "contact_phone": phone,
				"contact_email": email, "vehicle_fleet": fleet, "default_service_level": svc,
				"vehicles": veh, "is_transporter": true,
			})
		}
		return shared.OK(c, list)
	}
}

func createCarrier(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Name                string `json:"name"`
			CarrierCode         string `json:"carrier_code"`
			ContactPhone        string `json:"contact_phone"`
			ContactEmail        string `json:"contact_email"`
			VehicleFleet        string `json:"vehicle_fleet"`
			DefaultServiceLevel string `json:"default_service_level"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Name) == "" {
			return shared.Err(c, fiber.StatusBadRequest, "name required")
		}
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO suppliers (
				name, is_transporter, carrier_code, contact_phone, contact_email,
				vehicle_fleet, default_service_level, supplier_group
			) VALUES ($1,true,$2,$3,$4,$5,$6,'Carrier') RETURNING id`,
			body.Name, nullIfEmpty(body.CarrierCode), nullIfEmpty(body.ContactPhone),
			nullIfEmpty(body.ContactEmail), nullIfEmpty(body.VehicleFleet),
			nullIfEmpty(body.DefaultServiceLevel)).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "name": body.Name, "is_transporter": true})
	}
}

func parseFloatKey(row map[string]string, keys ...string) float64 {
	s := strings.ReplaceAll(firstKey(row, keys...), ",", "")
	if s == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func itemCodeFrom(row map[string]string) string {
	return firstKey(row, "code", "sku", "item_code", "Item Code", "Part Code", "Product No", "Product No*", "Part No", "ItemCode")
}

func itemNameFrom(row map[string]string) string {
	return firstKey(row, "name", "item_name", "Item Name", "Part Name", "Item Description", "Description", "ItemDescription")
}

func normHeader(s string) string {
	s = strings.TrimSpace(strings.TrimPrefix(s, "\ufeff"))
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

func firstKey(row map[string]string, keys ...string) string {
	norm := make(map[string]string, len(row))
	for rk, rv := range row {
		nk := normHeader(rk)
		if nk == "" {
			continue
		}
		if _, exists := norm[nk]; !exists || strings.TrimSpace(norm[nk]) == "" {
			norm[nk] = rv
		}
	}
	for _, k := range keys {
		if v, ok := norm[normHeader(k)]; ok && strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func rowsFromCSV(r io.Reader) ([]map[string]string, error) {
	cr := csv.NewReader(r)
	cr.LazyQuotes = true
	cr.FieldsPerRecord = -1
	records, err := cr.ReadAll()
	if err != nil {
		return nil, err
	}
	return mapsFromTable(records), nil
}

func rowsFromXLSX(r io.Reader) ([]map[string]string, error) {
	f, err := excelize.OpenReader(r)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	sheets := f.GetSheetList()
	if len(sheets) == 0 {
		return nil, fmt.Errorf("workbook has no sheets")
	}
	table, err := f.GetRows(sheets[0])
	if err != nil {
		return nil, err
	}
	return mapsFromTable(table), nil
}

func mapsFromTable(table [][]string) []map[string]string {
	if len(table) == 0 {
		return nil
	}
	headerIdx := 0
	for i, row := range table {
		blob := strings.ToLower(strings.Join(row, " "))
		if strings.Contains(blob, "item code") ||
			(strings.Contains(blob, "item description") && strings.Contains(blob, "code")) {
			headerIdx = i
			break
		}
	}
	headers := table[headerIdx]
	out := make([]map[string]string, 0, len(table)-headerIdx)
	for _, row := range table[headerIdx+1:] {
		m := map[string]string{}
		empty := true
		for i, h := range headers {
			h = strings.TrimSpace(strings.TrimPrefix(h, "\ufeff"))
			if h == "" {
				continue
			}
			v := ""
			if i < len(row) {
				v = strings.TrimSpace(row[i])
			}
			m[h] = v
			if v != "" {
				empty = false
			}
		}
		if !empty {
			out = append(out, m)
		}
	}
	return out
}

func truthy(s string) bool {
	s = strings.ToLower(strings.TrimSpace(s))
	return s == "1" || s == "true" || s == "yes" || s == "y"
}
