-- 051: "Can't find it" shortage flags — picker flags a line, supervisor
-- reviews in a UI and either backorders it or rejects (item was findable).

CREATE TABLE IF NOT EXISTS pick_shortage_flags (
	id               SERIAL PRIMARY KEY,
	flag_no          VARCHAR(32) UNIQUE NOT NULL,
	pick_list_id     INTEGER NOT NULL REFERENCES pick_lists(id) ON DELETE CASCADE,
	pick_list_item_id INTEGER REFERENCES pick_list_items(id) ON DELETE CASCADE,
	sales_order_no   VARCHAR(140),
	item_code        VARCHAR(140) NOT NULL,
	item_name        VARCHAR(255),
	location_code    VARCHAR(64),
	qty              NUMERIC(18,6) NOT NULL DEFAULT 0,
	reason           TEXT,
	status           VARCHAR(24) NOT NULL DEFAULT 'pending', -- pending | approved | rejected
	flagged_by       INTEGER,
	flagged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	reviewed_by      INTEGER,
	reviewed_at      TIMESTAMPTZ,
	review_note      TEXT,
	backorder_no     VARCHAR(32),
	created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS pick_shortage_flags_no_seq;

CREATE INDEX IF NOT EXISTS idx_shortage_flags_status ON pick_shortage_flags(status);
CREATE INDEX IF NOT EXISTS idx_shortage_flags_pick_list ON pick_shortage_flags(pick_list_id);
