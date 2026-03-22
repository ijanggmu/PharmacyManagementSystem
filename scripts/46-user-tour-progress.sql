-- Persist first-time tour completion per authenticated user.
-- This is used to ensure tours are shown only for first login per user.

-- 1) Create table
CREATE TABLE IF NOT EXISTS public.user_tour_progress (
  user_id UUID NOT NULL,
  tour_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tour_key)
);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_tour_progress_updated_at ON public.user_tour_progress;
CREATE TRIGGER trg_user_tour_progress_updated_at
BEFORE UPDATE ON public.user_tour_progress
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 2) Enable RLS
ALTER TABLE public.user_tour_progress ENABLE ROW LEVEL SECURITY;

-- 3) RLS policies for self-service (if any client updates directly)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_tour_progress'
      AND policyname = 'user_tour_progress_select_own'
  ) THEN
    CREATE POLICY "user_tour_progress_select_own"
      ON public.user_tour_progress
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_tour_progress'
      AND policyname = 'user_tour_progress_upsert_own'
  ) THEN
    CREATE POLICY "user_tour_progress_upsert_own"
      ON public.user_tour_progress
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_tour_progress'
      AND policyname = 'user_tour_progress_update_own'
  ) THEN
    CREATE POLICY "user_tour_progress_update_own"
      ON public.user_tour_progress
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_tour_progress'
      AND policyname = 'user_tour_progress_delete_own'
  ) THEN
    CREATE POLICY "user_tour_progress_delete_own"
      ON public.user_tour_progress
      FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END $$;

