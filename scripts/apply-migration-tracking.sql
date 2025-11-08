-- Script to retroactively record migrations that have already been applied
-- Run this AFTER running check-migrations.sql to see what's missing
-- Then manually record which migrations you've already applied

-- Example: Record that a migration has been applied
-- Uncomment and modify as needed for each migration you've already run

-- SELECT record_migration('01-create-pharmacy-tables.sql', 'system', NULL, 'Applied during initial setup');
-- SELECT record_migration('02-seed-initial-data.sql', 'system', NULL, 'Applied during initial setup');
-- SELECT record_migration('03-add-controlled-substance-column.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('04-create-medicine-returns-table.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('05-create-sales-refunds-table.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('06-create-returns-tables.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('07-add-timestamps.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('08-create-audit-logs.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('09-create-purchase-orders.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('10-create-warehouses.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('11-create-medicine-batches.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('12-create-serial-numbers.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('13-create-notifications-table.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('14-create-system-settings.sql', 'system', NULL, 'Applied');
-- SELECT record_migration('15-add-is-taxable-column.sql', 'system', NULL, 'Applied');

-- View all recorded migrations
SELECT * FROM schema_migrations ORDER BY applied_at;

