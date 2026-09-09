-- Price-list versioning / effective-dated pricing (2026-09 ERP audit, priority
-- item #9). Two problems this closes:
--
--   1. Editing medicines.unit_price/cost_price today is destructive — no
--      record of what the price was before, or when it changed. (Past sales
--      are already safe: sale_items.unit_price freezes the price at sale
--      time, so historical invoices/margin reports were never actually wrong
--      — this is about the *catalog's* price history, e.g. "what did we
--      charge for this in Baishakh".)
--   2. There's no way to queue a price change for a future date — every
--      change is immediate.
--
-- Design: one medicine_price_history table covers both. A DB trigger on
-- `medicines` captures every direct price edit automatically (any code path —
-- the Edit Medicine form, bulk import, a future API — with zero app-code
-- changes required elsewhere), closing the 'active' row and opening a new one
-- dated today. A separate, additive scheduling API lets a user queue a
-- *future* price instead: it inserts a 'scheduled' row without touching
-- medicines.unit_price yet, and apply_due_medicine_price_schedules (called
-- opportunistically from the medicines list route) promotes it to 'active'
-- once its effective_from date arrives — which is what actually writes
-- medicines.unit_price, at which point the same trigger would fire again, so
-- the sweep suppresses it via a session-local guard to avoid double-booking.

CREATE TABLE IF NOT EXISTS public.medicine_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  cost_price NUMERIC(10,2) CHECK (cost_price IS NULL OR cost_price >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('scheduled', 'active', 'superseded', 'cancelled')),
  -- 'trigger' = auto-captured because unit_price/cost_price changed directly;
  -- 'manual' = created through the scheduling API (immediate or future).
  source VARCHAR(20) NOT NULL DEFAULT 'trigger' CHECK (source IN ('trigger', 'manual')),
  reason TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- At most one 'active' and one 'scheduled' row per medicine at a time — a
-- second scheduled change should replace the pending one, not queue behind it
-- ambiguously.
CREATE UNIQUE INDEX IF NOT EXISTS ux_medicine_price_history_one_active
  ON public.medicine_price_history (tenant_id, medicine_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS ux_medicine_price_history_one_scheduled
  ON public.medicine_price_history (tenant_id, medicine_id) WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_medicine_price_history_medicine
  ON public.medicine_price_history (tenant_id, medicine_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_medicine_price_history_due
  ON public.medicine_price_history (tenant_id, effective_from) WHERE status = 'scheduled';

ALTER TABLE public.medicine_price_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicine_price_history' AND policyname = 'Medicine price history by tenant'
  ) THEN
    CREATE POLICY "Medicine price history by tenant" ON public.medicine_price_history
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'medicine_price_history' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON public.medicine_price_history FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;

-- --- automatic capture on any direct price edit -------------------------------
CREATE OR REPLACE FUNCTION public.trg_medicine_price_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Suppressed while apply_due_medicine_price_schedules is promoting a
  -- scheduled row itself — it does its own history bookkeeping in that case.
  IF current_setting('app.suppress_price_history_trigger', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF (NEW.unit_price IS DISTINCT FROM OLD.unit_price) OR (NEW.cost_price IS DISTINCT FROM OLD.cost_price) THEN
    UPDATE public.medicine_price_history
    SET effective_to = CURRENT_DATE, status = 'superseded'
    WHERE tenant_id = NEW.tenant_id AND medicine_id = NEW.id AND status = 'active';

    INSERT INTO public.medicine_price_history (
      tenant_id, medicine_id, unit_price, cost_price, effective_from, status, source, created_by
    ) VALUES (
      NEW.tenant_id, NEW.id, NEW.unit_price, NEW.cost_price, CURRENT_DATE, 'active', 'trigger', auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS medicines_price_history ON public.medicines;
CREATE TRIGGER medicines_price_history
AFTER UPDATE ON public.medicines
FOR EACH ROW
EXECUTE PROCEDURE public.trg_medicine_price_history();

-- Baseline row at creation time too, so a brand-new medicine isn't
-- history-less until its first price edit.
CREATE OR REPLACE FUNCTION public.trg_medicine_price_history_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.suppress_price_history_trigger', true) = 'on' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.medicine_price_history (
    tenant_id, medicine_id, unit_price, cost_price, effective_from, status, source, created_by
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.unit_price, NEW.cost_price, CURRENT_DATE, 'active', 'trigger', auth.uid()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS medicines_price_history_insert ON public.medicines;
CREATE TRIGGER medicines_price_history_insert
AFTER INSERT ON public.medicines
FOR EACH ROW
EXECUTE PROCEDURE public.trg_medicine_price_history_insert();

-- One-time backfill: give every medicine an 'active' row reflecting its
-- current price, dated from when the medicine was created, so the price
-- history view isn't empty for stock that predates this migration.
INSERT INTO public.medicine_price_history (tenant_id, medicine_id, unit_price, cost_price, effective_from, status, source)
SELECT m.tenant_id, m.id, m.unit_price, m.cost_price, COALESCE(m.created_at::date, CURRENT_DATE), 'active', 'trigger'
FROM public.medicines m
WHERE NOT EXISTS (
  SELECT 1 FROM public.medicine_price_history h WHERE h.tenant_id = m.tenant_id AND h.medicine_id = m.id AND h.status = 'active'
);

-- --- scheduling: queue a future price without touching medicines yet ---------
CREATE OR REPLACE FUNCTION public.schedule_medicine_price(
  p_medicine_id UUID,
  p_unit_price NUMERIC,
  p_effective_from DATE,
  p_cost_price NUMERIC DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_id UUID;
BEGIN
  v_tenant := public.current_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant context for current user';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.medicines WHERE id = p_medicine_id AND tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'Medicine % not found in this pharmacy', p_medicine_id;
  END IF;

  IF p_unit_price < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative';
  END IF;

  IF p_effective_from < CURRENT_DATE THEN
    RAISE EXCEPTION 'Effective date cannot be in the past';
  END IF;

  -- Immediate: effective today. Apply directly (same effect as editing the
  -- medicine) rather than going through the scheduled->active promotion path.
  IF p_effective_from = CURRENT_DATE THEN
    PERFORM set_config('app.suppress_price_history_trigger', 'on', true);

    UPDATE public.medicine_price_history
    SET effective_to = CURRENT_DATE, status = 'superseded'
    WHERE tenant_id = v_tenant AND medicine_id = p_medicine_id AND status = 'active';

    UPDATE public.medicines
    SET unit_price = p_unit_price, cost_price = COALESCE(p_cost_price, cost_price)
    WHERE id = p_medicine_id AND tenant_id = v_tenant;

    PERFORM set_config('app.suppress_price_history_trigger', 'off', true);

    INSERT INTO public.medicine_price_history (
      tenant_id, medicine_id, unit_price, cost_price, effective_from, status, source, reason, created_by
    ) VALUES (
      v_tenant, p_medicine_id, p_unit_price, p_cost_price, p_effective_from, 'active', 'manual', p_reason, auth.uid()
    )
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  -- Future-dated: replace any still-pending schedule for this medicine (one
  -- pending change at a time keeps "what will the price be" unambiguous).
  UPDATE public.medicine_price_history
  SET status = 'cancelled'
  WHERE tenant_id = v_tenant AND medicine_id = p_medicine_id AND status = 'scheduled';

  INSERT INTO public.medicine_price_history (
    tenant_id, medicine_id, unit_price, cost_price, effective_from, status, source, reason, created_by
  ) VALUES (
    v_tenant, p_medicine_id, p_unit_price, p_cost_price, p_effective_from, 'scheduled', 'manual', p_reason, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_medicine_price(UUID, NUMERIC, DATE, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_medicine_price(p_history_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_updated INTEGER;
BEGIN
  v_tenant := public.current_tenant_id();
  UPDATE public.medicine_price_history
  SET status = 'cancelled'
  WHERE id = p_history_id AND tenant_id = v_tenant AND status = 'scheduled';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No pending scheduled price change found with that id';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_scheduled_medicine_price(UUID) TO authenticated;

-- --- sweep: promote due scheduled changes to active ---------------------------
-- Called opportunistically from the medicines list route (cheap: the caller
-- should check for due rows first via a lightweight query and skip calling
-- this when there are none). No pg_cron dependency — correctness holds as
-- long as the app is used at least once on/after the effective date, which is
-- the normal case for an actively-run pharmacy.
CREATE OR REPLACE FUNCTION public.apply_due_medicine_price_schedules()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  r RECORD;
  v_applied INTEGER := 0;
BEGIN
  v_tenant := public.current_tenant_id();
  IF v_tenant IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT id, medicine_id, unit_price, cost_price
    FROM public.medicine_price_history
    WHERE tenant_id = v_tenant AND status = 'scheduled' AND effective_from <= CURRENT_DATE
    ORDER BY effective_from
    FOR UPDATE
  LOOP
    PERFORM set_config('app.suppress_price_history_trigger', 'on', true);

    UPDATE public.medicine_price_history
    SET effective_to = CURRENT_DATE, status = 'superseded'
    WHERE tenant_id = v_tenant AND medicine_id = r.medicine_id AND status = 'active';

    UPDATE public.medicines
    SET unit_price = r.unit_price, cost_price = COALESCE(r.cost_price, cost_price)
    WHERE id = r.medicine_id AND tenant_id = v_tenant;

    PERFORM set_config('app.suppress_price_history_trigger', 'off', true);

    UPDATE public.medicine_price_history
    SET status = 'active'
    WHERE id = r.id;

    v_applied := v_applied + 1;
  END LOOP;

  RETURN v_applied;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_due_medicine_price_schedules() TO authenticated;
