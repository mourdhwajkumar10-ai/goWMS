package grn

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	verifyMethodPOFallback = "po_fallback"

	itemDecisionSubstitute = "substitute"
	itemDecisionWrongPO    = "wrong_po"
	itemDecisionAcceptPO   = "accept_po"
	itemDecisionWrongItem  = "wrong_item"
)

// cartonHasPackingListLines is true when this carton was loaded from a packing
// list (or any non-fallback expected map). Empty boxes after a skipped import
// have no such lines, so item scans must be checked against the PO instead.
func cartonHasPackingListLines(c *fiber.Ctx, db *pgxpool.Pool, cartonID int) bool {
	if db == nil || cartonID < 1 {
		return false
	}
	var n int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_lines
		WHERE grn_carton_id=$1
		  AND COALESCE(verification_method,'') NOT IN ('po_fallback','invoice_only')`, cartonID).Scan(&n)
	return n > 0
}

func sessionHasPackingListExpected(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) bool {
	if db == nil || sessionID < 1 {
		return false
	}
	var n int
	_ = db.QueryRow(c.Context(), `
		SELECT COUNT(*) FROM grn_lines
		WHERE grn_session_id=$1
		  AND COALESCE(expected_qty,0) > 0
		  AND COALESCE(verification_method,'') NOT IN ('po_fallback')`, sessionID).Scan(&n)
	return n > 0
}

// decideMissingBoxLine chooses what to do when the scanned item is not on the
// open carton's expected lines.
func decideMissingBoxLine(hasPackingList, substitute, onThisPO, onOtherPO bool) string {
	if substitute {
		return itemDecisionSubstitute
	}
	if onOtherPO && !onThisPO {
		return itemDecisionWrongPO
	}
	if !hasPackingList && onThisPO {
		return itemDecisionAcceptPO
	}
	return itemDecisionWrongItem
}

type poItemLookup struct {
	Code      string
	Remaining float64
	OnPO      bool
}

func lookupPOItemForSession(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, itemCode string) poItemLookup {
	itemCode = strings.TrimSpace(itemCode)
	if db == nil || sessionID < 1 || itemCode == "" {
		return poItemLookup{}
	}
	var code string
	var remaining float64
	err := db.QueryRow(c.Context(), `
		SELECT MIN(poi.item_code),
		       COALESCE(SUM(GREATEST(COALESCE(poi.qty,0)-COALESCE(poi.received_qty,0),0)),0)
		FROM purchase_order_items poi
		JOIN purchase_orders po ON po.id = poi.purchase_order_id
		JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
		WHERE gs.id=$1 AND UPPER(poi.item_code)=UPPER($2)
		GROUP BY UPPER(poi.item_code)`, sessionID, itemCode).Scan(&code, &remaining)
	if err != nil || strings.TrimSpace(code) == "" {
		return poItemLookup{}
	}
	return poItemLookup{Code: code, Remaining: remaining, OnPO: true}
}

func sessionScannedQtyForItem(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, itemCode string, exceptLineID int) float64 {
	if db == nil || sessionID < 1 || strings.TrimSpace(itemCode) == "" {
		return 0
	}
	var n float64
	_ = db.QueryRow(c.Context(), `
		SELECT COALESCE(SUM(scanned_qty),0) FROM grn_lines
		WHERE grn_session_id=$1 AND UPPER(item_code)=UPPER($2) AND id<>$3`,
		sessionID, itemCode, exceptLineID).Scan(&n)
	return n
}

func insertPOFallbackLine(c *fiber.Ctx, db *pgxpool.Pool, sessionID, cartonID int, itemCode string, qty float64) (int, error) {
	var lineID int
	err := db.QueryRow(c.Context(), `
		INSERT INTO grn_lines (
			grn_carton_id, grn_session_id, item_code, expected_qty, scanned_qty, status, verification_method
		) VALUES ($1,$2,$3,0,$4,'full_match','po_fallback')
		RETURNING id`, cartonID, sessionID, itemCode, qty).Scan(&lineID)
	return lineID, err
}

func overlayPOExpectedParts(c *fiber.Ctx, db *pgxpool.Pool, sessionID int, existing []partBoxQty) []partBoxQty {
	if db == nil || sessionID < 1 {
		return existing
	}
	rows, err := db.Query(c.Context(), `
		SELECT MIN(poi.item_code),
		       SUM(GREATEST(COALESCE(poi.qty,0)-COALESCE(poi.received_qty,0),0))
		FROM purchase_order_items poi
		JOIN purchase_orders po ON po.id = poi.purchase_order_id
		JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
		WHERE gs.id=$1
		GROUP BY UPPER(poi.item_code)
		ORDER BY MIN(poi.id)`, sessionID)
	if err != nil {
		return existing
	}
	defer rows.Close()
	poLines := []partBoxQty{}
	for rows.Next() {
		var code string
		var remaining float64
		if err := rows.Scan(&code, &remaining); err != nil || strings.TrimSpace(code) == "" {
			continue
		}
		poLines = append(poLines, partBoxQty{PartNo: code, Expected: remaining})
	}
	return foldPOExpectedParts(poLines, existing)
}

// foldPOExpectedParts merges duplicate PO SKUs into one expected row and
// attaches session scanned qty once (not once per duplicate PO line).
func foldPOExpectedParts(poLines, existing []partBoxQty) []partBoxQty {
	scanned := map[string]float64{}
	for _, ln := range existing {
		scanned[strings.ToUpper(strings.TrimSpace(ln.PartNo))] += ln.Scanned
	}
	out := []partBoxQty{}
	seen := map[string]bool{}
	for _, ln := range poLines {
		key := strings.ToUpper(strings.TrimSpace(ln.PartNo))
		if key == "" || seen[key] {
			if seen[key] {
				for i := range out {
					if strings.ToUpper(out[i].PartNo) == key {
						out[i].Expected += ln.Expected
						break
					}
				}
			}
			continue
		}
		seen[key] = true
		out = append(out, partBoxQty{
			PartNo: ln.PartNo, BoxNo: "", Expected: ln.Expected, Scanned: scanned[key],
		})
	}
	for _, ln := range existing {
		key := strings.ToUpper(strings.TrimSpace(ln.PartNo))
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, ln)
	}
	if len(out) == 0 {
		return existing
	}
	return out
}

// healFalsePOExcess clears excess flags that were raised because duplicate PO
// lines were compared one-at-a-time instead of as a combined remaining qty.
func healFalsePOExcess(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) {
	if db == nil || sessionID < 1 {
		return
	}
	rows, err := db.Query(c.Context(), `
		SELECT MIN(poi.item_code),
		       COALESCE(SUM(GREATEST(COALESCE(poi.qty,0)-COALESCE(poi.received_qty,0),0)),0)
		FROM purchase_order_items poi
		JOIN purchase_orders po ON po.id = poi.purchase_order_id
		JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
		WHERE gs.id=$1
		GROUP BY UPPER(poi.item_code)`, sessionID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var part string
		var remaining float64
		if err := rows.Scan(&part, &remaining); err != nil || strings.TrimSpace(part) == "" {
			continue
		}
		scanned := sessionScannedQtyForItem(c, db, sessionID, part, 0)
		if remaining <= 0 || scanned > remaining {
			continue
		}
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_exceptions
			SET status='resolved', resolution='Within combined PO qty for this item', resolved_at=now()
			WHERE grn_session_id=$1 AND exception_type='excess' AND status='open'
			  AND UPPER(COALESCE(part_no,''))=UPPER($2)`, sessionID, part)
		_, _ = db.Exec(c.Context(), `
			UPDATE grn_lines SET status='full_match'
			WHERE grn_session_id=$1 AND UPPER(item_code)=UPPER($2)
			  AND status='excess'
			  AND COALESCE(verification_method,'')='po_fallback'`, sessionID, part)
	}
	_, _ = db.Exec(c.Context(), `
		UPDATE grn_cartons gc SET status='received'
		WHERE gc.grn_session_id=$1 AND gc.status='exception'
		  AND NOT EXISTS (
		    SELECT 1 FROM grn_lines gl
		    WHERE gl.grn_carton_id=gc.id AND gl.status IN ('excess','exception','wrong_item','shortage')
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM grn_exceptions e
		    WHERE e.grn_session_id=$1 AND e.status='open' AND COALESCE(e.box_no,'')=gc.carton_no
		  )`, sessionID)
}
