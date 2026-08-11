package notifications

// Event wiring helpers — call from other modules after key state changes.
// Keeps notification creation consistent without hard-coupling modules.

import (
	"context"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Emit inserts an in-app notification (type must be info|warning|error|success).
func Emit(ctx context.Context, db *pgxpool.Pool, typ, title, message string, userID int) {
	if typ == "" {
		typ = "info"
	}
	var uid any
	if userID > 0 {
		uid = userID
	}
	_, _ = db.Exec(ctx,
		`INSERT INTO notifications (type, title, message, user_id) VALUES ($1,$2,$3,$4)`,
		typ, title, message, uid)
}

// EmitSOConfirmed notifies that a sales order is ready to pick.
func EmitSOConfirmed(ctx context.Context, db *pgxpool.Pool, soName string) {
	Emit(ctx, db, "success", "Sales order confirmed", soName+" is ready for picking", 0)
}

// EmitShortage notifies pick shortage / backorder candidate.
func EmitShortage(ctx context.Context, db *pgxpool.Pool, pickName, itemCode string) {
	Emit(ctx, db, "warning", "Pick shortage", pickName+": "+itemCode, 0)
}

// EmitTripComplete notifies trip completion.
func EmitTripComplete(ctx context.Context, db *pgxpool.Pool, tripNo string) {
	Emit(ctx, db, "success", "Trip completed", tripNo, 0)
}

// EmitGRNClosed notifies inbound session closed.
func EmitGRNClosed(ctx context.Context, db *pgxpool.Pool, sessionID int, supplier string) {
	msg := "GRN session #" + strconv.Itoa(sessionID) + " closed"
	if supplier != "" {
		msg += " — " + supplier
	}
	Emit(ctx, db, "success", "GRN closed", msg, 0)
}

// EmitPickCreated notifies a new pick list is ready.
func EmitPickCreated(ctx context.Context, db *pgxpool.Pool, pickName, soNo string) {
	msg := pickName
	if soNo != "" {
		msg += " for " + soNo
	}
	Emit(ctx, db, "info", "Pick list created", msg, 0)
}

// EmitBackorderCreated notifies auto/manual backorder creation.
func EmitBackorderCreated(ctx context.Context, db *pgxpool.Pool, boNo string, lineCount int) {
	Emit(ctx, db, "warning", "Backorder created", boNo+" ("+strconv.Itoa(lineCount)+" lines)", 0)
}

// EmitOpenBOsForItem alerts open backorders when stock arrives (e.g. GRN close).
func EmitOpenBOsForItem(ctx context.Context, db *pgxpool.Pool, itemCode string, openQty float64) {
	Emit(ctx, db, "info", "Stock can fulfill backorder",
		itemCode+" — open BO qty "+strconv.FormatFloat(openQty, 'f', -1, 64), 0)
}
