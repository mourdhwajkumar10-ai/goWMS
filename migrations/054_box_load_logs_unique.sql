-- Migration 054: Add unique constraint to box_load_logs to prevent duplicate loads
-- Fix #11: Duplicate box_load_logs on re-load

-- Add unique constraint on (box_id, trip_id) to prevent duplicate entries
-- when the same box is loaded on the same trip multiple times
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'box_load_logs_box_trip_unique'
        AND conrelid = 'public.box_load_logs'::regclass
    ) THEN
        ALTER TABLE public.box_load_logs
        ADD CONSTRAINT box_load_logs_box_trip_unique UNIQUE (box_id, trip_id);
    END IF;
END $$;