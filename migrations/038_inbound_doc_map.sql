-- Map PO + packing list + GRN on the same receiving session.
-- packing_list_no is the warehouse packing-list id (PL-YYYY-NNNN).
-- purchase_order_id is a real FK; purchase_receipt_no remains the PO name string.

ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS packing_list_no varchar(30);
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS packing_list_filename varchar(255);
ALTER TABLE public.grn_sessions
    ADD COLUMN IF NOT EXISTS purchase_order_id integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'grn_sessions_purchase_order_id_fkey'
    ) THEN
        ALTER TABLE public.grn_sessions
            ADD CONSTRAINT grn_sessions_purchase_order_id_fkey
            FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_grn_sessions_packing_list_no
    ON public.grn_sessions(packing_list_no);
CREATE INDEX IF NOT EXISTS idx_grn_sessions_purchase_order_id
    ON public.grn_sessions(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_grn_sessions_po_name
    ON public.grn_sessions(purchase_receipt_no);

-- Existing packing-list GRNs get a PL number that mirrors the GRN suffix (1:1 today).
UPDATE public.grn_sessions
SET packing_list_no = REPLACE(session_no, 'GRN-', 'PL-')
WHERE packing_list_no IS NULL
  AND session_no LIKE 'GRN-%'
  AND (
    COALESCE(packing_list_available, false)
    OR COALESCE(receiving_mode, '') = 'packing_list'
    OR EXISTS (SELECT 1 FROM public.grn_cartons c WHERE c.grn_session_id = grn_sessions.id)
  );

-- Link sessions to PO rows by name.
UPDATE public.grn_sessions gs
SET purchase_order_id = po.id
FROM public.purchase_orders po
WHERE gs.purchase_order_id IS NULL
  AND NULLIF(TRIM(gs.purchase_receipt_no), '') IS NOT NULL
  AND po.name = gs.purchase_receipt_no;
