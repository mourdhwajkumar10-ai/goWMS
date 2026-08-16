package putaway

import (
	"fmt"
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
	r.Post("/fit-exception", recordFitException(db))
	r.Get("/rules", listRulesAlias(db))
	r.Get("/suggest", suggest(db))
	r.Get("/queue", queue(db))
	r.Post("/sessions", createSession(db))
	r.Get("/sessions/:id", getSession(db))
	r.Delete("/sessions/:id", cancelSession(db))
	r.Post("/sessions/:id/heartbeat", sessionHeartbeat(db))
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
		prefAisle := strings.TrimSpace(strings.ToUpper(c.Query("preferred_aisle")))
		prefBay := strings.TrimSpace(c.Query("preferred_bay"))
		if prefBay == "" {
			prefBay = strings.TrimSpace(c.Query("preferred_shelf"))
		}
		excludeIDs := parseIDList(c.Query("exclude_location_ids"))
		if itemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}
		if qty <= 0 {
			qty = 1
		}

		var controlMode string
		var homeID *int
		err := db.QueryRow(c.Context(), `
			SELECT COALESCE(control_mode,'item_controlled'), home_location_id
			FROM items WHERE UPPER(code)=UPPER($1) AND disabled=false`, itemCode).
			Scan(&controlMode, &homeID)
		if err == pgx.ErrNoRows {
			shared.EnsureItemStub(c.Context(), db, itemCode)
			controlMode = "item_controlled"
			err = nil
		}
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var velocityTier string
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(velocity_tier,'medium')
			FROM items WHERE UPPER(code)=UPPER($1) AND disabled=false`, itemCode).Scan(&velocityTier)

		if warehouseID < 1 {
			if wid, werr := shared.EnsureDefaultWarehouse(c.Context(), db); werr == nil {
				warehouseID = wid
			}
		} else {
			_ = shared.EnsureDefaultPickBins(c.Context(), db, warehouseID)
		}

		if prefAisle == "" || prefBay == "" {
			if homeID != nil {
				var a, s string
				if db.QueryRow(c.Context(), `
					SELECT COALESCE(aisle,''), COALESCE(shelf, COALESCE(rack,''))
					FROM warehouse_locations WHERE id=$1`, *homeID).Scan(&a, &s) == nil {
					if prefAisle == "" {
						prefAisle = strings.ToUpper(a)
					}
					if prefBay == "" {
						prefBay = s
					}
				}
			}
		}
		if prefAisle == "" || prefBay == "" {
			var a, s string
			_ = db.QueryRow(c.Context(), `
				SELECT COALESCE(wl.aisle,''), COALESCE(wl.shelf, COALESCE(wl.rack,''))
				FROM stock_location_balances slb
				JOIN warehouse_locations wl ON wl.id = slb.location_id
				WHERE slb.item_code=$1 AND slb.actual_qty > 0
				  AND wl.location_type IN ('pick_face','storage')
				  AND ($2=0 OR wl.warehouse_id=$2)
				ORDER BY CASE WHEN wl.location_type='pick_face' THEN 0 ELSE 1 END, slb.updated_at DESC
				LIMIT 1`, itemCode, warehouseID).Scan(&a, &s)
			if prefAisle == "" {
				prefAisle = strings.ToUpper(a)
			}
			if prefBay == "" {
				prefBay = s
			}
		}

		rule, _ := shared.LoadWarehousePutawayRule(c.Context(), db, itemCode, warehouseID)
		if rule != nil && rule.StockCapacity > 0 && rule.Remaining <= 0 {
			return shared.Err(c, fiber.StatusConflict,
				fmt.Sprintf("putaway rule cap %.0f reached for this item in %s — raise the rule or putaway less",
					rule.StockCapacity, rule.Warehouse))
		}

		type cand struct {
			LocationID   int      `json:"location_id"`
			LocationCode string   `json:"location_code"`
			WarehouseID  int      `json:"warehouse_id"`
			Reason       string   `json:"reason"`
			FreeCapacity *float64 `json:"free_capacity"`
			OnHandQty    float64  `json:"on_hand_qty"`
			Aisle        string   `json:"aisle"`
			Bay          string   `json:"bay"`
			Level        string   `json:"level"`
			LocationType string   `json:"location_type"`
			SameBay      bool     `json:"same_bay"`
			Zone         string   `json:"zone"`
		}

		joins := `
				LEFT JOIN LATERAL (
				  SELECT MIN(v) AS item_bin_cap
				  FROM (
				    SELECT ibc.max_qty FROM item_bin_capacities ibc
				     WHERE ibc.location_id = wl.id AND UPPER(ibc.item_code)=UPPER($2)
				    UNION ALL
				    SELECT i.max_qty_per_bin FROM items i
				     WHERE UPPER(i.code)=UPPER($2) AND COALESCE(i.disabled,false)=false
				    UNION ALL
				    SELECT wl.max_capacity_qty
				  ) s(v)
				  WHERE v IS NOT NULL AND v > 0
				) cap ON true
				LEFT JOIN LATERAL (
				  SELECT COALESCE(SUM(actual_qty),0) AS on_hand
				  FROM stock_location_balances slb
				  WHERE slb.location_id = wl.id AND UPPER(slb.item_code)=UPPER($2)
				) oh ON true`
		mixedOK := `
				  AND (
				    COALESCE(wl.allow_mixed_items, true) = true
				    OR NOT EXISTS (
				      SELECT 1 FROM stock_location_balances o
				      WHERE o.location_id = wl.id AND o.actual_qty <> 0
				        AND UPPER(o.item_code) <> UPPER($2)
				    )
				  )`
		fits := ` AND (cap.item_bin_cap IS NULL OR cap.item_bin_cap - COALESCE(oh.on_hand,0) >= $1)`
		zoneSQL := func(zone string) string {
			if zone == "pick_face" {
				return ` AND (
					wl.location_type = 'pick_face'
					OR (wl.location_type = 'storage' AND (
						(wl.level ~ '^[0-9]+$' AND wl.level::int BETWEEN 1 AND 4)
						OR lower(wl.level) IN ('01','02','03','04','lower','low','l','bottom','middle','mid','m')
					))
				)`
			}
			return ` AND (
					wl.location_type = 'storage'
					OR (wl.location_type = 'pick_face' AND wl.level ~ '^[0-9]+$' AND wl.level::int >= 5)
				)
				AND NOT (wl.level ~ '^[0-9]+$' AND wl.level::int BETWEEN 1 AND 4)`
		}

		scanRows := func(sql string, args []any, reason, zone string) []cand {
			rows, err := db.Query(c.Context(), sql, args...)
			if err != nil {
				return nil
			}
			defer rows.Close()
			out := []cand{}
			for rows.Next() {
				var s cand
				var cap *float64
				if rows.Scan(&s.LocationID, &s.LocationCode, &s.WarehouseID, &cap, &s.OnHandQty,
					&s.Aisle, &s.Bay, &s.Level, &s.LocationType) != nil {
					continue
				}
				if cap != nil {
					free := *cap - s.OnHandQty
					s.FreeCapacity = &free
				}
				s.Zone = zone
				s.SameBay = prefAisle != "" && strings.EqualFold(s.Aisle, prefAisle) && s.Bay == prefBay
				s.Reason = reason
				out = append(out, s)
			}
			return out
		}

		selectSQL := `
				SELECT wl.id, wl.code, wl.warehouse_id, cap.item_bin_cap, COALESCE(oh.on_hand,0),
				       COALESCE(wl.aisle,''), COALESCE(wl.shelf, COALESCE(wl.rack,'')), COALESCE(wl.level,''),
				       COALESCE(wl.location_type,'storage')
				FROM warehouse_locations wl` + joins + `
				WHERE COALESCE(wl.disabled,false)=false` + mixedOK + fits

		skipShelfFilter := false

		load := func(reason, zone string, sameBayOnly, emptyOnly bool, onlyID int, limit int) []cand {
			args := []any{qty, itemCode}
			sql := selectSQL
			n := 2
			if warehouseID > 0 {
				n++
				sql += fmt.Sprintf(` AND wl.warehouse_id=$%d`, n)
				args = append(args, warehouseID)
			}
			sql += zoneSQL(zone)
			if !skipShelfFilter {
				band := velocityShelfBand(velocityTier)
				sf := shelfBandFilter(band)
				if sf != "" {
					sql += sf
				}
			}
			if emptyOnly {
				sql += ` AND NOT EXISTS (
					SELECT 1 FROM stock_location_balances slb
					WHERE slb.location_id = wl.id AND slb.actual_qty <> 0)`
			} else if reason == "consolidate_same_item" {
				sql += ` AND COALESCE(oh.on_hand,0) > 0`
			}
			if onlyID > 0 {
				n++
				sql += fmt.Sprintf(` AND wl.id=$%d`, n)
				args = append(args, onlyID)
			}
			if sameBayOnly && prefAisle != "" && prefBay != "" {
				n++
				sql += fmt.Sprintf(` AND upper(wl.aisle)=upper($%d)`, n)
				args = append(args, prefAisle)
				n++
				sql += fmt.Sprintf(` AND wl.shelf=$%d`, n)
				args = append(args, prefBay)
			}
			if len(excludeIDs) > 0 {
				ids := make([]string, len(excludeIDs))
				for i, id := range excludeIDs {
					ids[i] = strconv.Itoa(id)
				}
				sql += ` AND wl.id NOT IN (` + strings.Join(ids, ",") + `)`
			}
			sql += ` ORDER BY
				CASE WHEN wl.level ~ '^[0-9]+$' THEN wl.level::int ELSE 99 END ASC,
				COALESCE(wl.putaway_priority,5) ASC,
				wl.code
				LIMIT ` + strconv.Itoa(limit)
			return scanRows(sql, args, reason, zone)
		}

		candidates := []cand{}
		if controlMode == "bin_controlled" && homeID != nil {
			home := load("home_bin", "pick_face", false, false, *homeID, 1)
			if len(home) == 0 {
				home = load("home_bin", "storage", false, false, *homeID, 1)
			}
			candidates = append(candidates, home...)
		}
		candidates = append(candidates, load("consolidate_same_item", "pick_face", true, false, 0, 20)...)
		candidates = append(candidates, load("consolidate_same_item", "pick_face", false, false, 0, 20)...)
		candidates = append(candidates, load("consolidate_same_item", "storage", true, false, 0, 20)...)
		candidates = append(candidates, load("consolidate_same_item", "storage", false, false, 0, 20)...)
		candidates = append(candidates, load("empty_pick_face_dedicated_bay", "pick_face", true, true, 0, 20)...)
		candidates = append(candidates, load("empty_pick_face", "pick_face", false, true, 0, 20)...)
		candidates = append(candidates, load("empty_storage_dedicated_bay", "storage", true, true, 0, 20)...)
		candidates = append(candidates, load("empty_storage", "storage", false, true, 0, 20)...)

		seen := map[int]bool{}
		uniq := []cand{}
		for _, cnd := range candidates {
			if seen[cnd.LocationID] {
				continue
			}
			seen[cnd.LocationID] = true
			uniq = append(uniq, cnd)
		}
		candidates = uniq

		// Retry without shelf filter if no candidates found with band filter
		if len(candidates) == 0 && shelfBandFilter(velocityShelfBand(velocityTier)) != "" {
			skipShelfFilter = true
			candidates = load("consolidate_same_item", "pick_face", true, false, 0, 20)
			candidates = append(candidates, load("consolidate_same_item", "pick_face", false, false, 0, 20)...)
			candidates = append(candidates, load("consolidate_same_item", "storage", true, false, 0, 20)...)
			candidates = append(candidates, load("consolidate_same_item", "storage", false, false, 0, 20)...)
			candidates = append(candidates, load("empty_pick_face_dedicated_bay", "pick_face", true, true, 0, 20)...)
			candidates = append(candidates, load("empty_pick_face", "pick_face", false, true, 0, 20)...)
			candidates = append(candidates, load("empty_storage_dedicated_bay", "storage", true, true, 0, 20)...)
			candidates = append(candidates, load("empty_storage", "storage", false, true, 0, 20)...)
			seen2 := map[int]bool{}
			uniq2 := []cand{}
			for _, cnd := range candidates {
				if seen2[cnd.LocationID] {
					continue
				}
				seen2[cnd.LocationID] = true
				uniq2 = append(uniq2, cnd)
			}
			candidates = uniq2
		}

		if len(candidates) == 0 {
			return shared.Err(c, fiber.StatusNotFound,
				"no home, same-item, or empty pick/storage bin with capacity — free a location or raise max qty per bin")
		}

		best := candidates[0]
		out := fiber.Map{
			"location_id": best.LocationID, "location_code": best.LocationCode,
			"warehouse_id": best.WarehouseID, "reason": best.Reason,
			"free_capacity": best.FreeCapacity, "on_hand_qty": best.OnHandQty,
			"aisle": best.Aisle, "bay": best.Bay, "level": best.Level,
			"location_type": best.LocationType, "zone": best.Zone, "same_bay": best.SameBay,
			"preferred_aisle": prefAisle, "preferred_bay": prefBay,
			"control_mode": controlMode,
			"velocity_tier": velocityTier,
			"shelf_band":    velocityShelfBand(velocityTier),
			"strategy":      []string{"home_bin", "consolidate_same_item", "empty_pick_face", "empty_storage"},
			"candidates":    candidates,
		}
		if homeID != nil {
			out["home_location_id"] = *homeID
		}
		if rule != nil {
			out["putaway_rule"] = fiber.Map{
				"id": rule.ID, "warehouse": rule.Warehouse, "priority": rule.Priority,
				"stock_capacity": rule.StockCapacity, "current_qty": rule.CurrentQty, "remaining": rule.Remaining,
			}
		}
		return shared.OK(c, out)
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
			GRNLineID        int     `json:"grn_line_id"`
			ItemCode         string  `json:"item_code"`
			BatchNo          string  `json:"batch_no"`
			SourceWarehouse  string  `json:"source_warehouse"`
			SourceLocation   string  `json:"source_location"`
			SourceLocationID int     `json:"source_location_id"`
			TargetLocation   string  `json:"target_location"`
			TargetLocationID int     `json:"target_location_id"`
			WarehouseID      int     `json:"warehouse_id"`
			Quantity         float64 `json:"quantity"`
			ExceptionReason  string  `json:"exception_reason"`
			IsOverride       bool    `json:"is_override"`
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
		if body.SourceLocationID == 0 && strings.TrimSpace(body.SourceLocation) == "" && strings.TrimSpace(body.SourceWarehouse) == "" {
			return shared.Err(c, fiber.StatusBadRequest, "source_location_id or source_location required")
		}

		shared.EnsureItemStub(c.Context(), db, body.ItemCode)

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

		// Resolve source location — never silently invent one when caller sent an id.
		var sourceID *int
		if body.SourceLocationID > 0 {
			var sid, sWh int
			if err := tx.QueryRow(c.Context(), `
				SELECT id, warehouse_id FROM warehouse_locations WHERE id=$1`, body.SourceLocationID).
				Scan(&sid, &sWh); err != nil {
				return shared.Err(c, fiber.StatusBadRequest, "source location not found")
			}
			if warehouseID > 0 && sWh != warehouseID {
				return shared.Err(c, fiber.StatusBadRequest, "source and target warehouses differ")
			}
			sourceID = &sid
		} else {
			srcCode := strings.TrimSpace(body.SourceLocation)
			if srcCode == "" {
				srcCode = strings.TrimSpace(body.SourceWarehouse)
			}
			if srcCode != "" {
				var sid int
				if err := tx.QueryRow(c.Context(), `
					SELECT id FROM warehouse_locations WHERE code=$1 AND warehouse_id=$2`,
					srcCode, warehouseID).Scan(&sid); err != nil {
					return shared.Err(c, fiber.StatusBadRequest, "source location not found")
				}
				sourceID = &sid
			}
		}
		if sourceID == nil {
			return shared.Err(c, fiber.StatusBadRequest, "source_location_id or source_location required")
		}

		var avail float64
		_ = tx.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(actual_qty - reserved_qty),0) FROM stock_location_balances
			WHERE location_id=$1 AND item_code=$2 AND COALESCE(batch_no,'')=COALESCE($3,'')`,
			*sourceID, body.ItemCode, nullBatch(batch)).Scan(&avail)
		if avail < body.Quantity {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("insufficient stock at source (available %.0f, requested %.0f)", avail, body.Quantity))
		}

		if err := shared.RejectMixedPutaway(c.Context(), tx, body.ItemCode, targetID); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}
		rule, _ := shared.LoadWarehousePutawayRule(c.Context(), db, body.ItemCode, warehouseID)
		if err := shared.RejectWarehouseRule(rule, body.Quantity); err != nil {
			return shared.Err(c, fiber.StatusBadRequest, err.Error())
		}

		var onHand float64
		_ = tx.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
			WHERE location_id=$1 AND UPPER(item_code)=UPPER($2)`,
			targetID, body.ItemCode).Scan(&onHand)
		cap, _ := shared.ItemBinCapacity(c.Context(), tx, body.ItemCode, targetID)
		if cap != nil && onHand+body.Quantity > *cap+1e-9 {
			return shared.Err(c, fiber.StatusBadRequest,
				fmt.Sprintf("bin holds max %.0f of this item (already %.0f, trying to add %.0f) — split or pick another location",
					*cap, onHand, body.Quantity))
		}

		_, _ = tx.Exec(c.Context(), `
			UPDATE stock_location_balances
			SET actual_qty = GREATEST(actual_qty - $1, 0), updated_at=now()
			WHERE location_id=$2 AND item_code=$3 AND COALESCE(batch_no,'')=COALESCE($4,'')`,
			body.Quantity, *sourceID, body.ItemCode, nullBatch(batch))

		// Increase target location balance (manual upsert — expression unique index).
		var existingID int
		qerr := tx.QueryRow(c.Context(), `
			SELECT id FROM stock_location_balances
			WHERE item_code=$1 AND location_id=$2 AND COALESCE(batch_no,'')=COALESCE($3,'')`,
			body.ItemCode, targetID, nullBatch(batch)).Scan(&existingID)
		if qerr == pgx.ErrNoRows {
			_, err = tx.Exec(c.Context(), `
				INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty, allocation_status)
				VALUES ($1,$2,$3,$4,$5,0,'allocatable')`,
				body.ItemCode, warehouseID, targetID, nullBatch(batch), body.Quantity)
			if err != nil {
				_, err = tx.Exec(c.Context(), `
					INSERT INTO stock_location_balances (item_code, warehouse_id, location_id, batch_no, actual_qty, reserved_qty)
					VALUES ($1,$2,$3,$4,$5,0)`,
					body.ItemCode, warehouseID, targetID, nullBatch(batch), body.Quantity)
			}
		} else if qerr == nil {
			_, err = tx.Exec(c.Context(), `
				UPDATE stock_location_balances
				SET actual_qty = actual_qty + $1, allocation_status='allocatable', updated_at=now() WHERE id=$2`,
				body.Quantity, existingID)
			if err != nil {
				_, err = tx.Exec(c.Context(), `
					UPDATE stock_location_balances SET actual_qty = actual_qty + $1, updated_at=now() WHERE id=$2`,
					body.Quantity, existingID)
			}
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
		reason := strings.TrimSpace(body.ExceptionReason)
		err = tx.QueryRow(c.Context(),
			`INSERT INTO putaway_logs (log_no,grn_line_id,item_code,batch_no,source_warehouse,target_location,quantity,placed_at,placed_by,exception_reason,is_override)
			 VALUES ('PA-'||TO_CHAR(NOW(),'YYYY')||'-'||LPAD(nextval('putaway_logs_id_seq')::TEXT,5,'0'),$1,$2,$3,$4,$5,$6,NOW(),$7,NULLIF($8,''),$9)
			 RETURNING id, log_no`,
			grnLineID, body.ItemCode, nullBatch(batch), body.SourceWarehouse,
			targetCode, body.Quantity, userID(c), reason, body.IsOverride).Scan(&id, &logNo)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}

		var remaining float64
		_ = tx.QueryRow(c.Context(), `
			SELECT COALESCE(SUM(actual_qty),0) FROM stock_location_balances
			WHERE location_id=$1 AND item_code=$2 AND COALESCE(batch_no,'')=COALESCE($3,'')`,
			*sourceID, body.ItemCode, nullBatch(batch)).Scan(&remaining)

		if err := tx.Commit(c.Context()); err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		return shared.OK(c, fiber.Map{
			"id": id, "log_no": logNo,
			"target_location": targetCode, "target_location_id": targetID,
			"warehouse_id": warehouseID, "quantity": body.Quantity,
			"remaining_source_qty": remaining,
		})
	}
}

func recordFitException(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			ItemCode           string  `json:"item_code"`
			RejectedLocation   string  `json:"rejected_location"`
			RejectedLocationID int     `json:"rejected_location_id"`
			Reason             string  `json:"reason"`
			RequestedQty       float64 `json:"requested_qty"`
			FitsQty            float64 `json:"fits_qty"`
			OverrideLocation   string  `json:"override_location"`
			Notes              string  `json:"notes"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		body.ItemCode = strings.TrimSpace(body.ItemCode)
		body.Reason = strings.TrimSpace(strings.ToLower(body.Reason))
		if body.ItemCode == "" {
			return shared.Err(c, fiber.StatusBadRequest, "item_code required")
		}
		if body.Reason != "too_small" && body.Reason != "too_large" {
			return shared.Err(c, fiber.StatusBadRequest, "reason must be too_small or too_large")
		}
		var id int
		err := db.QueryRow(c.Context(), `
			INSERT INTO putaway_exceptions (item_code, rejected_location, rejected_location_id, reason, requested_qty, fits_qty, override_location, notes, created_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
			body.ItemCode, nullStr(body.RejectedLocation), nullInt(body.RejectedLocationID),
			body.Reason, body.RequestedQty, nullFloat(body.FitsQty),
			nullStr(body.OverrideLocation), nullStr(body.Notes), userID(c)).Scan(&id)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		if body.FitsQty > 0 && body.RejectedLocationID > 0 {
			_, _ = db.Exec(c.Context(), `
				INSERT INTO item_bin_capacities (item_code, location_id, max_qty, updated_at)
				VALUES ($1,$2,$3,now())
				ON CONFLICT (item_code, location_id)
				DO UPDATE SET max_qty=EXCLUDED.max_qty, updated_at=now()`,
				body.ItemCode, body.RejectedLocationID, body.FitsQty)
		}
		return shared.OK(c, fiber.Map{"id": id, "reason": body.Reason})
	}
}

func parseIDList(s string) []int {
	out := []int{}
	for _, p := range strings.Split(s, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err == nil && n > 0 {
			out = append(out, n)
		}
	}
	return out
}

func nullStr(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return strings.TrimSpace(s)
}

func nullInt(n int) any {
	if n <= 0 {
		return nil
	}
	return n
}

func nullFloat(n float64) any {
	if n <= 0 {
		return nil
	}
	return n
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
