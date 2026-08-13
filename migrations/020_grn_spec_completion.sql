-- 020: GRN spec completion — POD metadata, stock-post tracking, invoice expected lines

ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS pod_captured_at timestamptz;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS pod_captured_by integer REFERENCES public.users(id);
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS stock_posted_at timestamptz;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS putaway_status varchar(30) DEFAULT 'pending';

-- Invoice expected lines (invoice-only mode consolidated expectations)
CREATE TABLE IF NOT EXISTS public.grn_invoice_lines (
  id serial PRIMARY KEY,
  grn_session_id integer NOT NULL REFERENCES public.grn_sessions(id) ON DELETE CASCADE,
  invoice_no varchar(100) NOT NULL,
  part_no varchar(100) NOT NULL,
  expected_qty numeric(18,6) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (grn_session_id, invoice_no, part_no)
);
CREATE INDEX IF NOT EXISTS idx_grn_invoice_lines_session ON public.grn_invoice_lines (grn_session_id);
