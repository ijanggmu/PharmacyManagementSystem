-- Add current_branch_id to users to track user's active branch

DO $$
DECLARE
  v_user RECORD;
  v_branch_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'current_branch_id'
  ) THEN
    ALTER TABLE users ADD COLUMN current_branch_id UUID;
  END IF;

  -- For each user, set current_branch_id to their tenant's default branch (if available)
  FOR v_user IN SELECT id, tenant_id FROM users LOOP
    IF v_user.tenant_id IS NOT NULL THEN
      SELECT id INTO v_branch_id
      FROM branches
      WHERE tenant_id = v_user.tenant_id
      ORDER BY created_at
      LIMIT 1;

      IF v_branch_id IS NOT NULL THEN
        UPDATE users
        SET current_branch_id = v_branch_id
        WHERE id = v_user.id AND current_branch_id IS NULL;
      END IF;
    END IF;
  END LOOP;

  -- Enforce foreign key; keep column nullable to allow future flexibility
  ALTER TABLE users
    ADD CONSTRAINT users_current_branch_fk FOREIGN KEY (current_branch_id) REFERENCES branches(id) ON DELETE SET NULL;
END $$;

