package grn

import (
	"strconv"
	"strings"
	"time"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerDocCompare(r fiber.Router, db *pgxpool.Pool) {
	r.Get("/session/:id/doc-compare", docCompare(db))
}

func docCompare(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		cmp := shared.CompareSessionDocs(c.Context(), db, sessionID)
		return shared.OK(c, cmp)
	}
}

func sumInv(cmp shared.DocCompare) float64 {
	var n float64
	for _, ln := range cmp.Lines {
		n += ln.InvoiceQty
	}
	return n
}

func applyInvoiceComparison(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) shared.DocCompare {
	cmp := shared.CompareSessionDocs(c.Context(), db, sessionID)
	if cmp.HasInvoice && cmp.HasPO && cmp.Mismatch {
		writeException(db, c, sessionID, "invoice_po_mismatch", fiber.Map{
			"expected_qty": sumPO(cmp), "scanned_qty": sumInv(cmp), "variance": sumInv(cmp) - sumPO(cmp),
		})
		writeEvent(db, c, sessionID, "INVOICE_PO_MISMATCH", fiber.Map{
			"result":  "invoice_po_mismatch",
			"payload": fiber.Map{"lines": cmp.Lines},
		})
	}
	return cmp
}

func applyImportPLComparison(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) shared.DocCompare {
	cmp := shared.CompareSessionDocs(c.Context(), db, sessionID)
	if cmp.HasPackingList && cmp.HasPO && cmp.Mismatch {
		writeException(db, c, sessionID, "packing_list_po_mismatch", fiber.Map{
			"expected_qty": sumPO(cmp), "scanned_qty": sumPL(cmp), "variance": sumPL(cmp) - sumPO(cmp),
		})
		writeEvent(db, c, sessionID, "PACKING_LIST_PO_MISMATCH", fiber.Map{
			"result":  "packing_list_po_mismatch",
			"payload": fiber.Map{"lines": cmp.Lines},
		})
	}
	return cmp
}

func sumPO(cmp shared.DocCompare) float64 {
	var n float64
	for _, ln := range cmp.Lines {
		n += ln.POQty
	}
	return n
}

func sumPL(cmp shared.DocCompare) float64 {
	var n float64
	for _, ln := range cmp.Lines {
		n += ln.PackingListQty
	}
	return n
}

func autoArrivalChecks(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, documentsToFollow bool, invoiceNos, arrivalAt, expectedDeliveryAt, purchaseReceiptNo string, warehouseID int, supplierBarcode string) []string {
	flags := []string{}
	if documentsToFollow {
		writeException(db, c, sessionID, "driver_no_docs", fiber.Map{})
		writeEvent(db, c, sessionID, "DRIVER_NO_DOCS", fiber.Map{"result": "driver_no_docs"})
		flags = append(flags, "driver_no_docs")
		inv := strings.ToUpper(strings.TrimSpace(invoiceNos))
		if inv == "" || strings.Contains(inv, "TO-FOLLOW") || strings.Contains(inv, "TO FOLLOW") {
			writeException(db, c, sessionID, "no_invoice", fiber.Map{})
			writeEvent(db, c, sessionID, "INVOICE_TO_FOLLOW", fiber.Map{"result": "no_invoice"})
			flags = append(flags, "no_invoice")
		}
	}
	arr := strings.TrimSpace(arrivalAt)
	if arr == "" {
		arr = time.Now().Format(time.RFC3339)
	}
	arrT, okA := parseFlexibleTime(arr)
	if !okA {
		arrT = time.Now()
	}

	if warehouseID > 0 {
		var openT, closeT, days *string
		_ = db.QueryRow(c.Context(), `
			SELECT receiving_open::text, receiving_close::text, receiving_days
			FROM warehouses WHERE id=$1`, warehouseID).Scan(&openT, &closeT, &days)
		openS, closeS, daysS := "", "", ""
		if openT != nil {
			openS = *openT
		}
		if closeT != nil {
			closeS = *closeT
		}
		if days != nil {
			daysS = *days
		}
		if shared.OutsideReceivingHours(arrT, openS, closeS, daysS) {
			writeException(db, c, sessionID, "outside_hours", fiber.Map{})
			writeEvent(db, c, sessionID, "OUTSIDE_HOURS", fiber.Map{
				"result":  "outside_hours",
				"payload": fiber.Map{"arrival_at": arr, "open": openS, "close": closeS, "days": daysS},
			})
			flags = append(flags, "outside_hours")
		}
	}

	if code := strings.TrimSpace(supplierBarcode); code != "" {
		res := matchSupplierBarcode(c, db, sessionID, code)
		if res["mismatch"] == true {
			writeException(db, c, sessionID, "wrong_supplier", fiber.Map{})
			writeEvent(db, c, sessionID, "WRONG_SUPPLIER", fiber.Map{"result": "wrong_supplier", "payload": res})
			flags = append(flags, "wrong_supplier")
		}
	}

	sched := strings.TrimSpace(expectedDeliveryAt)
	if sched == "" && strings.TrimSpace(purchaseReceiptNo) != "" {
		var d *string
		_ = db.QueryRow(c.Context(), `SELECT schedule_date::text FROM purchase_orders WHERE name=$1`, purchaseReceiptNo).Scan(&d)
		if d != nil {
			sched = *d
		}
	}
	if sched == "" {
		return flags
	}
	schT, okS := parseFlexibleTime(sched)
	if !okS {
		return flags
	}
	arrDay := time.Date(arrT.Year(), arrT.Month(), arrT.Day(), 0, 0, 0, 0, time.UTC)
	schDay := time.Date(schT.Year(), schT.Month(), schT.Day(), 0, 0, 0, 0, time.UTC)
	if arrDay.Before(schDay) {
		writeException(db, c, sessionID, "early_delivery", fiber.Map{})
		writeEvent(db, c, sessionID, "EARLY_DELIVERY", fiber.Map{
			"result":  "early_delivery",
			"payload": fiber.Map{"arrival_at": arr, "scheduled": sched},
		})
		flags = append(flags, "early_delivery")
	} else if arrDay.After(schDay) {
		writeException(db, c, sessionID, "late_delivery", fiber.Map{})
		writeEvent(db, c, sessionID, "LATE_DELIVERY", fiber.Map{
			"result":  "late_delivery",
			"payload": fiber.Map{"arrival_at": arr, "scheduled": sched},
		})
		flags = append(flags, "late_delivery")
	}
	return flags
}

func parseFlexibleTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	for _, l := range layouts {
		if t, err := time.ParseInLocation(l, s, time.Local); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
