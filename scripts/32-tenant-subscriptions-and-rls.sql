-- Tenant subscriptions and core row-level security policies

-- 1) Subscription plans
CREATE TABLE IF NOT EXISTS plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  annual_price NUMERIC(10,2),
  max_users INTEGER,
  max_warehouses INTEGER,
  max_branches INTEGER,
  max_invoices_per_month INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Tenant subscriptions
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'cancelled')) DEFAULT 'trial',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  external_subscription_id VARCHAR(255), -- Stripe/other provider
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id ON tenant_subscriptions(tenant_id);

-- 3) Seed a few basic plans if none exist
INSERT INTO plans (code, name, description, monthly_price, annual_price, max_users, max_warehouses, max_invoices_per_month)
VALUES
  ('starter', 'Starter', 'Single location pharmacy with basic features', 0, NULL, 5, 1, 5000),
  ('standard', 'Standard', 'Growing pharmacy with multiple staff members', 29, 299, 15, 3, 25000),
  ('pro', 'Pro', 'High volume pharmacy with advanced reporting', 79, 799, 50, 10, 100000)
ON CONFLICT (code) DO NOTHING;

-- 4) Core row-level security (RLS) policies for multi-tenant isolation

-- Helper: enable RLS on key tables if not already enabled
DO $$
BEGIN
  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants';
  -- RLS on tenants mainly for platform admins; keep simple for now (no policies here)

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users';
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers';
  ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'suppliers';
  ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'categories';
  ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'medicines';
  ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'prescriptions';
  ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'prescription_items';
  ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sales';
  ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sale_items';
  ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'inventory_transactions';
  ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'medicine_batches';
  ALTER TABLE medicine_batches ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'batch_allocations';
  ALTER TABLE batch_allocations ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_settings';
  ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
END $$;

-- Helper expression: resolve current tenant from auth.uid()
CREATE OR REPLACE VIEW current_tenant_context AS
SELECT
  u.id AS user_id,
  u.tenant_id
FROM users u
WHERE u.id = auth.uid();

-- 5) Generic per-tenant policies

-- Users: each tenant can only see its own users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users by tenant'
  ) THEN
    CREATE POLICY "Users by tenant" ON users
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

-- Macro-like helper for other tables
DO $$
BEGIN
  -- customers
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'Customers by tenant'
  ) THEN
    CREATE POLICY "Customers by tenant" ON customers
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- suppliers
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'Suppliers by tenant'
  ) THEN
    CREATE POLICY "Suppliers by tenant" ON suppliers
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- categories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'categories' AND policyname = 'Categories by tenant'
  ) THEN
    CREATE POLICY "Categories by tenant" ON categories
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- medicines
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicines' AND policyname = 'Medicines by tenant'
  ) THEN
    CREATE POLICY "Medicines by tenant" ON medicines
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- prescriptions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prescriptions' AND policyname = 'Prescriptions by tenant'
  ) THEN
    CREATE POLICY "Prescriptions by tenant" ON prescriptions
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- prescription_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prescription_items' AND policyname = 'Prescription items by tenant'
  ) THEN
    CREATE POLICY "Prescription items by tenant" ON prescription_items
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- sales
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sales' AND policyname = 'Sales by tenant'
  ) THEN
    CREATE POLICY "Sales by tenant" ON sales
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- sale_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sale_items' AND policyname = 'Sale items by tenant'
  ) THEN
    CREATE POLICY "Sale items by tenant" ON sale_items
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- inventory_transactions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_transactions' AND policyname = 'Inventory by tenant'
  ) THEN
    CREATE POLICY "Inventory by tenant" ON inventory_transactions
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- medicine_batches
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicine_batches' AND policyname = 'Batches by tenant'
  ) THEN
    CREATE POLICY "Batches by tenant" ON medicine_batches
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- batch_allocations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'batch_allocations' AND policyname = 'Batch allocations by tenant'
  ) THEN
    CREATE POLICY "Batch allocations by tenant" ON batch_allocations
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- system_settings
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'system_settings' AND policyname = 'Settings by tenant'
  ) THEN
    CREATE POLICY "Settings by tenant" ON system_settings
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

