# Database Migration Guide

## Overview
This directory contains all database migration scripts for the Pharmacy Management System. Migrations should be run in numerical order.

## Migration Scripts

1. **00-create-migrations-table.sql** - Creates migration tracking table (run this first)
2. **01-create-pharmacy-tables.sql** - Creates core tables (users, customers, medicines, etc.)
3. **02-seed-initial-data.sql** - Seeds initial data
4. **03-add-controlled-substance-column.sql** - Adds controlled_substance column to medicines
5. **04-create-medicine-returns-table.sql** - Creates medicine_returns table
6. **05-create-sales-refunds-table.sql** - Creates sales_refunds table
7. **06-create-returns-tables.sql** - Creates returns and return_items tables
8. **07-add-timestamps.sql** - Adds updated_at columns and triggers
9. **08-create-audit-logs.sql** - Creates audit_logs table and triggers
10. **09-create-purchase-orders.sql** - Creates purchase_orders table
11. **10-create-warehouses.sql** - Creates warehouses and related tables
12. **11-create-medicine-batches.sql** - Creates medicine_batches table
13. **12-create-serial-numbers.sql** - Creates serial_numbers table
14. **13-create-notifications-table.sql** - Creates notifications table
15. **14-create-system-settings.sql** - Creates system_settings table
16. **15-add-is-taxable-column.sql** - Adds is_taxable column to medicines
17. **16-add-customer-insurance-columns.sql** - Adds insurance_provider, insurance_number, and emergency_contact columns to customers

## How to Check What’s Missing (Supabase)

To confirm the database has everything the app needs (tables, columns, migrations):

### 1. Get your database connection string

- Open **Supabase Dashboard** → your project → **Project Settings** → **Database**.
- Under **Connection string**, choose **URI** and copy it.
- Set it locally (replace password and optionally the host if using pooler):
  ```bash
  set SUPABASE_DB_URL=postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
  ```
  Or create a `.env.local` and add `SUPABASE_DB_URL=...` (do not commit this file).

### 2. Run the health check (Node)

From the project root:

```bash
node scripts/check-database-health.js
```

This script:

- Compares **applied migrations** (in `schema_migrations`) with `scripts/*.sql` and lists **pending** migrations.
- Verifies **required tables** (e.g. `tenants`, `users`, `sales`, `audit_logs`, `branches`, …).
- Verifies **critical columns** (e.g. `sales.notes`, `sales.branch_id`, `audit_logs.tenant_id`, …).
- Verifies the **`create_sale_with_items`** function exists.

If anything is missing, it prints a list. Apply pending migrations with:

```bash
node scripts/run-migrations.js
```

### 3. Run the health check (SQL only)

If you prefer not to use Node, run **`scripts/check-database-health.sql`** in the Supabase **SQL Editor**. It returns result sets for applied migrations, table existence, critical columns, and the `create_sale_with_items` function. Fix any missing items by running the corresponding migrations (in order) from the SQL Editor or via `run-migrations.js`.

---

## How to Check Migration Status

### Method 1: Using the Verification Script

1. **Run the migration tracking table creation** (if not already done):
   ```sql
   -- In your Supabase SQL Editor or database client
   -- Run: scripts/00-create-migrations-table.sql
   ```

2. **Check which migrations have been applied**:
   ```sql
   -- Run: scripts/check-migrations.sql
   -- This will show you which migrations are APPLIED and which are MISSING
   ```

3. **Verify schema completeness**:
   ```sql
   -- Run: scripts/verify-schema.sql
   -- This checks for tables, columns, and constraints
   ```

### Method 2: Manual Verification

Check for key indicators of each migration:

#### Migration 01 - Core Tables
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('users', 'medicines', 'customers', 'sales');
```

#### Migration 03 - Controlled Substance
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'medicines' AND column_name = 'controlled_substance';
```

#### Migration 15 - Is Taxable
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'medicines' AND column_name = 'is_taxable';
```

#### Migration 08 - Audit Logs
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'audit_logs';
```

#### Migration 10 - Warehouses
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('warehouses', 'warehouse_stock');
```

#### Migration 11 - Medicine Batches
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'medicine_batches';
```

#### Migration 13 - Notifications
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'notifications';
```

#### Migration 14 - System Settings
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'system_settings';
```

## Applying Missing Migrations

1. **Check what's missing** using `check-migrations.sql`
2. **Run missing migrations in order** from the scripts directory
3. **Record the migration** after running:
   ```sql
   SELECT record_migration('XX-migration-name.sql', 'your_name', NULL, 'Applied manually');
   ```

## Quick Status Check Query

Run this single query to see all migration status:

```sql
-- Ensure migrations table exists
CREATE TABLE IF NOT EXISTS schema_migrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_name VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_by VARCHAR(255),
  checksum VARCHAR(64),
  notes TEXT
);

-- Check status
WITH expected AS (
  SELECT unnest(ARRAY[
    '01-create-pharmacy-tables.sql',
    '02-seed-initial-data.sql',
    '03-add-controlled-substance-column.sql',
    '04-create-medicine-returns-table.sql',
    '05-create-sales-refunds-table.sql',
    '06-create-returns-tables.sql',
    '07-add-timestamps.sql',
    '08-create-audit-logs.sql',
    '09-create-purchase-orders.sql',
    '10-create-warehouses.sql',
    '11-create-medicine-batches.sql',
    '12-create-serial-numbers.sql',
    '13-create-notifications-table.sql',
    '14-create-system-settings.sql',
    '15-add-is-taxable-column.sql',
    '16-add-customer-insurance-columns.sql'
  ]) AS migration_name
)
SELECT 
  e.migration_name,
  CASE WHEN m.migration_name IS NOT NULL THEN '✅ APPLIED' ELSE '❌ MISSING' END AS status,
  m.applied_at,
  m.executed_by
FROM expected e
LEFT JOIN schema_migrations m ON e.migration_name = m.migration_name
ORDER BY e.migration_name;
```

## Important Notes

- Always run migrations in numerical order
- The `schema_migrations` table tracks which migrations have been applied
- Use `IF NOT EXISTS` clauses in migrations to make them idempotent
- Some migrations depend on previous ones - check the dependencies before skipping

