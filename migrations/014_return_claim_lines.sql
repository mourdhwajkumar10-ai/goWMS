-- Return claim lines + decide workflow support
CREATE SEQUENCE IF NOT EXISTS public.return_claim_lines_id_seq;

CREATE TABLE IF NOT EXISTS public.return_claim_lines (
  id integer PRIMARY KEY DEFAULT nextval('return_claim_lines_id_seq'),
  return_claim_id integer NOT NULL REFERENCES public.return_claims(id) ON DELETE CASCADE,
  item_code character varying(100) NOT NULL,
  qty numeric(18,6) NOT NULL DEFAULT 0,
  condition character varying(50) DEFAULT 'good',
  decision character varying(50), -- restock|scrap|rts|pending
  location_id integer,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_claim_lines_claim ON public.return_claim_lines(return_claim_id);

ALTER TABLE public.return_claims
  ADD COLUMN IF NOT EXISTS delivery_note_no character varying(100),
  ADD COLUMN IF NOT EXISTS warehouse_id integer,
  ADD COLUMN IF NOT EXISTS decided_at timestamp with time zone;
