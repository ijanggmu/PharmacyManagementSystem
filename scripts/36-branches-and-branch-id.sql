-- Multi-branch support: branches table + branch_id on transactional tables

-- 1) Branches table (per-tenant branches)
CREATE TABLE IF NOT EXISTS branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

-- 2) Add branch_id to key transactional tables and backfill to a default branch per tenant
DO $$
DECLARE
  v_tenant RECORD;
  v_branch_id UUID;
BEGIN
  -- For each tenant, ensure at least one default branch exists
  FOR v_tenant IN SELECT id, name, code FROM tenants LOOP
    -- Create a default branch if none exists yet
    INSERT INTO branches (tenant_id, name, code, address, phone, email)
    SELECT v_tenant.id,
           COALESCE(v_tenant.name, 'Main Branch'),
           v_tenant.code || '-main',
           NULL,
           NULL,
           NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM branches WHERE tenant_id = v_tenant.id
    );

    -- Get a stable default branch for this tenant
    SELECT id INTO v_branch_id
    FROM branches
    WHERE tenant_id = v_tenant.id
    ORDER BY created_at
    LIMIT 1;

    -- Attach branch_id column where missing and backfill NULLs for this tenant

    -- sales
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE sales ADD COLUMN branch_id UUID;
    END IF;

    UPDATE sales
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id AND branch_id IS NULL;

    -- sale_items
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE sale_items ADD COLUMN branch_id UUID;
    END IF;

    UPDATE sale_items si
    SET branch_id = s.branch_id
    FROM sales s
    WHERE si.sale_id = s.id
      AND si.tenant_id = v_tenant.id
      AND si.branch_id IS NULL;

    -- inventory_transactions
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'inventory_transactions' AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE inventory_transactions ADD COLUMN branch_id UUID;
    END IF;

    UPDATE inventory_transactions
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id AND branch_id IS NULL;

    -- goods_receipts
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'goods_receipts' AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE goods_receipts ADD COLUMN branch_id UUID;
    END IF;

    UPDATE goods_receipts
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id AND branch_id IS NULL;

    -- goods_receipt_items
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'goods_receipt_items' AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE goods_receipt_items ADD COLUMN branch_id UUID;
    END IF;

    UPDATE goods_receipt_items gri
    SET branch_id = gr.branch_id
    FROM goods_receipts gr
    WHERE gri.goods_receipt_id = gr.id
      AND gri.branch_id IS NULL;

    -- warehouses
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'warehouses' AND column_name = 'branch_id'
    ) THEN
      ALTER TABLE warehouses ADD COLUMN branch_id UUID;
    END IF;

    UPDATE warehouses
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id AND branch_id IS NULL;
  END LOOP;
END $$;
