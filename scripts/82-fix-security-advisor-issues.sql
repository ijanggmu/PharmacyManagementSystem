-- Fix Supabase database linter (security advisor) findings:
--   * policy_exists_rls_disabled  : audit_logs, notifications, tenant_subscriptions, tenants
--   * rls_disabled_in_public      : nepal_medicine_catalog, notifications, tenants,
--                                   tenant_subscriptions, plans, goods_receipt_items, audit_logs,
--                                   schema_migrations
--   * security_definer_view       : current_tenant_context, dda_narcotic_register
--   * sensitive_columns_exposed   : tenants.license_number (fixed by enabling RLS + policies below)
--
-- These tables already had CREATE POLICY statements from earlier migrations but were never
-- given ALTER TABLE ... ENABLE ROW LEVEL SECURITY, so the policies were dormant and the
-- tables were fully open via the API. Enabling RLS without adding the missing read/write
-- policies below would silently break audit logging, notifications, the dashboard
-- subscription widget, medicine-catalog search, and GRN posting for ordinary tenant users
-- (they all query through the request-scoped Supabase client, not the service role).

-- 1) Enable RLS on every flagged table
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nepal_medicine_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- 2) Missing policies so ordinary tenant users keep working once RLS is enforced

DO $$
BEGIN
  -- tenants: a tenant user may read (not write) its own tenant row.
  -- Writes stay superadmin-only via the existing "Tenants superadmin all" policy.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Tenants self read'
  ) THEN
    CREATE POLICY "Tenants self read" ON public.tenants
      FOR SELECT
      USING (id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- tenant_subscriptions: a tenant user may read its own subscription rows
  -- (dashboard plan widget, max-users checks). Writes go through the service role.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenant_subscriptions' AND policyname = 'Tenant subscriptions by tenant'
  ) THEN
    CREATE POLICY "Tenant subscriptions by tenant" ON public.tenant_subscriptions
      FOR SELECT
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- audit_logs: tenant users can read and write only their own tenant's audit trail.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'Audit logs by tenant'
  ) THEN
    CREATE POLICY "Audit logs by tenant" ON public.audit_logs
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- notifications: each user can only see/update their own notifications.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'Notifications own user'
  ) THEN
    CREATE POLICY "Notifications own user" ON public.notifications
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- plans: not tenant-scoped, read-only reference data for any signed-in user.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plans' AND policyname = 'Plans readable by authenticated'
  ) THEN
    CREATE POLICY "Plans readable by authenticated" ON public.plans
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  -- nepal_medicine_catalog: shared reference catalog, read-only for any signed-in user.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nepal_medicine_catalog' AND policyname = 'Nepal catalog readable by authenticated'
  ) THEN
    CREATE POLICY "Nepal catalog readable by authenticated" ON public.nepal_medicine_catalog
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  -- goods_receipt_items: no tenant_id column of its own — scope through its parent
  -- goods_receipts row (which is already tenant-scoped).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'goods_receipt_items' AND policyname = 'Goods receipt items by tenant'
  ) THEN
    CREATE POLICY "Goods receipt items by tenant" ON public.goods_receipt_items
      FOR ALL
      USING (
        public.is_superadmin()
        OR EXISTS (
          SELECT 1 FROM public.goods_receipts gr
          WHERE gr.id = goods_receipt_items.goods_receipt_id
            AND gr.tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1)
        )
      )
      WITH CHECK (
        public.is_superadmin()
        OR EXISTS (
          SELECT 1 FROM public.goods_receipts gr
          WHERE gr.id = goods_receipt_items.goods_receipt_id
            AND gr.tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1)
        )
      );
  END IF;

  -- schema_migrations: internal tooling table only, no policies — RLS enabled with
  -- zero policies denies all access via the API/anon/authenticated roles while the
  -- migration runner (service role / direct DB connection) still bypasses RLS.
END $$;

-- 3) security_definer_view: force these views to run with the querying user's
-- privileges/RLS instead of the view owner's, per Supabase advisor guidance.
ALTER VIEW public.current_tenant_context SET (security_invoker = on);
ALTER VIEW public.dda_narcotic_register SET (security_invoker = on);
