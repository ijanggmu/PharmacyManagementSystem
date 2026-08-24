-- CRITICAL FIX: prevent_locked_sales_modification (scripts/33) returns OLD
-- unconditionally on its non-exception path. For a BEFORE UPDATE trigger, the
-- returned row is what actually gets written — returning OLD means every
-- non-locked UPDATE to `sales` silently writes back the pre-update values
-- and is a no-op, while reporting success (no exception, no error).
--
-- Confirmed live via an in-transaction UPDATE + immediate re-SELECT (then
-- rolled back, no data changed): the write never took effect. This has been
-- silently breaking updateSaleForTenant (payment_status/notes PATCH), any
-- IRD sync/lock marking, and cancel_sale (scripts/93) since the trigger was
-- introduced — none of them ever actually persisted.
--
-- Fix: return NEW (the incoming update) when not locked, only block via
-- exception when actually locked. DELETE is unaffected — returning a non-null
-- row for a BEFORE DELETE trigger already correctly allows the delete to
-- proceed, so that half of this trigger was fine.

CREATE OR REPLACE FUNCTION prevent_locked_sales_modification()
RETURNS TRIGGER AS $saleslock$
BEGIN
  IF OLD.locked_at IS NOT NULL OR OLD.ird_status = 'synced' THEN
    RAISE EXCEPTION 'Cannot modify IRD-locked sale %. Use returns/credit notes instead.', OLD.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$saleslock$ LANGUAGE plpgsql;
