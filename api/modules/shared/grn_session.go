package shared

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// DerivePackingListNo maps a GRN session number to its companion packing-list ref.
// PO-only receiving (no uploaded XLSX) still shows PL in the RF header.
func DerivePackingListNo(sessionNo string) string {
	s := strings.TrimSpace(sessionNo)
	if s == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToUpper(s), "GRN-") {
		return "PL-" + s[4:]
	}
	return "PL-" + s
}

type packingListNoWriter interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// EnsureSessionPackingListNo sets packing_list_no when missing (idempotent).
func EnsureSessionPackingListNo(ctx context.Context, exec packingListNoWriter, sessionID int, sessionNo string) error {
	plNo := DerivePackingListNo(sessionNo)
	if plNo == "" || sessionID < 1 {
		return nil
	}
	_, err := exec.Exec(ctx, `
		UPDATE grn_sessions SET packing_list_no = COALESCE(NULLIF(btrim(packing_list_no),''), $2)
		WHERE id=$1`, sessionID, plNo)
	return err
}
