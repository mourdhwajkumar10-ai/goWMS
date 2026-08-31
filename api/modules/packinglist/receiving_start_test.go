package packinglist

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestBackfillBoxesFromPO(t *testing.T) {
	dsn := os.Getenv("GOWMS_TEST_DSN")
	if dsn == "" {
		dsn = "postgres://gowms:secret@localhost:5432/gowms?sslmode=disable"
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()

	ctx := context.Background()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback(ctx)

	var sessionID int
	err = tx.QueryRow(ctx, `
		INSERT INTO grn_sessions (session_no, warehouse_id, status, receiving_mode, packing_list_available, purchase_receipt_no, purchase_order_id, arrival_at, created_by)
		VALUES ($1, 1, 'receiving', 'packing_list', true, 'PO-2026-00022', 21, NOW(), 1)
		RETURNING id`, fmt.Sprintf("GRN-TEST-BF-%d", os.Getpid())).Scan(&sessionID)
	if err != nil {
		t.Fatalf("session: %v", err)
	}

	boxes, lines, err := backfillBoxesFromPO(ctx, tx, sessionID, "PO-2026-00022")
	if err != nil {
		t.Fatalf("backfill: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}
	if boxes < 1 || lines < 1 {
		t.Fatalf("expected boxes/lines, got boxes=%d lines=%d", boxes, lines)
	}
}
