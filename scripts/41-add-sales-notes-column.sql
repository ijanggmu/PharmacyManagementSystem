-- Add notes column to sales table for storing additional sale notes

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'notes'
  ) THEN
    ALTER TABLE sales
      ADD COLUMN notes TEXT;
  END IF;
END $$;

