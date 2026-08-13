-- 018: GRN inbound redesign (spec docs/features/grn_specification.md)
-- Dual modes, truck fields, workflow statuses, expected boxes, events, exceptions, invoices.

-- Session extensions
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS receiving_mode varchar(30) DEFAULT 'packing_list';
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS truck_no varchar(100);
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS driver_name varchar(200);
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS driver_phone varchar(50);
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS arrival_at timestamptz;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS expected_boxes int DEFAULT 0;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS plant varchar(100);
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS dock varchar(100);
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS invoice_nos text;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS pod_attachment_id integer;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Widen session status CHECK (keep open/stuck/closed for backward compat)
ALTER TABLE public.grn_sessions DROP CONSTRAINT IF EXISTS grn_sessions_status_check;
ALTER TABLE public.grn_sessions ADD CONSTRAINT grn_sessions_status_check CHECK (
  (status)::text = ANY ((ARRAY[
    'draft'::varchar, 'open'::varchar, 'receiving'::varchar, 'stuck'::varchar,
    'box_reconciliation'::varchar, 'item_verification'::varchar, 'exception_pending'::varchar,
    'item_verification_complete'::varchar, 'putaway_pending'::varchar, 'putaway_in_progress'::varchar,
    'completed'::varchar, 'closed'::varchar
  ])::text[])
);

-- Map legacy open → receiving semantics in app; keep stored value open for old rows
UPDATE public.grn_sessions SET receiving_mode = COALESCE(receiving_mode, 'packing_list') WHERE receiving_mode IS NULL;

-- Carton / box extensions
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS is_expected boolean DEFAULT false;
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS invoice_no varchar(100);
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS condition varchar(30) DEFAULT 'ok';
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS seal_status varchar(30) DEFAULT 'sealed';
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS expected_weight_kg numeric(18,6);
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS actual_weight_kg numeric(18,6);
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.grn_cartons ADD COLUMN IF NOT EXISTS verified_by integer;

ALTER TABLE public.grn_cartons DROP CONSTRAINT IF EXISTS grn_cartons_status_check;
ALTER TABLE public.grn_cartons ADD CONSTRAINT grn_cartons_status_check CHECK (
  (status)::text = ANY ((ARRAY[
    'pending'::varchar, 'expected'::varchar, 'received'::varchar, 'accounted'::varchar,
    'unmatched'::varchar, 'excess'::varchar, 'missing'::varchar, 'verified'::varchar, 'exception'::varchar
  ])::text[])
);

-- Line extensions for invoice linkage + verify tracking
ALTER TABLE public.grn_lines ADD COLUMN IF NOT EXISTS invoice_no varchar(100);
ALTER TABLE public.grn_lines ADD COLUMN IF NOT EXISTS qty_short numeric(18,6) DEFAULT 0;
ALTER TABLE public.grn_lines ADD COLUMN IF NOT EXISTS qty_excess numeric(18,6) DEFAULT 0;

-- Invoices assigned to GRN
CREATE TABLE IF NOT EXISTS public.grn_invoices (
  id serial PRIMARY KEY,
  grn_session_id integer NOT NULL REFERENCES public.grn_sessions(id) ON DELETE CASCADE,
  invoice_no varchar(100) NOT NULL,
  invoice_date date,
  delivery_no varchar(100),
  delivery_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (grn_session_id, invoice_no)
);

-- Immutable event log (spec §22)
CREATE TABLE IF NOT EXISTS public.grn_events (
  id bigserial PRIMARY KEY,
  grn_session_id integer NOT NULL REFERENCES public.grn_sessions(id) ON DELETE CASCADE,
  event_type varchar(80) NOT NULL,
  invoice_no varchar(100),
  box_no varchar(100),
  part_no varchar(100),
  quantity numeric(18,6),
  result varchar(50),
  reason text,
  actor_id integer REFERENCES public.users(id),
  device varchar(100),
  payload jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grn_events_session ON public.grn_events (grn_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grn_events_type ON public.grn_events (event_type);

-- Exceptions queue (spec §18)
CREATE TABLE IF NOT EXISTS public.grn_exceptions (
  id serial PRIMARY KEY,
  grn_session_id integer NOT NULL REFERENCES public.grn_sessions(id) ON DELETE CASCADE,
  exception_type varchar(50) NOT NULL,
  invoice_no varchar(100),
  box_no varchar(100),
  part_no varchar(100),
  expected_qty numeric(18,6),
  scanned_qty numeric(18,6),
  variance numeric(18,6),
  status varchar(30) DEFAULT 'open',
  resolution text,
  resolved_by integer REFERENCES public.users(id),
  resolved_at timestamptz,
  actor_id integer REFERENCES public.users(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grn_exceptions_session ON public.grn_exceptions (grn_session_id, status);
