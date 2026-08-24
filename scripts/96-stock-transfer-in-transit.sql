-- Item from the 2026-08 domain audit (§19 of the spec): stock transfers moved
-- atomically in one step (decrement source, increment destination, both inside
-- create_stock_transfer) with only 'completed'/'cancelled' statuses — there was
-- no way to answer "where are these units right now" mid-transfer, and nothing
-- to cancel once dispatched (the whole thing already happened in one call).
--
-- New flow: create_stock_transfer now only debits the source and marks the
-- transfer 'in_transit'. receive_stock_transfer credits the destination and
-- marks it 'completed'. cancel_stock_transfer (only while still 'in_transit')
-- credits the source back and marks it 'cancelled'. Existing historical rows
-- keep their 'completed' status untouched — this only changes new transfers.

ALTER TABLE public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check;
ALTER TABLE public.stock_transfers
  ALTER COLUMN status SET DEFAULT 'in_transit',
  ADD CONSTRAINT stock_transfers_status_check CHECK (status IN ('in_transit', 'completed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers (tenant_id, status);

-- Dispatch: debit source only, leave destination untouched until received.
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_tenant_id UUID,
  p_from_branch_id UUID,
  p_to_branch_id UUID,
  p_actor_user_id UUID,
  p_notes TEXT,
  p_items JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
  v_medicine_id UUID;
  v_quantity INTEGER;
  v_from_stock INTEGER;
BEGIN
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
$$;

-- Receive: credit destination, complete the transfer. Only from 'in_transit'.
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

-- Cancel: only while still in_transit — credits the source back (it was never
-- debited from the destination, since receive hadn't happened yet).
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

GRANT EXECUTE ON FUNCTION public.receive_stock_transfer(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer(UUID, UUID, UUID, TEXT) TO authenticated;
