// Package testdb provides a Postgres-backed test harness.
//
// Tests skip when GOWMS_TEST_DSN is unset, so `go test ./...` passes on a
// bare checkout with no database. To run them:
//
//	GOWMS_TEST_DSN="postgres://gowms:secret@localhost:5432/gowms" go test ./...
package testdb

import (
	"context"
	"os"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	once    sync.Once
	pool    *pgxpool.Pool
	poolErr error
)

// Open returns a shared pool, or skips the test when GOWMS_TEST_DSN is unset.
func Open(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("GOWMS_TEST_DSN")
	if dsn == "" {
		t.Skip("GOWMS_TEST_DSN not set — skipping database test")
	}
	once.Do(func() {
		pool, poolErr = pgxpool.New(context.Background(), dsn)
		if poolErr == nil {
			poolErr = pool.Ping(context.Background())
		}
	})
	if poolErr != nil {
		t.Fatalf("connect to GOWMS_TEST_DSN: %v", poolErr)
	}
	return pool
}

// Tx begins a transaction that is rolled back when the test finishes, so
// tests never mutate the database they run against and can run repeatedly.
func Tx(t *testing.T) pgx.Tx {
	t.Helper()
	p := Open(t)
	tx, err := p.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin transaction: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	return tx
}
