-- 048: pick_scan_logs rejection + supervisor override audit
ALTER TABLE public.pick_scan_logs
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false;

ALTER TABLE public.pick_scan_logs
  ADD COLUMN IF NOT EXISTS override_by integer;

ALTER TABLE public.pick_scan_logs
  ADD COLUMN IF NOT EXISTS override_reason text;
