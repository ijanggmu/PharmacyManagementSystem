-- Item 5 of the 2026-08 business-logic domain audit (AUDIT-003): sales had no
-- cancellation path at all — deleteSaleForTenant was a permanent stub that always
-- rejected, leaving partial refunds as the only reversal mechanism for what might
-- be a pure input mistake (wrong customer/medicine), a different business event
-- entirely. This adds a real CONFIRMED -> CANCELLED transition.
--
-- Deliberately restricted to sales that are not yet IRD-locked (see
-- prevent_locked_sales_modification, scripts/33) — once a sale is synced/locked,
-- cancellation is correctly blocked by that trigger and a return/credit note is
-- the only path, same as any other edit.
--
-- Known limitation: FEFO batch deduction (deduct_fefo_batches, scripts/85) does
-- not record which specific medicine_batches row(s) a sale line was drawn from,
-- so cancellation cannot precisely restore per-batch quantity_remaining. It
-- restores medicine_branch_stock (the authoritative figure for "can I sell N
-- more") and inventory_transactions exactly; per-batch remaining counts may
-- undercount slightly after a cancellation involving batch-tracked stock. This
-- is a pre-existing gap (there's no allocation record to reverse precisely, and
-- guessing which batch(es) to credit back would fabricate false precision).

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales (tenant_id, status);

CREATE OR REPLACE FUNCTION public.cancel_sale(
  p_sale_id UUID,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
  v_item RECORD;
  v_voucher_id UUID;
  v_updated INTEGER;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;

  IF v_sale.status = 'cancelled' THEN
    RAISE EXCEPTION 'Sale is already cancelled';
  END IF;

  IF v_sale.locked_at IS NOT NULL OR v_sale.ird_status = 'synced' THEN
    RAISE EXCEPTION 'Cannot cancel an IRD-locked sale — use a return/credit note instead';
  END IF;

  IF v_sale.branch_id IS NULL THEN
    RAISE EXCEPTION 'Sale % has no branch_id — cannot determine which branch stock to restore', p_sale_id;
  END IF;

  -- Restore stock + audit trail, one inventory_transactions row per line (mirrors
  -- the +/-quantity pattern create_sale_with_items already uses).
  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id LOOP
    UPDATE medicine_branch_stock
    SET stock_quantity = stock_quantity + v_item.quantity, updated_at = NOW()
    WHERE branch_id = v_sale.branch_id AND medicine_id = v_item.medicine_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
      INSERT INTO medicine_branch_stock (tenant_id, branch_id, medicine_id, stock_quantity)
      VALUES (v_sale.tenant_id, v_sale.branch_id, v_item.medicine_id, v_item.quantity)
      ON CONFLICT (branch_id, medicine_id) DO UPDATE
        SET stock_quantity = medicine_branch_stock.stock_quantity + v_item.quantity;
    END IF;

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type,
      user_id, tenant_id, branch_id, notes
    ) VALUES (
      v_item.medicine_id, 'adjustment', v_item.quantity, p_sale_id, 'sale_cancellation',
      p_user_id, v_sale.tenant_id, v_sale.branch_id, COALESCE(NULLIF(p_reason, ''), 'Sale cancelled')
    );
  END LOOP;

  -- Reverse prescription dispensing counts symmetrically with how
  -- create_sale_with_items incremented them.
  IF v_sale.prescription_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id LOOP
      UPDATE prescription_items
      SET quantity_dispensed = GREATEST(0, quantity_dispensed - v_item.quantity)
      WHERE prescription_id = v_sale.prescription_id
        AND medicine_id = v_item.medicine_id
        AND tenant_id = v_sale.tenant_id;
    END LOOP;

    UPDATE prescriptions
    SET status = 'partially_filled', updated_at = NOW()
    WHERE id = v_sale.prescription_id AND tenant_id = v_sale.tenant_id AND status = 'filled';
  END IF;

  -- Reverse the posted sale voucher if one exists. accounting_post_sale_voucher
  -- runs as an AFTER INSERT trigger and silently no-ops when the tenant has no
  -- chart of accounts (see scripts/81), so there may be nothing to reverse — that
  -- is not an error here, just nothing to do.
  SELECT id INTO v_voucher_id
  FROM accounting_vouchers
  WHERE tenant_id = v_sale.tenant_id
    AND reference_type = 'sale'
    AND reference_id = p_sale_id
    AND status = 'posted'
  LIMIT 1;

  IF v_voucher_id IS NOT NULL THEN
    PERFORM public.accounting_reverse_posted_voucher(v_voucher_id, p_user_id, CURRENT_DATE);
  END IF;

  UPDATE sales
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_by = p_user_id,
      cancellation_reason = p_reason
  WHERE id = p_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_sale(UUID, UUID, TEXT) TO authenticated;
