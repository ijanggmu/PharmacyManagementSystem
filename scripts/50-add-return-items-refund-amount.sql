-- Add refund_amount to return_items for compatibility with app queries.
-- Supabase nested selects expect return_items.refund_amount.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'return_items'
      AND column_name = 'refund_amount'
  ) THEN
    ALTER TABLE public.return_items
      ADD COLUMN refund_amount DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Keep refund_amount in sync with total_amount when not explicitly provided.
CREATE OR REPLACE FUNCTION public.set_return_items_refund_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Always keep refund_amount aligned with total_amount when total_amount is present.
  -- This avoids issues where refund_amount defaults to 0 but total_amount holds the real value.
  NEW.refund_amount := COALESCE(NEW.total_amount, NEW.refund_amount, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_return_items_refund_amount ON public.return_items;
CREATE TRIGGER trg_set_return_items_refund_amount
BEFORE INSERT OR UPDATE ON public.return_items
FOR EACH ROW
EXECUTE FUNCTION public.set_return_items_refund_amount();

