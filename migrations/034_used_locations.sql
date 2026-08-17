-- Add used_location_ids to track bins used during iterative putaway
ALTER TABLE putaway_session_items
    ADD COLUMN IF NOT EXISTS used_location_ids integer[] DEFAULT '{}';

COMMENT ON COLUMN putaway_session_items.used_location_ids
    IS 'Location IDs already used for this session item (for iterative putaway exclusion)';
