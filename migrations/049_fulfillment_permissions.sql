-- 049: fulfillment permissions (catalog rows assigned to desk roles)
-- Permissions are also listed in api/modules/rbac/catalog.go.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM roles
    WHERE lower(code) IN ('admin', 'wm', 'warehouse_manager', 'supervisor', 'billing')
       OR lower(name) IN ('admin', 'wm', 'warehouse manager', 'supervisor', 'billing')
  LOOP
    INSERT INTO role_permissions (role_id, permission_code)
    VALUES (r.id, 'counter_sale.access')
    ON CONFLICT DO NOTHING;
  END LOOP;

  FOR r IN
    SELECT id FROM roles
    WHERE lower(code) IN ('admin', 'wm', 'warehouse_manager', 'supervisor')
       OR lower(name) IN ('admin', 'wm', 'warehouse manager', 'supervisor')
  LOOP
    INSERT INTO role_permissions (role_id, permission_code)
    VALUES (r.id, 'picking.override')
    ON CONFLICT DO NOTHING;
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'roles/role_permissions not present — skip grants';
  WHEN undefined_column THEN
    RAISE NOTICE 'role_permissions schema mismatch — skip grants';
END $$;
