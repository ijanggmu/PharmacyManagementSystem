-- Fix tenant context resolution for RLS.
--
-- Problem:
-- - RLS policies depend on current_tenant_context, which reads public.users.
-- - When public.users has restrictive/self-referential policies, current_tenant_context returns no row,
--   causing INSERT/UPDATE failures (RLS violations) across tenant-scoped tables (medicines, suppliers, etc.).
--
-- Solution:
-- - Introduce a SECURITY DEFINER helper function to fetch current tenant_id from public.users.
-- - Re-create current_tenant_context view to rely on the function (avoids querying users directly).
-- - Add a "Users can read own row" policy (required for many app flows and debugging).
-- - Recreate "Users by tenant" to use the helper function (avoids recursion).

-- 1) Helper: current tenant_id for auth.uid() (bypasses RLS on users)
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.tenant_id
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1
$$;

-- 2) View used by existing policies/scripts (keep name for compatibility)
CREATE OR REPLACE VIEW public.current_tenant_context AS
SELECT
  auth.uid() AS user_id,
  public.current_tenant_id() AS tenant_id;

-- 3) Ensure users has a baseline "own row" SELECT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Users can read own row'
  ) THEN
    CREATE POLICY "Users can read own row" ON public.users
      FOR SELECT
      USING (id = auth.uid());
  END IF;
END $$;

-- 4) Replace the self-referential Users by tenant policy with function-based tenant resolution
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND policyname = 'Users by tenant'
  ) THEN
    DROP POLICY "Users by tenant" ON public.users;
  END IF;

  -- Allow reading/updating users within the same tenant (used by tenant management screens).
  -- Superadmin access is handled by scripts/45-rls-allow-superadmin.sql via public.is_superadmin().
  CREATE POLICY "Users by tenant" ON public.users
    FOR ALL
    USING (tenant_id = public.current_tenant_id())
    WITH CHECK (tenant_id = public.current_tenant_id());
END $$;

