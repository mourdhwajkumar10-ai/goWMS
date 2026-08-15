package shared

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DocCompareLine struct {
	PartNo         string  `json:"part_no"`
	POQty          float64 `json:"po_qty"`
	PackingListQty float64 `json:"packing_list_qty"`
	InvoiceQty     float64 `json:"invoice_qty"`
	Status         string  `json:"status"`
}

type DocCompare struct {
	Lines          []DocCompareLine `json:"lines"`
	Mismatch       bool             `json:"mismatch"`
	HasPackingList bool             `json:"has_packing_list"`
	HasInvoice     bool             `json:"has_invoice"`
	HasPO          bool             `json:"has_po"`
}

func DocLineStatus(po, pl, inv float64, hasPL, hasInv bool) string {
	if hasPL {
		if po == 0 && pl > 0 {
			return "extra_on_pl"
		}
		if po > 0 && pl == 0 {
			return "missing_from_pl"
		}
		if po > 0 && pl > 0 && po != pl {
			return "qty_mismatch"
		}
	}
	if hasInv {
		if po == 0 && inv > 0 {
			return "extra_on_invoice"
		}
		if po > 0 && inv == 0 {
			return "missing_from_invoice"
		}
		if po > 0 && inv > 0 && po != inv {
			return "qty_mismatch"
		}
	}
	return "match"
}

func CompareSessionDocs(ctx context.Context, db *pgxpool.Pool, sessionID int) DocCompare {
	out := DocCompare{Lines: []DocCompareLine{}}
	if db == nil || sessionID < 1 {
		return out
	}
	rows, err := db.Query(ctx, `
		WITH po AS (
			SELECT upper(btrim(poi.item_code)) AS part, SUM(COALESCE(poi.qty,0)) AS qty
			FROM purchase_order_items poi
			JOIN purchase_orders po ON po.id = poi.purchase_order_id
			JOIN grn_sessions gs ON gs.purchase_receipt_no = po.name
			WHERE gs.id=$1
			GROUP BY 1
		),
		pl AS (
			SELECT upper(btrim(gl.item_code)) AS part, SUM(COALESCE(gl.expected_qty,0)) AS qty
			FROM grn_lines gl
			WHERE gl.grn_session_id=$1
			GROUP BY 1
		),
		inv AS (
			SELECT upper(btrim(part_no)) AS part, SUM(COALESCE(expected_qty,0)) AS qty
			FROM grn_invoice_lines
			WHERE grn_session_id=$1
			GROUP BY 1
		)
		SELECT COALESCE(po.part, pl.part, inv.part),
		       COALESCE(po.qty,0), COALESCE(pl.qty,0), COALESCE(inv.qty,0)
		FROM po
		FULL OUTER JOIN pl ON po.part = pl.part
		FULL OUTER JOIN inv ON COALESCE(po.part, pl.part) = inv.part
		ORDER BY 1`, sessionID)
	if err != nil {
		return out
	}
	defer rows.Close()
	var poTotal, plTotal, invTotal float64
	for rows.Next() {
		var ln DocCompareLine
		if err := rows.Scan(&ln.PartNo, &ln.POQty, &ln.PackingListQty, &ln.InvoiceQty); err != nil {
			continue
		}
		ln.PartNo = strings.TrimSpace(ln.PartNo)
		poTotal += ln.POQty
		plTotal += ln.PackingListQty
		invTotal += ln.InvoiceQty
		out.Lines = append(out.Lines, ln)
	}
	out.HasPO = poTotal > 0
	out.HasPackingList = plTotal > 0
	out.HasInvoice = invTotal > 0
	for i := range out.Lines {
		out.Lines[i].Status = DocLineStatus(
			out.Lines[i].POQty, out.Lines[i].PackingListQty, out.Lines[i].InvoiceQty,
			out.HasPackingList, out.HasInvoice,
		)
		if out.Lines[i].Status != "match" {
			out.Mismatch = true
		}
	}
	return out
}
