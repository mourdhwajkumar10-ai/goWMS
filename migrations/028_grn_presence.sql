-- 028: Concurrent operators on the same GRN (presence heartbeat)

CREATE TABLE IF NOT EXISTS public.grn_presence (
  grn_session_id integer NOT NULL REFERENCES public.grn_sessions(id) ON DELETE CASCADE,
  user_id integer NOT NULL,
  device text,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grn_session_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_grn_presence_seen ON public.grn_presence (grn_session_id, last_seen DESC);
