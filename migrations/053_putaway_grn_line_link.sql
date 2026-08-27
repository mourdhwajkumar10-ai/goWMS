-- Track which GRN line is being placed so we can deterministically update
-- grn_lines.route_location and grn_sessions.putaway_status when the new
-- putaway session flow is used (replaces the legacy /grn/putaway path).
ALTER TABLE putaway_session_items
    ADD COLUMN IF NOT EXISTS grn_line_id integer
    REFERENCES grn_lines(id) ON DELETE SET NULL;

ALTER TABLE putaway_session_items
    ADD COLUMN IF NOT EXISTS grn_session_id integer
    REFERENCES grn_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_psi_grn_line
    ON putaway_session_items(grn_line_id)
    WHERE grn_line_id IS NOT NULL;
