-- Comprehensive Schema Verification Script
-- Checks for tables, columns, and constraints that should exist based on migrations

-- Check for key tables
SELECT 
  'Tables Check' AS check_type,
  table_name,
  CASE 
    WHEN table_name IN (
      'users', 'customers', 'suppliers', 'categories', 'medicines',
      'prescriptions', 'prescription_items', 'sales', 'sale_items',
      'inventory_transactions', 'medicine_returns', 'sales_refunds',
      'returns', 'return_items', 'audit_logs', 'purchase_orders',
      'warehouses', 'warehouse_stock', 'stock_transfers',
      'medicine_batches', 'serial_numbers', 'notifications',
      'system_settings', 'schema_migrations'
    ) THEN 'EXISTS'
    ELSE 'UNKNOWN'
  END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check for key columns in medicines table
SELECT 
  'Medicines Columns' AS check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'medicines'
ORDER BY ordinal_position;

-- Check for is_taxable column specifically
SELECT 
  'is_taxable Check' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'medicines' 
        AND column_name = 'is_taxable'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

-- Check for controlled_substance column
SELECT 
  'controlled_substance Check' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'medicines' 
        AND column_name = 'controlled_substance'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

-- Check for audit_logs table
SELECT 
  'audit_logs Table' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'audit_logs'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

-- Check for warehouses table
SELECT 
  'warehouses Table' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'warehouses'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

-- Check for medicine_batches table
SELECT 
  'medicine_batches Table' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'medicine_batches'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

-- Check for notifications table
SELECT 
  'notifications Table' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'notifications'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

-- Check for system_settings table
SELECT 
  'system_settings Table' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'system_settings'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

-- Check for schema_migrations table
SELECT 
  'schema_migrations Table' AS check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name = 'schema_migrations'
    ) THEN 'EXISTS'
    ELSE 'MISSING'
  END AS status;

