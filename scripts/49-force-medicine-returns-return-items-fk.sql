-- Force return_items.return_id -> medicine_returns.id foreign key.
-- Supabase nested selects need this relationship for schema cache.

DO $$
DECLARE
  medicine_returns_oid oid;
  return_items_oid oid;
  return_id_attnum int2;
  r RECORD;
BEGIN
  SELECT 'public.medicine_returns'::regclass::oid INTO medicine_returns_oid;
  SELECT 'public.return_items'::regclass::oid INTO return_items_oid;

  -- If return_items doesn't have the return_id column, nothing to do.
  SELECT a.attnum
    INTO return_id_attnum
  FROM pg_attribute a
  WHERE a.attrelid = return_items_oid
    AND a.attname = 'return_id'
    AND NOT a.attisdropped;

  IF return_id_attnum IS NULL THEN
    RAISE NOTICE 'return_items.return_id column not found; skipping';
    RETURN;
  END IF;

  -- Drop any FK constraints on return_items that involve return_id column.
  -- (Defensive: fixes partially-migrated schemas where FK points to wrong table.)
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = return_items_oid
      AND c.contype = 'f'
      AND c.conkey @> ARRAY[return_id_attnum]::int2[]
  LOOP
    EXECUTE format('ALTER TABLE public.return_items DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.return_items
    ADD CONSTRAINT return_items_return_id_fkey
    FOREIGN KEY (return_id)
    REFERENCES public.medicine_returns(id)
    ON DELETE CASCADE;

EXCEPTION
  WHEN duplicate_object THEN
    -- Constraint already exists; nothing to do.
    NULL;
END $$;

