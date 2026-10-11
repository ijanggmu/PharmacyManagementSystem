# Database Migration Check Guide

## Overview
This guide explains how to check if all database migration scripts have been applied to your database.

## Quick Start

### Method 1: Using the Web Interface (Recommended)

1. **Navigate to Settings**:
   - Go to `/dashboard/settings` in your application
   - Click on "Check Migration Status" button in the Database Management card
   - Or directly visit `/dashboard/settings/migrations`

2. **View Status**:
   - The page will show:
     - Summary of applied vs missing migrations
     - Schema element checks (tables, columns)
     - Detailed list of each migration with status

3. **Refresh**:
   - Click the "Refresh" button to re-check the status

### Method 2: Using SQL Scripts

#### Quick Check (Easiest)
1. Open your Supabase SQL Editor
2. Copy and paste the contents of `scripts/quick-check-migrations.sql`
3. Run the query
4. You'll see:
   - A list of all migrations with ✅ APPLIED or ❌ MISSING status
   - A summary showing counts

#### Detailed Check
1. Run `scripts/check-migrations.sql` for detailed migration status
2. Run `scripts/verify-schema.sql` to check for specific tables and columns

## Understanding the Results

### Migration Status
- **✅ APPLIED**: The migration has been recorded in the `schema_migrations` table
- **❌ MISSING**: The migration has not been recorded (may or may not have been run)

### Schema Checks
The system checks for:
- `is_taxable` column in `medicines` table
- `controlled_substance` column in `medicines` table
- `audit_logs` table
- `warehouses` table
- `medicine_batches` table
- `notifications` table
- `system_settings` table

## Setting Up Migration Tracking

If you haven't set up migration tracking yet:

1. **Create the migrations table**:
   ```sql
   -- Run scripts/00-create-migrations-table.sql
   ```

2. **Record existing migrations** (if you've already run some):
   ```sql
   -- Edit scripts/apply-migration-tracking.sql
   -- Uncomment the migrations you've already applied
   -- Run the script
   ```

## Applying Missing Migrations

If you find missing migrations:

1. **Check the migration scripts** in the `scripts/` directory
2. **Run them in order** (01, 02, 03, etc.)
3. **Record each migration** after running:
   ```sql
   SELECT record_migration('XX-migration-name.sql', 'your_name', NULL, 'Applied manually');
   ```

## All Migration Scripts

The system expects these 15 migrations (plus the tracking table):

1. `00-create-migrations-table.sql` - Migration tracking (run first)
2. `01-create-pharmacy-tables.sql` - Core tables
3. `02-seed-initial-data.sql` - Initial data
4. `03-add-controlled-substance-column.sql` - Controlled substance flag
5. `04-create-medicine-returns-table.sql` - Medicine returns
6. `05-create-sales-refunds-table.sql` - Sales refunds
7. `06-create-returns-tables.sql` - Returns system
8. `07-add-timestamps.sql` - Timestamp columns and triggers
9. `08-create-audit-logs.sql` - Audit logging
10. `09-create-purchase-orders.sql` - Purchase orders
11. `10-create-warehouses.sql` - Warehouse management
12. `11-create-medicine-batches.sql` - Batch tracking
13. `12-create-serial-numbers.sql` - Serial number tracking
14. `13-create-notifications-table.sql` - Notifications
15. `14-create-system-settings.sql` - System settings
16. `15-add-is-taxable-column.sql` - Taxable flag for medicines

## Troubleshooting

### "Table doesn't exist" errors
- Make sure you've run `00-create-migrations-table.sql` first
- Check that you're connected to the correct database

### Migrations show as missing but tables exist
- The migration may have been run but not recorded
- Use `apply-migration-tracking.sql` to retroactively record them

### Schema checks fail
- The migration may not have been fully applied
- Check the specific migration script for what it should create
- Re-run the migration if needed (they use `IF NOT EXISTS` so it's safe)

## Best Practices

1. **Always check before deploying**: Run the migration check before deploying to production
2. **Record migrations immediately**: After running a migration, record it in the tracking table
3. **Run in order**: Migrations should be run sequentially
4. **Test first**: Test migrations on a development database first
5. **Backup**: Always backup your database before running migrations

## Files Reference

- `scripts/00-create-migrations-table.sql` - Creates tracking infrastructure
- `scripts/check-migrations.sql` - Detailed migration status check
- `scripts/quick-check-migrations.sql` - Quick status check
- `scripts/verify-schema.sql` - Schema element verification
- `scripts/apply-migration-tracking.sql` - Record existing migrations
- `scripts/README-MIGRATIONS.md` - Detailed migration documentation
- `app/dashboard/settings/migrations/page.tsx` - Web interface
- `components/migration-status-checker.tsx` - Migration checker component
- `lib/utils/check-migrations.ts` - Migration checking utilities

