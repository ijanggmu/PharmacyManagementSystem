-- Verify refund_amount column exists on return_items
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'return_items'
  AND column_name IN ('refund_amount', 'total_amount', 'unit_price');

