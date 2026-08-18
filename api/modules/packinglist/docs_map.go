package packinglist

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
)

// mapInboundDocs stamps PO + packing-list identifiers onto a GRN session
// so all three documents share one inbound chain.
func mapInboundDocs(ctx context.Context, tx pgx.Tx, sessionID int, poName, filename string) {
	poName = strings.TrimSpace(poName)
	filename = strings.TrimSpace(filename)

	var sessionNo, existingPL string
	_ = tx.QueryRow(ctx, `
		SELECT COALESCE(session_no,''), COALESCE(packing_list_no,'')
		FROM grn_sessions WHERE id=$1`, sessionID).Scan(&sessionNo, &existingPL)

	plNo := existingPL
	if plNo == "" && strings.HasPrefix(sessionNo, "GRN-") {
		plNo = "PL-" + strings.TrimPrefix(sessionNo, "GRN-")
	}

	var poID any
	if poName != "" {
		var id int
		if err := tx.QueryRow(ctx, `SELECT id FROM purchase_orders WHERE name=$1`, poName).Scan(&id); err == nil {
			poID = id
		}
	}

	_, _ = tx.Exec(ctx, `
		UPDATE grn_sessions SET
			packing_list_no = COALESCE(NULLIF(packing_list_no,''), NULLIF($2,'')),
			packing_list_filename = COALESCE(NULLIF($3,''), packing_list_filename),
			purchase_receipt_no = COALESCE(NULLIF($4,''), purchase_receipt_no),
			purchase_order_id = COALESCE($5::int, purchase_order_id)
		WHERE id=$1`,
		sessionID, plNo, filename, poName, poID,
	)
}
