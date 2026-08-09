package masterdata

import (
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Register wires the master-data list endpoints (registered inline in main.go
// in the original binary; restored as a dedicated module here).
func Register(r fiber.Router, db *pgxpool.Pool) {
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
		rows, err := db.Query(c.Context(), `
			SELECT id, code, name, has_serial, has_batch, safety_stock
			FROM items WHERE disabled=false ORDER BY code`)
		if err != nil {
			return shared.Err(c, fiber.StatusInternalServerError, err.Error())
		}
		defer rows.Close()

		type item struct {
			ID          int      `json:"id"`
			Code        string   `json:"code"`
			Name        string   `json:"name"`
			HasSerial   bool     `json:"has_serial"`
			HasBatch    bool     `json:"has_batch"`
			SafetyStock *float64 `json:"safety_stock"`
		}
		var list []item
		for rows.Next() {
			var i item
			if err := rows.Scan(&i.ID, &i.Code, &i.Name, &i.HasSerial, &i.HasBatch, &i.SafetyStock); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, i)
		}
		if list == nil {
			list = []item{}
		}
		return shared.OK(c, list)
	}
}

func listWarehouses(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rows, err := db.Query(c.Context(), `
			SELECT id, name, code, warehouse_type, picking_mode, disabled, is_group,
			       parent_id, account, is_rejected_warehouse, customer,
			       default_in_transit_warehouse, email_id, phone_no, mobile_no,
			       address_line_1, address_line_2, city, state, pin
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
		}
		var list []wh
		for rows.Next() {
			var w wh
			if err := rows.Scan(&w.ID, &w.Name, &w.Code, &w.WarehouseType, &w.PickingMode,
				&w.Disabled, &w.IsGroup, &w.ParentID, &w.Account, &w.IsRejected, &w.Customer,
				&w.DefaultInTransit, &w.EmailID, &w.PhoneNo, &w.MobileNo,
				&w.AddressLine1, &w.AddressLine2, &w.City, &w.State, &w.Pin); err != nil {
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
		var list []sup
		for rows.Next() {
			var s sup
			if err := rows.Scan(&s.ID, &s.Name, &s.SupplierGroup, &s.GSTIN, &s.Disabled); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		if list == nil {
			list = []sup{}
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
		var list []batch
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
		if list == nil {
			list = []batch{}
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
		var list []dn
		for rows.Next() {
			var d dn
			if err := rows.Scan(&d.ID, &d.Name, &d.CustomerName, &d.Status, &d.PostingDate,
				&d.GrandTotal, &d.NetTotal, &d.TotalQty); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, d)
		}
		if list == nil {
			list = []dn{}
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
		var list []se
		for rows.Next() {
			var s se
			if err := rows.Scan(&s.ID, &s.Name, &s.StockEntryType, &s.Status, &s.PostingDate,
				&s.FromWarehouse, &s.ToWarehouse, &s.Purpose); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		if list == nil {
			list = []se{}
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
		var list []sr
		for rows.Next() {
			var s sr
			if err := rows.Scan(&s.ID, &s.Name, &s.Status, &s.PostingDate); err != nil {
				return shared.Err(c, fiber.StatusInternalServerError, err.Error())
			}
			list = append(list, s)
		}
		if list == nil {
			list = []sr{}
		}
		return shared.OK(c, list)
	}
}
