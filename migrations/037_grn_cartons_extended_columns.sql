-- Idempotent migration to add extended packing list columns to grn_cartons

ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS branch varchar(255);
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS invoice_date timestamptz;
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS delivery_date timestamptz;
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS box_no_from varchar(50);
ALTER TABLE grn_cartons ADD COLUMN IF NOT EXISTS box_no_to varchar(50);
