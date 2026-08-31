-- Driver check-in / dock visit tracking for inbound trucks.
-- Status flow: planned → dock → unloading → box_verification → signed_off

CREATE TABLE IF NOT EXISTS public.driver_visits (
  id                serial PRIMARY KEY,
  warehouse_id      integer REFERENCES public.warehouses(id),
  truck_no          varchar(100) NOT NULL,
  driver_name       varchar(200),
  driver_phone      varchar(50),
  transporter       varchar(200),
  dock              varchar(100),
  purchase_order_id integer,
  purchase_receipt_no varchar(120),
  supplier_name     varchar(255),
  grn_session_id    integer REFERENCES public.grn_sessions(id) ON DELETE SET NULL,
  status            varchar(40) NOT NULL DEFAULT 'planned',
  planned_at        timestamptz NOT NULL DEFAULT now(),
  dock_at           timestamptz,
  unloading_at      timestamptz,
  box_verification_at timestamptz,
  signed_off_at     timestamptz,
  notes             text,
  created_by        integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_visits_status_check CHECK (
    status IN ('planned','dock','unloading','box_verification','signed_off','cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_driver_visits_status ON public.driver_visits (status);
CREATE INDEX IF NOT EXISTS idx_driver_visits_planned ON public.driver_visits (planned_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_visits_truck ON public.driver_visits (lower(btrim(truck_no)));
CREATE INDEX IF NOT EXISTS idx_driver_visits_grn ON public.driver_visits (grn_session_id);
CREATE INDEX IF NOT EXISTS idx_driver_visits_po ON public.driver_visits (purchase_order_id);

COMMENT ON TABLE public.driver_visits IS
  'Inbound driver check-in board: planned → dock → unloading → box verification → signed off';
COMMENT ON COLUMN public.driver_visits.status IS
  'planned | dock | unloading | box_verification | signed_off | cancelled';
