-- 019: GRN item verify, audit, follow-up receipts

ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS active_verify_carton_id integer;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS parent_grn_id integer REFERENCES public.grn_sessions(id);
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS is_followup boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.grn_audits (
  id serial PRIMARY KEY,
  grn_session_id integer NOT NULL REFERENCES public.grn_sessions(id) ON DELETE CASCADE,
  sample_size int NOT NULL DEFAULT 5,
  status varchar(30) DEFAULT 'open',
  started_by integer REFERENCES public.users(id),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  notes text
);

CREATE TABLE IF NOT EXISTS public.grn_audit_items (
  id serial PRIMARY KEY,
  audit_id integer NOT NULL REFERENCES public.grn_audits(id) ON DELETE CASCADE,
  part_no varchar(100) NOT NULL,
  system_qty numeric(18,6) NOT NULL DEFAULT 0,
  physical_qty numeric(18,6),
  result varchar(20),
  checked_by integer REFERENCES public.users(id),
  checked_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_grn_audits_session ON public.grn_audits (grn_session_id);
CREATE INDEX IF NOT EXISTS idx_grn_sessions_parent ON public.grn_sessions (parent_grn_id);
