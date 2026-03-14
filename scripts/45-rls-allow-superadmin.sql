-- RLS: allow superadmin (tenant_id IS NULL) to read own row and to bypass tenant filter.
-- Fixes "Database error querying schema" when logging in as admin@pharmacare.local (superadmin).

-- 1) Superadmin can read/update own row on users (so current_tenant_context view returns a row)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users superadmin own row'
  ) THEN
    CREATE POLICY "Users superadmin own row" ON users
      FOR ALL
      USING (id = auth.uid() AND tenant_id IS NULL)
      WITH CHECK (id = auth.uid() AND tenant_id IS NULL);
  END IF;
END $$;

-- 2) Helper: true if current user is superadmin (SECURITY DEFINER so it can read users despite RLS)
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'superadmin'
  );
$$;

-- 3) Allow superadmin to read tenants (for Tenants page)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tenants' AND policyname = 'Tenants superadmin all'
  ) THEN
    CREATE POLICY "Tenants superadmin all" ON tenants
      FOR ALL
      USING (public.is_superadmin())
      WITH CHECK (public.is_superadmin());
  END IF;
END $$;

-- 4) For tenant-scoped tables: allow superadmin to read all rows (so dashboard and tenant management work)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers', 'suppliers', 'categories', 'medicines', 'prescriptions', 'prescription_items',
    'sales', 'sale_items', 'inventory_transactions', 'medicine_batches', 'batch_allocations',
    'system_settings', 'sales_refunds', 'sales_refund_items', 'medicine_returns', 'return_items',
    'purchase_orders', 'purchase_order_items', 'warehouses', 'warehouse_stock', 'stock_transfers',
    'branches', 'supplier_ledger_entries', 'goods_receipts', 'ird_invoice_queue',
    'tenant_subscriptions', 'notifications', 'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'Superadmin read all'
      ) THEN
        EXECUTE format(
          'CREATE POLICY "Superadmin read all" ON %I FOR SELECT USING (public.is_superadmin())',
          t
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- 5) users: superadmin can read/update all users (so current_tenant_context works and Tenants page can list users)
DROP POLICY IF EXISTS "Users superadmin own row" ON users;
CREATE POLICY "Users superadmin own row" ON users
  FOR ALL
  USING (
    (id = auth.uid() AND tenant_id IS NULL)
    OR public.is_superadmin()
  )
  WITH CHECK (
    (id = auth.uid() AND tenant_id IS NULL)
    OR public.is_superadmin()
  );
