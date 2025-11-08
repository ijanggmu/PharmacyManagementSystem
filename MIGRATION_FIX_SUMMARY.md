# Migration Conflict Fix Summary

## Problem
Two migration scripts were trying to create a table with the same name (`medicine_returns`) but different schemas:

- **Script 04**: Created `medicine_returns` for **supplier returns** (returning medicines to suppliers)
  - Had: `supplier_id`, `medicine_id`, `return_number`, etc.
  - No `sale_id` or `customer_id`

- **Script 06**: Tried to create `medicine_returns` for **customer returns** (customers returning purchased medicines)
  - Had: `sale_id`, `customer_id`, `return_items` table
  - No `supplier_id`

When script 04 ran first, it created the table. Then script 06 tried to create indexes on `sale_id` which didn't exist, causing the error.

## Solution

### 1. Updated Script 04 (`04-create-medicine-returns-table.sql`)
- Changed table name from `medicine_returns` to `supplier_returns`
- Updated all indexes to use `supplier_returns` prefix
- Updated trigger name
- Made sample data insert conditional (only if table is empty)

### 2. Updated Script 06 (`06-create-returns-tables.sql`)
- Added migration logic to detect if old `medicine_returns` table exists with supplier structure
- If found, renames it to `supplier_returns` and updates indexes/triggers
- Then creates new `medicine_returns` table for customer returns

### 3. Updated Component (`components/new-return-form.tsx`)
- Changed from `medicine_returns` to `supplier_returns`
- Updated field names to match supplier_returns schema:
  - `processed_by` → `user_id`
  - `total_items` → `quantity_returned`
  - Added `return_reason` field

## Table Structure After Fix

### `supplier_returns` (for returns TO suppliers)
- `id`, `return_number`, `medicine_id`, `supplier_id`, `user_id`
- `quantity_returned`, `return_reason`, `return_type`
- `batch_number`, `expiry_date`, `unit_cost`, `total_cost`
- `return_date`, `status`, `notes`, `refund_amount`, `refund_status`
- `created_at`, `updated_at`

### `medicine_returns` (for returns FROM customers)
- `id`, `sale_id`, `customer_id`
- `return_date`, `total_return_amount`, `return_reason`
- `refund_method`, `status`
- `created_at`, `updated_at`

### `return_items` (items in customer returns)
- `id`, `return_id`, `sale_item_id`, `medicine_id`
- `quantity_returned`, `unit_price`, `total_amount`
- `reason`, `created_at`

## How to Apply the Fix

1. **If script 04 has already run**:
   - Run script 06 - it will automatically detect and rename the old table

2. **If neither script has run**:
   - Run scripts in order (04, then 06)
   - Script 04 will create `supplier_returns`
   - Script 06 will create `medicine_returns` and `return_items`

3. **If both have run but with errors**:
   - Drop the incorrectly created `medicine_returns` table if it has the wrong structure
   - Re-run script 06

## Verification

After running the migrations, verify:

```sql
-- Check supplier_returns table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'supplier_returns';

-- Check medicine_returns table exists with correct columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'medicine_returns' 
AND column_name IN ('sale_id', 'customer_id');

-- Check return_items table exists
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'return_items';
```

## Files Changed

1. `scripts/04-create-medicine-returns-table.sql` - Renamed table to `supplier_returns`
2. `scripts/06-create-returns-tables.sql` - Added migration logic and kept `medicine_returns` for customers
3. `components/new-return-form.tsx` - Updated to use `supplier_returns` table

