-- Fix: medicine return creation was writing to columns that don't exist on
-- medicine_returns/return_items (total_refund_amount, missing return_reason, missing
-- total_amount) — every return create was failing. On top of that, refund_amount and
-- quantity_returned were entirely client-supplied with no cap against the original
-- sale, no double-processing guard, and completed returns never put stock back.
--
-- This migration adds an atomic, server-authoritative return-creation RPC (mirrors the
-- pattern used for create_sale_with_items / receive_purchase_goods) plus a completion
-- RPC that restores branch stock exactly once.

ALTER TABLE public.medicine_returns
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS stock_restored_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.create_medicine_return(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_sale_id UUID,
  p_customer_id UUID,
  p_return_date DATE,
  p_return_reason TEXT,
  p_notes TEXT,
  p_status TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_return_id UUID;
  v_item JSONB;
  v_sale_item_id UUID;
  v_quantity_returned INTEGER;
  v_item_reason TEXT;
  v_sale_item_quantity INTEGER;
  v_sale_item_unit_price DECIMAL(14,2);
  v_sale_item_medicine_id UUID;
  v_already_returned INTEGER;
  v_line_total DECIMAL(14,2);
  v_total_return_amount DECIMAL(14,2) := 0;
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'completed') THEN
    RAISE EXCEPTION 'Invalid return status %', p_status;
  END IF;

  PERFORM 1 FROM sales WHERE id = p_sale_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found for tenant %', p_sale_id, p_tenant_id;
  END IF;

  INSERT INTO medicine_returns (
    tenant_id, sale_id, customer_id, return_date, total_return_amount,
    return_reason, status, notes
  ) VALUES (
    p_tenant_id, p_sale_id, p_customer_id, p_return_date, 0,
    p_return_reason, p_status, p_notes
  ) RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sale_item_id := (v_item->>'sale_item_id')::UUID;
    v_quantity_returned := (v_item->>'quantity_returned')::INTEGER;
    v_item_reason := v_item->>'reason';

    IF v_quantity_returned IS NULL OR v_quantity_returned <= 0 THEN
      RAISE EXCEPTION 'quantity_returned must be positive for sale_item %', v_sale_item_id;
    END IF;

    -- Row-locked so concurrent return requests against the same sale line can't both
    -- pass the "already returned" check before either writes.
    SELECT quantity, unit_price, medicine_id
    INTO v_sale_item_quantity, v_sale_item_unit_price, v_sale_item_medicine_id
    FROM sale_items
    WHERE id = v_sale_item_id AND sale_id = p_sale_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_sale_item_quantity IS NULL THEN
      RAISE EXCEPTION 'Sale item % not found on sale %', v_sale_item_id, p_sale_id;
    END IF;

    -- Sum quantity already returned against this sale line across all non-rejected
    -- returns — prevents returning more than was actually sold, including across
    -- multiple separate return requests.
    SELECT COALESCE(SUM(ri.quantity_returned), 0) INTO v_already_returned
    FROM return_items ri
    JOIN medicine_returns mr ON mr.id = ri.return_id
    WHERE ri.sale_item_id = v_sale_item_id AND mr.status <> 'rejected';

    IF v_already_returned + v_quantity_returned > v_sale_item_quantity THEN
      RAISE EXCEPTION 'Cannot return % units of sale item % — % of % already returned/sold',
        v_quantity_returned, v_sale_item_id, v_already_returned, v_sale_item_quantity;
    END IF;

    -- Authoritative line amount: quantity x the sale's actual unit price, never a
    -- client-supplied refund_amount.
    v_line_total := v_sale_item_unit_price * v_quantity_returned;
    v_total_return_amount := v_total_return_amount + v_line_total;

    INSERT INTO return_items (
      tenant_id, return_id, sale_item_id, medicine_id, quantity_returned,
      unit_price, total_amount, reason
    ) VALUES (
      p_tenant_id, v_return_id, v_sale_item_id, v_sale_item_medicine_id, v_quantity_returned,
      v_sale_item_unit_price, v_line_total, v_item_reason
    );
  END LOOP;

  UPDATE medicine_returns SET total_return_amount = v_total_return_amount WHERE id = v_return_id;

  IF p_status = 'completed' THEN
    PERFORM public.restore_return_stock(v_return_id, p_tenant_id, p_branch_id);
  END IF;

  RETURN v_return_id;
END;
$$ LANGUAGE plpgsql;

-- Restores branch stock for every line on a return, exactly once (guarded by
-- stock_restored_at). Called either inline by create_medicine_return (status already
-- 'completed' on creation) or later when a pending/approved return is marked completed.
CREATE OR REPLACE FUNCTION public.restore_return_stock(
  p_return_id UUID,
  p_tenant_id UUID,
  p_branch_id UUID
) RETURNS VOID AS $$
DECLARE
  v_already_restored TIMESTAMPTZ;
  v_item RECORD;
  v_current_branch_stock INTEGER;
BEGIN
  SELECT stock_restored_at INTO v_already_restored
  FROM medicine_returns
  WHERE id = p_return_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_already_restored IS NOT NULL THEN
    RETURN; -- already restored, no-op (prevents double-restoration on repeat completion)
  END IF;

  FOR v_item IN
    SELECT medicine_id, quantity_returned
    FROM return_items
    WHERE return_id = p_return_id AND tenant_id = p_tenant_id
  LOOP
    v_current_branch_stock := public.lock_medicine_branch_stock(p_tenant_id, p_branch_id, v_item.medicine_id);

    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_current_branch_stock + v_item.quantity_returned, updated_at = NOW()
    WHERE branch_id = p_branch_id AND medicine_id = v_item.medicine_id;

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, tenant_id, branch_id
    ) VALUES (
      v_item.medicine_id, 'return', v_item.quantity_returned, p_return_id, 'return', p_tenant_id, p_branch_id
    );
  END LOOP;

  UPDATE medicine_returns SET stock_restored_at = NOW() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_medicine_return TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_return_stock TO authenticated;

-- Refunds: a single atomic RPC (was: a separate validation RPC followed by a plain
-- insert from the app — two independent transactions, so the FOR UPDATE lock in the
-- check was released before the insert ran, and two concurrent refund requests could
-- still both pass the check before either wrote). Also recomputes item-level amounts
-- from the sale's real unit price and caps quantity_refunded per sale line, the same
-- double-processing protection as create_medicine_return.
CREATE OR REPLACE FUNCTION public.create_sales_refund(
  p_tenant_id UUID,
  p_user_id UUID,
  p_original_sale_id UUID,
  p_customer_id UUID,
  p_refund_date DATE,
  p_refund_reason TEXT,
  p_refund_type TEXT,
  p_refund_method TEXT,
  p_refund_status TEXT,
  p_tax_refund_amount DECIMAL(14,2),
  p_processing_fee DECIMAL(14,2),
  p_notes TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_sale_total DECIMAL(14,2);
  v_already_refunded DECIMAL(14,2);
  v_refund_id UUID;
  v_refund_number TEXT;
  v_item JSONB;
  v_sale_item_id UUID;
  v_quantity_refunded INTEGER;
  v_sale_item_quantity INTEGER;
  v_sale_item_unit_price DECIMAL(14,2);
  v_sale_item_medicine_id UUID;
  v_already_refunded_qty INTEGER;
  v_line_total DECIMAL(14,2);
  v_items_total DECIMAL(14,2) := 0;
  v_net_refund_amount DECIMAL(14,2);
BEGIN
  IF p_refund_status NOT IN ('pending', 'approved', 'rejected', 'completed') THEN
    RAISE EXCEPTION 'Invalid refund status %', p_refund_status;
  END IF;

  -- Row-locked so a concurrent refund request against the same sale can't read the
  -- same "already refunded" total before this one commits.
  SELECT total_amount INTO v_sale_total
  FROM sales
  WHERE id = p_original_sale_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_sale_total IS NULL THEN
    RAISE EXCEPTION 'Sale % not found for tenant %', p_original_sale_id, p_tenant_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sale_item_id := (v_item->>'sale_item_id')::UUID;
    v_quantity_refunded := (v_item->>'quantity_refunded')::INTEGER;

    IF v_quantity_refunded IS NULL OR v_quantity_refunded <= 0 THEN
      RAISE EXCEPTION 'quantity_refunded must be positive for sale_item %', v_sale_item_id;
    END IF;

    SELECT quantity, unit_price, medicine_id
    INTO v_sale_item_quantity, v_sale_item_unit_price, v_sale_item_medicine_id
    FROM sale_items
    WHERE id = v_sale_item_id AND sale_id = p_original_sale_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_sale_item_quantity IS NULL THEN
      RAISE EXCEPTION 'Sale item % not found on sale %', v_sale_item_id, p_original_sale_id;
    END IF;

    SELECT COALESCE(SUM(sri.quantity_refunded), 0) INTO v_already_refunded_qty
    FROM sales_refund_items sri
    JOIN sales_refunds sr ON sr.id = sri.refund_id
    WHERE sri.sale_item_id = v_sale_item_id AND sr.refund_status <> 'rejected';

    IF v_already_refunded_qty + v_quantity_refunded > v_sale_item_quantity THEN
      RAISE EXCEPTION 'Cannot refund % units of sale item % — % of % already refunded/sold',
        v_quantity_refunded, v_sale_item_id, v_already_refunded_qty, v_sale_item_quantity;
    END IF;

    v_line_total := v_sale_item_unit_price * v_quantity_refunded;
    v_items_total := v_items_total + v_line_total;
  END LOOP;

  -- net_refund_amount: item lines (authoritative, from real sale prices) plus any
  -- tax refund, minus a processing fee — the same shape the app already computed,
  -- just no longer trusting a client-supplied lump sum.
  v_net_refund_amount := v_items_total + COALESCE(p_tax_refund_amount, 0) - COALESCE(p_processing_fee, 0);
  IF v_net_refund_amount < 0 THEN
    v_net_refund_amount := 0;
  END IF;

  SELECT COALESCE(SUM(net_refund_amount), 0) INTO v_already_refunded
  FROM sales_refunds
  WHERE original_sale_id = p_original_sale_id AND tenant_id = p_tenant_id AND refund_status <> 'rejected';

  IF v_already_refunded + v_net_refund_amount > v_sale_total THEN
    RAISE EXCEPTION 'Refund of % would exceed remaining refundable balance (% already refunded of % sale total)',
      v_net_refund_amount, v_already_refunded, v_sale_total;
  END IF;

  v_refund_number := 'REF-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::TEXT;

  INSERT INTO sales_refunds (
    tenant_id, refund_number, original_sale_id, customer_id, user_id, refund_type,
    refund_reason, refund_amount, tax_refund_amount, processing_fee, net_refund_amount,
    refund_method, refund_status, refund_date, notes
  ) VALUES (
    p_tenant_id, v_refund_number, p_original_sale_id, p_customer_id, p_user_id,
    COALESCE(p_refund_type, 'partial_refund'), p_refund_reason, v_items_total,
    COALESCE(p_tax_refund_amount, 0), COALESCE(p_processing_fee, 0), v_net_refund_amount,
    COALESCE(p_refund_method, 'original_payment'), p_refund_status, p_refund_date, p_notes
  ) RETURNING id INTO v_refund_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_sale_item_id := (v_item->>'sale_item_id')::UUID;
    v_quantity_refunded := (v_item->>'quantity_refunded')::INTEGER;

    SELECT quantity, unit_price, medicine_id
    INTO v_sale_item_quantity, v_sale_item_unit_price, v_sale_item_medicine_id
    FROM sale_items
    WHERE id = v_sale_item_id AND sale_id = p_original_sale_id AND tenant_id = p_tenant_id;

    INSERT INTO sales_refund_items (
      refund_id, sale_item_id, medicine_id, quantity_refunded, unit_price, total_refund_amount, tenant_id
    ) VALUES (
      v_refund_id, v_sale_item_id, v_sale_item_medicine_id, v_quantity_refunded,
      v_sale_item_unit_price, v_sale_item_unit_price * v_quantity_refunded, p_tenant_id
    );
  END LOOP;

  RETURN v_refund_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_sales_refund TO authenticated;
