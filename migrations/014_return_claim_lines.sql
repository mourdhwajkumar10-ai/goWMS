-- Return claim lines + decide workflow support (idempotent)

CREATE SEQUENCE IF NOT EXISTS public.return_claim_lines_id_seq;

CREATE TABLE IF NOT EXISTS public.return_claim_lines (
  id integer PRIMARY KEY DEFAULT nextval('public.return_claim_lines_id_seq'),
  return_claim_id integer NOT NULL,
  item_code character varying(100) NOT NULL,
  qty numeric(18,6) NOT NULL DEFAULT 0,
  condition character varying(50) DEFAULT 'good',
  decision character varying(50), -- restock|scrap|rts|pending
  location_id integer,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'return_claim_lines_return_claim_id_fkey'
      AND conrelid = 'public.return_claim_lines'::regclass
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'return_claims'
  ) THEN
    ALTER TABLE public.return_claim_lines
      ADD CONSTRAINT return_claim_lines_return_claim_id_fkey
      FOREIGN KEY (return_claim_id) REFERENCES public.return_claims(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_return_claim_lines_claim
  ON public.return_claim_lines(return_claim_id);

ALTER TABLE public.return_claims
  ADD COLUMN IF NOT EXISTS delivery_note_no character varying(100),
  ADD COLUMN IF NOT EXISTS warehouse_id integer,
  ADD COLUMN IF NOT EXISTS decided_at timestamp with time zone;
