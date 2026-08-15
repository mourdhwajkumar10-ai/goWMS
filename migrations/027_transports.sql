-- 027: Inbound transport / truck master for GRN arrival suggestions

CREATE TABLE IF NOT EXISTS public.transports (
    id serial PRIMARY KEY,
    truck_no varchar(100) NOT NULL,
    name varchar(255),
    transporter varchar(255),
    driver_name varchar(255),
    driver_phone varchar(50),
    notes text,
    disabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS transports_truck_no_uniq
    ON public.transports (lower(btrim(truck_no)));

CREATE INDEX IF NOT EXISTS transports_name_idx
    ON public.transports (lower(btrim(name)));

INSERT INTO public.transports (truck_no, driver_name, driver_phone)
SELECT DISTINCT ON (lower(btrim(gs.truck_no)))
    btrim(gs.truck_no),
    NULLIF(btrim(COALESCE(gs.driver_name, '')), ''),
    NULLIF(btrim(COALESCE(gs.driver_phone, '')), '')
FROM public.grn_sessions gs
WHERE gs.truck_no IS NOT NULL AND btrim(gs.truck_no) <> ''
ON CONFLICT ((lower(btrim(truck_no)))) DO NOTHING;

COMMENT ON TABLE public.transports IS 'Inbound truck/vehicle master used for GRN arrival autocomplete';
