-- Fix: "Users by tenant" RLS policy on public.users was role-blind — any authenticated
-- member of a tenant (including a cashier) could UPDATE any other user's row in that
-- tenant, including their own `role` column, enabling self privilege-escalation to admin.
--
-- This is defense-in-depth alongside the app-layer fix in app/api/users/[id]/route.ts
-- (which now requires the users:write / users:delete permission, i.e. admin/superadmin
-- only, and rejects setting role to "superadmin"). Session-scoped routes use the anon
-- key + RLS, so RLS must independently enforce the same rule.

-- 1) Helper: current user's role (bypasses RLS on users, mirrors current_tenant_id()).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1
$$;

-- 2) Replace the single role-blind "FOR ALL" policy with per-operation policies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users by tenant'
  ) THEN
    DROP POLICY "Users by tenant" ON public.users;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users select within tenant'
  ) THEN
    DROP POLICY "Users select within tenant" ON public.users;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users insert by admin'
  ) THEN
    DROP POLICY "Users insert by admin" ON public.users;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users update by admin'
  ) THEN
    DROP POLICY "Users update by admin" ON public.users;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users delete by admin'
  ) THEN
    DROP POLICY "Users delete by admin" ON public.users;
  END IF;

  -- Any tenant member can see their colleagues (needed for staff-selection dropdowns
  -- on refunds/returns, "processed by", etc.) — read-only, no data-integrity risk.
  CREATE POLICY "Users select within tenant" ON public.users
    FOR SELECT
    USING (tenant_id = public.current_tenant_id());

  -- Only admin/superadmin of the same tenant can create a user row via a session-scoped
  -- client, and never with role = 'superadmin' (that is a platform-level role, granted
  -- only via the separate superadmin seed/management flow, never through tenant routes).
  CREATE POLICY "Users insert by admin" ON public.users
    FOR INSERT
    WITH CHECK (
      tenant_id = public.current_tenant_id()
      AND public.current_user_role() IN ('admin', 'superadmin')
      AND role <> 'superadmin'
    );

  -- Only admin/superadmin of the same tenant can update a user row, and can never
  -- promote anyone (including themselves) to 'superadmin' through this path.
  CREATE POLICY "Users update by admin" ON public.users
    FOR UPDATE
    USING (
      tenant_id = public.current_tenant_id()
      AND public.current_user_role() IN ('admin', 'superadmin')
    )
    WITH CHECK (
      tenant_id = public.current_tenant_id()
      AND public.current_user_role() IN ('admin', 'superadmin')
      AND role <> 'superadmin'
    );

  -- Only admin/superadmin of the same tenant can delete a user row.
  CREATE POLICY "Users delete by admin" ON public.users
    FOR DELETE
    USING (
      tenant_id = public.current_tenant_id()
      AND public.current_user_role() IN ('admin', 'superadmin')
    );
END $$;
