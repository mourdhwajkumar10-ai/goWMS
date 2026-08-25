package masterdata

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"goWMS/api/modules/rbac"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires master-data routes under /masterdata (matches the React client).
func Register(r fiber.Router, db *pgxpool.Pool) {
	md := r.Group("/masterdata")
	manage := rbac.RequirePermission("masterdata.manage")

	md.Get("/items", listItems(db))
	md.Get("/items/suggest", suggestItems(db))
	md.Post("/items", manage, createItem(db))
	md.Get("/items/export", exportItemsCSV(db))
	md.Patch("/items/:id", manage, updateItem(db))
	md.Post("/items/complete", manage, completeItemMaster(db))
	md.Get("/items/:code/inventory", itemInventory(db))
	md.Get("/items/check/:code", checkItem(db))
	md.Get("/scan-lookup", scanLookup(db))

	md.Get("/warehouses", listWarehouses(db))
	md.Post("/warehouses", manage, createWarehouse(db))
	md.Patch("/warehouses/:id", manage, updateWarehouse(db))
	md.Get("/warehouses/:id/locations", listWarehouseLocations(db))
	md.Post("/warehouses/:id/locations", manage, createLocation(db))
	md.Post("/warehouses/:id/locations/bulk", manage, bulkCreateLocations(db))
	md.Post("/warehouses/:id/locations/qr-labels", manage, locationQRLabels(db))

	md.Patch("/locations/:id", manage, updateLocation(db))
	md.Get("/locations/:id/inventory", locationInventory(db))
	md.Get("/locations/:id/qr-label", locationQRLabel(db))
	md.Get("/locations", listAllLocations(db))

	md.Get("/suppliers", listSuppliers(db))
	md.Post("/suppliers", manage, createSupplier(db))
	md.Get("/suppliers/by-barcode/:code", supplierByBarcode(db))
	md.Get("/suppliers/:id/vehicles", getSupplierVehicles(db))
	md.Put("/suppliers/:id/vehicles", manage, setSupplierVehicles(db))
	md.Get("/batches", listBatches(db))
	md.Post("/batches", manage, createBatch(db))
	md.Get("/delivery-notes", listDeliveryNotes(db))
	md.Get("/delivery-notes/:id", getDeliveryNote(db))
	md.Post("/delivery-notes/:id/confirm", confirmDeliveryNote(db))
	md.Get("/stock-entries", listStockEntries(db))
	md.Get("/stock-reconciliations", listStockReconciliations(db))
	registerStockRoutes(md, db)
	registerGapRoutes(md, db)

	// Legacy root aliases (older callers).
	r.Get("/items", listItems(db))
	r.Get("/warehouses", listWarehouses(db))
	r.Get("/suppliers", listSuppliers(db))
	r.Get("/batches", listBatches(db))
	r.Get("/delivery-notes", listDeliveryNotes(db))
	r.Get("/delivery-notes/:id", getDeliveryNote(db))
	r.Post("/delivery-notes/:id/confirm", confirmDeliveryNote(db))
	r.Get("/stock-entries", listStockEntries(db))
	r.Get("/stock-reconciliations", listStockReconciliations(db))
}

// suggestItems is a lean typeahead for ItemAutocomplete.
// Unlike listItems it skips COUNT(*), returns only display fields, and prefers
// indexed prefix matches on code so a 20k+ catalog stays snappy.
func suggestItems(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := strings.TrimSpace(c.Query("q"))
		if q == "" {
			return shared.OK(c, []fiber.Map{})
		}
		limit := c.QueryInt("limit", 12)
		if limit <= 0 {
			limit = 12
		}
		if limit > 30 {
			limit = 30
		}
		prefix := q + "%"
		contains := "%" + q + "%"
		rows, err := db.Query(c.Context(), `
			SELECT id, code, name, COALESCE(brand,''), COALESCE(barcode,''),
			       COALESCE(mrp,0), COALESCE(standard_rate,0), COALESCE(valuation_rate,0),
			       COALESCE(description,''), COALESCE(uom,'Nos'), COALESCE(min_order_qty,0),
			       COALESCE(carton_qty,0), COALESCE(weight_per_unit,0)
			FROM items
			WHERE disabled=false
			  AND (
			    code ILIKE $1
			    OR COALESCE(barcode,'') ILIKE $1
			    OR name ILIKE $2
			  )
			ORDER BY
			  CASE
			    WHEN upper(code) = upper($3) THEN 0
			    WHEN code ILIKE $1 THEN 1
			    WHEN COALESCE(barcode,'') ILIKE $1 THEN 2
			    WHEN name ILIKE $1 THEN 3
			    ELSE 4
			  END,
			  code
			LIMIT $4`, prefix, contains, q, limit)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := make([]fiber.Map, 0, limit)
		for rows.Next() {
			var id, cartonQty int
			var code, name, brand, barcode, description, uom string
			var mrp, rate, valuation, moq, weightPerUnit float64
			if err := rows.Scan(&id, &code, &name, &brand, &barcode, &mrp, &rate, &valuation, &description, &uom, &moq, &cartonQty, &weightPerUnit); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, fiber.Map{
				"id": id, "code": code, "name": name, "brand": brand, "barcode": barcode,
				"mrp": mrp, "standard_rate": rate, "valuation_rate": valuation,
				"description": description, "uom": uom, "min_order_qty": moq,
				"carton_qty": cartonQty, "pack_qty": cartonQty, "weight_per_unit": weightPerUnit,
			})
		}
		return shared.OK(c, out)
	}
}

func listItems(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := strings.TrimSpace(c.Query("q"))
		limit := c.QueryInt("limit", 50)
		if limit <= 0 {
			limit = 50
		}
		if limit > 200 {
			limit = 200
		}
		offset := c.QueryInt("offset", 0)
		if offset < 0 {
			offset = 0
		}

		where := `WHERE disabled=false`
		args := []any{}
		if q != "" {
			args = append(args, "%"+q+"%")
			where += ` AND (code ILIKE $1 OR name ILIKE $1 OR COALESCE(brand,'') ILIKE $1
				OR COALESCE(hsn_no,'') ILIKE $1 OR COALESCE(category,'') ILIKE $1
				OR COALESCE(product_group,'') ILIKE $1 OR COALESCE(vech,'') ILIKE $1
				OR COALESCE(make,'') ILIKE $1 OR COALESCE(barcode,'') ILIKE $1)`
		}

		var total int
		countSQL := `SELECT count(*) FROM items ` + where
		if err := db.QueryRow(c.Context(), countSQL, args...).Scan(&total); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		order := ` ORDER BY code`
		if q != "" {
			args = append(args, q)
			order = ` ORDER BY CASE WHEN upper(code) = upper($2) THEN 0 ELSE 1 END, code`
		}
		limitArg := len(args) + 1
		offsetArg := len(args) + 2
		args = append(args, limit, offset)

		sql := `
			SELECT id, code, name, COALESCE(brand,''), COALESCE(item_group_id::text,''),
			       has_serial, has_batch, has_expiry_date, safety_stock, valuation_rate,
			       COALESCE(pack_type,'loose'), COALESCE(control_mode,'item_controlled'),
			       home_location_id, COALESCE(master_complete,false), COALESCE(barcode,''),
			       COALESCE(carton_qty,0), shelf_life_in_days,
			       COALESCE(mrp,0), COALESCE(hsn_no,''), COALESCE(gst_percentage,0),
			       COALESCE(vech,''), COALESCE(make,''), COALESCE(uom,'PCS'),
			       COALESCE(product_group,''), COALESCE(category,''),
			       COALESCE(parts_movement,''), COALESCE(parts_pbo,''), COALESCE(threshold_value,0),
			       COALESCE(max_rate_discount,0), COALESCE(remark,''),
			       COALESCE(description,''), COALESCE(min_order_qty,0), COALESCE(weight_per_unit,0), COALESCE(weight_uom,''), unit_length_cm, unit_width_cm, unit_height_cm, unit_volume_cm3,
			       COALESCE(standard_rate,0), max_qty_per_bin, COALESCE(requires_qi,false),
			       COALESCE(velocity_tier,'medium')
			FROM items ` + where + order + fmt.Sprintf(` LIMIT $%d OFFSET $%d`, limitArg, offsetArg)

		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type item struct {
			ID              int      `json:"id"`
			Code            string   `json:"code"`
			Name            string   `json:"name"`
			Brand           string   `json:"brand"`
			ItemGroup       string   `json:"item_group"`
			HasSerial       bool     `json:"has_serial"`
			HasBatch        bool     `json:"has_batch"`
			HasExpiryDate   bool     `json:"has_expiry_date"`
			SafetyStock     *float64 `json:"safety_stock"`
			ValuationRate   *float64 `json:"valuation_rate"`
			PackType        string   `json:"pack_type"`
			ControlMode     string   `json:"control_mode"`
			HomeLocationID  *int     `json:"home_location_id"`
			MasterComplete  bool     `json:"master_complete"`
			Barcode         string   `json:"barcode"`
			CartonQty       int      `json:"carton_qty"`
			ShelfLifeDays   *int     `json:"shelf_life_in_days"`
			MRP             float64  `json:"mrp"`
			HSNNo           string   `json:"hsn_no"`
			GSTPercentage   float64  `json:"gst_percentage"`
			Vech            string   `json:"vech"`
			Make            string   `json:"make"`
			UOM             string   `json:"uom"`
			ProductGroup    string   `json:"product_group"`
			Category        string   `json:"category"`
			PartsMovement   string   `json:"parts_movement"`
			PartsPBO        string   `json:"parts_pbo"`
			ThresholdValue  float64  `json:"threshold_value"`
			MaxRateDiscount float64  `json:"max_rate_discount"`
			Remark          string   `json:"remark"`
			Description     string   `json:"description"`
			MinOrderQty     float64  `json:"min_order_qty"`
			WeightPerUnit   float64  `json:"weight_per_unit"`
			WeightUOM       string   `json:"weight_uom"`
			UnitLengthCm    *float64 `json:"unit_length_cm"`
			UnitWidthCm     *float64 `json:"unit_width_cm"`
			UnitHeightCm    *float64 `json:"unit_height_cm"`
			UnitVolumeCm3   *float64 `json:"unit_volume_cm3"`
			StandardRate    float64  `json:"standard_rate"`
			MaxQtyPerBin    *float64 `json:"max_qty_per_bin"`
			RequiresQI      bool     `json:"requires_qi"`
			VelocityTier    string   `json:"velocity_tier"`
		}
		list := []item{}
		for rows.Next() {
			var i item
			var groupID string
			if err := rows.Scan(&i.ID, &i.Code, &i.Name, &i.Brand, &groupID,
				&i.HasSerial, &i.HasBatch, &i.HasExpiryDate, &i.SafetyStock, &i.ValuationRate,
				&i.PackType, &i.ControlMode, &i.HomeLocationID, &i.MasterComplete, &i.Barcode,
				&i.CartonQty, &i.ShelfLifeDays,
				&i.MRP, &i.HSNNo, &i.GSTPercentage, &i.Vech, &i.Make, &i.UOM, &i.ProductGroup, &i.Category,
				&i.PartsMovement, &i.PartsPBO, &i.ThresholdValue, &i.MaxRateDiscount, &i.Remark,
				&i.Description, &i.MinOrderQty, &i.WeightPerUnit, &i.WeightUOM, &i.UnitLengthCm, &i.UnitWidthCm, &i.UnitHeightCm, &i.UnitVolumeCm3, &i.StandardRate, &i.MaxQtyPerBin, &i.RequiresQI, &i.VelocityTier); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			i.ItemGroup = groupID
			list = append(list, i)
		}
		return c.JSON(fiber.Map{
			"ok": true, "data": list, "total": total, "limit": limit, "offset": offset,
		})
	}
}

func createItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Code            string   `json:"code"`
			Name            string   `json:"name"`
			Brand           string   `json:"brand"`
			ItemGroup       string   `json:"item_group"`
			HasSerial       bool     `json:"has_serial"`
			HasBatch        bool     `json:"has_batch"`
			HasExpiryDate   bool     `json:"has_expiry_date"`
			PackType        string   `json:"pack_type"`
			ControlMode     string   `json:"control_mode"`
			HomeLocationID  *int     `json:"home_location_id"`
			Barcode         string   `json:"barcode"`
			CartonQty       int      `json:"carton_qty"`
			ShelfLifeDays   *int     `json:"shelf_life_in_days"`
			SafetyStock     float64  `json:"safety_stock"`
			MRP             float64  `json:"mrp"`
			StandardRate    float64  `json:"standard_rate"`
			ValuationRate   float64  `json:"valuation_rate"`
			HSNNo           string   `json:"hsn_no"`
			GSTPercentage   float64  `json:"gst_percentage"`
			Vech            string   `json:"vech"`
			Make            string   `json:"make"`
			UOM             string   `json:"uom"`
			ProductGroup    string   `json:"product_group"`
			Category        string   `json:"category"`
			PartsMovement   string   `json:"parts_movement"`
			PartsPBO        string   `json:"parts_pbo"`
			ThresholdValue  float64  `json:"threshold_value"`
			MaxRateDiscount float64  `json:"max_rate_discount"`
			Remark          string   `json:"remark"`
			Description     string   `json:"description"`
			MinOrderQty     float64  `json:"min_order_qty"`
			WeightPerUnit   float64  `json:"weight_per_unit"`
			WeightUOM       string   `json:"weight_uom"`
			UnitLengthCm    *float64 `json:"unit_length_cm"`
			UnitWidthCm     *float64 `json:"unit_width_cm"`
			UnitHeightCm    *float64 `json:"unit_height_cm"`
			UnitVolumeCm3   *float64 `json:"unit_volume_cm3"`
			MaxQtyPerBin    *float64 `json:"max_qty_per_bin"`
			RequiresQI      bool     `json:"requires_qi"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Code = strings.TrimSpace(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code and name required")
		}
		if len(body.Name) > 255 {
			return shared.Err(c, fiber.StatusBadRequest, "name must be at most 255 characters")
		}
		var err error
		body.PackType, err = normalizePackType(body.PackType)
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		body.ControlMode, err = normalizeControlMode(body.ControlMode)
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		if body.ControlMode == "bin_controlled" && body.HomeLocationID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "home_location_id required for bin_controlled items")
		}

		if body.MaxQtyPerBin != nil && *body.MaxQtyPerBin <= 0 {
			body.MaxQtyPerBin = nil
		}

		if body.UOM == "" {
			body.UOM = "PCS"
		}
		complete := itemMasterComplete(body.Code, body.Name, body.PackType, body.ControlMode, body.HomeLocationID, body.HasExpiryDate, body.ShelfLifeDays)

		var id int
		err = db.QueryRow(c.Context(), `
			INSERT INTO items (
				code, name, brand, has_serial, has_batch, has_expiry_date,
				pack_type, control_mode, home_location_id, barcode, carton_qty,
				shelf_life_in_days, safety_stock, master_complete, valuation_rate,
				mrp, standard_rate, hsn_no, gst_percentage, vech, make, uom, product_group, category,
				parts_movement, parts_pbo, threshold_value, max_rate_discount, remark,
				description, min_order_qty, weight_per_unit, max_qty_per_bin
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
			          $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
			RETURNING id`,
			body.Code, body.Name, nullIfEmpty(body.Brand), body.HasSerial, body.HasBatch, body.HasExpiryDate,
			body.PackType, body.ControlMode, body.HomeLocationID, nullIfEmpty(body.Barcode), body.CartonQty,
			body.ShelfLifeDays, body.SafetyStock, complete, body.ValuationRate,
			body.MRP, body.StandardRate, nullIfEmpty(body.HSNNo), body.GSTPercentage, nullIfEmpty(body.Vech), nullIfEmpty(body.Make),
			body.UOM, nullIfEmpty(body.ProductGroup), nullIfEmpty(body.Category), nullIfEmpty(body.PartsMovement), nullIfEmpty(body.PartsPBO),
			body.ThresholdValue, body.MaxRateDiscount, nullIfEmpty(body.Remark),
			nullIfEmpty(body.Description), body.MinOrderQty, body.WeightPerUnit, body.MaxQtyPerBin,
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		_, _ = db.Exec(c.Context(), `UPDATE items SET requires_qi=$2 WHERE id=$1`, id, body.RequiresQI)
		if body.WeightUOM != "" || body.UnitLengthCm != nil || body.UnitWidthCm != nil || body.UnitHeightCm != nil || body.UnitVolumeCm3 != nil {
			_, _ = db.Exec(c.Context(), `
				UPDATE items SET
					weight_uom = COALESCE($2, weight_uom),
					unit_length_cm = COALESCE($3, unit_length_cm),
					unit_width_cm = COALESCE($4, unit_width_cm),
					unit_height_cm = COALESCE($5, unit_height_cm),
					unit_volume_cm3 = COALESCE($6, unit_volume_cm3)
				WHERE id=$1`,
				id, nullIfEmpty(body.WeightUOM), body.UnitLengthCm, body.UnitWidthCm, body.UnitHeightCm, body.UnitVolumeCm3)
		}
		shared.WriteAudit(db, c.Context(), shared.ActorID(c), "item.create", "item", id, nil, fiber.Map{
			"code": body.Code, "name": body.Name, "master_complete": complete,
		})
		return shared.OK(c, fiber.Map{
			"id": id, "code": body.Code, "master_complete": complete,
		})
	}
}

func updateItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Name            *string  `json:"name"`
			Brand           *string  `json:"brand"`
			HasSerial       *bool    `json:"has_serial"`
			HasBatch        *bool    `json:"has_batch"`
			HasExpiryDate   *bool    `json:"has_expiry_date"`
			PackType        *string  `json:"pack_type"`
			ControlMode     *string  `json:"control_mode"`
			HomeLocationID  *int     `json:"home_location_id"`
			Barcode         *string  `json:"barcode"`
			CartonQty       *int     `json:"carton_qty"`
			ShelfLifeDays   *int     `json:"shelf_life_in_days"`
			SafetyStock     *float64 `json:"safety_stock"`
			MRP             *float64 `json:"mrp"`
			StandardRate    *float64 `json:"standard_rate"`
			ValuationRate   *float64 `json:"valuation_rate"`
			HSNNo           *string  `json:"hsn_no"`
			GSTPercentage   *float64 `json:"gst_percentage"`
			Vech            *string  `json:"vech"`
			Make            *string  `json:"make"`
			UOM             *string  `json:"uom"`
			ProductGroup    *string  `json:"product_group"`
			Category        *string  `json:"category"`
			PartsMovement   *string  `json:"parts_movement"`
			PartsPBO        *string  `json:"parts_pbo"`
			ThresholdValue  *float64 `json:"threshold_value"`
			MaxRateDiscount *float64 `json:"max_rate_discount"`
			Remark          *string  `json:"remark"`
			Description     *string  `json:"description"`
			MinOrderQty     *float64 `json:"min_order_qty"`
			WeightPerUnit   *float64 `json:"weight_per_unit"`
			WeightUOM       *string  `json:"weight_uom"`
			UnitLengthCm    *float64 `json:"unit_length_cm"`
			UnitWidthCm     *float64 `json:"unit_width_cm"`
			UnitHeightCm    *float64 `json:"unit_height_cm"`
			UnitVolumeCm3   *float64 `json:"unit_volume_cm3"`
			MaxQtyPerBin    *float64 `json:"max_qty_per_bin"`
			RequiresQI      *bool    `json:"requires_qi"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}

		var code, name, packType, controlMode string
		var homeID *int
		var hasExpiry bool
		var shelfLife *int
		err = db.QueryRow(c.Context(), `
			SELECT code, name, COALESCE(pack_type,'loose'), COALESCE(control_mode,'item_controlled'),
			       home_location_id, has_expiry_date, shelf_life_in_days
			FROM items WHERE id=$1`, id).Scan(&code, &name, &packType, &controlMode, &homeID, &hasExpiry, &shelfLife)
		if err != nil {
			if err == pgx.ErrNoRows {
				return shared.Err(c, fiber.StatusNotFound, "item not found")
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if body.Name != nil {
			name = strings.TrimSpace(*body.Name)
			if len(name) > 255 {
				return shared.Err(c, fiber.StatusBadRequest, "name must be at most 255 characters")
			}
		}
		if body.PackType != nil {
			pt, nerr := normalizePackType(*body.PackType)
			if nerr != nil {
				return shared.Err(c, fiber.StatusBadRequest, nerr.Error())
			}
			packType = pt
		}
		if body.ControlMode != nil {
			cm, nerr := normalizeControlMode(*body.ControlMode)
			if nerr != nil {
				return shared.Err(c, fiber.StatusBadRequest, nerr.Error())
			}
			controlMode = cm
		}
		if body.HomeLocationID != nil {
			homeID = body.HomeLocationID
		}
		if body.HasExpiryDate != nil {
			hasExpiry = *body.HasExpiryDate
		}
		if body.ShelfLifeDays != nil {
			shelfLife = body.ShelfLifeDays
		}
		if controlMode == "bin_controlled" && homeID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "home_location_id required for bin_controlled items")
		}
		if body.MaxQtyPerBin != nil && *body.MaxQtyPerBin <= 0 {
			body.MaxQtyPerBin = nil
		}
		complete := itemMasterComplete(code, name, packType, controlMode, homeID, hasExpiry, shelfLife)

		_, err = db.Exec(c.Context(), `
			UPDATE items SET
				name = COALESCE($2, name),
				brand = COALESCE($3, brand),
				has_serial = COALESCE($4, has_serial),
				has_batch = COALESCE($5, has_batch),
				has_expiry_date = COALESCE($6, has_expiry_date),
				pack_type = $7,
				control_mode = $8,
				home_location_id = $9,
				barcode = COALESCE($10, barcode),
				carton_qty = COALESCE($11, carton_qty),
				shelf_life_in_days = COALESCE($12, shelf_life_in_days),
				safety_stock = COALESCE($13, safety_stock),
				master_complete = $14,
				mrp = COALESCE($15, mrp),
				standard_rate = COALESCE($16, standard_rate),
				valuation_rate = COALESCE($17, valuation_rate),
				hsn_no = COALESCE($18, hsn_no),
				gst_percentage = COALESCE($19, gst_percentage),
				vech = COALESCE($20, vech),
				make = COALESCE($21, make),
				uom = COALESCE($22, uom),
				product_group = COALESCE($23, product_group),
				category = COALESCE($24, category),
				parts_movement = COALESCE($25, parts_movement),
				parts_pbo = COALESCE($26, parts_pbo),
				threshold_value = COALESCE($27, threshold_value),
				max_rate_discount = COALESCE($28, max_rate_discount),
				remark = COALESCE($29, remark),
				description = COALESCE($30, description),
				min_order_qty = COALESCE($31, min_order_qty),
				weight_per_unit = COALESCE($32, weight_per_unit),
				max_qty_per_bin = $33
			WHERE id=$1`,
			id,
			body.Name, body.Brand, body.HasSerial, body.HasBatch, body.HasExpiryDate,
			packType, controlMode, homeID, body.Barcode, body.CartonQty, body.ShelfLifeDays,
			body.SafetyStock, complete,
			body.MRP, body.StandardRate, body.ValuationRate, body.HSNNo, body.GSTPercentage, body.Vech, body.Make, body.UOM, body.ProductGroup, body.Category,
			body.PartsMovement, body.PartsPBO, body.ThresholdValue, body.MaxRateDiscount, body.Remark,
			body.Description, body.MinOrderQty, body.WeightPerUnit, body.MaxQtyPerBin,
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if body.RequiresQI != nil {
			_, _ = db.Exec(c.Context(), `UPDATE items SET requires_qi=$2 WHERE id=$1`, id, *body.RequiresQI)
		}
		if body.WeightUOM != nil || body.UnitLengthCm != nil || body.UnitWidthCm != nil || body.UnitHeightCm != nil || body.UnitVolumeCm3 != nil {
			_, _ = db.Exec(c.Context(), `
				UPDATE items SET
					weight_uom = COALESCE($2, weight_uom),
					unit_length_cm = COALESCE($3, unit_length_cm),
					unit_width_cm = COALESCE($4, unit_width_cm),
					unit_height_cm = COALESCE($5, unit_height_cm),
					unit_volume_cm3 = COALESCE($6, unit_volume_cm3)
				WHERE id=$1`,
				id, body.WeightUOM, body.UnitLengthCm, body.UnitWidthCm, body.UnitHeightCm, body.UnitVolumeCm3)
		}
		shared.WriteAudit(db, c.Context(), shared.ActorID(c), "item.update", "item", id, nil, fiber.Map{
			"name": name, "master_complete": complete,
		})
		return shared.OK(c, fiber.Map{"id": id, "master_complete": complete})
	}
}

func completeItemMaster(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Code            string   `json:"code"`
			Name            string   `json:"name"`
			Brand           string   `json:"brand"`
			HasSerial       bool     `json:"has_serial"`
			HasBatch        bool     `json:"has_batch"`
			HasExpiryDate   bool     `json:"has_expiry_date"`
			PackType        string   `json:"pack_type"`
			ControlMode     string   `json:"control_mode"`
			HomeLocationID  *int     `json:"home_location_id"`
			Barcode         string   `json:"barcode"`
			CartonQty       int      `json:"carton_qty"`
			ShelfLifeDays   *int     `json:"shelf_life_in_days"`
			SafetyStock     float64  `json:"safety_stock"`
			MRP             float64  `json:"mrp"`
			StandardRate    float64  `json:"standard_rate"`
			HSNNo           string   `json:"hsn_no"`
			GSTPercentage   float64  `json:"gst_percentage"`
			Vech            string   `json:"vech"`
			Make            string   `json:"make"`
			UOM             string   `json:"uom"`
			ProductGroup    string   `json:"product_group"`
			Category        string   `json:"category"`
			PartsMovement   string   `json:"parts_movement"`
			PartsPBO        string   `json:"parts_pbo"`
			ThresholdValue  float64  `json:"threshold_value"`
			MaxRateDiscount float64  `json:"max_rate_discount"`
			Remark          string   `json:"remark"`
			Description     string   `json:"description"`
			MinOrderQty     float64  `json:"min_order_qty"`
			WeightPerUnit   float64  `json:"weight_per_unit"`
			WeightUOM       string   `json:"weight_uom"`
			UnitLengthCm    *float64 `json:"unit_length_cm"`
			UnitWidthCm     *float64 `json:"unit_width_cm"`
			UnitHeightCm    *float64 `json:"unit_height_cm"`
			UnitVolumeCm3   *float64 `json:"unit_volume_cm3"`
			MaxQtyPerBin    *float64 `json:"max_qty_per_bin"`
			RequiresQI      bool     `json:"requires_qi"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Code = strings.TrimSpace(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code and name required")
		}
		var nerr error
		body.PackType, nerr = normalizePackType(body.PackType)
		if nerr != nil {
			return shared.Err(c, fiber.StatusBadRequest, nerr.Error())
		}
		body.ControlMode, nerr = normalizeControlMode(body.ControlMode)
		if nerr != nil {
			return shared.Err(c, fiber.StatusBadRequest, nerr.Error())
		}
		if body.ControlMode == "bin_controlled" && body.HomeLocationID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "home_location_id required for bin_controlled items")
		}
		if body.UOM == "" {
			body.UOM = "PCS"
		}
		if body.MaxQtyPerBin != nil && *body.MaxQtyPerBin <= 0 {
			body.MaxQtyPerBin = nil
		}
		complete := itemMasterComplete(body.Code, body.Name, body.PackType, body.ControlMode, body.HomeLocationID, body.HasExpiryDate, body.ShelfLifeDays)
		if !complete {
			return shared.Err(c, fiber.StatusBadRequest, "item master incomplete — fill required fields")
		}

		var id int
		err := db.QueryRow(c.Context(), `SELECT id FROM items WHERE code=$1`, body.Code).Scan(&id)
		if err == pgx.ErrNoRows {
			err = db.QueryRow(c.Context(), `
				INSERT INTO items (
					code, name, brand, has_serial, has_batch, has_expiry_date,
					pack_type, control_mode, home_location_id, barcode, carton_qty,
					shelf_life_in_days, safety_stock, master_complete,
					mrp, standard_rate, hsn_no, gst_percentage, vech, make, uom, product_group, category,
					parts_movement, parts_pbo, threshold_value, max_rate_discount, remark,
					description, min_order_qty, weight_per_unit, max_qty_per_bin
				) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,
				          $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
				RETURNING id`,
				body.Code, body.Name, nullIfEmpty(body.Brand), body.HasSerial, body.HasBatch, body.HasExpiryDate,
				body.PackType, body.ControlMode, body.HomeLocationID, nullIfEmpty(body.Barcode), body.CartonQty,
				body.ShelfLifeDays, body.SafetyStock,
				body.MRP, body.StandardRate, nullIfEmpty(body.HSNNo), body.GSTPercentage, nullIfEmpty(body.Vech), nullIfEmpty(body.Make),
				body.UOM, nullIfEmpty(body.ProductGroup), nullIfEmpty(body.Category),
				nullIfEmpty(body.PartsMovement), nullIfEmpty(body.PartsPBO),
				body.ThresholdValue, body.MaxRateDiscount, nullIfEmpty(body.Remark),
				nullIfEmpty(body.Description), body.MinOrderQty, body.WeightPerUnit, body.MaxQtyPerBin,
			).Scan(&id)
		} else if err == nil {
			_, err = db.Exec(c.Context(), `
				UPDATE items SET
					name=$2, brand=$3, has_serial=$4, has_batch=$5, has_expiry_date=$6,
					pack_type=$7, control_mode=$8, home_location_id=$9, barcode=$10,
					carton_qty=$11, shelf_life_in_days=$12, safety_stock=$13, master_complete=true,
					mrp=$14, standard_rate=$15, hsn_no=$16, gst_percentage=$17, vech=$18, make=$19, uom=$20,
					product_group=$21, category=$22, parts_movement=$23, parts_pbo=$24,
					threshold_value=$25, max_rate_discount=$26, remark=$27, description=$28,
					min_order_qty=$29, weight_per_unit=$30, max_qty_per_bin=$31
				WHERE id=$1`,
				id, body.Name, nullIfEmpty(body.Brand), body.HasSerial, body.HasBatch, body.HasExpiryDate,
				body.PackType, body.ControlMode, body.HomeLocationID, nullIfEmpty(body.Barcode), body.CartonQty,
				body.ShelfLifeDays, body.SafetyStock,
				body.MRP, body.StandardRate, nullIfEmpty(body.HSNNo), body.GSTPercentage, nullIfEmpty(body.Vech), nullIfEmpty(body.Make),
				body.UOM, nullIfEmpty(body.ProductGroup), nullIfEmpty(body.Category),
				nullIfEmpty(body.PartsMovement), nullIfEmpty(body.PartsPBO),
				body.ThresholdValue, body.MaxRateDiscount, nullIfEmpty(body.Remark),
				nullIfEmpty(body.Description), body.MinOrderQty, body.WeightPerUnit, body.MaxQtyPerBin,
			)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		_, _ = db.Exec(c.Context(), `UPDATE items SET requires_qi=$2 WHERE id=$1`, id, body.RequiresQI)
		if body.WeightUOM != "" || body.UnitLengthCm != nil || body.UnitWidthCm != nil || body.UnitHeightCm != nil || body.UnitVolumeCm3 != nil {
			_, _ = db.Exec(c.Context(), `
				UPDATE items SET
					weight_uom = COALESCE($2, weight_uom),
					unit_length_cm = COALESCE($3, unit_length_cm),
					unit_width_cm = COALESCE($4, unit_width_cm),
					unit_height_cm = COALESCE($5, unit_height_cm),
					unit_volume_cm3 = COALESCE($6, unit_volume_cm3)
				WHERE id=$1`,
				id, nullIfEmpty(body.WeightUOM), body.UnitLengthCm, body.UnitWidthCm, body.UnitHeightCm, body.UnitVolumeCm3)
		}
		return shared.OK(c, fiber.Map{"id": id, "code": body.Code, "master_complete": true})
	}
}

func checkItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		code := strings.TrimSpace(c.Params("code"))
		var id int
		var name string
		var complete bool
		var packType, controlMode string
		var requiresQI, hasExpiry, hasBatch, hasSerial bool
		var shelfLife *int
		err := db.QueryRow(c.Context(), `
			SELECT id, name, COALESCE(master_complete,false),
			       COALESCE(pack_type,'loose'), COALESCE(control_mode,'item_controlled'),
			       COALESCE(requires_qi,false), COALESCE(has_expiry_date,false),
			       COALESCE(has_batch,false), COALESCE(has_serial,false), shelf_life_in_days
			FROM items WHERE code=$1 AND disabled=false`, code).
			Scan(&id, &name, &complete, &packType, &controlMode, &requiresQI, &hasExpiry, &hasBatch, &hasSerial, &shelfLife)
		if err != nil && strings.Contains(err.Error(), "requires_qi") {
			err = db.QueryRow(c.Context(), `
				SELECT id, name, COALESCE(master_complete,false),
				       COALESCE(pack_type,'loose'), COALESCE(control_mode,'item_controlled'),
				       COALESCE(has_expiry_date,false), COALESCE(has_batch,false),
				       COALESCE(has_serial,false), shelf_life_in_days
				FROM items WHERE code=$1 AND disabled=false`, code).
				Scan(&id, &name, &complete, &packType, &controlMode, &hasExpiry, &hasBatch, &hasSerial, &shelfLife)
		}
		if err == pgx.ErrNoRows {
			return shared.OK(c, fiber.Map{
				"exists": false, "master_complete": false, "code": code,
			})
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"exists": true, "id": id, "code": code, "name": name,
			"master_complete": complete, "pack_type": packType, "control_mode": controlMode,
			"requires_qi": requiresQI, "has_expiry_date": hasExpiry, "has_batch": hasBatch,
			"has_serial": hasSerial, "shelf_life_in_days": shelfLife,
		})
	}
}

func itemInventory(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		code := strings.TrimSpace(c.Params("code"))
		rows, err := db.Query(c.Context(), `
			SELECT slb.id, slb.item_code, i.name, slb.warehouse_id, w.code, w.name,
			       slb.location_id, wl.code, wl.aisle, wl.shelf, wl.level, wl.number, wl.location_type,
			       COALESCE(slb.batch_no,''), b.expiry_date::text,
			       CASE WHEN b.expiry_date IS NULL THEN NULL ELSE (b.expiry_date - CURRENT_DATE) END,
			       slb.actual_qty, slb.reserved_qty,
			       (slb.actual_qty - slb.reserved_qty) AS available_qty,
			       CASE
			         WHEN COALESCE(slb.allocation_status,'') = 'unallocatable'
			              OR wl.location_type IN ('incoming','hold','damaged','staging')
			           THEN 'unallocatable'
			         WHEN slb.reserved_qty <= 0 THEN 'available'
			         WHEN slb.reserved_qty >= slb.actual_qty THEN 'fully_allocated'
			         ELSE 'partial'
			       END AS allocation_status
			FROM stock_location_balances slb
			JOIN warehouses w ON w.id = slb.warehouse_id
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			LEFT JOIN items i ON i.code = slb.item_code
			LEFT JOIN LATERAL (
				SELECT expiry_date FROM batches
				WHERE item_code = slb.item_code AND batch_id = slb.batch_no
				ORDER BY id DESC LIMIT 1
			) b ON true
			WHERE slb.item_code = $1 AND slb.actual_qty <> 0
			ORDER BY b.expiry_date NULLS LAST, w.code, wl.code, slb.batch_no`, code)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		return shared.OK(c, scanInventoryRows(rows))
	}
}

func createWarehouse(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Code           string `json:"code"`
			Name           string `json:"name"`
			WarehouseType  string `json:"warehouse_type"`
			PickingMode    string `json:"picking_mode"`
			ReceivingOpen  string `json:"receiving_open"`
			ReceivingClose string `json:"receiving_close"`
			ReceivingDays  string `json:"receiving_days"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Code = strings.TrimSpace(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code and name required")
		}
		if strings.ContainsAny(body.Code, " \t") {
			return shared.Err(c, fiber.StatusBadRequest, "warehouse code cannot contain spaces")
		}
		for _, ch := range body.Code {
			if (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' {
				continue
			}
			return shared.Err(c, fiber.StatusBadRequest, "warehouse code must match [A-Za-z0-9_-]+")
		}
		if body.PickingMode == "" {
			body.PickingMode = "scan"
		}
		if body.WarehouseType == "" {
			body.WarehouseType = "storage"
		}
		body.WarehouseType = strings.ToLower(strings.TrimSpace(body.WarehouseType))
		switch body.WarehouseType {
		case "hub", "satellite", "storage", "incoming", "returns", "transit", "warehouse", "stores", "distribution":
		default:
			return shared.Err(c, fiber.StatusBadRequest,
				"warehouse_type must be one of: hub, satellite, storage, incoming, returns, transit, warehouse, stores, distribution")
		}

		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO warehouses (code, name, warehouse_type, picking_mode)
			VALUES ($1,$2,$3,$4) RETURNING id`,
			body.Code, body.Name, body.WarehouseType, body.PickingMode,
		).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "warehouses_warehouse_type_check") {
				return shared.Err(c, fiber.StatusBadRequest, "invalid warehouse_type for database constraint")
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		// Default staging locations for new warehouse.
		staging := []struct{ code, zone, typ string }{
			{"INCOMING-01", "IN", "incoming"},
			{"HOLD-01", "HOLD", "hold"},
			{"DAMAGED-01", "DMG", "damaged"},
		}
		for _, loc := range staging {
			_, _ = db.Exec(c.Context(), `
				INSERT INTO warehouse_locations (
					code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
					location_type, allow_mixed_items, disabled, is_occupied
				) VALUES ($1,$2,$3,$3,'01','01','01','low','01',$4,true,false,false)
				ON CONFLICT (warehouse_id, code) DO NOTHING`, loc.code, id, loc.zone, loc.typ)
		}

		stampWarehouseHours(c, db, id, body.ReceivingOpen, body.ReceivingClose, body.ReceivingDays)
		return shared.OK(c, fiber.Map{"id": id, "code": body.Code, "name": body.Name})
	}
}

func stampWarehouseHours(c *fiber.Ctx, db *pgxpool.Pool, id int, open, close, days string) {
	open = strings.TrimSpace(open)
	close = strings.TrimSpace(close)
	days = strings.TrimSpace(days)
	if open == "" && close == "" && days == "" {
		return
	}
	if open == "" {
		open = "06:00"
	}
	if close == "" {
		close = "18:00"
	}
	if days == "" {
		days = "1,2,3,4,5"
	}
	_, _ = db.Exec(c.Context(), `
		UPDATE warehouses SET receiving_open=$2::time, receiving_close=$3::time, receiving_days=$4 WHERE id=$1`,
		id, open, close, days)
}

func updateWarehouse(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			Name           *string `json:"name"`
			ReceivingOpen  *string `json:"receiving_open"`
			ReceivingClose *string `json:"receiving_close"`
			ReceivingDays  *string `json:"receiving_days"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.Name != nil {
			_, _ = db.Exec(c.Context(), `UPDATE warehouses SET name=$2 WHERE id=$1`, id, strings.TrimSpace(*body.Name))
		}
		open, close, days := "", "", ""
		if body.ReceivingOpen != nil {
			open = *body.ReceivingOpen
		}
		if body.ReceivingClose != nil {
			close = *body.ReceivingClose
		}
		if body.ReceivingDays != nil {
			days = *body.ReceivingDays
		}
		stampWarehouseHours(c, db, id, open, close, days)
		return shared.OK(c, fiber.Map{"id": id})
	}
}

func listWarehouseLocations(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		wid, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid warehouse id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT wl.id, wl.code, wl.warehouse_id, COALESCE(wl.zone,''), COALESCE(wl.aisle,''),
			       COALESCE(wl.shelf, COALESCE(wl.rack,'')), COALESCE(wl.level,'lower'),
			       COALESCE(wl.number, COALESCE(wl.bin,'')), COALESCE(wl.location_type,'storage'),
			       wl.max_capacity_qty, COALESCE(wl.allow_mixed_items,true), COALESCE(wl.disabled,false),
			       COALESCE(wl.is_occupied,false), COALESCE(wl.putaway_priority, 5),
			       COALESCE(wl.length_cm,0), COALESCE(wl.width_cm,0), COALESCE(wl.height_cm,0),
			       COALESCE(wl.volume_cm3,0), COALESCE(wl.max_weight_kg,0),
			       COALESCE((SELECT SUM(actual_qty) FROM stock_location_balances slb WHERE slb.location_id = wl.id),0) AS on_hand_qty,
			       (SELECT COUNT(DISTINCT item_code) FROM stock_location_balances slb WHERE slb.location_id = wl.id AND slb.actual_qty <> 0) AS item_count
			FROM warehouse_locations wl
			WHERE wl.warehouse_id = $1
			ORDER BY wl.aisle, wl.shelf, wl.level, wl.number, wl.code`, wid)
		if err != nil {
			// Pre-013 DBs without putaway_priority
			if strings.Contains(err.Error(), "putaway_priority") {
				return listWarehouseLocationsLegacy(db, c, wid)
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type loc struct {
			ID              int      `json:"id"`
			Code            string   `json:"code"`
			WarehouseID     int      `json:"warehouse_id"`
			Zone            string   `json:"zone"`
			Aisle           string   `json:"aisle"`
			Shelf           string   `json:"shelf"`
			Bay             string   `json:"bay"`
			Level           string   `json:"level"`
			Number          string   `json:"number"`
			Bin             string   `json:"bin"`
			LocationType    string   `json:"location_type"`
			MaxCapacityQty  *float64 `json:"max_capacity_qty"`
			AllowMixedItems bool     `json:"allow_mixed_items"`
			Disabled        bool     `json:"disabled"`
			IsOccupied      bool     `json:"is_occupied"`
			PutawayPriority int      `json:"putaway_priority"`
			LengthCm        float64  `json:"length_cm"`
			WidthCm         float64  `json:"width_cm"`
			HeightCm        float64  `json:"height_cm"`
			VolumeCm3       float64  `json:"volume_cm3"`
			MaxWeightKg     float64  `json:"max_weight_kg"`
			OnHandQty       float64  `json:"on_hand_qty"`
			ItemCount       int      `json:"item_count"`
		}
		list := []loc{}
		for rows.Next() {
			var l loc
			if err := rows.Scan(&l.ID, &l.Code, &l.WarehouseID, &l.Zone, &l.Aisle, &l.Shelf, &l.Level, &l.Number,
				&l.LocationType, &l.MaxCapacityQty, &l.AllowMixedItems, &l.Disabled, &l.IsOccupied, &l.PutawayPriority,
				&l.LengthCm, &l.WidthCm, &l.HeightCm, &l.VolumeCm3, &l.MaxWeightKg,
				&l.OnHandQty, &l.ItemCount); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			l.Bay = l.Shelf
			l.Bin = l.Number
			l.Level = displayLevel(l.Level)
			list = append(list, l)
		}
		return shared.OK(c, list)
	}
}

func listWarehouseLocationsLegacy(db *pgxpool.Pool, c *fiber.Ctx, wid int) error {
	rows, err := db.Query(c.Context(), `
		SELECT wl.id, wl.code, wl.warehouse_id, COALESCE(wl.zone,''), COALESCE(wl.aisle,''),
		       COALESCE(wl.shelf, COALESCE(wl.rack,'')), COALESCE(wl.level,'lower'),
		       COALESCE(wl.number, COALESCE(wl.bin,'')), COALESCE(wl.location_type,'storage'),
		       wl.max_capacity_qty, COALESCE(wl.allow_mixed_items,true), COALESCE(wl.disabled,false),
		       COALESCE(wl.is_occupied,false),
		       COALESCE((SELECT SUM(actual_qty) FROM stock_location_balances slb WHERE slb.location_id = wl.id),0),
		       (SELECT COUNT(DISTINCT item_code) FROM stock_location_balances slb WHERE slb.location_id = wl.id AND slb.actual_qty <> 0)
		FROM warehouse_locations wl
		WHERE wl.warehouse_id = $1
		ORDER BY wl.aisle, wl.shelf, wl.level, wl.number, wl.code`, wid)
	if err != nil {
		return shared.Err(c, fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	list := []fiber.Map{}
	for rows.Next() {
		var id, whID, itemCount int
		var code, zone, aisle, shelf, level, number, locType string
		var maxCap *float64
		var mixed, disabled, occupied bool
		var onHand float64
		if err := rows.Scan(&id, &code, &whID, &zone, &aisle, &shelf, &level, &number, &locType,
			&maxCap, &mixed, &disabled, &occupied, &onHand, &itemCount); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		level = displayLevel(level)
		list = append(list, fiber.Map{
			"id": id, "code": code, "warehouse_id": whID, "zone": zone, "aisle": aisle,
			"shelf": shelf, "bay": shelf, "level": level, "number": number, "bin": number,
			"location_type": locType, "max_capacity_qty": maxCap, "allow_mixed_items": mixed,
			"disabled": disabled, "is_occupied": occupied, "putaway_priority": 5,
			"on_hand_qty": onHand, "item_count": itemCount,
		})
	}
	return shared.OK(c, list)
}

func createLocation(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		wid, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid warehouse id")
		}
		var body struct {
			Aisle           string   `json:"aisle"`
			Shelf           string   `json:"shelf"`
			Bay             string   `json:"bay"` // alias for shelf
			Level           string   `json:"level"`
			Number          string   `json:"number"`
			Bin             string   `json:"bin"` // alias for number
			LocationType    string   `json:"location_type"`
			MaxCapacityQty  *float64 `json:"max_capacity_qty"`
			AllowMixedItems *bool    `json:"allow_mixed_items"`
			PutawayPriority *int     `json:"putaway_priority"`
			Zone            string   `json:"zone"`
			Code            string   `json:"code"`
			LengthCm        *float64 `json:"length_cm"`
			WidthCm         *float64 `json:"width_cm"`
			HeightCm        *float64 `json:"height_cm"`
			VolumeCm3       *float64 `json:"volume_cm3"`
			MaxWeightKg     *float64 `json:"max_weight_kg"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		shelf := body.Shelf
		if shelf == "" {
			shelf = body.Bay
		}
		number := body.Number
		if number == "" {
			number = body.Bin
		}
		loc, errMsg := normalizeLocationInput(body.Aisle, shelf, body.Level, number, body.LocationType, body.Code)
		if errMsg != "" {
			return shared.Err(c, fiber.StatusBadRequest, errMsg)
		}
		mixed := true
		if body.AllowMixedItems != nil {
			mixed = *body.AllowMixedItems
		}
		priority := 5
		if body.PutawayPriority != nil {
			priority = *body.PutawayPriority
			if priority < 1 {
				priority = 1
			}
			if priority > 10 {
				priority = 10
			}
		}
		zone := body.Zone
		if zone == "" {
			zone = loc.Aisle
		}

		var id int
		err = db.QueryRow(c.Context(), `
			INSERT INTO warehouse_locations (
				code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
				location_type, max_capacity_qty, allow_mixed_items, putaway_priority, disabled, is_occupied
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false,false)
			RETURNING id`,
			loc.Code, wid, zone, loc.Aisle, loc.Shelf, loc.Number, loc.Shelf, loc.Level, loc.Number,
			loc.LocationType, body.MaxCapacityQty, mixed, priority,
		).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "putaway_priority") {
				err = db.QueryRow(c.Context(), `
					INSERT INTO warehouse_locations (
						code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
						location_type, max_capacity_qty, allow_mixed_items, disabled, is_occupied
					) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,false)
					RETURNING id`,
					loc.Code, wid, zone, loc.Aisle, loc.Shelf, loc.Number, loc.Shelf, loc.Level, loc.Number,
					loc.LocationType, body.MaxCapacityQty, mixed,
				).Scan(&id)
			}
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if body.LengthCm != nil || body.WidthCm != nil || body.HeightCm != nil || body.VolumeCm3 != nil || body.MaxWeightKg != nil {
			_, _ = db.Exec(c.Context(), `
				UPDATE warehouse_locations SET
					length_cm = COALESCE($2, length_cm),
					width_cm = COALESCE($3, width_cm),
					height_cm = COALESCE($4, height_cm),
					volume_cm3 = COALESCE($5, volume_cm3),
					max_weight_kg = COALESCE($6, max_weight_kg)
				WHERE id=$1`,
				id, body.LengthCm, body.WidthCm, body.HeightCm, body.VolumeCm3, body.MaxWeightKg)
		}
		shared.WriteAudit(db, c.Context(), shared.ActorID(c), "location.create", "location", id, nil, fiber.Map{
			"code": loc.Code, "warehouse_id": wid, "level": loc.Level,
		})
		return shared.OK(c, fiber.Map{
			"id": id, "code": loc.Code, "warehouse_id": wid,
			"aisle": loc.Aisle, "bay": loc.Shelf, "level": loc.Level, "bin": loc.Number,
			"putaway_priority": priority,
		})
	}
}

func bulkCreateLocations(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		wid, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid warehouse id")
		}
		var body struct {
			Aisle           string   `json:"aisle"`
			BayFrom         int      `json:"bay_from"`
			BayTo           int      `json:"bay_to"`
			ShelfFrom       int      `json:"shelf_from"` // alias
			ShelfTo         int      `json:"shelf_to"`
			Levels          []string `json:"levels"`
			LevelCount      int      `json:"level_count"` // progressive shelves from bottom: 01..N
			BinsPerBay      int      `json:"bins_per_bay"`
			BinsPerShelf    int      `json:"bins_per_shelf"` // alias
			LocationType    string   `json:"location_type"`
			MaxCapacityQty  *float64 `json:"max_capacity_qty"`
			PutawayPriority *int     `json:"putaway_priority"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		aisle := strings.TrimSpace(strings.ToUpper(body.Aisle))
		if aisle == "" {
			return shared.Err(c, fiber.StatusBadRequest, "aisle required")
		}
		bayFrom := body.BayFrom
		if bayFrom < 1 {
			bayFrom = body.ShelfFrom
		}
		bayTo := body.BayTo
		if bayTo < 1 {
			bayTo = body.ShelfTo
		}
		if bayFrom < 1 {
			bayFrom = 1
		}
		if bayTo < bayFrom {
			bayTo = bayFrom
		}
		bins := body.BinsPerBay
		if bins < 1 {
			bins = body.BinsPerShelf
		}
		if bins < 1 {
			bins = 1
		}
		if bayTo-bayFrom > 50 || bins > 50 {
			return shared.Err(c, fiber.StatusBadRequest, "bulk range too large")
		}
		levels := body.Levels
		if len(levels) == 0 {
			n := body.LevelCount
			if n < 1 {
				n = 3
			}
			if n > 20 {
				return shared.Err(c, fiber.StatusBadRequest, "level_count must be 1–20")
			}
			levels = make([]string, 0, n)
			for i := 1; i <= n; i++ {
				levels = append(levels, fmt.Sprintf("%02d", i))
			}
		}
		if (bayTo-bayFrom+1)*len(levels)*bins > 2000 {
			return shared.Err(c, fiber.StatusBadRequest, "bulk range too large (max 2000 locations)")
		}
		locType := body.LocationType
		if locType == "" {
			locType = "storage"
		}
		priority := 5
		if body.PutawayPriority != nil {
			priority = *body.PutawayPriority
			if priority < 1 {
				priority = 1
			}
			if priority > 10 {
				priority = 10
			}
		}

		created := []fiber.Map{}
		for bay := bayFrom; bay <= bayTo; bay++ {
			for _, level := range levels {
				for n := 1; n <= bins; n++ {
					loc, errMsg := normalizeLocationInput(
						aisle,
						fmt.Sprintf("%02d", bay),
						level,
						fmt.Sprintf("%02d", n),
						locType,
						"",
					)
					if errMsg != "" {
						continue
					}
					var id int
					err := db.QueryRow(c.Context(), `
						INSERT INTO warehouse_locations (
							code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
							location_type, max_capacity_qty, allow_mixed_items, putaway_priority, disabled, is_occupied
						) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,false,false)
						ON CONFLICT (warehouse_id, code) DO NOTHING
						RETURNING id`,
						loc.Code, wid, aisle, loc.Aisle, loc.Shelf, loc.Number, loc.Shelf, loc.Level, loc.Number,
						loc.LocationType, body.MaxCapacityQty, priority,
					).Scan(&id)
					if err != nil && strings.Contains(err.Error(), "putaway_priority") {
						err = db.QueryRow(c.Context(), `
							INSERT INTO warehouse_locations (
								code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
								location_type, max_capacity_qty, allow_mixed_items, disabled, is_occupied
							) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,false,false)
							ON CONFLICT (warehouse_id, code) DO NOTHING
							RETURNING id`,
							loc.Code, wid, aisle, loc.Aisle, loc.Shelf, loc.Number, loc.Shelf, loc.Level, loc.Number,
							loc.LocationType, body.MaxCapacityQty,
						).Scan(&id)
					}
					if err == nil {
						created = append(created, fiber.Map{"id": id, "code": loc.Code})
					}
				}
			}
		}
		shared.WriteAudit(db, c.Context(), shared.ActorID(c), "location.bulk_create", "warehouse", wid, nil, fiber.Map{
			"created": len(created), "aisle": aisle,
		})
		return shared.OK(c, fiber.Map{"created": len(created), "locations": created})
	}
}

func updateLocation(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			LocationType    *string  `json:"location_type"`
			MaxCapacityQty  *float64 `json:"max_capacity_qty"`
			AllowMixedItems *bool    `json:"allow_mixed_items"`
			Disabled        *bool    `json:"disabled"`
			PutawayPriority *int     `json:"putaway_priority"`
			Zone            *string  `json:"zone"`
			LengthCm        *float64 `json:"length_cm"`
			WidthCm         *float64 `json:"width_cm"`
			HeightCm        *float64 `json:"height_cm"`
			VolumeCm3       *float64 `json:"volume_cm3"`
			MaxWeightKg     *float64 `json:"max_weight_kg"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.LocationType != nil {
			t := strings.ToLower(strings.TrimSpace(*body.LocationType))
			switch t {
			case "storage", "pick_face", "staging", "hold", "damaged", "incoming", "quarantine", "returns":
				body.LocationType = &t
			default:
				return shared.Err(c, fiber.StatusBadRequest, "invalid location_type")
			}
		}
		if body.PutawayPriority != nil {
			p := *body.PutawayPriority
			if p < 1 {
				p = 1
			}
			if p > 10 {
				p = 10
			}
			body.PutawayPriority = &p
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE warehouse_locations SET
				location_type = COALESCE($2, location_type),
				max_capacity_qty = COALESCE($3, max_capacity_qty),
				allow_mixed_items = COALESCE($4, allow_mixed_items),
				disabled = COALESCE($5, disabled),
				putaway_priority = COALESCE($6, putaway_priority),
				zone = COALESCE($7, zone),
				updated_at = now()
			WHERE id=$1`, id, body.LocationType, body.MaxCapacityQty, body.AllowMixedItems, body.Disabled,
			body.PutawayPriority, body.Zone)
		if err != nil {
			if strings.Contains(err.Error(), "putaway_priority") {
				tag, err = db.Exec(c.Context(), `
					UPDATE warehouse_locations SET
						location_type = COALESCE($2, location_type),
						max_capacity_qty = COALESCE($3, max_capacity_qty),
						allow_mixed_items = COALESCE($4, allow_mixed_items),
						disabled = COALESCE($5, disabled),
						zone = COALESCE($6, zone),
						updated_at = now()
					WHERE id=$1`, id, body.LocationType, body.MaxCapacityQty, body.AllowMixedItems, body.Disabled, body.Zone)
			}
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "location not found")
		}
		if body.LengthCm != nil || body.WidthCm != nil || body.HeightCm != nil || body.VolumeCm3 != nil || body.MaxWeightKg != nil {
			_, _ = db.Exec(c.Context(), `
				UPDATE warehouse_locations SET
					length_cm = COALESCE($2, length_cm),
					width_cm = COALESCE($3, width_cm),
					height_cm = COALESCE($4, height_cm),
					volume_cm3 = COALESCE($5, volume_cm3),
					max_weight_kg = COALESCE($6, max_weight_kg)
				WHERE id=$1`,
				id, body.LengthCm, body.WidthCm, body.HeightCm, body.VolumeCm3, body.MaxWeightKg)
		}
		return shared.OK(c, fiber.Map{"id": id, "updated": true})
	}
}

type locationLabel struct {
	ID           int    `json:"id"`
	Code         string `json:"code"`
	WarehouseID  int    `json:"warehouse_id"`
	Aisle        string `json:"aisle"`
	Bay          string `json:"bay"`
	Level        string `json:"level"`
	Bin          string `json:"bin"`
	LocationType string `json:"location_type"`
}

func scanLocationLabel(id, wid int, code, aisle, shelf, level, number, locType string) locationLabel {
	return locationLabel{
		ID: id, Code: code, WarehouseID: wid,
		Aisle: aisle, Bay: shelf, Level: displayLevel(level), Bin: number,
		LocationType: locType,
	}
}

func locationQRLabel(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var code, aisle, shelf, level, number, locType string
		var wid int
		err = db.QueryRow(c.Context(), `
			SELECT id, code, warehouse_id, COALESCE(aisle,''), COALESCE(shelf, COALESCE(rack,'')),
			       COALESCE(level,'01'), COALESCE(number, COALESCE(bin,'')), COALESCE(location_type,'storage')
			FROM warehouse_locations WHERE id=$1`, id).
			Scan(&id, &code, &wid, &aisle, &shelf, &level, &number, &locType)
		if err != nil {
			if err == pgx.ErrNoRows {
				return shared.Err(c, fiber.StatusNotFound, "location not found")
			}
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, scanLocationLabel(id, wid, code, aisle, shelf, level, number, locType))
	}
}

func locationQRLabels(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		wid, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid warehouse id")
		}
		var body struct {
			LocationIDs []int  `json:"location_ids"`
			Aisle       string `json:"aisle"`
			Bay         string `json:"bay"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		aisle := strings.TrimSpace(strings.ToUpper(body.Aisle))
		bay := strings.TrimSpace(body.Bay)

		sql := `
			SELECT id, code, warehouse_id, COALESCE(aisle,''), COALESCE(shelf, COALESCE(rack,'')),
			       COALESCE(level,'01'), COALESCE(number, COALESCE(bin,'')), COALESCE(location_type,'storage')
			FROM warehouse_locations
			WHERE warehouse_id = $1 AND COALESCE(disabled,false) = false`
		args := []any{wid}
		argN := 2
		if len(body.LocationIDs) > 0 {
			sql += fmt.Sprintf(` AND id = ANY($%d)`, argN)
			args = append(args, body.LocationIDs)
			argN++
		}
		if aisle != "" {
			sql += fmt.Sprintf(` AND UPPER(COALESCE(aisle,'')) = $%d`, argN)
			args = append(args, aisle)
			argN++
		}
		if bay != "" {
			sql += fmt.Sprintf(` AND COALESCE(shelf, COALESCE(rack,'')) = $%d`, argN)
			args = append(args, bay)
			argN++
		}
		sql += ` ORDER BY aisle, shelf, level, number, code`

		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		out := []locationLabel{}
		for rows.Next() {
			var id, whID int
			var code, a, shelf, level, number, locType string
			if err := rows.Scan(&id, &code, &whID, &a, &shelf, &level, &number, &locType); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			out = append(out, scanLocationLabel(id, whID, code, a, shelf, level, number, locType))
		}
		return shared.OK(c, fiber.Map{"labels": out, "count": len(out)})
	}
}

func locationInventory(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		rows, err := db.Query(c.Context(), `
			SELECT slb.id, slb.item_code, i.name, slb.warehouse_id, w.code, w.name,
			       slb.location_id, wl.code, wl.aisle, wl.shelf, wl.level, wl.number, wl.location_type,
			       COALESCE(slb.batch_no,''), b.expiry_date::text,
			       CASE WHEN b.expiry_date IS NULL THEN NULL ELSE (b.expiry_date - CURRENT_DATE) END,
			       slb.actual_qty, slb.reserved_qty,
			       (slb.actual_qty - slb.reserved_qty) AS available_qty,
			       CASE
			         WHEN COALESCE(slb.allocation_status,'') = 'unallocatable'
			              OR wl.location_type IN ('incoming','hold','damaged','staging')
			           THEN 'unallocatable'
			         WHEN slb.reserved_qty <= 0 THEN 'available'
			         WHEN slb.reserved_qty >= slb.actual_qty THEN 'fully_allocated'
			         ELSE 'partial'
			       END AS allocation_status
			FROM stock_location_balances slb
			JOIN warehouses w ON w.id = slb.warehouse_id
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			LEFT JOIN items i ON i.code = slb.item_code
			LEFT JOIN LATERAL (
				SELECT expiry_date FROM batches
				WHERE item_code = slb.item_code AND batch_id = slb.batch_no
				ORDER BY id DESC LIMIT 1
			) b ON true
			WHERE slb.location_id = $1 AND slb.actual_qty <> 0
			ORDER BY b.expiry_date NULLS LAST, slb.item_code, slb.batch_no`, id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		return shared.OK(c, scanInventoryRows(rows))
	}
}

func listAllLocations(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		wid := c.Query("warehouse_id")
		sql := `
			SELECT wl.id, wl.code, wl.warehouse_id, w.code, w.name,
			       COALESCE(wl.aisle,''), COALESCE(wl.shelf, COALESCE(wl.rack,'')),
			       COALESCE(wl.level,'low'), COALESCE(wl.number, COALESCE(wl.bin,'')),
			       COALESCE(wl.location_type,'storage'), COALESCE(wl.disabled,false),
			       COALESCE((SELECT SUM(actual_qty) FROM stock_location_balances slb WHERE slb.location_id = wl.id),0),
			       (SELECT COUNT(DISTINCT item_code) FROM stock_location_balances slb WHERE slb.location_id = wl.id AND slb.actual_qty <> 0)
			FROM warehouse_locations wl
			JOIN warehouses w ON w.id = wl.warehouse_id
			WHERE COALESCE(wl.disabled,false)=false`
		args := []any{}
		if wid != "" {
			sql += ` AND wl.warehouse_id = $1`
			args = append(args, wid)
		}
		sql += ` ORDER BY w.code, wl.code`

		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			ID            int     `json:"id"`
			Code          string  `json:"code"`
			WarehouseID   int     `json:"warehouse_id"`
			WarehouseCode string  `json:"warehouse_code"`
			WarehouseName string  `json:"warehouse_name"`
			Aisle         string  `json:"aisle"`
			Shelf         string  `json:"shelf"`
			Level         string  `json:"level"`
			Number        string  `json:"number"`
			LocationType  string  `json:"location_type"`
			Disabled      bool    `json:"disabled"`
			OnHandQty     float64 `json:"on_hand_qty"`
			ItemCount     int     `json:"item_count"`
		}
		list := []row{}
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.Code, &r.WarehouseID, &r.WarehouseCode, &r.WarehouseName,
				&r.Aisle, &r.Shelf, &r.Level, &r.Number, &r.LocationType, &r.Disabled,
				&r.OnHandQty, &r.ItemCount); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func createSupplier(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Name                string `json:"name"`
			SupplierGroup       string `json:"supplier_group"`
			GSTIN               string `json:"gstin"`
			IsTransporter       bool   `json:"is_transporter"`
			CarrierCode         string `json:"carrier_code"`
			ContactPhone        string `json:"contact_phone"`
			ContactEmail        string `json:"contact_email"`
			VehicleFleet        string `json:"vehicle_fleet"`
			DefaultServiceLevel string `json:"default_service_level"`
			Barcode             string `json:"barcode"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Name) == "" {
			return shared.Err(c, fiber.StatusBadRequest, "name required")
		}
		if body.IsTransporter && body.CarrierCode == "" && body.ContactPhone == "" {
			return shared.Err(c, fiber.StatusBadRequest, "carrier fields required when is_transporter=true (carrier_code or contact_phone)")
		}
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO suppliers (
				name, supplier_group, gstin, is_transporter,
				carrier_code, contact_phone, contact_email, vehicle_fleet, default_service_level
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
			body.Name, nullIfEmpty(body.SupplierGroup), nullIfEmpty(body.GSTIN), body.IsTransporter,
			nullIfEmpty(body.CarrierCode), nullIfEmpty(body.ContactPhone), nullIfEmpty(body.ContactEmail),
			nullIfEmpty(body.VehicleFleet), nullIfEmpty(body.DefaultServiceLevel),
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if strings.TrimSpace(body.Barcode) != "" {
			_, _ = db.Exec(c.Context(), `UPDATE suppliers SET barcode=$2 WHERE id=$1`, id, strings.TrimSpace(body.Barcode))
		}
		return shared.OK(c, fiber.Map{"id": id, "name": body.Name, "is_transporter": body.IsTransporter})
	}
}

func createBatch(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			BatchID           string  `json:"batch_id"`
			ItemCode          string  `json:"item_code"`
			ItemName          string  `json:"item_name"`
			ManufacturingDate string  `json:"manufacturing_date"`
			ExpiryDate        string  `json:"expiry_date"`
			BatchQty          float64 `json:"batch_qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if body.BatchID == "" || body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "batch_id and item_code required")
		}
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO batches (batch_id, item_code, item_name, manufacturing_date, expiry_date, batch_qty)
			VALUES ($1,$2,$3,NULLIF($4,'')::date,NULLIF($5,'')::date,$6) RETURNING id`,
			body.BatchID, body.ItemCode, nullIfEmpty(body.ItemName), body.ManufacturingDate, body.ExpiryDate, body.BatchQty,
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "batch_id": body.BatchID})
	}
}

// --- helpers ---

type locNorm struct {
	Aisle, Shelf, Level, Number, LocationType, Code string
}

func normalizeLocationInput(aisle, shelf, level, number, locType, code string) (locNorm, string) {
	aisle = strings.TrimSpace(strings.ToUpper(aisle))
	shelf = strings.TrimSpace(shelf)
	level = strings.TrimSpace(strings.ToLower(level))
	number = strings.TrimSpace(number)
	locType = strings.TrimSpace(strings.ToLower(locType))
	if aisle == "" || shelf == "" || number == "" {
		return locNorm{}, "aisle, bay (shelf), and bin (number) required"
	}
	level = normalizeLevel(level)
	if locType == "" {
		locType = "storage"
	}
	switch locType {
	case "storage", "pick_face", "staging", "hold", "damaged", "incoming", "quarantine", "returns":
	default:
		return locNorm{}, "invalid location_type"
	}
	// Bottom shelves 01–04 = pick face; 05+ = storage (when type is storage/pick_face).
	if locType == "storage" || locType == "pick_face" {
		if n, err := strconv.Atoi(level); err == nil {
			if n >= 1 && n <= 4 {
				locType = "pick_face"
			} else if n >= 5 {
				locType = "storage"
			}
		}
	}
	if code == "" {
		lvl := levelCode(level)
		code = fmt.Sprintf("%s-%s-%s-%s", aisle, shelf, lvl, number)
	}
	return locNorm{Aisle: aisle, Shelf: shelf, Level: level, Number: number, LocationType: locType, Code: code}, ""
}

// normalizeLevel returns zero-padded shelf level from bottom (01 = lowest).
// Legacy lower/middle/upper (and L/M/U) map to 01/02/03 for compatibility.
func normalizeLevel(level string) string {
	level = strings.TrimSpace(strings.ToLower(level))
	switch level {
	case "", "l", "low", "lower", "bottom":
		return "01"
	case "m", "mid", "middle", "med":
		return "02"
	case "u", "up", "upper", "high", "top":
		return "03"
	}
	if n, err := strconv.Atoi(level); err == nil && n >= 1 && n <= 99 {
		return fmt.Sprintf("%02d", n)
	}
	return level
}

func displayLevel(level string) string {
	return normalizeLevel(level)
}

func levelCode(level string) string {
	return normalizeLevel(level)
}

func normalizePackType(v string) (string, error) {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return "", fmt.Errorf("pack_type required (loose or packed)")
	}
	if v != "loose" && v != "packed" {
		return "", fmt.Errorf("pack_type must be loose or packed")
	}
	return v, nil
}

func normalizeControlMode(v string) (string, error) {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "" {
		return "", fmt.Errorf("control_mode required (item_controlled or bin_controlled)")
	}
	if v != "item_controlled" && v != "bin_controlled" {
		return "", fmt.Errorf("control_mode must be item_controlled or bin_controlled")
	}
	return v, nil
}

func itemMasterComplete(code, name, packType, controlMode string, homeID *int, hasExpiry bool, shelfLife *int) bool {
	if strings.TrimSpace(code) == "" || strings.TrimSpace(name) == "" {
		return false
	}
	if packType != "loose" && packType != "packed" {
		return false
	}
	if controlMode != "item_controlled" && controlMode != "bin_controlled" {
		return false
	}
	if controlMode == "bin_controlled" && homeID == nil {
		return false
	}
	if hasExpiry && (shelfLife == nil || *shelfLife <= 0) {
		return false
	}
	return true
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

type inventoryRow struct {
	ID               int     `json:"id"`
	ItemCode         string  `json:"item_code"`
	ItemName         *string `json:"item_name"`
	WarehouseID      int     `json:"warehouse_id"`
	WarehouseCode    string  `json:"warehouse_code"`
	WarehouseName    string  `json:"warehouse_name"`
	LocationID       int     `json:"location_id"`
	LocationCode     string  `json:"location_code"`
	Aisle            string  `json:"aisle"`
	Shelf            string  `json:"shelf"`
	Level            string  `json:"level"`
	Number           string  `json:"number"`
	LocationType     string  `json:"location_type"`
	BatchNo          string  `json:"batch_no"`
	ExpiryDate       *string `json:"expiry_date"`
	DaysUntilExpiry  *int    `json:"days_until_expiry"`
	ActualQty        float64 `json:"actual_qty"`
	ReservedQty      float64 `json:"reserved_qty"`
	AvailableQty     float64 `json:"available_qty"`
	AllocationStatus string  `json:"allocation_status"`
	FefoWarn         bool    `json:"fefo_warn"`
}

func scanInventoryRows(rows pgx.Rows) []inventoryRow {
	list := []inventoryRow{}
	for rows.Next() {
		var r inventoryRow
		var aisle, shelf, level, number, locType *string
		_ = rows.Scan(&r.ID, &r.ItemCode, &r.ItemName, &r.WarehouseID, &r.WarehouseCode, &r.WarehouseName,
			&r.LocationID, &r.LocationCode, &aisle, &shelf, &level, &number, &locType,
			&r.BatchNo, &r.ExpiryDate, &r.DaysUntilExpiry, &r.ActualQty, &r.ReservedQty, &r.AvailableQty, &r.AllocationStatus)
		if aisle != nil {
			r.Aisle = *aisle
		}
		if shelf != nil {
			r.Shelf = *shelf
		}
		if level != nil {
			r.Level = *level
		}
		if number != nil {
			r.Number = *number
		}
		if locType != nil {
			r.LocationType = *locType
		}
		if r.DaysUntilExpiry != nil && *r.DaysUntilExpiry <= 90 {
			r.FefoWarn = true
		}
		list = append(list, r)
	}
	return list
}

func listWarehouses(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, code, warehouse_type, picking_mode, disabled, is_group,
			       parent_id, account, is_rejected_warehouse, customer,
			       default_in_transit_warehouse, email_id, phone_no, mobile_no,
			       address_line_1, address_line_2, city, state, pin,
			       (SELECT COUNT(*) FROM warehouse_locations wl WHERE wl.warehouse_id = warehouses.id) AS location_count,
			       COALESCE(receiving_open::text,''), COALESCE(receiving_close::text,''), COALESCE(receiving_days,'')
			FROM warehouses ORDER BY name`)
		if err != nil && strings.Contains(err.Error(), "receiving_open") {
			rows, err = db.Query(c.Context(), `
				SELECT id, name, code, warehouse_type, picking_mode, disabled, is_group,
				       parent_id, account, is_rejected_warehouse, customer,
				       default_in_transit_warehouse, email_id, phone_no, mobile_no,
				       address_line_1, address_line_2, city, state, pin,
				       (SELECT COUNT(*) FROM warehouse_locations wl WHERE wl.warehouse_id = warehouses.id) AS location_count,
				       '', '', ''
				FROM warehouses ORDER BY name`)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type wh struct {
			ID               int     `json:"id"`
			Name             string  `json:"name"`
			Code             string  `json:"code"`
			WarehouseType    *string `json:"warehouse_type"`
			PickingMode      *string `json:"picking_mode"`
			Disabled         bool    `json:"disabled"`
			IsGroup          bool    `json:"is_group"`
			ParentID         *int    `json:"parent_id"`
			Account          *string `json:"account"`
			IsRejected       bool    `json:"is_rejected_warehouse"`
			Customer         *string `json:"customer"`
			DefaultInTransit *string `json:"default_in_transit_warehouse"`
			EmailID          *string `json:"email_id"`
			PhoneNo          *string `json:"phone_no"`
			MobileNo         *string `json:"mobile_no"`
			AddressLine1     *string `json:"address_line_1"`
			AddressLine2     *string `json:"address_line_2"`
			City             *string `json:"city"`
			State            *string `json:"state"`
			Pin              *string `json:"pin"`
			LocationCount    int     `json:"location_count"`
			ReceivingOpen    string  `json:"receiving_open"`
			ReceivingClose   string  `json:"receiving_close"`
			ReceivingDays    string  `json:"receiving_days"`
		}
		list := []wh{}
		for rows.Next() {
			var w wh
			if err := rows.Scan(&w.ID, &w.Name, &w.Code, &w.WarehouseType, &w.PickingMode,
				&w.Disabled, &w.IsGroup, &w.ParentID, &w.Account, &w.IsRejected, &w.Customer,
				&w.DefaultInTransit, &w.EmailID, &w.PhoneNo, &w.MobileNo,
				&w.AddressLine1, &w.AddressLine2, &w.City, &w.State, &w.Pin, &w.LocationCount,
				&w.ReceivingOpen, &w.ReceivingClose, &w.ReceivingDays); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, w)
		}
		return shared.OK(c, list)
	}
}

func listSuppliers(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, supplier_group, gstin, disabled,
			       COALESCE(is_transporter,false), carrier_code, contact_phone, contact_email,
			       vehicle_fleet, default_service_level, COALESCE(barcode,'')
			FROM suppliers WHERE disabled=false ORDER BY name`)
		if err != nil && strings.Contains(err.Error(), "barcode") {
			rows, err = db.Query(c.Context(), `
				SELECT id, name, supplier_group, gstin, disabled,
				       COALESCE(is_transporter,false), carrier_code, contact_phone, contact_email,
				       vehicle_fleet, default_service_level, ''
				FROM suppliers WHERE disabled=false ORDER BY name`)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type sup struct {
			ID                  int     `json:"id"`
			Name                string  `json:"name"`
			SupplierGroup       *string `json:"supplier_group"`
			GSTIN               *string `json:"gstin"`
			Disabled            bool    `json:"disabled"`
			IsTransporter       bool    `json:"is_transporter"`
			CarrierCode         *string `json:"carrier_code"`
			ContactPhone        *string `json:"contact_phone"`
			ContactEmail        *string `json:"contact_email"`
			VehicleFleet        *string `json:"vehicle_fleet"`
			DefaultServiceLevel *string `json:"default_service_level"`
			Barcode             string  `json:"barcode"`
		}
		list := []sup{}
		for rows.Next() {
			var s sup
			if err := rows.Scan(&s.ID, &s.Name, &s.SupplierGroup, &s.GSTIN, &s.Disabled,
				&s.IsTransporter, &s.CarrierCode, &s.ContactPhone, &s.ContactEmail,
				&s.VehicleFleet, &s.DefaultServiceLevel, &s.Barcode); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		return shared.OK(c, list)
	}
}

func supplierByBarcode(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		code := strings.TrimSpace(c.Params("code"))
		if code == "" {
			return shared.Err(c, fiber.StatusBadRequest, "barcode required")
		}
		var id int
		var name, gstin, barcode string
		err := db.QueryRow(c.Context(), `
			SELECT id, name, COALESCE(gstin,''), COALESCE(barcode,'')
			FROM suppliers
			WHERE disabled=false AND (
				lower(btrim(barcode))=lower(btrim($1))
				OR lower(btrim(COALESCE(gstin,'')))=lower(btrim($1))
			)
			ORDER BY id LIMIT 1`, code).Scan(&id, &name, &gstin, &barcode)
		if err != nil {
			return shared.OK(c, fiber.Map{"found": false, "barcode": code})
		}
		return shared.OK(c, fiber.Map{"found": true, "id": id, "name": name, "gstin": gstin, "barcode": barcode})
	}
}

func listBatches(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, batch_id, item_code, item_name, manufacturing_date::text, expiry_date::text,
			       batch_qty, stock_uom, disabled, description, supplier,
			       reference_doctype, reference_name, qty_to_produce, produced_qty
			FROM batches ORDER BY id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type batch struct {
			ID                int      `json:"id"`
			BatchID           string   `json:"batch_id"`
			ItemCode          string   `json:"item_code"`
			ItemName          *string  `json:"item_name"`
			ManufacturingDate *string  `json:"manufacturing_date"`
			ExpiryDate        *string  `json:"expiry_date"`
			BatchQty          *float64 `json:"batch_qty"`
			StockUOM          *string  `json:"stock_uom"`
			Disabled          bool     `json:"disabled"`
			Description       *string  `json:"description"`
			Supplier          *string  `json:"supplier"`
			ReferenceDoctype  *string  `json:"reference_doctype"`
			ReferenceName     *string  `json:"reference_name"`
			QtyToProduce      *float64 `json:"qty_to_produce"`
			ProducedQty       *float64 `json:"produced_qty"`
		}
		list := []batch{}
		for rows.Next() {
			var b batch
			if err := rows.Scan(&b.ID, &b.BatchID, &b.ItemCode, &b.ItemName,
				&b.ManufacturingDate, &b.ExpiryDate, &b.BatchQty, &b.StockUOM, &b.Disabled,
				&b.Description, &b.Supplier, &b.ReferenceDoctype, &b.ReferenceName,
				&b.QtyToProduce, &b.ProducedQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, b)
		}
		return shared.OK(c, list)
	}
}

func listDeliveryNotes(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, customer_name, status, posting_date::text, grand_total, net_total, total_qty
			FROM delivery_notes ORDER BY id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type dn struct {
			ID           int      `json:"id"`
			Name         string   `json:"name"`
			CustomerName *string  `json:"customer_name"`
			Status       *string  `json:"status"`
			PostingDate  *string  `json:"posting_date"`
			GrandTotal   *float64 `json:"grand_total"`
			NetTotal     *float64 `json:"net_total"`
			TotalQty     *float64 `json:"total_qty"`
		}
		list := []dn{}
		for rows.Next() {
			var d dn
			if err := rows.Scan(&d.ID, &d.Name, &d.CustomerName, &d.Status, &d.PostingDate,
				&d.GrandTotal, &d.NetTotal, &d.TotalQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, d)
		}
		return shared.OK(c, list)
	}
}

func getDeliveryNote(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var name string
		var customer, status *string
		var tripID *int
		err = db.QueryRow(c.Context(), `
			SELECT name, customer_name, status, trip_id FROM delivery_notes WHERE id=$1`, id).
			Scan(&name, &customer, &status, &tripID)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "delivery note not found")
		}
		if err != nil {
			// trip_id may be missing on older DBs
			err = db.QueryRow(c.Context(), `
				SELECT name, customer_name, status FROM delivery_notes WHERE id=$1`, id).
				Scan(&name, &customer, &status)
			if err == pgx.ErrNoRows {
				return shared.Err(c, fiber.StatusNotFound, "delivery note not found")
			}
			if err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
		}
		items := []fiber.Map{}
		rows, err := db.Query(c.Context(), `
			SELECT item_code, qty, COALESCE(against_sales_order,'') FROM delivery_note_items WHERE delivery_note_id=$1`, id)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var code, so string
				var qty float64
				if rows.Scan(&code, &qty, &so) == nil {
					items = append(items, fiber.Map{"item_code": code, "qty": qty, "against_sales_order": so})
				}
			}
		}
		return shared.OK(c, fiber.Map{
			"id": id, "name": name, "customer_name": customer, "status": status, "trip_id": tripID, "items": items,
		})
	}
}

func confirmDeliveryNote(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var body struct {
			ReceivedBy string `json:"received_by"`
			Notes      string `json:"notes"`
		}
		_ = shared.Bind(c, &body)
		tag, err := db.Exec(c.Context(), `
			UPDATE delivery_notes SET status='Delivered',
				remarks = COALESCE(remarks,'') || CASE WHEN $2<>'' THEN E'\n[POD] '||$2 ELSE '' END,
				delivered_at = COALESCE(delivered_at, NOW())
			WHERE id=$1`, id, strings.TrimSpace(body.ReceivedBy+" "+body.Notes))
		if err != nil {
			tag, err = db.Exec(c.Context(), `
				UPDATE delivery_notes SET status='Delivered',
					remarks = COALESCE(remarks,'') || CASE WHEN $2<>'' THEN E'\n[POD] '||$2 ELSE '' END
				WHERE id=$1`, id, strings.TrimSpace(body.ReceivedBy+" "+body.Notes))
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "delivery note not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "status": "Delivered"})
	}
}

func listStockEntries(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, stock_entry_type, status, posting_date::text, from_warehouse, to_warehouse, purpose
			FROM stock_entries ORDER BY id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type se struct {
			ID             int     `json:"id"`
			Name           string  `json:"name"`
			StockEntryType *string `json:"stock_entry_type"`
			Status         *string `json:"status"`
			PostingDate    *string `json:"posting_date"`
			FromWarehouse  *string `json:"from_warehouse"`
			ToWarehouse    *string `json:"to_warehouse"`
			Purpose        *string `json:"purpose"`
		}
		list := []se{}
		for rows.Next() {
			var s se
			if err := rows.Scan(&s.ID, &s.Name, &s.StockEntryType, &s.Status, &s.PostingDate,
				&s.FromWarehouse, &s.ToWarehouse, &s.Purpose); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		return shared.OK(c, list)
	}
}

func listStockReconciliations(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, status, posting_date::text FROM stock_reconciliations ORDER BY id DESC LIMIT 100`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type sr struct {
			ID          int     `json:"id"`
			Name        string  `json:"name"`
			Status      *string `json:"status"`
			PostingDate *string `json:"posting_date"`
		}
		list := []sr{}
		for rows.Next() {
			var s sr
			if err := rows.Scan(&s.ID, &s.Name, &s.Status, &s.PostingDate); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		return shared.OK(c, list)
	}
}

func exportItemsCSV(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT code, name, COALESCE(brand,''), COALESCE(weight_per_unit,0), COALESCE(weight_uom,''),
			       COALESCE(reorder_level,0), COALESCE(safety_stock,0), disabled,
			       COALESCE(mrp,0), COALESCE(valuation_rate,0), COALESCE(standard_rate,0),
			       COALESCE(hsn_no,''), COALESCE(gst_percentage,0),
			       COALESCE(vech,''), COALESCE(make,''), COALESCE(uom,'PCS'),
			       COALESCE(product_group,''), COALESCE(category,''),
			       COALESCE(parts_movement,''), COALESCE(parts_pbo,''),
			       COALESCE(threshold_value,0), COALESCE(max_rate_discount,0),
			       COALESCE(remark,''), COALESCE(description,''), COALESCE(min_order_qty,0)
			FROM items ORDER BY code LIMIT 5000`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		var b strings.Builder
		b.WriteString("code,name,brand,weight_per_unit,weight_uom,reorder_level,safety_stock,disabled,mrp,cost_price,unit_selling_price,hsn_no,gst_percentage,vech,make,uom,product_group,category,parts_movement,parts_pbo,threshold_value,max_rate_discount,remark,description,moq\n")
		for rows.Next() {
			var code, name, brand, wuom, hsn, vech, make, uom, pgroup, category, pmove, pbo, remark, desc string
			var w, reorder, safety, mrp, costPrice, standardRate, gst, thresh, maxDisc, moq float64
			var disabled bool
			if err := rows.Scan(&code, &name, &brand, &w, &wuom, &reorder, &safety, &disabled,
				&mrp, &costPrice, &standardRate, &hsn, &gst, &vech, &make, &uom, &pgroup, &category, &pmove, &pbo, &thresh, &maxDisc, &remark, &desc, &moq); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			b.WriteString(fmt.Sprintf("%s,%s,%s,%g,%s,%g,%g,%t,%g,%g,%g,%s,%g,%s,%s,%s,%s,%s,%s,%s,%g,%g,%s,%s,%g\n",
				csvEsc(code), csvEsc(name), csvEsc(brand), w, csvEsc(wuom), reorder, safety, disabled,
				mrp, costPrice, standardRate, csvEsc(hsn), gst, csvEsc(vech), csvEsc(make), csvEsc(uom), csvEsc(pgroup), csvEsc(category),
				csvEsc(pmove), csvEsc(pbo), thresh, maxDisc, csvEsc(remark), csvEsc(desc), moq))
		}
		c.Set("Content-Type", "text/csv")
		c.Set("Content-Disposition", "attachment; filename=items.csv")
		return c.SendString(b.String())
	}
}

func setSupplierVehicles(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var rawBody struct {
			Vehicles json.RawMessage `json:"vehicles"`
		}
		if err := shared.Bind(c, &rawBody); err != nil {
			return err
		}
		vehicles := []map[string]any{}
		if len(rawBody.Vehicles) > 0 && string(rawBody.Vehicles) != "null" {
			var asObjects []map[string]any
			if err := json.Unmarshal(rawBody.Vehicles, &asObjects); err == nil {
				vehicles = asObjects
			} else {
				var asStrings []string
				if err := json.Unmarshal(rawBody.Vehicles, &asStrings); err != nil {
					return shared.Err(c, fiber.StatusBadRequest,
						`vehicles must be an array of strings or objects like {"vehicle_no":"..."}`)
				}
				for _, plate := range asStrings {
					plate = strings.TrimSpace(plate)
					if plate == "" {
						continue
					}
					vehicles = append(vehicles, map[string]any{"vehicle_no": plate})
				}
			}
		}
		raw, _ := json.Marshal(vehicles)
		fleet := ""
		for i, v := range vehicles {
			plate, _ := v["vehicle_no"].(string)
			if plate == "" {
				continue
			}
			if i > 0 && fleet != "" {
				fleet += ","
			}
			fleet += plate
		}
		tag, err := db.Exec(c.Context(), `
			UPDATE suppliers SET vehicles=$2::jsonb, vehicle_fleet=COALESCE(NULLIF($3,''), vehicle_fleet)
			WHERE id=$1`, id, string(raw), fleet)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if tag.RowsAffected() == 0 {
			return shared.Err(c, fiber.StatusNotFound, "supplier not found")
		}
		return shared.OK(c, fiber.Map{"id": id, "vehicles": vehicles})
	}
}

func getSupplierVehicles(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		id, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid id")
		}
		var raw []byte
		err = db.QueryRow(c.Context(), `
			SELECT COALESCE(vehicles::text, '[]') FROM suppliers WHERE id=$1`, id).Scan(&raw)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusNotFound, "supplier not found")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		var veh any
		_ = json.Unmarshal(raw, &veh)
		if veh == nil {
			veh = []any{}
		}
		return shared.OK(c, fiber.Map{"id": id, "vehicles": veh})
	}
}

func csvEsc(s string) string {
	if strings.ContainsAny(s, ",\"\n") {
		return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
	}
	return s
}
