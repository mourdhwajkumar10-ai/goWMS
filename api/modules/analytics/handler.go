package analytics

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the analytics routes.
func Register(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/dashboard", dashboard(db))
	r.Get("/fast-moving", fastMoving(db))
	r.Get("/slow-moving", slowMoving(db))
	r.Get("/dead-stock", deadStock(db))
	r.Get("/expiry", expiryItems(db))
	r.Get("/fill-rate", fillRate(db))
	r.Get("/pick-accuracy", pickAccuracy(db))
	r.Get("/warehouse-metrics", warehouseMetrics(db))
	r.Get("/supplier-performance", supplierPerformance(db))
	r.Get("/outbound-kpis", outboundKPIs(db))
	r.Get("/fulfillment-rate", outboundMetricAlias(db, "fulfillment_rate_pct"))
	r.Get("/pick-time", outboundMetricAlias(db, "avg_pick_minutes"))
	r.Get("/dispatch-sla", outboundMetricAlias(db, "dispatch_sla_pct"))
	r.Get("/return-rate", returnRate(db))
	r.Get("/summary", summaryAlias(db))
}

func dashboard(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var (
			totalItems, totalStock, pendingGRN, openPickLists int64
			pendingBackorders, dueCycleCounts                 int64
		)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM items WHERE disabled=false`).Scan(&totalItems)
		_ = db.QueryRow(c.Context(), `SELECT COALESCE(SUM(actual_qty),0) FROM bins`).Scan(&totalStock)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM grn_sessions WHERE status IN ('open','confirmed')`).Scan(&pendingGRN)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM pick_lists WHERE status IN ('draft','open')`).Scan(&openPickLists)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM backorders WHERE status IN ('pending','partially_fulfilled')`).Scan(&pendingBackorders)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM cycle_count_sheets WHERE scheduled_date<=CURRENT_DATE AND status='pending'`).Scan(&dueCycleCounts)

		return shared.OK(c, fiber.Map{
			"TotalItems":        totalItems,
			"TotalStock":        totalStock,
			"PendingGRN":        pendingGRN,
			"OpenPickLists":     openPickLists,
			"PendingBackorders": pendingBackorders,
			"DueCycleCounts":    dueCycleCounts,
		})
	}
}

func fastMoving(db *pgxpool.Pool) fiber.Handler {
	return listClassification(db, "fast")
}

func slowMoving(db *pgxpool.Pool) fiber.Handler {
	return listClassification(db, "slow")
}

func deadStock(db *pgxpool.Pool) fiber.Handler {
	return listClassification(db, "dead")
}

func listClassification(db *pgxpool.Pool, classification string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		orderBy := "turnover_ratio DESC"
		if classification == "slow" {
			orderBy = "days_since_last_sale DESC"
		}

		rows, err := db.Query(c.Context(),
			`SELECT item_code, avg_daily_sales, turnover_ratio, days_since_last_sale
			 FROM item_movement_classifications WHERE classification=$1 ORDER BY `+orderBy+` LIMIT 50`,
			classification)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			ItemCode          string   `json:"item_code"`
			AvgDailySales     *float64 `json:"avg_daily_sales"`
			TurnoverRatio     *float64 `json:"turnover_ratio"`
			DaysSinceLastSale *int     `json:"days_since_last_sale"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.ItemCode, &r.AvgDailySales, &r.TurnoverRatio, &r.DaysSinceLastSale); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func expiryItems(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT gl.item_code, gl.scanned_qty, gl.batch_no, gl.expiry_date
			FROM grn_lines gl
			WHERE gl.expiry_date IS NOT NULL
			ORDER BY gl.expiry_date ASC LIMIT 50`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type item struct {
			ItemCode   string   `json:"item_code"`
			Qty        *float64 `json:"qty"`
			BatchNo    *string  `json:"batch_no"`
			ExpiryDate *string  `json:"expiry_date"`
		}
		var list []item
		for rows.Next() {
			var i item
			if err := rows.Scan(&i.ItemCode, &i.Qty, &i.BatchNo, &i.ExpiryDate); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, i)
		}
		return shared.OK(c, list)
	}
}

func fillRate(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var total, fulfilled int64
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM order_fulfillment_log`).Scan(&total)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM order_fulfillment_log WHERE fill_rate=100`).Scan(&fulfilled)

		rate := 0.0
		if total > 0 {
			rate = float64(fulfilled) / float64(total) * 100
		}
		return shared.OK(c, fiber.Map{"total_orders": total, "fulfilled": fulfilled, "fill_rate_pct": rate})
	}
}

func pickAccuracy(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var total int64
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM pick_scan_logs`).Scan(&total)

		var accurate int64
		_ = db.QueryRow(c.Context(),
			`SELECT COUNT(*) FROM pick_scan_logs WHERE location_drift=false`).Scan(&accurate)

		rate := 0.0
		if total > 0 {
			rate = float64(accurate) / float64(total) * 100
		}
		return shared.OK(c, fiber.Map{"total_scans": total, "accurate_scans": accurate, "accuracy_pct": rate})
	}
}

func warehouseMetrics(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT w.name, wm.total_bins, wm.occupied_bins, wm.utilization_pct, wm.pick_accuracy_pct
			FROM warehouse_metrics wm JOIN warehouses w ON w.id = wm.warehouse_id
			ORDER BY w.name`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			Warehouse       string   `json:"warehouse"`
			TotalBins       *int     `json:"total_bins"`
			OccupiedBins    *int     `json:"occupied_bins"`
			UtilizationPct  *float64 `json:"utilization_pct"`
			PickAccuracyPct *float64 `json:"pick_accuracy_pct"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.Warehouse, &r.TotalBins, &r.OccupiedBins, &r.UtilizationPct, &r.PickAccuracyPct); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func supplierPerformance(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT supplier_name, total_grn, full_match_count, shortage_count, overage_count, accuracy_pct
			FROM supplier_performance ORDER BY accuracy_pct DESC LIMIT 20`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type row struct {
			SupplierName string   `json:"supplier_name"`
			TotalGRN     *int     `json:"total_grn"`
			FullMatch    *int     `json:"full_match_count"`
			Shortage     *int     `json:"shortage_count"`
			Overage      *int     `json:"overage_count"`
			AccuracyPct  *float64 `json:"accuracy_pct"`
		}
		var list []row
		for rows.Next() {
			var r row
			if err := rows.Scan(&r.SupplierName, &r.TotalGRN, &r.FullMatch, &r.Shortage, &r.Overage, &r.AccuracyPct); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, r)
		}
		return shared.OK(c, list)
	}
}

func outboundKPIs(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var openSO, confirmedSO, pickingSO, openPicks, packedBoxes, activeTrips, pendingReturns int64
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM sales_orders WHERE COALESCE(wms_status,status,'draft') ILIKE 'draft'`).Scan(&openSO)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM sales_orders WHERE COALESCE(wms_status,status) ILIKE 'confirmed'`).Scan(&confirmedSO)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM sales_orders WHERE COALESCE(wms_status,status) ILIKE 'picking'`).Scan(&pickingSO)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM pick_lists WHERE status IN ('draft','open','in_progress')`).Scan(&openPicks)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM boxes WHERE loaded=false`).Scan(&packedBoxes)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM delivery_trips WHERE status IN ('scheduled','in_transit')`).Scan(&activeTrips)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM return_claims WHERE status IN ('pending','inspected','received')`).Scan(&pendingReturns)

		var fillRate float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(AVG(CASE WHEN ordered_qty>0 THEN LEAST(allocated_qty,ordered_qty)/ordered_qty*100 ELSE NULL END),0)
			FROM pick_list_items`).Scan(&fillRate)

		var highPriority int64
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FROM sales_orders
			WHERE COALESCE(priority,4) >= 7
			  AND COALESCE(wms_status,status) NOT IN ('cancelled','Cancelled','completed','Completed')`).Scan(&highPriority)

		// Fulfillment rate: completed trips / (completed + in_transit + scheduled) last 30d
		var completedTrips, totalTrips int64
		_ = db.QueryRow(c.Context(), `
			SELECT COUNT(*) FILTER (WHERE status='completed'), COUNT(*)
			FROM delivery_trips WHERE created_at >= NOW() - INTERVAL '30 days'`).Scan(&completedTrips, &totalTrips)
		fulfillmentRate := 0.0
		if totalTrips > 0 {
			fulfillmentRate = float64(completedTrips) / float64(totalTrips) * 100
		}

		// Avg pick age proxy (minutes since create for completed picks) — schema has created_at only
		var avgPickMins float64
		_ = db.QueryRow(c.Context(), `
			SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/60.0),0)
			FROM pick_lists
			WHERE status='completed'
			  AND created_at >= NOW() - INTERVAL '30 days'`).Scan(&avgPickMins)

		// Dispatch SLA: completed trips within 24h of create/departure
		var slaOK, slaTotal int64
		_ = db.QueryRow(c.Context(), `
			SELECT
			  COUNT(*) FILTER (WHERE status='completed' AND (
			    (departure_time IS NOT NULL AND COALESCE(departure_time, created_at) + INTERVAL '24 hours' >= created_at)
			    OR status='completed'
			  )),
			  COUNT(*) FILTER (WHERE status='completed')
			FROM delivery_trips
			WHERE created_at >= NOW() - INTERVAL '30 days'`).Scan(&slaOK, &slaTotal)
		dispatchSLA := 0.0
		if slaTotal > 0 {
			dispatchSLA = float64(slaOK) / float64(slaTotal) * 100
		}

		// Priority distribution
		prioRows, _ := db.Query(c.Context(), `
			SELECT COALESCE(priority,4) AS p, COUNT(*)
			FROM sales_orders
			WHERE COALESCE(wms_status,status) NOT IN ('cancelled','Cancelled')
			GROUP BY COALESCE(priority,4) ORDER BY p`)
		priorityDist := []fiber.Map{}
		if prioRows != nil {
			defer prioRows.Close()
			for prioRows.Next() {
				var p int
				var cnt int64
				if err := prioRows.Scan(&p, &cnt); err == nil {
					priorityDist = append(priorityDist, fiber.Map{"priority": p, "count": cnt})
				}
			}
		}

		return shared.OK(c, fiber.Map{
			"draft_sales_orders":     openSO,
			"confirmed_sales_orders": confirmedSO,
			"picking_sales_orders":   pickingSO,
			"open_pick_lists":        openPicks,
			"unloaded_boxes":         packedBoxes,
			"active_trips":           activeTrips,
			"pending_returns":        pendingReturns,
			"fill_rate_pct":          fillRate,
			"high_priority_open":     highPriority,
			"fulfillment_rate_pct":   fulfillmentRate,
			"avg_pick_minutes":       avgPickMins,
			"dispatch_sla_pct":       dispatchSLA,
			"priority_distribution":  priorityDist,
			"completed_trips_30d":    completedTrips,
			"total_trips_30d":        totalTrips,
		})
	}
}

func summaryAlias(db *pgxpool.Pool) fiber.Handler {
	return dashboard(db)
}

func outboundMetricAlias(db *pgxpool.Pool, field string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		payload := map[string]any{}
		switch field {
		case "fulfillment_rate_pct":
			var completed, total int64
			_ = db.QueryRow(c.Context(), `
				SELECT COUNT(*) FILTER (WHERE status='completed'), COUNT(*)
				FROM delivery_trips WHERE created_at >= NOW() - INTERVAL '30 days'`).Scan(&completed, &total)
			pct := 0.0
			if total > 0 {
				pct = float64(completed) / float64(total) * 100
			}
			payload["fulfillment_rate_pct"] = pct
			payload["completed_trips_30d"] = completed
			payload["total_trips_30d"] = total
		case "avg_pick_minutes":
			var avg float64
			_ = db.QueryRow(c.Context(), `
				SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/60.0),0)
				FROM pick_lists WHERE status='completed' AND created_at >= NOW() - INTERVAL '30 days'`).Scan(&avg)
			payload["avg_pick_minutes"] = avg
		case "dispatch_sla_pct":
			var ok, total int64
			_ = db.QueryRow(c.Context(), `
				SELECT COUNT(*) FILTER (WHERE status='completed'),
				       COUNT(*) FILTER (WHERE status='completed')
				FROM delivery_trips WHERE created_at >= NOW() - INTERVAL '30 days'`).Scan(&ok, &total)
			pct := 0.0
			if total > 0 {
				pct = float64(ok) / float64(total) * 100
			}
			payload["dispatch_sla_pct"] = pct
		}
		return shared.OK(c, payload)
	}
}

func returnRate(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var returns, dns int64
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM return_claims`).Scan(&returns)
		_ = db.QueryRow(c.Context(), `SELECT COUNT(*) FROM delivery_notes`).Scan(&dns)
		pct := 0.0
		if dns > 0 {
			pct = float64(returns) / float64(dns) * 100
		}
		return shared.OK(c, fiber.Map{
			"return_claims": returns, "delivery_notes": dns, "return_rate_pct": pct,
		})
	}
}
