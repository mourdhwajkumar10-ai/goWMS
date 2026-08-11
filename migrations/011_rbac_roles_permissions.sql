-- 011: Admin-configurable RBAC (roles + role_permissions)
-- JWT continues to use roles.code as the `role` claim (employees.wms_role / users.role).
-- API enforcement stays OFF until GOWMS_RBAC=1 — configure roles first, then enable.

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(50) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id          INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code  VARCHAR(80) NOT NULL,
    PRIMARY KEY (role_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_code ON role_permissions(permission_code);

-- Allow custom / new role codes on users.role (was hardcoded picker|packer|driver|wm|billing|admin).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Seed system roles (preferred + legacy aliases for existing PIN / password users)
INSERT INTO roles (code, name, description, is_system) VALUES
    ('admin',       'Admin',       'Full system access; manage roles and employees', true),
    ('supervisor',  'Supervisor',  'Warehouse supervisor (floor + masters)', true),
    ('picker',      'Picker',      'Picking operations', true),
    ('packer',      'Packer',      'Packing operations', true),
    ('qi',          'QI',          'Quality inspection', true),
    ('dispatcher',  'Dispatcher',  'Dispatch / delivery notes', true),
    ('wm',          'Warehouse Manager', 'Legacy alias of supervisor', true),
    ('driver',      'Driver',      'Legacy alias of dispatcher', true),
    ('billing',     'Billing',     'Sales orders and billing', true)
ON CONFLICT (code) DO NOTHING;

-- Helper: assign permission codes to a role by code
CREATE OR REPLACE FUNCTION _rbac_grant(p_role TEXT, VARIADIC p_perms TEXT[]) RETURNS void AS $$
DECLARE
    rid INT;
    p TEXT;
BEGIN
    SELECT id INTO rid FROM roles WHERE code = p_role;
    IF rid IS NULL THEN
        RETURN;
    END IF;
    FOREACH p IN ARRAY p_perms LOOP
        INSERT INTO role_permissions (role_id, permission_code)
        VALUES (rid, p)
        ON CONFLICT DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT _rbac_grant('admin', '*');

SELECT _rbac_grant('supervisor',
    'masters.access', 'grn.access', 'qi.access', 'putaway.access',
    'sales_orders.access', 'picking.access', 'packing.access', 'dispatch.access',
    'backorders.access', 'returns.access', 'analytics.access', 'notifications.access',
    'import_export.access', 'employees.manage');

SELECT _rbac_grant('wm',
    'masters.access', 'grn.access', 'qi.access', 'putaway.access',
    'sales_orders.access', 'picking.access', 'packing.access', 'dispatch.access',
    'backorders.access', 'returns.access', 'analytics.access', 'notifications.access',
    'import_export.access', 'employees.manage');

SELECT _rbac_grant('picker',
    'picking.access', 'masters.access', 'notifications.access', 'analytics.access');

SELECT _rbac_grant('packer',
    'packing.access', 'picking.access', 'masters.access', 'notifications.access');

SELECT _rbac_grant('qi',
    'qi.access', 'grn.access', 'masters.access', 'notifications.access');

SELECT _rbac_grant('dispatcher',
    'dispatch.access', 'notifications.access', 'sales_orders.access');

SELECT _rbac_grant('driver',
    'dispatch.access', 'notifications.access', 'sales_orders.access');

SELECT _rbac_grant('billing',
    'sales_orders.access', 'analytics.access', 'notifications.access', 'import_export.access');

DROP FUNCTION IF EXISTS _rbac_grant(TEXT, VARIADIC TEXT[]);
