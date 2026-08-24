-- Phase 5 security hardening (2026-08 cleanup audit, item E): every SECURITY
-- DEFINER function callable directly by `authenticated` (GRANT EXECUTE ...) that
-- accepted a tenant_id parameter or looked a row up by bare id was trusting that
-- input instead of re-deriving the caller's real tenant. Because these are
-- SECURITY DEFINER, they run with the function owner's privileges and bypass RLS
-- entirely — so a forged tenant_id/row id isn't caught by anything downstream
-- the way it would be for a SECURITY INVOKER function (RLS still applies there
-- under the caller's own identity, which is why approve_purchase_order and
-- recall_medicine_batch were checked and found NOT exploitable — left untouched).
--
-- Fix: every affected function now validates the caller's real tenant via
-- public.current_tenant_id() (auth.uid() -> users.tenant_id, scripts/62) before
-- touching any row, instead of trusting the parameter. For legitimate calls
-- (the app always passes the caller's own real tenantId) this is a no-op change
-- in behavior; for a forged call it now fails closed.
--
-- create_stock_transfer additionally regressed from SECURITY INVOKER (its
-- original definition, scripts/87 — safe, RLS-protected) to SECURITY DEFINER
-- when redefined in scripts/96 this session. Reverted to INVOKER here, which is
-- both the fix and the lower-risk option (no security-context behavior change,
-- matches how it worked before and how create_sale_with_items / recall_medicine_batch
-- still work today).

-- 1) cancel_sale — no tenant parameter at all; filter the sale lookup by the
-- caller's real tenant instead of accepting any sale id.
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
  SELECT * INTO v_sale
  FROM sales
  WHERE id = p_sale_id AND tenant_id = public.current_tenant_id()
  FOR UPDATE;
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

-- 2) accounting_reverse_posted_voucher — no tenant parameter; filter the voucher
-- lookup by the caller's real tenant. Safe to call both directly (RPC) and
-- internally from cancel_sale above (current_tenant_id() resolves from the
-- session's auth.uid() either way, unaffected by nesting).
CREATE OR REPLACE FUNCTION public.accounting_reverse_posted_voucher(
  p_voucher_id UUID,
  p_user_id UUID,
  p_reversal_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig RECORD;
  v_rev_id UUID;
  v_no VARCHAR(64);
  v_date DATE;
  r RECORD;
  ln INT := 0;
BEGIN
  SELECT * INTO v_orig
  FROM accounting_vouchers
  WHERE id = p_voucher_id AND tenant_id = public.current_tenant_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;
  IF v_orig.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted vouchers can be reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM accounting_vouchers
    WHERE reverses_voucher_id = p_voucher_id AND status = 'posted'
  ) THEN
    RAISE EXCEPTION 'This voucher was already reversed';
  END IF;

  v_date := COALESCE(p_reversal_date, CURRENT_DATE);
  PERFORM public.accounting_assert_posting_open(v_orig.tenant_id, v_date);

  v_no := public.accounting_next_voucher_no(v_orig.tenant_id);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by,
    reverses_voucher_id
  ) VALUES (
    v_orig.tenant_id, v_orig.branch_id, v_no, v_date, 'journal', 'manual',
    'reversal', p_voucher_id, 'posted',
    'Reversal of ' || v_orig.voucher_no,
    p_user_id, NOW(), p_user_id,
    p_voucher_id
  ) RETURNING id INTO v_rev_id;

  FOR r IN
    SELECT account_id, description, debit_amount, credit_amount
    FROM accounting_voucher_lines
    WHERE voucher_id = p_voucher_id
    ORDER BY line_no
  LOOP
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (
      tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount
    ) VALUES (
      v_orig.tenant_id, v_orig.branch_id, v_rev_id, ln, r.account_id,
      'Reversal: ' || COALESCE(r.description, ''),
      r.credit_amount, r.debit_amount
    );
  END LOOP;

  UPDATE accounting_vouchers SET status = 'void' WHERE id = p_voucher_id;

  RETURN v_rev_id;
END;
$$;

-- 3) create_stock_transfer — revert to SECURITY INVOKER (its original,
-- pre-this-session definition). RLS on stock_transfers/stock_transfer_items/
-- medicine_branch_stock/inventory_transactions already scopes correctly under
-- the caller's own identity, same as it did before scripts/96 touched this.
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_tenant_id UUID,
  p_from_branch_id UUID,
  p_to_branch_id UUID,
  p_actor_user_id UUID,
  p_notes TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
  v_medicine_id UUID;
  v_quantity INTEGER;
  v_from_stock INTEGER;
BEGIN
  IF p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;

  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Source and destination branch must differ';
  END IF;

  PERFORM 1 FROM branches WHERE id = p_from_branch_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid source branch'; END IF;
  PERFORM 1 FROM branches WHERE id = p_to_branch_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid destination branch'; END IF;

  v_transfer_number := 'TRF-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::TEXT;

  INSERT INTO stock_transfers (tenant_id, from_branch_id, to_branch_id, transfer_number, status, notes, created_by)
  VALUES (p_tenant_id, p_from_branch_id, p_to_branch_id, v_transfer_number, 'in_transit', p_notes, p_actor_user_id)
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'quantity must be positive for medicine %', v_medicine_id;
    END IF;

    v_from_stock := public.lock_medicine_branch_stock(p_tenant_id, p_from_branch_id, v_medicine_id);
    IF v_from_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock at source branch for medicine % — has %, requested %',
        v_medicine_id, v_from_stock, v_quantity;
    END IF;

    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_from_stock - v_quantity, updated_at = NOW()
    WHERE branch_id = p_from_branch_id AND medicine_id = v_medicine_id;

    INSERT INTO stock_transfer_items (tenant_id, transfer_id, medicine_id, quantity)
    VALUES (p_tenant_id, v_transfer_id, v_medicine_id, v_quantity);

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, reason_code, user_id, tenant_id, branch_id
    ) VALUES (
      v_medicine_id, 'adjustment', -v_quantity, v_transfer_id, 'stock_transfer', 'branch_transfer_out', p_actor_user_id, p_tenant_id, p_from_branch_id
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;

-- 4) receive_stock_transfer / cancel_stock_transfer — validate p_tenant_id
-- against the caller's real tenant before doing anything. Kept SECURITY DEFINER
-- (lock_medicine_branch_stock and the cross-branch writes need it), unlike
-- create_stock_transfer which could safely revert to INVOKER.
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(
  p_transfer_id UUID,
  p_tenant_id UUID,
  p_actor_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_to_stock INTEGER;
BEGIN
  IF p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;

  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;
  IF v_transfer.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Only in-transit transfers can be received (current status: %)', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    v_to_stock := public.lock_medicine_branch_stock(v_transfer.tenant_id, v_transfer.to_branch_id, v_item.medicine_id);

    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_to_stock + v_item.quantity, updated_at = NOW()
    WHERE branch_id = v_transfer.to_branch_id AND medicine_id = v_item.medicine_id;

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, reason_code, user_id, tenant_id, branch_id
    ) VALUES (
      v_item.medicine_id, 'adjustment', v_item.quantity, p_transfer_id, 'stock_transfer', 'branch_transfer_in', p_actor_user_id, v_transfer.tenant_id, v_transfer.to_branch_id
    );
  END LOOP;

  UPDATE stock_transfers
  SET status = 'completed', received_at = NOW(), received_by = p_actor_user_id
  WHERE id = p_transfer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(
  p_transfer_id UUID,
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_from_stock INTEGER;
BEGIN
  IF p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'Tenant mismatch';
  END IF;

  SELECT * INTO v_transfer FROM stock_transfers WHERE id = p_transfer_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;
  IF v_transfer.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Only in-transit transfers can be cancelled (current status: %)', v_transfer.status;
  END IF;

  FOR v_item IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
    v_from_stock := public.lock_medicine_branch_stock(v_transfer.tenant_id, v_transfer.from_branch_id, v_item.medicine_id);

    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_from_stock + v_item.quantity, updated_at = NOW()
    WHERE branch_id = v_transfer.from_branch_id AND medicine_id = v_item.medicine_id;

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, reason_code, user_id, tenant_id, branch_id, notes
    ) VALUES (
      v_item.medicine_id, 'adjustment', v_item.quantity, p_transfer_id, 'stock_transfer', 'branch_transfer_cancelled', p_actor_user_id, v_transfer.tenant_id, v_transfer.from_branch_id, p_reason
    );
  END LOOP;

  UPDATE stock_transfers
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_actor_user_id, cancellation_reason = p_reason
  WHERE id = p_transfer_id;
END;
$$;
