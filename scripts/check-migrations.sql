-- Migration Verification Script
-- This script checks which migrations have been applied and which are missing

-- First, ensure migrations table exists
CREATE TABLE IF NOT EXISTS schema_migrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_name VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_by VARCHAR(255),
  checksum VARCHAR(64),
  notes TEXT
);

-- List of all expected migrations
WITH expected_migrations AS (
  SELECT migration_name FROM (VALUES
    ('01-create-pharmacy-tables.sql'),
    ('02-seed-initial-data.sql'),
    ('03-add-controlled-substance-column.sql'),
    ('04-create-medicine-returns-table.sql'),
    ('05-create-sales-refunds-table.sql'),
    ('06-create-returns-tables.sql'),
    ('07-add-timestamps.sql'),
    ('08-create-audit-logs.sql'),
    ('09-create-purchase-orders.sql'),
    ('10-create-warehouses.sql'),
    ('11-create-medicine-batches.sql'),
    ('12-create-serial-numbers.sql'),
    ('13-create-notifications-table.sql'),
    ('14-create-system-settings.sql'),
    ('15-add-is-taxable-column.sql'),
    ('16-add-customer-insurance-columns.sql')
  ) AS t(migration_name)
),
applied_migrations AS (
  SELECT migration_name, applied_at, executed_by
  FROM schema_migrations
)
SELECT 
  em.migration_name,
  CASE 
    WHEN am.migration_name IS NOT NULL THEN 'APPLIED'
    ELSE 'MISSING'
  END AS status,
  am.applied_at,
  am.executed_by
FROM expected_migrations em
LEFT JOIN applied_migrations am ON em.migration_name = am.migration_name
ORDER BY em.migration_name;

-- Summary
SELECT 
  COUNT(*) FILTER (WHERE status = 'APPLIED') AS applied_count,
  COUNT(*) FILTER (WHERE status = 'MISSING') AS missing_count,
  COUNT(*) AS total_migrations
FROM (
  SELECT 
    em.migration_name,
    CASE 
      WHEN am.migration_name IS NOT NULL THEN 'APPLIED'
      ELSE 'MISSING'
    END AS status
  FROM (VALUES
    ('01-create-pharmacy-tables.sql'),
    ('02-seed-initial-data.sql'),
    ('03-add-controlled-substance-column.sql'),
    ('04-create-medicine-returns-table.sql'),
    ('05-create-sales-refunds-table.sql'),
    ('06-create-returns-tables.sql'),
    ('07-add-timestamps.sql'),
    ('08-create-audit-logs.sql'),
    ('09-create-purchase-orders.sql'),
    ('10-create-warehouses.sql'),
    ('11-create-medicine-batches.sql'),
    ('12-create-serial-numbers.sql'),
    ('13-create-notifications-table.sql'),
    ('14-create-system-settings.sql'),
    ('15-add-is-taxable-column.sql'),
    ('16-add-customer-insurance-columns.sql')
  ) AS em(migration_name)
  LEFT JOIN schema_migrations am ON em.migration_name = am.migration_name
) AS migration_status;

