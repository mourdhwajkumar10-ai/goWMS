-- 032: Add velocity tier for putaway placement
ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS velocity_tier character varying(10) DEFAULT 'medium';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'items_velocity_tier_check'
      AND conrelid = 'public.items'::regclass
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_velocity_tier_check
      CHECK (
        velocity_tier IS NULL OR velocity_tier IN ('fast', 'medium', 'slow')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_items_velocity_tier
    ON public.items (velocity_tier)
    WHERE velocity_tier IS NOT NULL;

COMMENT ON COLUMN public.items.velocity_tier IS
  'Putaway placement tier: fast=golden zone, medium=lower shelves, slow=upper shelves.';
