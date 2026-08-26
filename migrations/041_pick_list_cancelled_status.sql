-- 041: admit 'cancelled' into pick_lists.status.
-- cancelPickList releases reservations but cannot record the status because
-- the original CHECK (002_operations.sql:294) omits 'cancelled'; writing it
-- would abort the transaction and roll the release back with it.
DO $$
BEGIN
  ALTER TABLE public.pick_lists DROP CONSTRAINT IF EXISTS pick_lists_status_check;
  ALTER TABLE public.pick_lists ADD CONSTRAINT pick_lists_status_check
    CHECK (status::text = ANY (ARRAY[
      'draft','open','partially_delivered','completed','cancelled']::text[]));
END $$;
