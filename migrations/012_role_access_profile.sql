-- 012: High-level role access_profile (inbound / outbound / admin × none|view|edit)
-- Expands into role_permissions on save; seeds backfill profiles for system roles.

ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS access_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill profiles for known system roles (idempotent)
UPDATE roles SET access_profile = '{"inbound":"edit","outbound":"edit","admin":"edit"}'::jsonb
WHERE code = 'admin' AND (access_profile = '{}'::jsonb OR access_profile IS NULL);

UPDATE roles SET access_profile = '{"inbound":"edit","outbound":"edit","admin":"view"}'::jsonb
WHERE code IN ('supervisor', 'wm') AND (access_profile = '{}'::jsonb OR access_profile IS NULL);

UPDATE roles SET access_profile = '{"inbound":"none","outbound":"edit","admin":"none"}'::jsonb
WHERE code IN ('picker', 'packer', 'dispatcher', 'driver', 'billing')
  AND (access_profile = '{}'::jsonb OR access_profile IS NULL);

UPDATE roles SET access_profile = '{"inbound":"edit","outbound":"none","admin":"none"}'::jsonb
WHERE code = 'qi' AND (access_profile = '{}'::jsonb OR access_profile IS NULL);
