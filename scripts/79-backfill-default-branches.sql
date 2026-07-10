-- Backfill: every tenant should have at least one branch ("Head Office"),
-- and every tenant-scoped user should have current_branch_id set. New
-- tenants get this automatically at signup (see lib/server/services/tenant-service.ts,
-- seedDefaultBranch); this catches tenants/users created before that existed.

DO $$
DECLARE
  v_tenant RECORD;
  v_branch_id UUID;
BEGIN
  FOR v_tenant IN SELECT id, code FROM tenants LOOP
    INSERT INTO branches (tenant_id, name, code, is_active)
    SELECT v_tenant.id, 'Head Office', v_tenant.code || '-main', true
    WHERE NOT EXISTS (
      SELECT 1 FROM branches WHERE tenant_id = v_tenant.id
    );

    SELECT id INTO v_branch_id
    FROM branches
    WHERE tenant_id = v_tenant.id
    ORDER BY created_at
    LIMIT 1;

    UPDATE users
    SET current_branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id AND current_branch_id IS NULL;
  END LOOP;
END $$;
