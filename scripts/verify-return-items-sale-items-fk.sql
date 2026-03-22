-- Verify FK on return_items.sale_item_id -> sale_items.id

SELECT
  conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.return_items'::regclass
  AND c.contype = 'f'
ORDER BY conname;

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'return_items'
  AND column_name IN ('sale_item_id', 'return_id');

SELECT to_regclass('public.sale_items') AS sale_items_table_exists;

