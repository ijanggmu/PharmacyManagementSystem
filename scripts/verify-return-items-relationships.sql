-- Verify foreign keys for return_items.return_id

-- 1) FK constraints on return_items
SELECT
  conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.return_items'::regclass
  AND c.contype = 'f'
ORDER BY conname;

-- 2) Confirm medicine_returns table exists
SELECT to_regclass('public.medicine_returns') AS medicine_returns_table_exists;

-- 3) Confirm return_items has the return_id column
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'return_items'
  AND column_name = 'return_id';

