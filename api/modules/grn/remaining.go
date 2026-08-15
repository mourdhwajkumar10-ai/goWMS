package grn

import (
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type discSpec struct {
	Event string
	Msg   string
}

// extraDiscrepancyKinds covers S-041–S-081 (docs remainder, quality, logistics, process, special, post).
var extraDiscrepancyKinds = map[string]discSpec{
	"invoice_po_mismatch":           {"INVOICE_PO_MISMATCH", "INVOICE ≠ PO — invoice quantities, items, or prices differ from the purchase order."},
	"invoice_packing_list_mismatch": {"INVOICE_PACKING_LIST_MISMATCH", "INVOICE ≠ PACKING LIST — invoice and packing list disagree for this shipment."},
	"wrong_po_referenced":           {"WRONG_PO_REFERENCED", "WRONG PO REFERENCED — documents cite a different PO than the goods on this truck."},
	"missing_delivery_note":         {"MISSING_DELIVERY_NOTE", "MISSING DELIVERY NOTE / CHALLAN — no transport document. Who shipped this?"},
	"handwritten_docs":              {"HANDWRITTEN_DOCS", "UNCLEAR DOCUMENTS — handwritten, smudged, or foreign-language paperwork. Hold for review."},
	"multiple_invoices":             {"MULTIPLE_INVOICES", "MULTIPLE INVOICES — one truck billed on more than one invoice. Record each invoice on this GRN."},
	"quality_fail":                  {"QUALITY_FAIL", "QUALITY FAIL — items failed dimensional, functional, or visual inspection. Hold / QI required."},
	"expired":                       {"EXPIRED_ITEM", "EXPIRED / SHORT SHELF LIFE — do not put away as good stock. Quarantine / QI."},
	"wrong_batch":                   {"WRONG_BATCH", "WRONG BATCH / LOT — item is correct but batch does not match the order."},
	"missing_coa":                   {"MISSING_COA", "MISSING CERTIFICATIONS — COA or required certs were not provided."},
	"contaminated":                  {"CONTAMINATED", "CONTAMINATED — smell, wetness, residue, or contamination. Quarantine."},
	"cold_chain":                    {"COLD_CHAIN_BREAK", "COLD CHAIN BREAK — temperature-sensitive goods arrived warm / thawed."},
	"recalled":                      {"RECALLED_ITEM", "RECALLED ITEM — identify and quarantine. Do not receive as available stock."},
	"wrong_supplier":                {"WRONG_SUPPLIER", "WRONG SUPPLIER — expected a different supplier's delivery."},
	"unscheduled_delivery":          {"UNSCHEDULED_DELIVERY", "UNSCHEDULED DELIVERY — no PO/ASN appointment. Surprise truck."},
	"early_delivery":                {"EARLY_DELIVERY", "EARLY DELIVERY — arrived before the PO schedule. Warehouse may not be ready."},
	"late_delivery":                 {"LATE_DELIVERY", "LATE DELIVERY — arrived after the PO schedule."},
	"split_truck":                   {"SPLIT_TRUCK", "SPLIT TRUCK — this PO is split across multiple trucks. Receive this truck only."},
	"outside_hours":                 {"OUTSIDE_HOURS", "OUTSIDE OPERATING HOURS — delivery outside staffed receiving window."},
	"driver_no_docs":                {"DRIVER_NO_DOCS", "DRIVER HAS NO DOCUMENTS — papers said to follow by email. Cannot fully verify the truck."},
	"rejected_truck_return":         {"REJECTED_TRUCK_RETURN", "REJECTED TRUCK RETURNED — same-day return after a prior reject. Confirm goods were not swapped."},
	"scanner_down":                  {"SCANNER_DOWN", "SCANNER NOT WORKING — use manual entry of box and item IDs."},
	"system_offline":                {"SYSTEM_OFFLINE", "SYSTEM DOWN — paper / offline fallback. Queue scans and replay when online."},
	"network_timeout":               {"NETWORK_TIMEOUT", "NETWORK TIMEOUT — last scan may not have registered. Retry; do not assume it counted."},
	"concurrent_ops":                {"CONCURRENT_OPS", "CONCURRENT RECEIVING — more than one operator is on this GRN. Scans are not exclusive-locked."},
	"undo_last_box":                 {"BOX_SCAN_UNDONE", "WRONG BOX CORRECTED — last box scan undone."},
	"double_scan_item":              {"DOUBLE_SCAN_ITEM", "DOUBLE SCAN — same item scanned twice. Quantity must not be counted twice."},
	"resume_session":                {"SESSION_RESUME", "SESSION RESUME — reopen this GRN via its URL after a crash, refresh, or break."},
	"wrong_warehouse":               {"WRONG_WAREHOUSE", "WRONG WAREHOUSE — this GRN was opened against a different warehouse than the dock."},
	"return_receipt":                {"RETURN_RECEIPT", "RETURN RECEIPT — inbound customer/supplier return, not a PO delivery."},
	"transfer_in":                   {"TRANSFER_IN", "TRANSFER IN — stock moving from another warehouse, not a supplier PO."},
	"consignment":                   {"CONSIGNMENT", "CONSIGNMENT — supplier-owned stock received into our warehouse."},
	"vmi":                           {"VMI", "VMI — vendor-managed inventory receipt."},
	"sample":                        {"SAMPLE", "SAMPLE — non-stock / evaluation sample. Do not mix with saleable inventory."},
	"loan":                          {"LOAN", "LOAN / TOOLING — temporary loaned material. Track for return."},
	"hazmat":                        {"HAZMAT", "HAZMAT — hazardous material. Use designated dock and PPE."},
	"oversized":                     {"OVERSIZED", "OVERSIZED — will not fit standard locations. Stage separately."},
	"high_value":                    {"HIGH_VALUE", "HIGH VALUE — extra count and secure putaway required."},
	"serialized":                    {"SERIALIZED", "SERIALIZED RECEIVING — capture manufacturer serials before close."},
	"cross_dock":                    {"CROSS_DOCK", "CROSS-DOCK — do not put away; stage for outbound."},
	"quarantine":                    {"QUARANTINE", "QUARANTINE — hold in quarantine / QI. Not available stock."},
	"rma":                           {"RMA", "RMA — link this receipt to a return merchandise authorization."},
	"stock_adjustment":              {"STOCK_ADJUSTMENT", "STOCK ADJUSTMENT — post-receiving qty correction via stock entry / reconciliation."},
}

func applyCatalogDiscrepancy(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, kind, boxNo, part, notes string, expected, scanned float64) (eventType, msg string) {
	spec := extraDiscrepancyKinds[kind]
	eventType = spec.Event
	msg = spec.Msg
	if kind == "undo_last_box" {
		if undone, ok := undoLastBoxScan(c, db, sessionID); ok {
			msg = "WRONG BOX CORRECTED — last scan of " + undone + " was undone. It was not counted twice."
			boxNo = undone
		} else {
			msg = "No received box scan to undo on this GRN."
		}
		writeException(db, c, sessionID, kind, fiber.Map{"box_no": boxNo, "part_no": part})
		return eventType, msg
	}
	if kind == "invoice_po_mismatch" {
		cmp := shared.CompareSessionDocs(c.Context(), db, sessionID)
		if !cmp.HasPO || !cmp.HasInvoice {
			msg = "Cannot compare invoice vs PO — seed invoice expected lines and link a PO first."
			return eventType, msg
		}
		if !cmp.Mismatch {
			msg = "Invoice line quantities match the PO."
			return eventType, msg
		}
		msg = spec.Msg
		writeException(db, c, sessionID, kind, fiber.Map{
			"box_no": boxNo, "part_no": part, "expected_qty": sumPO(cmp), "scanned_qty": sumInv(cmp), "variance": sumInv(cmp) - sumPO(cmp),
		})
		applyRemainingSideEffects(c, db, sessionID, kind, part, notes)
		return eventType, msg
	}
	writeException(db, c, sessionID, kind, fiber.Map{
		"box_no": boxNo, "part_no": part, "expected_qty": expected, "scanned_qty": scanned,
	})
	applyRemainingSideEffects(c, db, sessionID, kind, part, notes)
	return eventType, msg
}

func applyRemainingSideEffects(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, kind, part, notes string) {
	switch kind {
	case "quality_fail", "expired", "contaminated", "recalled", "cold_chain", "missing_coa", "quarantine":
		if strings.TrimSpace(part) != "" {
			_, _ = db.Exec(c.Context(), `
				UPDATE grn_lines SET requires_qi=true WHERE grn_session_id=$1 AND item_code=$2`, sessionID, part)
		} else {
			_, _ = db.Exec(c.Context(), `
				UPDATE grn_lines SET requires_qi=true WHERE grn_session_id=$1`, sessionID)
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET notes = TRIM(BOTH FROM COALESCE(notes,'') || $2), updated_at=now()
			WHERE id=$1`, sessionID, "\nQI HOLD: "+kind)
	case "wrong_warehouse":
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET notes = TRIM(BOTH FROM COALESCE(notes,'') || $2), updated_at=now()
			WHERE id=$1`, sessionID, "\nWRONG WAREHOUSE: "+strings.TrimSpace(notes))
	case "return_receipt", "transfer_in", "consignment", "vmi", "sample", "loan",
		"hazmat", "oversized", "high_value", "serialized", "cross_dock":
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_sessions SET notes = TRIM(BOTH FROM COALESCE(notes,'') || $2), updated_at=now()
			WHERE id=$1`, sessionID, "\nRECEIVING TYPE: "+kind)
	}
}

func undoLastBoxScan(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) (string, bool) {
	var id int
	var boxNo string
	var expected bool
	var status string
	err := db.QueryRow(c.Context(), `
		SELECT id, carton_no, COALESCE(is_expected,false), status
		FROM grn_cartons
		WHERE grn_session_id=$1 AND carton_no <> 'CONSOLIDATED'
		  AND status IN ('received','accounted','verified','exception','excess')
		ORDER BY scanned_at DESC NULLS LAST, id DESC
		LIMIT 1`, sessionID).Scan(&id, &boxNo, &expected, &status)
	if err != nil || id < 1 {
		return "", false
	}
	if expected {
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_cartons SET status='expected', scanned_at=NULL, scanned_by=NULL WHERE id=$1`, id)
	} else {
		_, _ = db.Exec(c.Context(), `DELETE FROM grn_lines WHERE grn_carton_id=$1`, id)
		_, _ = db.Exec(c.Context(), `DELETE FROM grn_cartons WHERE id=$1`, id)
	}
	writeEvent(db, c, sessionID, "BOX_SCAN_UNDONE", fiber.Map{
		"box_no": boxNo, "result": "undone", "reason": status,
	})
	return boxNo, true
}
