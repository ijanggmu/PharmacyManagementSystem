-- Ensure return_items.return_id -> medicine_returns.id foreign key exists.
-- Supabase nested selects (medicine_returns -> return_items(...)) require a real FK.

DO $$
DECLARE
  medicine_returns_oid oid;
  return_items_oid oid;
  fk_exists boolean;
  r RECORD;
BEGIN
  SELECT 'public.medicine_returns'::regclass::oid INTO medicine_returns_oid;
  SELECT 'public.return_items'::regclass::oid INTO return_items_oid;

  -- Check if there is already a FK from return_items to medicine_returns
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = return_items_oid
      AND c.contype = 'f'
      AND c.confrelid = medicine_returns_oid
  )
  INTO fk_exists;

  -- If FK doesn't exist, (re)create it with a stable constraint name.
  IF NOT fk_exists THEN
    -- Drop any FK constraints on return_items that point to a different parent.
    -- (This is defensive for partially-migrated/bad schemas.)
    FOR r IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = return_items_oid
        AND contype = 'f'
    LOOP
      EXECUTE format('ALTER TABLE public.return_items DROP CONSTRAINT %I', r.conname);
    END LOOP;

    ALTER TABLE public.return_items
      ADD CONSTRAINT return_items_return_id_fkey
      FOREIGN KEY (return_id)
      REFERENCES public.medicine_returns(id)
      ON DELETE CASCADE;
  END IF;
END $$;

