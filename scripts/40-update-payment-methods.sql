-- Expand allowed payment methods on sales.payment_method

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.sales'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sales DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE sales
    ADD CONSTRAINT sales_payment_method_check
    CHECK (
      payment_method IN (
        'cash',
        'card',
        'insurance',
        'fonepay',
        'esewa',
        'khalti',
        'bank',
        'mixed',
        'other'
      )
    );
END $$;

