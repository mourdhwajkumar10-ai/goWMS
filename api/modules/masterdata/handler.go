package masterdata

import (
	"fmt"
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires master-data routes under /masterdata (matches the React client).
func Register(r fiber.Router, db *pgxpool.Pool) {
	md := r.Group("/masterdata")

	md.Get("/items", listItems(db))
	md.Post("/items", createItem(db))
	md.Patch("/items/:id", updateItem(db))
	md.Post("/items/complete", completeItemMaster(db))
	md.Get("/items/:code/inventory", itemInventory(db))
	md.Get("/items/check/:code", checkItem(db))

	md.Get("/warehouses", listWarehouses(db))
	md.Post("/warehouses", createWarehouse(db))
	md.Get("/warehouses/:id/locations", listWarehouseLocations(db))
	md.Post("/warehouses/:id/locations", createLocation(db))
	md.Post("/warehouses/:id/locations/bulk", bulkCreateLocations(db))

	md.Patch("/locations/:id", updateLocation(db))
	md.Get("/locations/:id/inventory", locationInventory(db))
	md.Get("/locations", listAllLocations(db))

	md.Get("/suppliers", listSuppliers(db))
	md.Post("/suppliers", createSupplier(db))
	md.Get("/batches", listBatches(db))
	md.Post("/batches", createBatch(db))
	md.Get("/delivery-notes", listDeliveryNotes(db))
	md.Get("/stock-entries", listStockEntries(db))
	md.Get("/stock-reconciliations", listStockReconciliations(db))
	registerStockRoutes(md, db)

	// Legacy root aliases (older callers).
	r.Get("/items", listItems(db))
	r.Get("/warehouses", listWarehouses(db))
	r.Get("/suppliers", listSuppliers(db))
	r.Get("/batches", listBatches(db))
	r.Get("/delivery-notes", listDeliveryNotes(db))
	r.Get("/stock-entries", listStockEntries(db))
	r.Get("/stock-reconciliations", listStockReconciliations(db))
}

func listItems(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := strings.TrimSpace(c.Query("q"))
		sql := `
			SELECT id, code, name, COALESCE(brand,''), COALESCE(item_group_id::text,''),
			       has_serial, has_batch, has_expiry_date, safety_stock, valuation_rate,
			       COALESCE(pack_type,'loose'), COALESCE(control_mode,'item_controlled'),
			       home_location_id, COALESCE(master_complete,false), COALESCE(barcode,''),
			       COALESCE(carton_qty,0), shelf_life_in_days
			FROM items
			WHERE disabled=false`
		args := []any{}
		if q != "" {
			sql += ` AND (code ILIKE $1 OR name ILIKE $1 OR COALESCE(brand,'') ILIKE $1)`
			args = append(args, "%"+q+"%")
		}
		sql += ` ORDER BY code`

		rows, err := db.Query(c.Context(), sql, args...)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type item struct {
			ID            int      `json:"id"`
			Code          string   `json:"code"`
			Name          string   `json:"name"`
			Brand         string   `json:"brand"`
			ItemGroup     string   `json:"item_group"`
			HasSerial     bool     `json:"has_serial"`
			HasBatch      bool     `json:"has_batch"`
			HasExpiryDate bool     `json:"has_expiry_date"`
			SafetyStock   *float64 `json:"safety_stock"`
			ValuationRate *float64 `json:"valuation_rate"`
			PackType      string   `json:"pack_type"`
			ControlMode   string   `json:"control_mode"`
			HomeLocationID *int    `json:"home_location_id"`
			MasterComplete bool    `json:"master_complete"`
			Barcode       string   `json:"barcode"`
			CartonQty     int      `json:"carton_qty"`
			ShelfLifeDays *int     `json:"shelf_life_in_days"`
		}
		list := []item{}
		for rows.Next() {
			var i item
			var groupID string
			if err := rows.Scan(&i.ID, &i.Code, &i.Name, &i.Brand, &groupID,
				&i.HasSerial, &i.HasBatch, &i.HasExpiryDate, &i.SafetyStock, &i.ValuationRate,
				&i.PackType, &i.ControlMode, &i.HomeLocationID, &i.MasterComplete, &i.Barcode,
				&i.CartonQty, &i.ShelfLifeDays); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			i.ItemGroup = groupID
			list = append(list, i)
		}
		return shared.OK(c, list)
	}
}

func createItem(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Code           string  `json:"code"`
			Name           string  `json:"name"`
			Brand          string  `json:"brand"`
			ItemGroup      string  `json:"item_group"`
			HasSerial      bool    `json:"has_serial"`
			HasBatch       bool    `json:"has_batch"`
			HasExpiryDate  bool    `json:"has_expiry_date"`
			PackType       string  `json:"pack_type"`
			ControlMode    string  `json:"control_mode"`
			HomeLocationID *int    `json:"home_location_id"`
			Barcode        string  `json:"barcode"`
			CartonQty      int     `json:"carton_qty"`
			ShelfLifeDays  *int    `json:"shelf_life_in_days"`
			SafetyStock    float64 `json:"safety_stock"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Code = strings.TrimSpace(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code and name required")
		}
		body.PackType = normalizePackType(body.PackType)
		body.ControlMode = normalizeControlMode(body.ControlMode)
		if body.ControlMode == "bin_controlled" && body.HomeLocationID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "home_location_id required for bin_controlled items")
		}

		complete := itemMasterComplete(body.Code, body.Name, body.PackType, body.ControlMode, body.HomeLocationID, body.HasExpiryDate, body.ShelfLifeDays)

		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO items (
				code, name, brand, has_serial, has_batch, has_expiry_date,
				pack_type, control_mode, home_location_id, barcode, carton_qty,
				shelf_life_in_days, safety_stock, master_complete
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
			RETURNING id`,
			body.Code, body.Name, nullIfEmpty(body.Brand), body.HasSerial, body.HasBatch, body.HasExpiryDate,
			body.PackType, body.ControlMode, body.HomeLocationID, nullIfEmpty(body.Barcode), body.CartonQty,
			body.ShelfLifeDays, body.SafetyStock, complete,
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
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
			Name           *string `json:"name"`
			Brand          *string `json:"brand"`
			HasSerial      *bool   `json:"has_serial"`
			HasBatch       *bool   `json:"has_batch"`
			HasExpiryDate  *bool   `json:"has_expiry_date"`
			PackType       *string `json:"pack_type"`
			ControlMode    *string `json:"control_mode"`
			HomeLocationID *int    `json:"home_location_id"`
			Barcode        *string `json:"barcode"`
			CartonQty      *int    `json:"carton_qty"`
			ShelfLifeDays  *int    `json:"shelf_life_in_days"`
			SafetyStock    *float64 `json:"safety_stock"`
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
		}
		if body.PackType != nil {
			packType = normalizePackType(*body.PackType)
		}
		if body.ControlMode != nil {
			controlMode = normalizeControlMode(*body.ControlMode)
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
				master_complete = $14
			WHERE id=$1`,
			id,
			body.Name, body.Brand, body.HasSerial, body.HasBatch, body.HasExpiryDate,
			packType, controlMode, homeID, body.Barcode, body.CartonQty, body.ShelfLifeDays,
			body.SafetyStock, complete,
		)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "master_complete": complete})
	}
}

func completeItemMaster(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Code           string  `json:"code"`
			Name           string  `json:"name"`
			Brand          string  `json:"brand"`
			HasSerial      bool    `json:"has_serial"`
			HasBatch       bool    `json:"has_batch"`
			HasExpiryDate  bool    `json:"has_expiry_date"`
			PackType       string  `json:"pack_type"`
			ControlMode    string  `json:"control_mode"`
			HomeLocationID *int    `json:"home_location_id"`
			Barcode        string  `json:"barcode"`
			CartonQty      int     `json:"carton_qty"`
			ShelfLifeDays  *int    `json:"shelf_life_in_days"`
			SafetyStock    float64 `json:"safety_stock"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Code = strings.TrimSpace(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code and name required")
		}
		body.PackType = normalizePackType(body.PackType)
		body.ControlMode = normalizeControlMode(body.ControlMode)
		if body.ControlMode == "bin_controlled" && body.HomeLocationID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "home_location_id required for bin_controlled items")
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
					shelf_life_in_days, safety_stock, master_complete
				) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
				RETURNING id`,
				body.Code, body.Name, nullIfEmpty(body.Brand), body.HasSerial, body.HasBatch, body.HasExpiryDate,
				body.PackType, body.ControlMode, body.HomeLocationID, nullIfEmpty(body.Barcode), body.CartonQty,
				body.ShelfLifeDays, body.SafetyStock,
			).Scan(&id)
		} else if err == nil {
			_, err = db.Exec(c.Context(), `
				UPDATE items SET
					name=$2, brand=$3, has_serial=$4, has_batch=$5, has_expiry_date=$6,
					pack_type=$7, control_mode=$8, home_location_id=$9, barcode=$10,
					carton_qty=$11, shelf_life_in_days=$12, safety_stock=$13, master_complete=true
				WHERE id=$1`,
				id, body.Name, nullIfEmpty(body.Brand), body.HasSerial, body.HasBatch, body.HasExpiryDate,
				body.PackType, body.ControlMode, body.HomeLocationID, nullIfEmpty(body.Barcode), body.CartonQty,
				body.ShelfLifeDays, body.SafetyStock,
			)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
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
		err := db.QueryRow(c.Context(), `
			SELECT id, name, COALESCE(master_complete,false),
			       COALESCE(pack_type,'loose'), COALESCE(control_mode,'item_controlled')
			FROM items WHERE code=$1 AND disabled=false`, code).
			Scan(&id, &name, &complete, &packType, &controlMode)
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
			Code          string `json:"code"`
			Name          string `json:"name"`
			WarehouseType string `json:"warehouse_type"`
			PickingMode   string `json:"picking_mode"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.Code = strings.TrimSpace(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code and name required")
		}
		if body.PickingMode == "" {
			body.PickingMode = "scan"
		}
		if body.WarehouseType == "" {
			body.WarehouseType = "storage"
		}

		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO warehouses (code, name, warehouse_type, picking_mode)
			VALUES ($1,$2,$3,$4) RETURNING id`,
			body.Code, body.Name, body.WarehouseType, body.PickingMode,
		).Scan(&id)
		if err != nil {
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

		return shared.OK(c, fiber.Map{"id": id, "code": body.Code, "name": body.Name})
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
			       COALESCE(wl.shelf, COALESCE(wl.rack,'')), COALESCE(wl.level,'low'),
			       COALESCE(wl.number, COALESCE(wl.bin,'')), COALESCE(wl.location_type,'storage'),
			       wl.max_capacity_qty, COALESCE(wl.allow_mixed_items,true), COALESCE(wl.disabled,false),
			       COALESCE(wl.is_occupied,false),
			       COALESCE((SELECT SUM(actual_qty) FROM stock_location_balances slb WHERE slb.location_id = wl.id),0) AS on_hand_qty,
			       (SELECT COUNT(DISTINCT item_code) FROM stock_location_balances slb WHERE slb.location_id = wl.id AND slb.actual_qty <> 0) AS item_count
			FROM warehouse_locations wl
			WHERE wl.warehouse_id = $1
			ORDER BY wl.location_type, wl.code`, wid)
		if err != nil {
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
			Level           string   `json:"level"`
			Number          string   `json:"number"`
			LocationType    string   `json:"location_type"`
			MaxCapacityQty  *float64 `json:"max_capacity_qty"`
			AllowMixedItems bool     `json:"allow_mixed_items"`
			Disabled        bool     `json:"disabled"`
			IsOccupied      bool     `json:"is_occupied"`
			OnHandQty       float64  `json:"on_hand_qty"`
			ItemCount       int      `json:"item_count"`
		}
		list := []loc{}
		for rows.Next() {
			var l loc
			if err := rows.Scan(&l.ID, &l.Code, &l.WarehouseID, &l.Zone, &l.Aisle, &l.Shelf, &l.Level, &l.Number,
				&l.LocationType, &l.MaxCapacityQty, &l.AllowMixedItems, &l.Disabled, &l.IsOccupied,
				&l.OnHandQty, &l.ItemCount); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, l)
		}
		return shared.OK(c, list)
	}
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
			Level           string   `json:"level"`
			Number          string   `json:"number"`
			LocationType    string   `json:"location_type"`
			MaxCapacityQty  *float64 `json:"max_capacity_qty"`
			AllowMixedItems *bool    `json:"allow_mixed_items"`
			Zone            string   `json:"zone"`
			Code            string   `json:"code"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		loc, errMsg := normalizeLocationInput(body.Aisle, body.Shelf, body.Level, body.Number, body.LocationType, body.Code)
		if errMsg != "" {
			return shared.Err(c, fiber.StatusBadRequest, errMsg)
		}
		mixed := true
		if body.AllowMixedItems != nil {
			mixed = *body.AllowMixedItems
		}
		zone := body.Zone
		if zone == "" {
			zone = loc.Aisle
		}

		var id int
		err = db.QueryRow(c.Context(), `
			INSERT INTO warehouse_locations (
				code, warehouse_id, zone, aisle, rack, bin, shelf, level, number,
				location_type, max_capacity_qty, allow_mixed_items, disabled, is_occupied
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,false)
			RETURNING id`,
			loc.Code, wid, zone, loc.Aisle, loc.Shelf, loc.Number, loc.Shelf, loc.Level, loc.Number,
			loc.LocationType, body.MaxCapacityQty, mixed,
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "code": loc.Code, "warehouse_id": wid})
	}
}

func bulkCreateLocations(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		wid, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid warehouse id")
		}
		var body struct {
			Aisle          string   `json:"aisle"`
			ShelfFrom      int      `json:"shelf_from"`
			ShelfTo        int      `json:"shelf_to"`
			Levels         []string `json:"levels"`
			BinsPerShelf   int      `json:"bins_per_shelf"`
			LocationType   string   `json:"location_type"`
			MaxCapacityQty *float64 `json:"max_capacity_qty"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		aisle := strings.TrimSpace(strings.ToUpper(body.Aisle))
		if aisle == "" {
			return shared.Err(c, fiber.StatusBadRequest, "aisle required")
		}
		if body.ShelfFrom < 1 {
			body.ShelfFrom = 1
		}
		if body.ShelfTo < body.ShelfFrom {
			body.ShelfTo = body.ShelfFrom
		}
		if body.BinsPerShelf < 1 {
			body.BinsPerShelf = 1
		}
		if body.ShelfTo-body.ShelfFrom > 50 || body.BinsPerShelf > 50 {
			return shared.Err(c, fiber.StatusBadRequest, "bulk range too large")
		}
		levels := body.Levels
		if len(levels) == 0 {
			levels = []string{"low", "upper"}
		}
		locType := body.LocationType
		if locType == "" {
			locType = "storage"
		}

		created := []fiber.Map{}
		for shelf := body.ShelfFrom; shelf <= body.ShelfTo; shelf++ {
			for _, level := range levels {
				for n := 1; n <= body.BinsPerShelf; n++ {
					loc, errMsg := normalizeLocationInput(
						aisle,
						fmt.Sprintf("%02d", shelf),
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
							location_type, max_capacity_qty, allow_mixed_items, disabled, is_occupied
						) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,false,false)
						ON CONFLICT (warehouse_id, code) DO NOTHING
						RETURNING id`,
						loc.Code, wid, aisle, loc.Aisle, loc.Shelf, loc.Number, loc.Shelf, loc.Level, loc.Number,
						loc.LocationType, body.MaxCapacityQty,
					).Scan(&id)
					if err == nil {
						created = append(created, fiber.Map{"id": id, "code": loc.Code})
					}
				}
			}
		}
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
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		_, err = db.Exec(c.Context(), `
			UPDATE warehouse_locations SET
				location_type = COALESCE($2, location_type),
				max_capacity_qty = COALESCE($3, max_capacity_qty),
				allow_mixed_items = COALESCE($4, allow_mixed_items),
				disabled = COALESCE($5, disabled),
				updated_at = now()
			WHERE id=$1`, id, body.LocationType, body.MaxCapacityQty, body.AllowMixedItems, body.Disabled)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id})
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
			Name          string `json:"name"`
			SupplierGroup string `json:"supplier_group"`
			GSTIN         string `json:"gstin"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		if strings.TrimSpace(body.Name) == "" {
			return shared.Err(c, fiber.StatusBadRequest, "name required")
		}
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO suppliers (name, supplier_group, gstin)
			VALUES ($1,$2,$3) RETURNING id`,
			body.Name, nullIfEmpty(body.SupplierGroup), nullIfEmpty(body.GSTIN),
		).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{"id": id, "name": body.Name})
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
		return locNorm{}, "aisle, shelf, and number required"
	}
	if level == "" {
		level = "low"
	}
	if level != "low" && level != "upper" {
		// allow numeric / free levels but normalize common aliases
		if level == "l" {
			level = "low"
		} else if level == "u" || level == "up" || level == "high" {
			level = "upper"
		}
	}
	if locType == "" {
		locType = "storage"
	}
	switch locType {
	case "storage", "pick_face", "staging", "hold", "damaged", "incoming":
	default:
		return locNorm{}, "invalid location_type"
	}
	if code == "" {
		code = fmt.Sprintf("%s-%s-%s-%s", aisle, shelf, strings.ToUpper(level[:1]), number)
		// e.g. A-03-L-12 or A-03-U-12
		lvl := "L"
		if level == "upper" {
			lvl = "U"
		} else if level != "low" {
			lvl = strings.ToUpper(level)
			if len(lvl) > 3 {
				lvl = lvl[:3]
			}
		}
		code = fmt.Sprintf("%s-%s-%s-%s", aisle, shelf, lvl, number)
	}
	return locNorm{Aisle: aisle, Shelf: shelf, Level: level, Number: number, LocationType: locType, Code: code}, ""
}

func normalizePackType(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "packed" {
		return "packed"
	}
	return "loose"
}

func normalizeControlMode(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if v == "bin_controlled" {
		return "bin_controlled"
	}
	return "item_controlled"
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
			       (SELECT COUNT(*) FROM warehouse_locations wl WHERE wl.warehouse_id = warehouses.id) AS location_count
			FROM warehouses ORDER BY name`)
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
		}
		list := []wh{}
		for rows.Next() {
			var w wh
			if err := rows.Scan(&w.ID, &w.Name, &w.Code, &w.WarehouseType, &w.PickingMode,
				&w.Disabled, &w.IsGroup, &w.ParentID, &w.Account, &w.IsRejected, &w.Customer,
				&w.DefaultInTransit, &w.EmailID, &w.PhoneNo, &w.MobileNo,
				&w.AddressLine1, &w.AddressLine2, &w.City, &w.State, &w.Pin, &w.LocationCount); err != nil {
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
			SELECT id, name, supplier_group, gstin, disabled
			FROM suppliers WHERE disabled=false ORDER BY name`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type sup struct {
			ID            int     `json:"id"`
			Name          string  `json:"name"`
			SupplierGroup *string `json:"supplier_group"`
			GSTIN         *string `json:"gstin"`
			Disabled      bool    `json:"disabled"`
		}
		list := []sup{}
		for rows.Next() {
			var s sup
			if err := rows.Scan(&s.ID, &s.Name, &s.SupplierGroup, &s.GSTIN, &s.Disabled); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		return shared.OK(c, list)
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
