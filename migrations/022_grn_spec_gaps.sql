-- 022: Remaining GRN spec gaps — packing-list flag, arrival docs, POD snapshot, exception device

ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS packing_list_available boolean;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS arrival_attachment_id integer;
ALTER TABLE public.grn_sessions ADD COLUMN IF NOT EXISTS pod_box_summary jsonb;

UPDATE public.grn_sessions
SET packing_list_available = (COALESCE(receiving_mode, 'packing_list') = 'packing_list')
WHERE packing_list_available IS NULL;

ALTER TABLE public.grn_exceptions ADD COLUMN IF NOT EXISTS device varchar(100);

COMMENT ON COLUMN public.grn_sessions.packing_list_available IS 'Spec §4: packing list availability at truck arrival';
COMMENT ON COLUMN public.grn_sessions.arrival_attachment_id IS 'Spec §4: supporting documents captured at arrival';
COMMENT ON COLUMN public.grn_sessions.pod_box_summary IS 'Spec §9: box receipt summary snapshotted with POD';
COMMENT ON COLUMN public.grn_exceptions.device IS 'Spec §18: device that created the exception';
