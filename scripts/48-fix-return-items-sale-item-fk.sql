-- Ensure return_items.sale_item_id -> sale_items.id foreign key exists.
-- Supabase nested selects (return_items -> sale_items(...)) require a real FK.

DO $$
DECLARE
  return_items_oid oid;
  sale_items_oid oid;
  fk_exists boolean;
  r RECORD;
BEGIN
  SELECT 'public.return_items'::regclass::oid INTO return_items_oid;
  SELECT 'public.sale_items'::regclass::oid INTO sale_items_oid;

  -- FK exists if any FK on return_items references sale_items
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = return_items_oid
      AND c.contype = 'f'
      AND c.confrelid = sale_items_oid
  )
  INTO fk_exists;

  IF NOT fk_exists THEN
    -- Defensive: drop existing FKs from return_items (if any), then add the correct one.
    FOR r IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = return_items_oid
        AND contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE public.return_items DROP CONSTRAINT %I', r.conname);
    END LOOP;

    ALTER TABLE public.return_items
      ADD CONSTRAINT return_items_sale_item_id_fkey
      FOREIGN KEY (sale_item_id)
      REFERENCES public.sale_items(id)
      ON DELETE CASCADE;
  END IF;
END $$;

