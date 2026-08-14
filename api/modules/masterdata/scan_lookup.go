package masterdata

import (
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// scanLookup resolves a scanned barcode/QR to either a location (contents) or an item (allocation).
// Prefers exact location code match (warehouse labels), otherwise item code.
func scanLookup(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		code := strings.TrimSpace(c.Query("code"))
		if code == "" {
			code = strings.TrimSpace(c.Query("q"))
		}
		if code == "" {
			return shared.Err(c, fiber.StatusBadRequest, "code required")
		}
		packQty := 0.0
		if item, qty, ok := shared.ParsePackedItemQR(code); ok {
			code = item
			packQty = qty
		}
		mode := strings.ToLower(strings.TrimSpace(c.Query("mode", "auto"))) // auto | item | location

		if mode == "location" || mode == "auto" {
			loc, rows, err := lookupLocationInventory(c, db, code)
			if err == nil && loc != nil {
				return shared.OK(c, fiber.Map{
					"kind": "location", "code": code, "location": loc, "rows": rows,
					"item_count": len(rows),
				})
			}
			if mode == "location" {
				return shared.Err(c, fiber.StatusNotFound, "location not found: "+code)
			}
		}

		if mode == "item" || mode == "auto" {
			item, rows, err := lookupItemInventory(c, db, code)
			if err == nil && item != nil {
				var alloc, unalloc float64
				for _, r := range rows {
					if r.AllocationStatus == "unallocatable" {
						unalloc += r.ActualQty
					} else {
						alloc += r.ActualQty
					}
				}
				out := fiber.Map{
					"kind": "item", "code": code, "item": item, "rows": rows,
					"summary": fiber.Map{
						"allocatable_qty":   alloc,
						"unallocatable_qty": unalloc,
						"total_qty":         alloc + unalloc,
						"is_allocatable":    unalloc <= 0 && alloc > 0,
						"has_unallocatable": unalloc > 0,
						"has_allocatable":   alloc > 0,
					},
				}
				if packQty > 0 {
					out["pack_qty"] = packQty
				}
				return shared.OK(c, out)
			}
			if mode == "item" {
				return shared.Err(c, fiber.StatusNotFound, "item not found: "+code)
			}
		}

		return shared.Err(c, fiber.StatusNotFound, "no item or location matched: "+code)
	}
}

func lookupLocationInventory(c *fiber.Ctx, db *pgxpool.Pool, code string) (fiber.Map, []inventoryRow, error) {
	var id, wid int
	var locCode, locType, aisle, shelf, level, number string
	err := db.QueryRow(c.Context(), `
		SELECT id, warehouse_id, code, COALESCE(location_type,'storage'),
		       COALESCE(aisle,''), COALESCE(shelf, COALESCE(rack,'')), COALESCE(level,''), COALESCE(number, COALESCE(bin,''))
		FROM warehouse_locations
		WHERE UPPER(code)=UPPER($1) AND COALESCE(disabled,false)=false
		ORDER BY id LIMIT 1`, code).
		Scan(&id, &wid, &locCode, &locType, &aisle, &shelf, &level, &number)
	if err == pgx.ErrNoRows {
		return nil, nil, err
	}
	if err != nil {
		return nil, nil, err
	}
	rows, err := queryInventory(c, db, `slb.location_id = $1`, id)
	if err != nil {
		return nil, nil, err
	}
	return fiber.Map{
		"id": id, "warehouse_id": wid, "code": locCode, "location_type": locType,
		"aisle": aisle, "bay": shelf, "shelf": shelf, "level": level, "number": number,
	}, rows, nil
}

func lookupItemInventory(c *fiber.Ctx, db *pgxpool.Pool, code string) (fiber.Map, []inventoryRow, error) {
	var id int
	var itemCode, name string
	var complete bool
	err := db.QueryRow(c.Context(), `
		SELECT id, code, COALESCE(name,''), COALESCE(master_complete,false)
		FROM items WHERE UPPER(code)=UPPER($1) AND disabled=false LIMIT 1`, code).
		Scan(&id, &itemCode, &name, &complete)
	if err == pgx.ErrNoRows {
		return nil, nil, err
	}
	if err != nil {
		return nil, nil, err
	}
	rows, err := queryInventory(c, db, `slb.item_code = $1`, itemCode)
	if err != nil {
		return nil, nil, err
	}
	return fiber.Map{
		"id": id, "code": itemCode, "name": name, "master_complete": complete,
	}, rows, nil
}

func queryInventory(c *fiber.Ctx, db *pgxpool.Pool, where string, arg any) ([]inventoryRow, error) {
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
		WHERE `+where+` AND slb.actual_qty <> 0
		ORDER BY b.expiry_date NULLS LAST, w.code, wl.code, slb.item_code, slb.batch_no`, arg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanInventoryRows(rows), nil
}
