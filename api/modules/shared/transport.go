package shared

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// UpsertTransport saves a truck into the shared inbound/outbound transport master.
func UpsertTransport(ctx context.Context, db *pgxpool.Pool, truckNo, driverName, driverPhone string) {
	truckNo = strings.TrimSpace(truckNo)
	if db == nil || truckNo == "" {
		return
	}
	_, _ = db.Exec(ctx, `
		INSERT INTO transports (truck_no, driver_name, driver_phone)
		VALUES ($1,$2,$3)
		ON CONFLICT ((lower(btrim(truck_no)))) DO UPDATE SET
			driver_name = COALESCE(NULLIF(EXCLUDED.driver_name,''), transports.driver_name),
			driver_phone = COALESCE(NULLIF(EXCLUDED.driver_phone,''), transports.driver_phone),
			updated_at = now()`,
		truckNo, nullIfBlank(driverName), nullIfBlank(driverPhone))
}

func nullIfBlank(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
