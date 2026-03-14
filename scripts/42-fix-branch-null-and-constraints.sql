-- Backfill branch_id on existing rows and safely add NOT NULL + FKs

-- 1) Ensure every tenant has at least one branch and backfill NULL branch_id
DO $$
DECLARE
  v_tenant RECORD;
  v_branch_id UUID;
BEGIN
  FOR v_tenant IN SELECT id, name, code FROM tenants LOOP
    -- Ensure default branch
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

    SELECT id INTO v_branch_id
    FROM branches
    WHERE tenant_id = v_tenant.id
    ORDER BY created_at
    LIMIT 1;

    -- Backfill sales
    UPDATE sales
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id
      AND branch_id IS NULL;

    -- Backfill sale_items from their parent sale
    UPDATE sale_items si
    SET branch_id = s.branch_id
    FROM sales s
    WHERE si.sale_id = s.id
      AND si.tenant_id = v_tenant.id
      AND si.branch_id IS NULL;

    -- Backfill inventory_transactions
    UPDATE inventory_transactions
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id
      AND branch_id IS NULL;

    -- Backfill goods_receipts
    UPDATE goods_receipts
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id
      AND branch_id IS NULL;

    -- Backfill goods_receipt_items from parent receipt
    UPDATE goods_receipt_items gri
    SET branch_id = gr.branch_id
    FROM goods_receipts gr
    WHERE gri.goods_receipt_id = gr.id
      AND gri.branch_id IS NULL;

    -- Backfill warehouses
    UPDATE warehouses
    SET branch_id = v_branch_id
    WHERE tenant_id = v_tenant.id
      AND branch_id IS NULL;
  END LOOP;
END $$;

-- 2) Add NOT NULL + FK constraints only when safe (no NULLs, and constraint missing)
DO $$
BEGIN
  -- sales
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'sales' AND constraint_name = 'sales_branch_fk')
     AND NOT EXISTS (SELECT 1 FROM sales WHERE branch_id IS NULL)
  THEN
    ALTER TABLE sales
      ALTER COLUMN branch_id SET NOT NULL,
      ADD CONSTRAINT sales_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;

  -- sale_items
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'sale_items' AND constraint_name = 'sale_items_branch_fk')
     AND NOT EXISTS (SELECT 1 FROM sale_items WHERE branch_id IS NULL)
  THEN
    ALTER TABLE sale_items
      ALTER COLUMN branch_id SET NOT NULL,
      ADD CONSTRAINT sale_items_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;

  -- inventory_transactions
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_transactions' AND column_name = 'branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'inventory_transactions' AND constraint_name = 'inventory_transactions_branch_fk')
     AND NOT EXISTS (SELECT 1 FROM inventory_transactions WHERE branch_id IS NULL)
  THEN
    ALTER TABLE inventory_transactions
      ALTER COLUMN branch_id SET NOT NULL,
      ADD CONSTRAINT inventory_transactions_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;

  -- goods_receipts
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goods_receipts' AND column_name = 'branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'goods_receipts' AND constraint_name = 'goods_receipts_branch_fk')
     AND NOT EXISTS (SELECT 1 FROM goods_receipts WHERE branch_id IS NULL)
  THEN
    ALTER TABLE goods_receipts
      ALTER COLUMN branch_id SET NOT NULL,
      ADD CONSTRAINT goods_receipts_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;

  -- goods_receipt_items
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goods_receipt_items' AND column_name = 'branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'goods_receipt_items' AND constraint_name = 'goods_receipt_items_branch_fk')
     AND NOT EXISTS (SELECT 1 FROM goods_receipt_items WHERE branch_id IS NULL)
  THEN
    ALTER TABLE goods_receipt_items
      ALTER COLUMN branch_id SET NOT NULL,
      ADD CONSTRAINT goods_receipt_items_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;

  -- warehouses
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouses' AND column_name = 'branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'warehouses' AND constraint_name = 'warehouses_branch_fk')
     AND NOT EXISTS (SELECT 1 FROM warehouses WHERE branch_id IS NULL)
  THEN
    ALTER TABLE warehouses
      ALTER COLUMN branch_id SET NOT NULL,
      ADD CONSTRAINT warehouses_branch_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END $$;

