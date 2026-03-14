-- Database health check: run in Supabase SQL Editor (Dashboard → SQL Editor)
-- Shows what exists and what might be missing for the app to work.

-- 1) Applied migrations
SELECT 'Applied migrations' AS section, migration_name AS name, applied_at::text AS detail
FROM schema_migrations
ORDER BY migration_name;

-- 2) Required tables – which exist
SELECT 'Tables' AS section, r.required AS name,
  CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM (VALUES
  ('tenants'), ('users'), ('customers'), ('suppliers'), ('categories'), ('medicines'),
  ('prescriptions'), ('prescription_items'), ('sales'), ('sale_items'), ('inventory_transactions'),
  ('medicine_returns'), ('sales_refunds'), ('return_items'), ('audit_logs'), ('purchase_orders'),
  ('purchase_order_items'), ('warehouses'), ('system_settings'), ('schema_migrations'),
  ('branches'), ('plans'), ('tenant_subscriptions'), ('notifications')
) AS r(required)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = r.required AND t.table_type = 'BASE TABLE'
ORDER BY r.required;

-- 3) Critical columns on key tables
SELECT 'Columns' AS section,
  r.tbl || '.' || r.col AS name,
  CASE WHEN c.column_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM (VALUES
  ('sales', 'tenant_id'),
  ('sales', 'branch_id'),
  ('sales', 'notes'),
  ('users', 'tenant_id'),
  ('users', 'current_branch_id'),
  ('inventory_transactions', 'tenant_id'),
  ('inventory_transactions', 'branch_id'),
  ('audit_logs', 'tenant_id')
) AS r(tbl, col)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = r.tbl AND c.column_name = r.col
ORDER BY r.tbl, r.col;

-- 4) RPC required for sales
SELECT 'Functions' AS section, p.proname AS name,
  CASE WHEN p.oid IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
FROM (VALUES ('create_sale_with_items')) AS r(required)
LEFT JOIN pg_proc p ON p.proname = r.required
LEFT JOIN pg_namespace n ON p.pronamespace = n.oid AND n.nspname = 'public'
ORDER BY r.required;
