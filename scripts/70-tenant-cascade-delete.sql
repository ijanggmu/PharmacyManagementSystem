-- Superadmin tenant deletion previously failed with FK violations because most
-- tenant-scoped tables used ON DELETE RESTRICT. Hard-deleting a tenant is now a
-- deliberate, re-authenticated action (see app/api/tenants/[id]/route.ts), so the
-- RESTRICT safety net is replaced with CASCADE: deleting a tenant removes all of
-- its business data in one transaction instead of failing partway through.
--
-- Wrapped in to_regclass guards because a few of these tables (warehouses,
-- warehouse_stock, stock_transfers, batch_allocations) only exist in
-- deployments that ran the later warehouse/batch-allocation migrations.
BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users', 'customers', 'suppliers', 'categories', 'medicines',
    'prescriptions', 'prescription_items', 'sales', 'sale_items',
    'inventory_transactions', 'medicine_batches', 'batch_allocations',
    'sales_refunds', 'sales_refund_items', 'medicine_returns', 'return_items',
    'purchase_orders', 'purchase_order_items', 'warehouses', 'warehouse_stock',
    'stock_transfers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, t || '_tenant_fk');
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE',
        t, t || '_tenant_fk'
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
