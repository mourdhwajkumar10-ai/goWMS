#!/usr/bin/env python3
"""Regenerate goWMS migrations from the recovered Postgres schema dump.

Reads recovery/gowms_schema.sql (pg_dump --schema-only) and splits it into
idempotent migrations: sequences, tables, column defaults, indexes, constraints.

Sequences + their SET DEFAULT nextval statements travel with their owner table
so a fresh DB builds cleanly.

Usage: python3 scripts/gen_migrations.py recovery/gowms_schema.sql migrations/
"""
import re
import sys
from pathlib import Path


def parse_dump(path: str):
    """Return ordered (kind, table, sql) items from a pg_dump schema-only file."""
    content = Path(path).read_text()
    lines = content.splitlines()
    items = []
    buf = []
    kind = None
    table = None
    in_block = False

    def flush():
        nonlocal buf, kind, table
        if buf:
            sql = "\n".join(buf).strip()
            if sql:
                items.append((kind, table, sql))
        buf = []

    def classify(s: str):
        nonlocal kind, table
        if s.startswith("CREATE SEQUENCE"):
            kind = "sequence"
            m = re.search(r"CREATE SEQUENCE (public\.\w+_id_seq)", s)
            table = m.group(1).replace("_id_seq", "") if m else None
            return "block"
        if s.startswith("CREATE TABLE"):
            kind = "table"
            m = re.search(r"CREATE TABLE (public\.\w+)", s)
            table = m.group(1) if m else None
            return "block"
        if s.startswith("ALTER TABLE ONLY") and "SET DEFAULT nextval" in s:
            kind = "default"
            m = re.search(r"ALTER TABLE ONLY (public\.\w+)", s)
            table = m.group(1) if m else None
            return "line"
        if s.startswith("ALTER TABLE") and ("ADD CONSTRAINT" in s or "ADD PRIMARY KEY" in s):
            kind = "constraint"
            m = re.search(r"ALTER TABLE (?:ONLY )?(public\.\w+)", s)
            table = m.group(1) if m else None
            return "line"
        if s.startswith("ALTER TABLE ONLY public.") and not in_block:
            # Multi-line constraint block:
            #   ALTER TABLE ONLY public.x
            #       ADD CONSTRAINT x_pkey PRIMARY KEY (id);
            kind = "constraint"
            m = re.search(r"ALTER TABLE ONLY (public\.\w+)", s)
            table = m.group(1) if m else None
            return "block"
        if s.startswith("CREATE INDEX") or s.startswith("CREATE UNIQUE INDEX"):
            kind = "index"
            m = re.search(r"ON (public\.\w+)", s)
            table = m.group(1) if m else None
            return "line"
        if s.startswith("ALTER TABLE") and "OWNER TO" in s:
            kind = "owner"
            m = re.search(r"ALTER TABLE (?:ONLY )?(public\.\w+)", s)
            table = m.group(1) if m else None
            return "line"
        if s.startswith(("SET ", "SELECT ", "--", "COMMENT ON")):
            kind = table = None
            return "skip"
        return None

    for line in lines:
        s = line.strip()

        if not in_block:
            mode = classify(s)
            if mode == "line":
                # Single-line complete statement (ends with ';')
                items.append((kind, table, s))
                continue
            if mode == "skip":
                continue
            if mode != "block":
                continue
            in_block = True

        if in_block:
            buf.append(line)
            if s.endswith(");") or s.endswith(";"):
                flush()
                in_block = False
    flush()
    return items


def make_if_not_exists(kind: str, sql: str) -> str:
    """Make statements idempotent."""
    if kind == "table":
        return re.sub(r"CREATE TABLE (public\.\w+)", r"CREATE TABLE IF NOT EXISTS \1", sql, count=1)
    if kind == "sequence":
        return re.sub(r"CREATE SEQUENCE (public\.\w+)", r"CREATE SEQUENCE IF NOT EXISTS \1", sql, count=1)
    if kind == "index":
        return re.sub(r"CREATE (UNIQUE )?INDEX (\w+)", r"CREATE \1INDEX IF NOT EXISTS \2", sql, count=1)
    if kind == "default":
        # ALTER TABLE ONLY public.x ALTER COLUMN id SET DEFAULT nextval(...) -> guarded
        m = re.match(r"ALTER TABLE ONLY (public\.\w+) ALTER COLUMN (\w+) SET DEFAULT (.*);", sql)
        if m:
            tbl, col, expr = m.groups()
            return (
                f"DO $$\nBEGIN\n"
                f"  IF NOT EXISTS (SELECT 1 FROM information_schema.columns "
                f"WHERE table_schema='public' AND table_name='{tbl.replace('public.', '')}' "
                f"AND column_name='{col}' AND column_default IS NOT NULL) THEN\n"
                f"    ALTER TABLE ONLY {tbl} ALTER COLUMN {col} SET DEFAULT {expr};\n"
                f"  END IF;\n"
                f"END $$;"
            )
        return f"-- (default not made idempotent)\n{sql}"
    if kind == "constraint":
        m = re.search(r"ALTER TABLE (?:ONLY )?(public\.\w+)\s+ADD CONSTRAINT (\w+)", sql, re.S)
        if m:
            tbl, con = m.groups()
            body = sql.replace("ALTER TABLE ONLY ", "ALTER TABLE ", 1)
            return (
                f"DO $$\nBEGIN\n"
                f"  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{con}' "
                f"AND conrelid = '{tbl}'::regclass) THEN\n"
                f"    {body}\n"
                f"  END IF;\n"
                f"END $$;"
            )
        return f"-- (constraint not made idempotent)\n{sql}"
    return sql


def file_for_table(table: str) -> str:
    core_prefixes = (
        "public.users", "public.items", "public.warehouses", "public.customers",
        "public.suppliers", "public.companies", "public.currencies", "public.uoms",
        "public.customer_groups", "public.supplier_groups", "public.item_groups",
        "public.business_units", "public.fiscal_years", "public.cost_centers",
        "public.payment_terms", "public.employees", "public.motorcycle_models",
    )
    ops_prefixes = (
        "public.purchase_orders", "public.purchase_order_items", "public.sales_orders",
        "public.purchase_receipts", "public.purchase_invoices", "public.sales_invoices",
        "public.delivery_notes", "public.packing_slips", "public.grn_sessions",
        "public.grn_cartons", "public.grn_lines", "public.pick_lists", "public.pick_list_items",
        "public.boxes", "public.box_items", "public.delivery_trips", "public.delivery_stops",
    )
    if not table:
        return "003_extras.sql"
    if table in core_prefixes or table.startswith(core_prefixes):
        return "001_core_schema.sql"
    if table in ops_prefixes or table.startswith(ops_prefixes):
        return "002_operations.sql"
    return "003_extras.sql"


def main():
    dump_path = sys.argv[1]
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    items = parse_dump(dump_path)

    groups = {"001_core_schema.sql": [], "002_operations.sql": [], "003_extras.sql": []}
    for kind, table, sql in items:
        target = file_for_table(table)
        groups[target].append((kind, sql))

    # Within each file: sequence -> table -> default -> primary/unique keys
    # -> index -> foreign keys -> owner (FKs need the referenced PK to exist first)
    def sort_key(item):
        kind, sql = item
        if kind == "sequence":
            return 0
        if kind == "table":
            return 1
        if kind == "default":
            return 2
        if kind == "constraint":
            if "PRIMARY KEY" in sql or "UNIQUE" in sql:
                return 3
            return 6
        if kind == "index":
            return 4
        if kind == "owner":
            return 9
        return 5

    header = "-- Auto-regenerated from recovered schema dump (pg_dump --schema-only).\n" \
             "-- Idempotent: safe to run repeatedly.\n\n"

    for fname in ("001_core_schema.sql", "002_operations.sql", "003_extras.sql"):
        stmts = groups[fname]
        stmts.sort(key=sort_key)
        body = "\n\n".join(make_if_not_exists(k, s) for k, s in stmts)
        (out_dir / fname).write_text(header + body + "\n")
        kinds = {}
        for k, _ in stmts:
            kinds[k] = kinds.get(k, 0) + 1
        print(f"{fname}: {len(stmts)} statements {kinds}")

    print(f"\nTotal statements: {len(items)}")


if __name__ == "__main__":
    main()
