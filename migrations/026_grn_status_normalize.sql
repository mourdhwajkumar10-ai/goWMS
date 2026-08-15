-- 026: Align GRN session statuses with spec §23
-- DRAFT → RECEIVING → BOX_RECONCILIATION → ITEM_VERIFICATION →
-- EXCEPTION_PENDING → ITEM_VERIFICATION_COMPLETE → PUTAWAY_PENDING → COMPLETED

UPDATE public.grn_sessions
SET status = 'receiving'
WHERE lower(status) = 'open';

UPDATE public.grn_sessions
SET status = 'completed'
WHERE lower(status) = 'closed';

COMMENT ON COLUMN public.grn_sessions.status IS
  'Spec §23: draft|receiving|box_reconciliation|item_verification|exception_pending|item_verification_complete|putaway_pending|putaway_in_progress|completed';
