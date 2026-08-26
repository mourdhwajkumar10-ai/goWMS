-- 052: Wave reconciliation audit trail — every close-out of a wave (clean or
-- forced with leftover) is recorded so leftovers/shrinkage are traceable.

CREATE TABLE IF NOT EXISTS wave_reconciliations (
	id               SERIAL PRIMARY KEY,
	pick_list_id     INTEGER NOT NULL REFERENCES pick_lists(id) ON DELETE CASCADE,
	leftover_qty     NUMERIC(18,6) NOT NULL DEFAULT 0,
	leftover_breakdown JSONB,
	incomplete_orders  JSONB,
	resolution       VARCHAR(24) NOT NULL DEFAULT 'none', -- none | return_to_stock | write_off
	forced           BOOLEAN NOT NULL DEFAULT false,
	reason           TEXT,
	resolved_by      INTEGER,
	resolved_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wave_reconciliations_pick_list ON wave_reconciliations(pick_list_id);
