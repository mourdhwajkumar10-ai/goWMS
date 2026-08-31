package grn

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type e2eLine struct {
	ItemCode         string
	ExpectedQty      float64
	MasterIncomplete bool // true → block item scan on non-damaged boxes
}

type e2eBox struct {
	CartonNo string
	Lines    []e2eLine
}

type inboundE2E struct {
	t         *testing.T
	pool      *pgxpool.Pool
	app       *fiber.App
	marker    string
	sfx       string
	SessionID int
	Warehouse int
	boxes     []e2eBox
}

func newInboundE2E(t *testing.T, boxes []e2eBox) *inboundE2E {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping inbound E2E in short mode")
	}
	pool := sharedTestPool(t)
	sfx := strconv.FormatInt(time.Now().UnixNano(), 10)
	marker := "E2E-" + sfx
	env := &inboundE2E{
		t:      t,
		pool:   pool,
		app:    newInboundTestApp(pool),
		marker: marker,
		sfx:    sfx,
		boxes:  boxes,
	}
	env.seed(boxes)
	t.Cleanup(func() { env.cleanup() })
	return env
}

func sharedTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	// testdb is in internal package; import at top of test file.
	return testPoolForInbound(t)
}

func newInboundTestApp(pool *pgxpool.Pool) *fiber.App {
	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			if len(c.Response().Body()) > 0 {
				return nil
			}
			code := fiber.StatusInternalServerError
			msg := err.Error()
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
				msg = e.Message
			}
			return c.Status(code).JSON(fiber.Map{"error": msg, "ok": false})
		},
	})
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("role", "admin")
		c.Locals("user_id", 1)
		return c.Next()
	})
	rec := app.Group("/receiving")
	rec.Post("/scan-box", scanBoxHandler(pool))
	rec.Post("/confirm-box", confirmBoxHandler(pool))
	rec.Post("/sign-off-boxes", signOffBoxesHandler(pool))
	rec.Post("/scan-item", scanItemHandler(pool))
	rec.Post("/reject-item", rejectItemHandler(pool))
	rec.Post("/complete-box", completeBoxHandler(pool))
	grn := app.Group("/grn")
	grn.Post("/session/:id/complete-verification", completeItemVerification(pool))
	grn.Post("/session/:id/partial-close", partialCloseWithShortages(pool))
	registerInboundPutawayRoutes(app, pool)
	return app
}

func (e *inboundE2E) seed(boxes []e2eBox) {
	e.t.Helper()
	ctx := context.Background()
	tx, err := e.pool.Begin(ctx)
	if err != nil {
		e.t.Fatalf("begin seed tx: %v", err)
	}
	defer tx.Rollback(ctx)

	var whID int
	if err := tx.QueryRow(ctx, `
		INSERT INTO warehouses (name, code) VALUES ($1,$2) RETURNING id`,
		"E2E-WH-"+e.sfx, "E2EWH"+e.sfx).Scan(&whID); err != nil {
		e.t.Fatalf("seed warehouse: %v", err)
	}
	e.Warehouse = whID

	var sessionID int
	err = tx.QueryRow(ctx, `
		INSERT INTO grn_sessions (
			session_no, warehouse_id, purchase_receipt_no, supplier_name, status,
			receiving_mode, packing_list_available, expected_boxes, boxes_total, arrival_at
		) VALUES (
			'GRN-E2E-'||$1, $2, $3, 'E2E Supplier', 'receiving', 'packing_list', true, $4, $4, NOW()
		) RETURNING id`,
		e.sfx, whID, e.marker, len(boxes)).Scan(&sessionID)
	if err != nil {
		e.t.Fatalf("seed session: %v", err)
	}
	e.SessionID = sessionID

	for i, box := range boxes {
		cartonNo := box.CartonNo
		if cartonNo == "" {
			cartonNo = fmt.Sprintf("C%04d", i+1)
		}
		var cartonID int
		if err := tx.QueryRow(ctx, `
			INSERT INTO grn_cartons (grn_session_id, carton_no, status, is_expected)
			VALUES ($1, $2, 'expected', true) RETURNING id`,
			sessionID, cartonNo).Scan(&cartonID); err != nil {
			e.t.Fatalf("seed carton %s: %v", cartonNo, err)
		}
		for _, line := range box.Lines {
			itemCode := line.ItemCode
			if itemCode == "" {
				itemCode = fmt.Sprintf("E2E-%s-%s", e.sfx, cartonNo)
			}
			masterOK := !line.MasterIncomplete
			if line.ExpectedQty == 0 {
				line.ExpectedQty = 1
			}
			_, err := tx.Exec(ctx, `
				INSERT INTO items (code, name, control_mode, master_complete)
				VALUES ($1, $1, 'item_controlled', $2)
				ON CONFLICT (code) DO UPDATE SET master_complete = EXCLUDED.master_complete`,
				itemCode, masterOK)
			if err != nil {
				// DB without master_complete column
				_, err = tx.Exec(ctx, `
					INSERT INTO items (code, name, control_mode) VALUES ($1,$1,'item_controlled')
					ON CONFLICT (code) DO NOTHING`, itemCode)
				if err != nil {
					e.t.Fatalf("seed item %s: %v", itemCode, err)
				}
			}
			if masterOK {
				_, _ = tx.Exec(ctx, `UPDATE items SET master_complete=true WHERE code=$1`, itemCode)
			} else {
				_, _ = tx.Exec(ctx, `UPDATE items SET master_complete=false WHERE code=$1`, itemCode)
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO grn_lines (
					grn_carton_id, item_code, expected_qty, scanned_qty, status,
					verification_method, grn_session_id, part_name
				) VALUES ($1, $2, $3, 0, 'pending', 'e2e-test', $4, $2)`,
				cartonID, itemCode, line.ExpectedQty, sessionID)
			if err != nil {
				e.t.Fatalf("seed line %s: %v", itemCode, err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		e.t.Fatalf("commit seed: %v", err)
	}
}

func (e *inboundE2E) cleanup() {
	ctx := context.Background()
	_, _ = e.pool.Exec(ctx, `DELETE FROM grn_sessions WHERE purchase_receipt_no = $1`, e.marker)
	_, _ = e.pool.Exec(ctx, `DELETE FROM items WHERE code LIKE $1`, "E2E-"+e.sfx+"%")
	_, _ = e.pool.Exec(ctx, `DELETE FROM warehouses WHERE id = $1`, e.Warehouse)
}

type apiResult struct {
	Status  int
	OK      bool
	Data    map[string]interface{}
	Error   string
	RawBody string
}

func (e *inboundE2E) post(path string, body any) apiResult {
	e.t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		e.t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	resp, err := e.app.Test(req, -1)
	if err != nil {
		e.t.Fatalf("app.Test %s: %v", path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	out := apiResult{Status: resp.StatusCode, RawBody: string(raw)}
	var parsed map[string]interface{}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		e.t.Fatalf("parse response %s: %v body=%s", path, err, string(raw))
	}
	if v, ok := parsed["ok"].(bool); ok {
		out.OK = v
	}
	if v, ok := parsed["error"].(string); ok {
		out.Error = v
	}
	if d, ok := parsed["data"].(map[string]interface{}); ok {
		out.Data = d
	}
	return out
}

func (e *inboundE2E) scanBox(box string, phase string) apiResult {
	body := map[string]interface{}{"session_id": e.SessionID, "box_number": box}
	if phase != "" {
		body["phase"] = phase
	}
	return e.post("/receiving/scan-box", body)
}

func (e *inboundE2E) confirmBox(box, condition string) apiResult {
	return e.post("/receiving/confirm-box", map[string]interface{}{
		"session_id": e.SessionID,
		"box_number": box,
		"condition":  condition,
	})
}

func (e *inboundE2E) signOff() apiResult {
	return e.post("/receiving/sign-off-boxes", map[string]interface{}{"session_id": e.SessionID})
}

func (e *inboundE2E) scanItem(box, qr string) apiResult {
	return e.post("/receiving/scan-item", map[string]interface{}{
		"session_id": e.SessionID,
		"box_number": box,
		"qr_raw":     qr,
	})
}

func (e *inboundE2E) rejectItem(box, itemCode string) apiResult {
	return e.post("/receiving/reject-item", map[string]interface{}{
		"session_id": e.SessionID,
		"box_number": box,
		"item_code":  itemCode,
	})
}

func (e *inboundE2E) completeBox(box string) apiResult {
	return e.post("/receiving/complete-box", map[string]interface{}{
		"session_id": e.SessionID,
		"box_number": box,
	})
}

func (e *inboundE2E) completeVerification() apiResult {
	return e.post(fmt.Sprintf("/grn/session/%d/complete-verification", e.SessionID), map[string]interface{}{})
}

func (e *inboundE2E) partialClose() apiResult {
	return e.post(fmt.Sprintf("/grn/session/%d/partial-close", e.SessionID), map[string]interface{}{})
}

func (e *inboundE2E) receiveBox(box, condition string) {
	e.t.Helper()
	r := e.scanBox(box, "")
	if r.Status != http.StatusOK || !r.OK {
		e.t.Fatalf("scanBox %s: status=%d err=%s", box, r.Status, r.Error)
	}
	r = e.confirmBox(box, condition)
	if r.Status != http.StatusOK || !r.OK {
		e.t.Fatalf("confirmBox %s: status=%d err=%s", box, r.Status, r.Error)
	}
}

func (e *inboundE2E) receiveAll(condition string) {
	for _, b := range e.boxes {
		box := b.CartonNo
		if box == "" {
			continue
		}
		e.receiveBox(box, condition)
	}
}

func (e *inboundE2E) scanItemQty(box, itemCode string, qty float64) {
	e.t.Helper()
	remaining := qty
	for remaining > 0 {
		step := 1.0
		if remaining < 1 {
			step = remaining
		}
		scanQR := itemCode
		if step > 1 {
			scanQR = fmt.Sprintf("%s-%.0f_%.0f", itemCode, step, step*100)
		}
		r := e.scanItem(box, scanQR)
		if r.Status != http.StatusOK || !r.OK {
			e.t.Fatalf("scanItem %s qty=%v: status=%d err=%s", itemCode, step, r.Status, r.Error)
		}
		remaining -= step
	}
}

func (e *inboundE2E) verifyBoxFully(box string) {
	e.t.Helper()
	ctx := context.Background()
	rows, err := e.pool.Query(ctx, `
		SELECT gl.item_code, COALESCE(gl.expected_qty,0)
		FROM grn_lines gl
		JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
		WHERE gc.grn_session_id=$1 AND lower(btrim(gc.carton_no))=lower(btrim($2))
		ORDER BY gl.id`, e.SessionID, box)
	if err != nil {
		e.t.Fatalf("lines in box %s: %v", box, err)
	}
	defer rows.Close()
	var found bool
	for rows.Next() {
		var item string
		var qty float64
		if err := rows.Scan(&item, &qty); err != nil {
			e.t.Fatalf("scan line: %v", err)
		}
		found = true
		e.scanItemQty(box, item, qty)
	}
	if !found {
		e.t.Fatalf("no lines for box %s", box)
	}
	r := e.completeBox(box)
	if r.Status != http.StatusOK || !r.OK {
		e.t.Fatalf("completeBox %s: status=%d err=%s", box, r.Status, r.Error)
	}
}

func (e *inboundE2E) verifyAllBoxes() {
	for i, b := range e.boxes {
		box := b.CartonNo
		if box == "" {
			box = fmt.Sprintf("C%04d", i+1)
		}
		e.verifyBoxFully(box)
	}
}

func (e *inboundE2E) itemCodeInBox(box string) string {
	ctx := context.Background()
	var code string
	err := e.pool.QueryRow(ctx, `
		SELECT gl.item_code FROM grn_lines gl
		JOIN grn_cartons gc ON gc.id = gl.grn_carton_id
		WHERE gc.grn_session_id=$1 AND lower(btrim(gc.carton_no))=lower(btrim($2))
		ORDER BY gl.id LIMIT 1`, e.SessionID, box).Scan(&code)
	if err != nil {
		e.t.Fatalf("itemCodeInBox %s: %v", box, err)
	}
	return code
}

func (e *inboundE2E) cartonStatus(box string) string {
	ctx := context.Background()
	var st string
	err := e.pool.QueryRow(ctx, `
		SELECT status FROM grn_cartons
		WHERE grn_session_id=$1 AND lower(btrim(carton_no))=lower(btrim($2))`,
		e.SessionID, box).Scan(&st)
	if err != nil {
		e.t.Fatalf("cartonStatus %s: %v", box, err)
	}
	return st
}

func (e *inboundE2E) sessionStatus() string {
	ctx := context.Background()
	var st string
	err := e.pool.QueryRow(ctx, `SELECT status FROM grn_sessions WHERE id=$1`, e.SessionID).Scan(&st)
	if err != nil {
		e.t.Fatalf("sessionStatus: %v", err)
	}
	return st
}

func (e *inboundE2E) countExceptions(excType string) int {
	ctx := context.Background()
	var n int
	q := `SELECT COUNT(*) FROM grn_exceptions WHERE grn_session_id=$1`
	args := []any{e.SessionID}
	if excType != "" {
		q += ` AND exception_type=$2`
		args = append(args, excType)
	}
	if err := e.pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
		e.t.Fatalf("countExceptions: %v", err)
	}
	return n
}

func (e *inboundE2E) countOpenExceptions(excType string) int {
	ctx := context.Background()
	var n int
	q := `SELECT COUNT(*) FROM grn_exceptions WHERE grn_session_id=$1 AND status='open'`
	args := []any{e.SessionID}
	if excType != "" {
		q += ` AND exception_type=$2`
		args = append(args, excType)
	}
	if err := e.pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
		e.t.Fatalf("countOpenExceptions: %v", err)
	}
	return n
}

func dataStr(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func dataFloat(m map[string]interface{}, key string) float64 {
	if m == nil {
		return 0
	}
	if v, ok := m[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case int:
			return float64(n)
		case json.Number:
			f, _ := n.Float64()
			return f
		}
	}
	return 0
}

func mustContain(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(sub))
}
