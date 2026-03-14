-- Extend multi-tenant RLS coverage and add tenant_id to audit_logs

-- 1) Enable RLS on remaining tenant-scoped tables
DO $$
BEGIN
  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sales_refunds';
  ALTER TABLE sales_refunds ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sales_refund_items';
  ALTER TABLE sales_refund_items ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'medicine_returns';
  ALTER TABLE medicine_returns ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'return_items';
  ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'purchase_orders';
  ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'purchase_order_items';
  ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'warehouses';
  ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'warehouse_stock';
  ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stock_transfers';
  ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'branches';
  ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'supplier_ledger_entries';
  ALTER TABLE supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'goods_receipts';
  ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;

  PERFORM 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ird_invoice_queue';
  ALTER TABLE ird_invoice_queue ENABLE ROW LEVEL SECURITY;
END $$;

-- 2) Per-tenant RLS policies for these tables
DO $$
BEGIN
  -- sales_refunds
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_refunds' AND policyname = 'Sales refunds by tenant'
  ) THEN
    CREATE POLICY "Sales refunds by tenant" ON sales_refunds
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- sales_refund_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sales_refund_items' AND policyname = 'Sales refund items by tenant'
  ) THEN
    CREATE POLICY "Sales refund items by tenant" ON sales_refund_items
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- medicine_returns
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'medicine_returns' AND policyname = 'Medicine returns by tenant'
  ) THEN
    CREATE POLICY "Medicine returns by tenant" ON medicine_returns
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- return_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'return_items' AND policyname = 'Return items by tenant'
  ) THEN
    CREATE POLICY "Return items by tenant" ON return_items
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- purchase_orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'purchase_orders' AND policyname = 'Purchase orders by tenant'
  ) THEN
    CREATE POLICY "Purchase orders by tenant" ON purchase_orders
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- purchase_order_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'purchase_order_items' AND policyname = 'Purchase order items by tenant'
  ) THEN
    CREATE POLICY "Purchase order items by tenant" ON purchase_order_items
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- warehouses
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouses' AND policyname = 'Warehouses by tenant'
  ) THEN
    CREATE POLICY "Warehouses by tenant" ON warehouses
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- warehouse_stock
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'warehouse_stock' AND policyname = 'Warehouse stock by tenant'
  ) THEN
    CREATE POLICY "Warehouse stock by tenant" ON warehouse_stock
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- stock_transfers
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stock_transfers' AND policyname = 'Stock transfers by tenant'
  ) THEN
    CREATE POLICY "Stock transfers by tenant" ON stock_transfers
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- branches
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'branches' AND policyname = 'Branches by tenant'
  ) THEN
    CREATE POLICY "Branches by tenant" ON branches
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- supplier_ledger_entries
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_ledger_entries' AND policyname = 'Supplier ledger by tenant'
  ) THEN
    CREATE POLICY "Supplier ledger by tenant" ON supplier_ledger_entries
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- goods_receipts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'goods_receipts' AND policyname = 'Goods receipts by tenant'
  ) THEN
    CREATE POLICY "Goods receipts by tenant" ON goods_receipts
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  -- ird_invoice_queue
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ird_invoice_queue' AND policyname = 'IRD queue by tenant'
  ) THEN
    CREATE POLICY "IRD queue by tenant" ON ird_invoice_queue
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

-- 3) Add tenant_id to audit_logs and backfill from users
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

UPDATE audit_logs al
SET tenant_id = u.tenant_id
FROM users u
WHERE al.user_id = u.id
  AND al.tenant_id IS NULL;

-- 4) Update create_audit_log to populate tenant_id
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM users
  WHERE id = auth.uid();

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, user_id, tenant_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD), auth.uid(), v_tenant_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id, tenant_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW), auth.uid(), v_tenant_id);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, action, new_data, user_id, tenant_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW), auth.uid(), v_tenant_id);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

