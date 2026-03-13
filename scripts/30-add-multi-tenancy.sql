-- Multi-tenancy foundations: tenants table + tenant_id on core domain tables
-- This migration assumes an existing single-tenant deployment and migrates it
-- to a tenant-aware schema by attaching all existing data to a single
-- default tenant.

-- 1) Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL, -- short slug/identifier
  legal_name VARCHAR(255),
  license_number VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Nepal',
  timezone VARCHAR(100) DEFAULT 'Asia/Kathmandu',
  currency VARCHAR(10) DEFAULT 'NPR',
  fiscal_year_start_month INTEGER DEFAULT 4, -- 1-12; April as common start
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2) Attach existing data to a default tenant and add tenant_id columns
DO $$
DECLARE
  v_default_tenant_id UUID;
BEGIN
  -- Create a single default tenant if none exists yet
  INSERT INTO tenants (name, code, legal_name, license_number)
  VALUES ('Default Pharmacy', 'default', 'Default Pharmacy', NULL)
  ON CONFLICT (code) DO NOTHING;

  SELECT id INTO v_default_tenant_id FROM tenants WHERE code = 'default';

  -- Helper macro-like pattern: add tenant_id where missing, backfill, then constrain

  -- users
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE users ADD COLUMN tenant_id UUID;
    UPDATE users SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE users ADD CONSTRAINT users_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- customers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE customers ADD COLUMN tenant_id UUID;
    UPDATE customers SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE customers ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE customers ADD CONSTRAINT customers_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- suppliers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE suppliers ADD COLUMN tenant_id UUID;
    UPDATE suppliers SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE suppliers ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE suppliers ADD CONSTRAINT suppliers_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- categories
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE categories ADD COLUMN tenant_id UUID;
    UPDATE categories SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE categories ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE categories ADD CONSTRAINT categories_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- medicines
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'medicines' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE medicines ADD COLUMN tenant_id UUID;
    UPDATE medicines SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE medicines ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE medicines ADD CONSTRAINT medicines_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- prescriptions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prescriptions' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE prescriptions ADD COLUMN tenant_id UUID;
    UPDATE prescriptions SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE prescriptions ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- prescription_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prescription_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE prescription_items ADD COLUMN tenant_id UUID;
    UPDATE prescription_items SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE prescription_items ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- sales
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN tenant_id UUID;
    UPDATE sales SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE sales ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE sales ADD CONSTRAINT sales_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- sale_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE sale_items ADD COLUMN tenant_id UUID;
    UPDATE sale_items SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE sale_items ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE sale_items ADD CONSTRAINT sale_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- inventory_transactions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inventory_transactions' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE inventory_transactions ADD COLUMN tenant_id UUID;
    UPDATE inventory_transactions SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE inventory_transactions ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- medicine_batches
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'medicine_batches' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE medicine_batches ADD COLUMN tenant_id UUID;
    UPDATE medicine_batches SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE medicine_batches ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE medicine_batches ADD CONSTRAINT medicine_batches_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- batch_allocations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'batch_allocations' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE batch_allocations ADD COLUMN tenant_id UUID;
    UPDATE batch_allocations SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE batch_allocations ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE batch_allocations ADD CONSTRAINT batch_allocations_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- sales_refunds
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_refunds' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE sales_refunds ADD COLUMN tenant_id UUID;
    UPDATE sales_refunds SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE sales_refunds ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE sales_refunds ADD CONSTRAINT sales_refunds_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- sales_refund_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_refund_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE sales_refund_items ADD COLUMN tenant_id UUID;
    UPDATE sales_refund_items SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE sales_refund_items ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE sales_refund_items ADD CONSTRAINT sales_refund_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- medicine_returns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'medicine_returns' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE medicine_returns ADD COLUMN tenant_id UUID;
    UPDATE medicine_returns SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE medicine_returns ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE medicine_returns ADD CONSTRAINT medicine_returns_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- return_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'return_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE return_items ADD COLUMN tenant_id UUID;
    UPDATE return_items SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE return_items ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE return_items ADD CONSTRAINT return_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- purchase_orders
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE purchase_orders ADD COLUMN tenant_id UUID;
    UPDATE purchase_orders SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE purchase_orders ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- purchase_order_items
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_order_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE purchase_order_items ADD COLUMN tenant_id UUID;
    UPDATE purchase_order_items SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE purchase_order_items ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE purchase_order_items ADD CONSTRAINT purchase_order_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- warehouses
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE warehouses ADD COLUMN tenant_id UUID;
    UPDATE warehouses SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE warehouses ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE warehouses ADD CONSTRAINT warehouses_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- warehouse_stock
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warehouse_stock' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE warehouse_stock ADD COLUMN tenant_id UUID;
    UPDATE warehouse_stock SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE warehouse_stock ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE warehouse_stock ADD CONSTRAINT warehouse_stock_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- stock_transfers
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_transfers' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE stock_transfers ADD COLUMN tenant_id UUID;
    UPDATE stock_transfers SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE stock_transfers ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT;
  END IF;

  -- system_settings: make settings tenant-aware (per-tenant + global)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_settings' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE system_settings ADD COLUMN tenant_id UUID;
    -- Attach all existing settings to default tenant
    UPDATE system_settings SET tenant_id = v_default_tenant_id WHERE tenant_id IS NULL;
    ALTER TABLE system_settings ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE system_settings ADD CONSTRAINT system_settings_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    -- Index to keep lookups fast
    CREATE INDEX IF NOT EXISTS idx_system_settings_tenant_key ON system_settings(tenant_id, key);
  END IF;

END $$;

