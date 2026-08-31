-- Partial GRN close: resume receiving later while putaway runs on posted qty.

ALTER TABLE public.grn_sessions DROP CONSTRAINT IF EXISTS grn_sessions_status_check;
ALTER TABLE public.grn_sessions ADD CONSTRAINT grn_sessions_status_check CHECK (
  (status)::text = ANY ((ARRAY[
    'draft'::varchar, 'open'::varchar, 'receiving'::varchar, 'stuck'::varchar,
    'box_reconciliation'::varchar, 'item_verification'::varchar, 'exception_pending'::varchar,
    'item_verification_complete'::varchar, 'putaway_pending'::varchar, 'putaway_in_progress'::varchar,
    'partially_received'::varchar,
    'completed'::varchar, 'closed'::varchar
  ])::text[])
);

ALTER TABLE public.grn_lines ADD COLUMN IF NOT EXISTS stock_posted_qty numeric(18,6) DEFAULT 0;

COMMENT ON COLUMN public.grn_sessions.status IS
  'partially_received = dock/item work paused; shortages logged; stock posted for scanned qty; session stays open for follow-up receiving';
