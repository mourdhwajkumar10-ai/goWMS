-- Add picked_by_user_id to session items
ALTER TABLE putaway_session_items
    ADD COLUMN IF NOT EXISTS picked_by_user_id integer REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_psi_picked_by 
    ON putaway_session_items (picked_by_user_id);

-- Add source_location_id to putaway_logs
ALTER TABLE putaway_logs
    ADD COLUMN IF NOT EXISTS source_location_id integer REFERENCES warehouse_locations(id);

CREATE INDEX IF NOT EXISTS idx_pl_source_loc ON putaway_logs (source_location_id);

-- Add last_picked_by_user_id to locations
ALTER TABLE warehouse_locations
    ADD COLUMN IF NOT EXISTS last_picked_by_user_id integer REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS last_picked_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_wl_last_picker 
    ON warehouse_locations (last_picked_by_user_id) 
    WHERE last_picked_by_user_id IS NOT NULL;
