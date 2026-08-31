package grn

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"goWMS/api/modules/putaway"
	"goWMS/api/modules/shared"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type putawayWorkLine struct {
	LineID    int
	ItemCode  string
	Qty       float64
	RouteCode string
}

func registerInboundPutawayRoutes(app *fiber.App, pool *pgxpool.Pool) {
	putaway.Register(app.Group("/putaway"), pool)
	app.Group("/grn").Post("/session/:id/complete-putaway", completePutaway(pool))
}

func (e *inboundE2E) ensureWarehouseLocations() {
	ctx := context.Background()
	_, _, _ = shared.EnsureLocation(ctx, e.pool, e.Warehouse, "INCOMING-01", "incoming")
	_, _, _ = shared.EnsureLocation(ctx, e.pool, e.Warehouse, "HOLD-01", "hold")
	_, _, _ = shared.EnsureLocation(ctx, e.pool, e.Warehouse, "STAGING-01", "staging")
	_, _, _ = shared.EnsureLocation(ctx, e.pool, e.Warehouse, "REJECT-01", "hold")
	targetCode := "E2E-BIN-" + e.sfx
	_, _, err := shared.EnsureLocation(ctx, e.pool, e.Warehouse, targetCode, "pick_face")
	if err != nil {
		e.t.Fatalf("ensure putaway bin: %v", err)
	}
}

func (e *inboundE2E) locationIDForCode(code string) int {
	ctx := context.Background()
	var id int
	err := e.pool.QueryRow(ctx, `
		SELECT id FROM warehouse_locations
		WHERE warehouse_id=$1 AND code=$2`, e.Warehouse, code).Scan(&id)
	if err != nil {
		e.t.Fatalf("location %s: %v", code, err)
	}
	return id
}

func (e *inboundE2E) putawayTargetLocationID() int {
	return e.locationIDForCode("E2E-BIN-" + e.sfx)
}

func (e *inboundE2E) stockPosted() bool {
	ctx := context.Background()
	var posted bool
	_ = e.pool.QueryRow(ctx, `
		SELECT stock_posted_at IS NOT NULL FROM grn_sessions WHERE id=$1`, e.SessionID).Scan(&posted)
	return posted
}

func (e *inboundE2E) putawayStatus() string {
	ctx := context.Background()
	var st string
	_ = e.pool.QueryRow(ctx, `
		SELECT COALESCE(putaway_status,'pending') FROM grn_sessions WHERE id=$1`, e.SessionID).Scan(&st)
	return st
}

func (e *inboundE2E) listPutawayWork() []putawayWorkLine {
	ctx := context.Background()
	rows, err := e.pool.Query(ctx, `
		SELECT gl.id, gl.item_code,
		       GREATEST(COALESCE(gl.scanned_qty,0)-COALESCE(gl.damaged_qty,0),0) AS qty,
		       COALESCE(NULLIF(BTRIM(gl.route_location),''), 'INCOMING-01') AS route
		FROM grn_lines gl
		WHERE gl.grn_session_id=$1
		  AND GREATEST(COALESCE(gl.scanned_qty,0)-COALESCE(gl.damaged_qty,0),0) > 0
		  AND (
		    NULLIF(BTRIM(COALESCE(gl.route_location,'')),'') IS NULL
		    OR UPPER(COALESCE(gl.route_location,'')) IN ('INCOMING-01','HOLD-01','STAGING-01')
		  )
		ORDER BY gl.id`, e.SessionID)
	if err != nil {
		e.t.Fatalf("listPutawayWork: %v", err)
	}
	defer rows.Close()
	var out []putawayWorkLine
	for rows.Next() {
		var ln putawayWorkLine
		if err := rows.Scan(&ln.LineID, &ln.ItemCode, &ln.Qty, &ln.RouteCode); err != nil {
			e.t.Fatalf("scan putaway work: %v", err)
		}
		if ln.Qty > 0 {
			out = append(out, ln)
		}
	}
	return out
}

func (e *inboundE2E) ensureStockPosted(t *testing.T) {
	t.Helper()
	if e.stockPosted() || len(e.listPutawayWork()) == 0 {
		return
	}
	if e.hasMissingOrUnverifiedCartons() {
		r := e.partialClose()
		if r.Status == http.StatusOK && r.OK && e.stockPosted() {
			return
		}
	}
	r := e.completeVerification()
	if r.Status == http.StatusOK && r.OK && e.stockPosted() {
		return
	}
	if !e.stockPosted() {
		r = e.partialClose()
		if r.Status != http.StatusOK || !r.OK {
			t.Fatalf("ensureStockPosted: verification err=%s partial-close err=%s", r.Error, r.Error)
		}
	}
}

func (e *inboundE2E) hasMissingOrUnverifiedCartons() bool {
	ctx := context.Background()
	var n int
	_ = e.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM grn_cartons
		WHERE grn_session_id=$1 AND carton_no <> 'CONSOLIDATED'
		  AND status IN ('missing','expected','pending','received','box_verified')`, e.SessionID).Scan(&n)
	return n > 0
}

func (e *inboundE2E) createPutawaySession() int {
	r := e.post("/putaway/sessions", map[string]interface{}{"warehouse_id": e.Warehouse})
	if r.Status != http.StatusOK || !r.OK {
		e.t.Fatalf("createPutawaySession: status=%d err=%s", r.Status, r.Error)
	}
	id := dataInt(r.Data, "id")
	if id <= 0 {
		e.t.Fatalf("createPutawaySession: id=%v", r.Data)
	}
	return id
}

func (e *inboundE2E) pickPutaway(paSessionID int, itemCode string, sourceLocID int, qty float64) int {
	r := e.post(fmt.Sprintf("/putaway/sessions/%d/pick", paSessionID), map[string]interface{}{
		"item_code":          itemCode,
		"source_location_id": sourceLocID,
		"qty":                qty,
	})
	if r.Status != http.StatusOK || !r.OK {
		e.t.Fatalf("pick %s qty=%.0f: status=%d err=%s", itemCode, qty, r.Status, r.Error)
	}
	id := dataInt(r.Data, "id")
	if id <= 0 {
		e.t.Fatalf("pick %s: missing id in %+v", itemCode, r.Data)
	}
	return id
}

func (e *inboundE2E) placePutaway(paSessionID, itemID, targetLocID int, qty float64) {
	r := e.post(fmt.Sprintf("/putaway/sessions/%d/place/%d", paSessionID, itemID), map[string]interface{}{
		"target_location_id": targetLocID,
		"qty":                qty,
	})
	if r.Status != http.StatusOK || !r.OK {
		e.t.Fatalf("place item %d: status=%d err=%s", itemID, r.Status, r.Error)
	}
}

func (e *inboundE2E) completePutawaySession(paSessionID int) {
	r := e.post(fmt.Sprintf("/putaway/sessions/%d/complete", paSessionID), map[string]interface{}{})
	if r.Status != http.StatusOK || !r.OK {
		e.t.Fatalf("completePutawaySession: status=%d err=%s", r.Status, r.Error)
	}
}

func (e *inboundE2E) grnCompletePutaway() apiResult {
	return e.post(fmt.Sprintf("/grn/session/%d/complete-putaway", e.SessionID), map[string]interface{}{})
}

// completePutawayForGRN picks from incoming/staging, places to a test bin, and
// finalizes putaway when there is posted stock to move.
func (e *inboundE2E) completePutawayForGRN(t *testing.T) {
	t.Helper()
	e.ensureWarehouseLocations()
	work := e.listPutawayWork()
	if len(work) == 0 {
		return
	}
	e.ensureStockPosted(t)
	work = e.listPutawayWork()
	if len(work) == 0 {
		return
	}

	targetID := e.putawayTargetLocationID()
	paID := e.createPutawaySession()
	for _, ln := range work {
		sourceID := e.locationIDForCode(ln.RouteCode)
		itemID := e.pickPutaway(paID, ln.ItemCode, sourceID, ln.Qty)
		e.placePutaway(paID, itemID, targetID, ln.Qty)
	}
	e.completePutawaySession(paID)

	if len(e.listPutawayWork()) > 0 {
		t.Fatalf("putaway incomplete: staging lines remain")
	}
	ps := e.putawayStatus()
	if ps != "completed" && ps != "in_progress" {
		t.Fatalf("putaway_status=%q want completed or in_progress", ps)
	}
	r := e.grnCompletePutaway()
	if r.Status == http.StatusOK && r.OK {
		if dataStr(r.Data, "putaway_status") != "completed" {
			t.Fatalf("grn complete-putaway: %+v", r.Data)
		}
		return
	}
	if ps == "completed" {
		return
	}
	t.Fatalf("grnCompletePutaway: status=%d err=%s putaway_status=%s", r.Status, r.Error, ps)
}

func (e *inboundE2E) assertNoPutawayWork(t *testing.T) {
	t.Helper()
	if len(e.listPutawayWork()) > 0 {
		t.Fatalf("expected no putaway work, got %d lines", len(e.listPutawayWork()))
	}
}

func dataInt(m map[string]interface{}, key string) int {
	if m == nil {
		return 0
	}
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return 0
}
