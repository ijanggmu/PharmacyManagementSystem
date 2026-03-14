  -- Allow superadmin role and nullable tenant_id for users (superadmin has no tenant)
  -- 1) Allow tenant_id to be NULL (for superadmin only)
  ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL;

  -- 2) Drop existing role check and add extended one (superadmin, manager, staff)
  DO $$
  DECLARE
    cname text;
  BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
    LIMIT 1;
    IF cname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', cname);
    END IF;
  END $$;

  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'pharmacist', 'cashier', 'manager', 'staff', 'superadmin'));
