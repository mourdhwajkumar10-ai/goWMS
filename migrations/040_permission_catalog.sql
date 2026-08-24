-- 040: Fine-grained permission catalog and new roles (receiving_operator, viewer).
-- Extends the coarse module-level permissions from 011 with named-action codes
-- and adds role profiles for receiving operators and read-only viewers.
-- Idempotent: ON CONFLICT DO NOTHING on all inserts.

-- New roles (idempotent — skip if code already exists).
INSERT INTO roles (code, name, description, is_system) VALUES
    ('receiving_operator', 'Receiving Operator', 'Receiving scan and verify operations', true),
    ('viewer',             'Viewer',             'Read-only access to warehouse data', true)
ON CONFLICT (code) DO NOTHING;

-- Helper: assign fine-grained permissions to a role by code.
CREATE OR REPLACE FUNCTION _rbac_grant_fine(p_role TEXT, VARIADIC p_perms TEXT[]) RETURNS void AS $$
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

-- receiving_operator: receiving scan/verify, PO view
SELECT _rbac_grant_fine('receiving_operator',
    'grn.access', 'qi.access',
    'receiving.view', 'receiving.start', 'receiving.scan_box',
    'receiving.scan_item', 'receiving.reject_item', 'receiving.complete',
    'po.view', 'notifications.access', 'notifications.view');

-- viewer: read-only across modules
SELECT _rbac_grant_fine('viewer',
    'receiving.view', 'inventory.view', 'reports.view',
    'po.view', 'notifications.access', 'notifications.view',
    'analytics.access');

-- qi: add fine-grained receiving permissions (coarse grn.access already granted in 011)
SELECT _rbac_grant_fine('qi',
    'receiving.view', 'receiving.scan_box', 'receiving.scan_item',
    'receiving.reject_item', 'receiving.complete',
    'po.view', 'notifications.view');

-- supervisor: add all fine-grained ops + approvals
SELECT _rbac_grant_fine('supervisor',
    'receiving.view', 'receiving.start', 'receiving.scan_box',
    'receiving.scan_item', 'receiving.reject_item', 'receiving.complete',
    'receiving.approve', 'po.view', 'po.create', 'po.edit',
    'inventory.view', 'inventory.adjust', 'masterdata.manage',
    'reports.view', 'notifications.view');

-- wm: same as supervisor (legacy alias)
SELECT _rbac_grant_fine('wm',
    'receiving.view', 'receiving.start', 'receiving.scan_box',
    'receiving.scan_item', 'receiving.reject_item', 'receiving.complete',
    'receiving.approve', 'po.view', 'po.create', 'po.edit',
    'inventory.view', 'inventory.adjust', 'masterdata.manage',
    'reports.view', 'notifications.view');

-- Floor roles: add fine-grained view permissions
SELECT _rbac_grant_fine('picker',     'inventory.view', 'notifications.view');
SELECT _rbac_grant_fine('packer',     'inventory.view', 'notifications.view');
SELECT _rbac_grant_fine('dispatcher', 'inventory.view', 'notifications.view');
SELECT _rbac_grant_fine('driver',     'notifications.view');
SELECT _rbac_grant_fine('billing',    'reports.view', 'notifications.view');

DROP FUNCTION IF EXISTS _rbac_grant_fine(TEXT, VARIADIC TEXT[]);