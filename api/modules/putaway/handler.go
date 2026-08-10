package putaway

import (
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the putaway routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Post("/", createLog(db))
	r.Get("/rules", listRulesAlias(db))
	r.Get("/suggest", suggest(db))
	r.Get("/queue", queue(db))
}

func listRulesAlias(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, item_code, warehouse, priority, stock_capacity
			FROM putaway_rules WHERE active=true ORDER BY item_code, priority`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()
		type rule struct {
			ID            int     `json:"id"`
			ItemCode      string  `json:"item_code"`
			Warehouse     string  `json:"warehouse"`
			Priority      int     `json:"priority"`
			StockCapacity float64 `json:"stock_capacity"`
		}
		list := []rule{}
		for rows.Next() {
			var r rule
			if err := rows.Scan(&r.ID, &r.ItemCode, &r.Warehouse, &r.Priority, &r.StockCapacity); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func suggest(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		itemCode := strings.TrimSpace(c.Query("item_code"))
		qty, _ := strconv.ParseFloat(c.Query("qty", "1"), 64)
		warehouseID, _ := strconv.Atoi(c.Query("warehouse_id"))
		if itemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}
		if qty <= 0 {
			qty = 1
		}

		var controlMode string
		var homeID *int
		var masterComplete bool
		err := db.QueryRow(c.Context(), `
			SELECT COALESCE(control_mode,'item_controlled'), home_location_id, COALESCE(master_complete,false)
			FROM items WHERE code=$1 AND disabled=false`, itemCode).
			Scan(&controlMode, &homeID, &masterComplete)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusConflict, "item not in master — complete item master first")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if !masterComplete {
			return shared.Err(c, fiber.StatusConflict, "item master incomplete — complete required fields before putaway")
		}

		type suggestion struct {
			LocationID   int      `json:"location_id"`
			LocationCode string   `json:"location_code"`
			WarehouseID  int      `json:"warehouse_id"`
			Reason       string   `json:"reason"`
			FreeCapacity *float64 `json:"free_capacity"`
			OnHandQty    float64  `json:"on_hand_qty"`
		}

		// 1) bin_controlled home location with capacity
		if controlMode == "bin_controlled" && homeID != nil {
			var s suggestion
			var maxCap *float64
			err := db.QueryRow(c.Context(), `
				SELECT wl.id, wl.code, wl.warehouse_id, wl.max_capacity_qty,
				       COALESCE((SELECT SUM(actual_qty) FROM stock_location_balances WHERE location_id=wl.id),0)
				FROM warehouse_locations wl
				WHERE wl.id=$1 AND COALESCE(wl.disabled,false)=false
				  AND wl.location_type IN ('storage','pick_face')`, *homeID).
				Scan(&s.LocationID, &s.LocationCode, &s.WarehouseID, &maxCap, &s.OnHandQty)
			if err == nil {
				ok := true
				if maxCap != nil {
					free := *maxCap - s.OnHandQty
					s.FreeCapacity = &free
					if free < qty {
						ok = false
					}
				}
				if warehouseID > 0 && s.WarehouseID != warehouseID {
					ok = false
				}
				if ok {
					s.Reason = "home_location"
					return shared.OK(c, s)
				}
			}
		}

		// 2) existing bins holding same item
		args := []any{itemCode, qty}
		sql := `
			SELECT wl.id, wl.code, wl.warehouse_id, wl.max_capacity_qty,
			       COALESCE(SUM(slb.actual_qty),0) AS on_hand
			FROM warehouse_locations wl
			JOIN stock_location_balances slb ON slb.location_id = wl.id
			WHERE slb.item_code=$1
			  AND COALESCE(wl.disabled,false)=false
			  AND wl.location_type IN ('storage','pick_face')
			  AND (wl.max_capacity_qty IS NULL OR wl.max_capacity_qty - COALESCE((
			        SELECT SUM(actual_qty) FROM stock_location_balances WHERE location_id=wl.id
			      ),0) >= $2)`
		if warehouseID > 0 {
			sql += ` AND wl.warehouse_id=$3`
			args = append(args, warehouseID)
		}
		sql += `
			GROUP BY wl.id, wl.code, wl.warehouse_id, wl.max_capacity_qty
			ORDER BY on_hand DESC
			LIMIT 1`

		var s suggestion
		var maxCap *float64
		err = db.QueryRow(c.Context(), sql, args...).Scan(&s.LocationID, &s.LocationCode, &s.WarehouseID, &maxCap, &s.OnHandQty)
		if err == nil {
			if maxCap != nil {
				free := *maxCap - s.OnHandQty
				s.FreeCapacity = &free
			}
			s.Reason = "consolidate_same_item"
			return shared.OK(c, s)
		}

		// 3) empty storage location
		args = []any{}
		sql = `
			SELECT wl.id, wl.code, wl.warehouse_id, wl.max_capacity_qty
			FROM warehouse_locations wl
			WHERE COALESCE(wl.disabled,false)=false
			  AND wl.location_type IN ('storage','pick_face')
			  AND NOT EXISTS (
			    SELECT 1 FROM stock_location_balances slb
			    WHERE slb.location_id = wl.id AND slb.actual_qty <> 0
			  )`
		if warehouseID > 0 {
			sql += ` AND wl.warehouse_id=$1`
			args = append(args, warehouseID)
		}
		sql += ` ORDER BY wl.code LIMIT 1`

		err = db.QueryRow(c.Context(), sql, args...).Scan(&s.LocationID, &s.LocationCode, &s.WarehouseID, &maxCap)
		if err == nil {
			s.OnHandQty = 0
			if maxCap != nil {
				s.FreeCapacity = maxCap
			}
			s.Reason = "empty_location"
			return shared.OK(c, s)
		}

		return shared.Err(c, fiber.StatusNotFound, "no suitable location — check capacity or create bins")
	}
}

func queue(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Pending = incoming/hold balances not yet moved to storage.
		rows, err := db.Query(c.Context(), `
			SELECT slb.id, slb.item_code, i.name, slb.warehouse_id, w.code, wl.id, wl.code,
			       COALESCE(slb.batch_no,''), slb.actual_qty, wl.location_type
			FROM stock_location_balances slb
			JOIN warehouse_locations wl ON wl.id = slb.location_id
			JOIN warehouses w ON w.id = slb.warehouse_id
			LEFT JOIN items i ON i.code = slb.item_code
			WHERE slb.actual_qty > 0 AND wl.location_type IN ('incoming','hold','staging')
			ORDER BY slb.updated_at ASC`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			ID            int     `json:"id"`
			ItemCode      string  `json:"item_code"`
			ItemName      *string `json:"item_name"`
			WarehouseID   int     `json:"warehouse_id"`
			WarehouseCode string  `json:"warehouse_code"`
			LocationID    int     `json:"location_id"`
			LocationCode  string  `json:"location_code"`
			BatchNo       string  `json:"batch_no"`
			Qty           float64 `json:"qty"`
			LocationType  string  `json:"location_type"`
		}
		list := []row{}
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ID, &r.ItemCode, &r.ItemName, &r.WarehouseID, &r.WarehouseCode,
				&r.LocationID, &r.LocationCode, &r.BatchNo, &r.Qty, &r.LocationType); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func createLog(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			GRNLineID       int     `json:"grn_line_id"`
			ItemCode        string  `json:"item_code"`
			BatchNo         string  `json:"batch_no"`
			SourceWarehouse string  `json:"source_warehouse"`
			SourceLocation  string  `json:"source_location"`
			TargetLocation  string  `json:"target_location"`
			TargetLocationID int    `json:"target_location_id"`
			WarehouseID     int     `json:"warehouse_id"`
			Quantity        float64 `json:"quantity"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.ItemCode = strings.TrimSpace(body.ItemCode)
		if body.ItemCode == "" || (body.TargetLocation == "" && body.TargetLocationID == 0) {
			return shared.Err(c, fiber.StatusBadRequest, "item_code and target_location required")
		}
		if body.Quantity <= 0 {
			return shared.Err(c, fiber.StatusBadRequest, "quantity must be > 0")
		}

		var complete bool
		err := db.QueryRow(c.Context(), `
			SELECT COALESCE(master_complete,false) FROM items WHERE code=$1`, body.ItemCode).Scan(&complete)
		if err == pgx.ErrNoRows {
			return shared.Err(c, fiber.StatusConflict, "item not in master — complete item master first")
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if !complete {
			return shared.Err(c, fiber.StatusConflict, "item master incomplete")
		}

		tx, err := db.Begin(c.Context())
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer tx.Rollback(c.Context())

		var targetID, warehouseID int
		var targetCode string
		if body.TargetLocationID > 0 {
			err = tx.QueryRow(c.Context(), `
				SELECT id, code, warehouse_id FROM warehouse_locations
				WHERE id=$1 AND COALESCE(disabled,false)=false`, body.TargetLocationID).
				Scan(&targetID, &targetCode, &warehouseID)
		} else {
			err = tx.QueryRow(c.Context(), `
				SELECT id, code, warehouse_id FROM warehouse_locations
				WHERE code=$1 AND COALESCE(disabled,false)=false
				  AND ($2=0 OR warehouse_id=$2)
				ORDER BY id LIMIT 1`, body.TargetLocation, body.WarehouseID).
				Scan(&targetID, &targetCode, &warehouseID)
		}
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "target location not found")
		}

		batch := strings.TrimSpace(body.BatchNo)

		// Decrease source incoming/hold if specified or default incoming for warehouse.
		var sourceID *int
		if body.SourceLocation != "" {
			var sid int
			if err := tx.QueryRow(c.Context(), `
				SELECT id FROM warehouse_locations WHERE code=$1 AND warehouse_id=$2`,
				body.SourceLocation, warehouseID).Scan(&sid); err == nil {
				sourceID = &sid
			}
		}
		if sourceID == nil {
			var sid int
			if err := tx.QueryRow(c.Context(), `
				SELECT id FROM warehouse_locations
				WHERE warehouse_id=$1 AND location_type IN ('incoming','hold','staging')
				ORDER BY CASE location_type WHEN 'incoming' THEN 0 WHEN 'staging' THEN 1 ELSE 2 END, id
				LIMIT 1`, warehouseID).Scan(&sid); err == nil {
				sourceID = &sid
			}
		}
		if sourceID != nil {
			_, _ = tx.Exec(c.Context(), `
				UPDATE stock_location_balances
				SET actual_qty = GREATEST(actual_qty - $1, 0), updated_at=now()
				WHERE location_id=$2 AND item_code=$3 AND COALESCE(batch_no,'')=COALESCE($4,'')`,
				body.Quantity, *sourceID, body.ItemCode, nullBatch(batch))
		}

		// Increase target location balance (manual upsert — expression unique index).
		var existingID int
		qerr := tx.QueryRow(c.Context(), `
			SELECT id FROM stock_location_balances
			WHERE item_code=$1 AND location_id=$2 AND COALESCE(batch_no,'')=COALESCE($3,'')`,
			body.ItemCode, targetID, nullBatch(batch)).Scan(&existingID)
		if qerr == pgx.ErrNoRows {
			_, err = tx.Exec(c.Context(), `
				INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty)
				VALUES ($1,$2,$3,$4,$5,0)`,
				body.ItemCode, warehouseID, targetID, nullBatch(batch), body.Quantity)
		} else if qerr == nil {
			_, err = tx.Exec(c.Context(), `
				UPDATE stock_location_balances SET actual_qty = actual_qty + $1, updated_at=now() WHERE id=$2`,
				body.Quantity, existingID)
		} else {
			err = qerr
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		_, _ = tx.Exec(c.Context(), `
			UPDATE warehouse_locations SET is_occupied=true, current_item=$2, updated_at=now() WHERE id=$1`,
			targetID, body.ItemCode)

		var grnLineID any
		if body.GRNLineID != 0 {
			grnLineID = body.GRNLineID
		}

		var id int
		var logNo string
		err = tx.QueryRow(c.Context(),
			`INSERT INTO putaway_logs (log_no,grn_line_id,item_code,batch_no,source_warehouse,target_location,quantity,placed_at,placed_by)
			 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,$5,$6,NOW(),$7)
			 RETURNING id, log_no`,
			grnLineID, body.ItemCode, nullBatch(batch), body.SourceWarehouse,
			targetCode, body.Quantity, userID(c)).Scan(&id, &logNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": id, "log_no": logNo,
			"target_location": targetCode, "target_location_id": targetID,
			"warehouse_id": warehouseID,
		})
	}
}

func nullBatch(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func userID(c *fiber.Ctx) int {
	if v, ok := c.Locals("user_id").(int); ok {
		return v
	}
	return 0
}
