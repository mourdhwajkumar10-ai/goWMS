package grn

import (
	"strconv"
	"strings"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func allowedGRNException(et string) bool {
	et = strings.ToLower(strings.TrimSpace(et))
	switch et {
	case "shortage", "excess", "wrong_item", "duplicate_box", "excess_box", "missing_box",
		"damage", "empty_box", "label_mismatch", "mixed_items", "wrong_variant",
		"wrong_revision", "substitute", "counterfeit", "wrong_po", "other",
		"internal_damage", "unknown_box", "relabeled", "no_box_id", "damaged_barcode",
		"nested_box", "no_packing_list", "no_invoice", "packing_list_po_mismatch",
		"packing_list_physical_mismatch":
		return true
	default:
		_, ok := extraDiscrepancyKinds[et]
		return ok
	}
}

func reportDiscrepancy(db *pgxpool.Pool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		sessionID, err := strconv.Atoi(c.Params("id"))
		if err != nil {
			return shared.Err(c, fiber.StatusBadRequest, "invalid session id")
		}
		var body struct {
			Kind             string  `json:"kind"`
			BoxNo            string  `json:"box_no"`
			PartNo           string  `json:"part_no"`
			Notes            string  `json:"notes"`
			LabelQty         float64 `json:"label_qty"`
			PhysicalQty      float64 `json:"physical_qty"`
			ExpectedQty      float64 `json:"expected_qty"`
			ScannedQty       float64 `json:"scanned_qty"`
			Variant          string  `json:"variant"`
			ExpectedVariant  string  `json:"expected_variant"`
			Revision         string  `json:"revision"`
			ExpectedRevision string  `json:"expected_revision"`
			SerialNo         string  `json:"serial_no"`
			OtherPO          string  `json:"other_po"`
		}
		if err := shared.Bind(c, &body); err != nil {
			return err
		}
		kind := strings.ToLower(strings.TrimSpace(body.Kind))
		if !allowedGRNException(kind) {
			return shared.Err(c, fiber.StatusBadRequest, "invalid discrepancy kind")
		}
		boxNo := strings.TrimSpace(body.BoxNo)
		part := strings.TrimSpace(body.PartNo)
		msg := ""
		eventType := "EXCEPTION_CREATED"

		switch kind {
		case "empty_box":
			eventType = "EMPTY_BOX"
			msg = "EMPTY BOX — sealed/labeled carton contained nothing. Full shortage recorded."
			if cid, ok := cartonIDByNo(c, db, sessionID, boxNo); ok {
				markCartonEmpty(c, db, sessionID, cid, boxNo)
			}
			writeException(db, c, sessionID, "empty_box", fiber.Map{
				"box_no": boxNo, "expected_qty": body.ExpectedQty, "scanned_qty": 0, "variance": -body.ExpectedQty,
			})
		case "label_mismatch":
			eventType = "LABEL_MISMATCH"
			phys := body.PhysicalQty
			label := body.LabelQty
			if phys < label {
				ensureShortageException(db, c, sessionID, "", boxNo, part, label, phys)
				msg = "LABEL MISMATCH — label qty higher than physical count. Shortage recorded."
			} else if phys > label {
				writeException(db, c, sessionID, "excess", fiber.Map{
					"box_no": boxNo, "part_no": part, "expected_qty": label, "scanned_qty": phys, "variance": phys - label,
				})
				msg = "LABEL MISMATCH — physical count higher than label qty. Excess recorded."
			} else {
				msg = "LABEL MISMATCH logged (label qty equals physical; recorded for audit)."
			}
			writeException(db, c, sessionID, "label_mismatch", fiber.Map{
				"box_no": boxNo, "part_no": part, "expected_qty": label, "scanned_qty": phys, "variance": phys - label,
			})
		case "mixed_items":
			eventType = "MIXED_ITEMS"
			msg = "MIXED ITEMS — box contains parts that were not expected together."
			writeException(db, c, sessionID, "mixed_items", fiber.Map{
				"box_no": boxNo, "part_no": part, "expected_qty": body.ExpectedQty, "scanned_qty": body.ScannedQty,
			})
		case "wrong_variant":
			msg = "WRONG VARIANT — " + strings.TrimSpace(body.ExpectedVariant) + " expected, received " + strings.TrimSpace(body.Variant)
			writeException(db, c, sessionID, "wrong_variant", fiber.Map{
				"box_no": boxNo, "part_no": part, "expected_qty": body.ExpectedQty, "scanned_qty": body.ScannedQty,
			})
		case "wrong_revision":
			msg = "WRONG REVISION — " + strings.TrimSpace(body.ExpectedRevision) + " expected, received " + strings.TrimSpace(body.Revision)
			writeException(db, c, sessionID, "wrong_revision", fiber.Map{
				"box_no": boxNo, "part_no": part, "expected_qty": body.ExpectedQty, "scanned_qty": body.ScannedQty,
			})
		case "substitute":
			msg = "SUBSTITUTE ITEM — recorded as pending approval. Supervisor must resolve before it becomes accepted stock."
			writeException(db, c, sessionID, "substitute", fiber.Map{
				"box_no": boxNo, "part_no": part, "expected_qty": body.ExpectedQty, "scanned_qty": body.ScannedQty,
			})
		case "counterfeit":
			eventType = "COUNTERFEIT_SERIAL"
			msg = "COUNTERFEIT / GRAY MARKET — serial " + strings.TrimSpace(body.SerialNo) + " does not match manufacturer records."
			writeException(db, c, sessionID, "counterfeit", fiber.Map{
				"box_no": boxNo, "part_no": part, "scanned_qty": 1,
			})
		case "wrong_po":
			other := strings.TrimSpace(body.OtherPO)
			if other == "" {
				other, _ = otherPOForItem(c, db, sessionID, part)
			}
			msg = "ITEM FROM DIFFERENT PO — valid item, but it belongs to " + other + ", not this GRN."
			writeException(db, c, sessionID, "wrong_po", fiber.Map{
				"box_no": boxNo, "part_no": part, "scanned_qty": body.ScannedQty,
			})
		case "internal_damage":
			eventType = "INTERNAL_DAMAGE"
			msg = "INTERNAL DAMAGE — outer carton looked OK, contents are broken/damaged."
			writeException(db, c, sessionID, "internal_damage", fiber.Map{"box_no": boxNo, "part_no": part})
			writeException(db, c, sessionID, "damage", fiber.Map{"box_no": boxNo, "part_no": part})
		case "unknown_box":
			eventType = "UNKNOWN_BOX"
			msg = "UNKNOWN BOX — barcode is not on the packing list or any PO."
			writeException(db, c, sessionID, "unknown_box", fiber.Map{"box_no": boxNo})
			writeException(db, c, sessionID, "excess_box", fiber.Map{"box_no": boxNo})
		case "relabeled":
			eventType = "BOX_RELABELED"
			msg = "RELABELED BOX — original label removed/covered. Suspicious; hold for supervisor."
			writeException(db, c, sessionID, "relabeled", fiber.Map{"box_no": boxNo})
		case "no_box_id":
			eventType = "NO_BOX_ID"
			if boxNo == "" {
				boxNo = "TEMP-BOX-" + strconv.Itoa(sessionID) + "-" + strconv.FormatInt(int64(len(part)+1), 10)
			}
			msg = "NO BOX ID — temporary ID assigned: " + boxNo + ". Receive against this ID."
			writeException(db, c, sessionID, "no_box_id", fiber.Map{"box_no": boxNo})
		case "damaged_barcode":
			eventType = "DAMAGED_BARCODE"
			msg = "DAMAGED BARCODE — scanner cannot read it. Enter the box ID manually."
			writeException(db, c, sessionID, "damaged_barcode", fiber.Map{"box_no": boxNo})
		case "nested_box":
			eventType = "NESTED_BOX"
			parent := strings.TrimSpace(body.OtherPO)
			if parent == "" {
				parent = strings.TrimSpace(body.Notes)
			}
			msg = "NESTED BOXES — inner box " + boxNo + " inside outer " + parent + ". Scan each level."
			writeException(db, c, sessionID, "nested_box", fiber.Map{"box_no": boxNo})
		case "no_packing_list":
			eventType = "NO_PACKING_LIST"
			msg = "NO PACKING LIST — switched to invoice-only. Verify items against invoice totals."
			_, _ = db.Exec(c.Context(), `
				UPDATE grn_sessions SET receiving_mode='invoice_only', packing_list_available=false, updated_at=now()
				WHERE id=$1`, sessionID)
			writeException(db, c, sessionID, "no_packing_list", fiber.Map{"box_no": boxNo})
		case "no_invoice":
			eventType = "INVOICE_TO_FOLLOW"
			msg = "INVOICE TO FOLLOW — goods may be received; invoice is missing. Do not silently close the GRN."
			writeException(db, c, sessionID, "no_invoice", fiber.Map{})
		case "packing_list_po_mismatch":
			eventType = "PACKING_LIST_PO_MISMATCH"
			cmp := shared.CompareSessionDocs(c.Context(), db, sessionID)
			poQty, listQty := sumPO(cmp), sumPL(cmp)
			if !cmp.HasPO || !cmp.HasPackingList {
				msg = "Cannot compare packing list vs PO — import a packing list and link a PO first."
			} else if cmp.Mismatch {
				msg = "PACKING LIST ≠ PO — packing list qty " + formatQty(listQty) + " vs PO qty " + formatQty(poQty) + "."
				writeException(db, c, sessionID, "packing_list_po_mismatch", fiber.Map{
					"expected_qty": poQty, "scanned_qty": listQty, "variance": listQty - poQty,
				})
			} else {
				msg = "Packing list line quantities match the PO."
			}
			writeEvent(db, c, sessionID, eventType, fiber.Map{
				"box_no": boxNo, "part_no": part, "result": kind, "reason": body.Notes,
				"payload": fiber.Map{"kind": kind, "lines": cmp.Lines, "mismatch": cmp.Mismatch},
			})
			return shared.OK(c, fiber.Map{
				"ok": true, "kind": kind, "message": msg, "box_no": boxNo, "part_no": part,
				"comparison": cmp,
			})
		case "packing_list_physical_mismatch":
			eventType = "PACKING_LIST_PHYSICAL_MISMATCH"
			listQty, phys, mismatch := packingListVsPhysical(c, db, sessionID)
			if listQty == 0 {
				msg = "Cannot compare packing list vs physical — import a packing list and count items first."
			} else if mismatch {
				msg = "PACKING LIST ≠ PHYSICAL — list " + formatQty(listQty) + " vs counted " + formatQty(phys) + "."
				writeException(db, c, sessionID, "packing_list_physical_mismatch", fiber.Map{
					"expected_qty": listQty, "scanned_qty": phys, "variance": phys - listQty,
				})
			} else {
				msg = "Physical count matches the packing list totals."
			}
		default:
			if _, ok := extraDiscrepancyKinds[kind]; ok {
				eventType, msg = applyCatalogDiscrepancy(c, db, sessionID, kind, boxNo, part, body.Notes, body.ExpectedQty, body.ScannedQty)
			} else {
				writeException(db, c, sessionID, kind, fiber.Map{
					"box_no": boxNo, "part_no": part, "expected_qty": body.ExpectedQty, "scanned_qty": body.ScannedQty,
				})
				msg = strings.ToUpper(kind) + " exception recorded"
			}
		}

		writeEvent(db, c, sessionID, eventType, fiber.Map{
			"box_no": boxNo, "part_no": part, "result": kind, "reason": body.Notes,
			"payload": fiber.Map{
				"kind": kind, "label_qty": body.LabelQty, "physical_qty": body.PhysicalQty,
				"variant": body.Variant, "expected_variant": body.ExpectedVariant,
				"revision": body.Revision, "expected_revision": body.ExpectedRevision,
				"serial_no": body.SerialNo, "other_po": body.OtherPO, "notes": body.Notes,
			},
		})
		return shared.OK(c, fiber.Map{"ok": true, "kind": kind, "message": msg, "box_no": boxNo, "part_no": part,
			"exception_id": latestExceptionID(c, db, sessionID, kind)})
	}
}

func cartonIDByNo(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, boxNo string) (int, bool) {
	if strings.TrimSpace(boxNo) == "" {
		return 0, false
	}
	var id int
	err := db.QueryRow(c.Context(), `
		SELECT id FROM grn_cartons
		WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))`, sessionID, boxNo).Scan(&id)
	return id, err == nil && id > 0
}

func markCartonEmpty(c *fiber.Ctx, db *pgxpool.Pool, sessionID, cartonID int, boxNo string) {
	rows, err := db.Query(c.Context(), `
		SELECT id, item_code, COALESCE(expected_qty,0), COALESCE(scanned_qty,0)
		FROM grn_lines WHERE grn_carton_id=$1`, cartonID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var lid int
		var code string
		var exp, scan float64
		if err := rows.Scan(&lid, &code, &exp, &scan); err != nil {
			continue
		}
		_, _ = db.Exec(c.Context(), `UPDATE grn_lines SET scanned_qty=0, status='shortage' WHERE id=$1`, lid)
		ensureShortageException(db, c, sessionID, "", boxNo, code, exp, 0)
	}
	_, _ = db.Exec(c.Context(), `UPDATE grn_cartons SET status='exception' WHERE id=$1`, cartonID)
}

func otherPOForItem(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, itemCode string) (string, bool) {
	if itemCode == "" {
		return "", false
	}
	var thisPO string
	_ = db.QueryRow(c.Context(), `SELECT COALESCE(purchase_receipt_no,'') FROM grn_sessions WHERE id=$1`, sessionID).Scan(&thisPO)
	var other string
	err := db.QueryRow(c.Context(), `
		SELECT po.name FROM purchase_order_items poi
		JOIN purchase_orders po ON po.id = poi.purchase_order_id
		WHERE poi.item_code=$1 AND po.name <> $2
		ORDER BY po.id DESC LIMIT 1`, itemCode, thisPO).Scan(&other)
	if err != nil || other == "" {
		return "", false
	}
	return other, true
}

func itemOnThisGRNPO(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, itemCode string) bool {
	var n int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM purchase_order_items poi
		JOIN purchase_orders po ON po.id = poi.purchase_order_id
		JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
		WHERE gs.id=$1 AND poi.item_code=$2`, sessionID, itemCode).Scan(&n)
	if n > 0 {
		return true
	}
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_lines
		WHERE grn_session_id=$1 AND item_code=$2 AND COALESCE(expected_qty,0) > 0`, sessionID, itemCode).Scan(&n)
	return n > 0
}

func formatQty(q float64) string {
	return strconv.FormatFloat(q, 'f', -1, 64)
}

func packingListVsPO(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) (poQty, listQty float64, mismatch bool) {
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(expected_qty),0) FROM grn_lines WHERE grn_session_id=$1`, sessionID).Scan(&listQty)
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(GREATEST(COALESCE(poi.qty,0),0)),0)
		FROM purchase_order_items poi
		JOIN purchase_orders po ON po.id = poi.purchase_order_id
		JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
		WHERE gs.id=$1`, sessionID).Scan(&poQty)
	return poQty, listQty, poQty > 0 && listQty > 0 && poQty != listQty
}

func packingListVsPhysical(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) (listQty, phys float64, mismatch bool) {
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(expected_qty),0), COALESCE(SUM(scanned_qty),0)
		FROM grn_lines WHERE grn_session_id=$1`, sessionID).Scan(&listQty, &phys)
	return listQty, phys, listQty > 0 && phys != listQty
}

func attachNestedBox(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, cartonNo, parent string, out fiber.Map) {
	parent = strings.TrimSpace(parent)
	if parent == "" || out == nil {
		return
	}
	writeException(db, c, sessionID, "nested_box", fiber.Map{"box_no": cartonNo})
	writeEvent(db, c, sessionID, "NESTED_BOX", fiber.Map{
		"box_no": cartonNo, "result": "nested_box",
		"payload": fiber.Map{"parent_carton_no": parent},
	})
	out["nested"] = true
	out["parent_carton_no"] = parent
	out["message"] = "NESTED BOXES — inner box " + cartonNo + " inside outer " + parent + ". Scan each level."
}
