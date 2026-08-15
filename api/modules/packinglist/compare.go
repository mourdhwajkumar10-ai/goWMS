package packinglist

import (
	"encoding/json"

	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func afterImportCompare(c *fiber.Ctx, db *pgxpool.Pool, sessionID int) shared.DocCompare {
	cmp := shared.CompareSessionDocs(c.Context(), db, sessionID)
	if !cmp.HasPackingList || !cmp.HasPO || !cmp.Mismatch {
		return cmp
	}
	var poQty, plQty float64
	for _, ln := range cmp.Lines {
		poQty += ln.POQty
		plQty += ln.PackingListQty
	}
	uid := userID(c)
	var actor any
	if uid > 0 {
		actor = uid
	}
	_, _ = db.Exec(c.Context(), `
		INSERT INTO grn_exceptions (
			grn_session_id, exception_type, expected_qty, scanned_qty, variance, status, actor_id
		) VALUES ($1,'packing_list_po_mismatch',$2,$3,$4,'open',$5)`,
		sessionID, poQty, plQty, plQty-poQty, actor)
	payload, _ := json.Marshal(map[string]any{"lines": cmp.Lines, "mismatch": true})
	_, _ = db.Exec(c.Context(), `
		INSERT INTO grn_events (grn_session_id, event_type, actor_id, device, payload)
		VALUES ($1,'PACKING_LIST_PO_MISMATCH',$2,$3,$4::jsonb)`,
		sessionID, actor, eventDevice(c), string(payload))
	return cmp
}
