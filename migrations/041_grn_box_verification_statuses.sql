-- 041: Explicit GRN box verification lifecycle.
-- New writes should use received -> box_verified -> item_verified.
-- Legacy verified is retained for backward-compatible reads and old rows.

ALTER TABLE public.grn_cartons DROP CONSTRAINT IF EXISTS grn_cartons_status_check;
ALTER TABLE public.grn_cartons ADD CONSTRAINT grn_cartons_status_check CHECK (
  status = ANY (ARRAY[
    'pending', 'expected', 'received', 'box_verified', 'item_verified',
    'completed', 'rejected', 'exception', 'accounted', 'unmatched',
    'excess', 'missing', 'verified'
  ]::varchar[])
);
