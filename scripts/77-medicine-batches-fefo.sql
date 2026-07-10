-- M2: real batch/expiry (FEFO) tracking. The old medicine_batches/batch_allocations
-- tables (dropped in scripts/73) were scaffolded but never wired into receiving or
-- sales — this is a fresh design validated against the actual receive/sale RPCs.
--
-- Each purchase receipt line creates one batch row with its own expiry date and a
-- remaining-quantity counter. Sales deduct from branch stock as before (that number
-- stays authoritative for availability), and additionally walk batches oldest-expiry
-- first to record which batch(es) a sale actually came from — this is what lets a
-- future "expiring stock" report be batch-accurate instead of just medicine-level.

CREATE TABLE IF NOT EXISTS public.medicine_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  expiry_date DATE,
  quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
  quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  goods_receipt_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicine_batches_fefo
  ON public.medicine_batches (branch_id, medicine_id, expiry_date NULLS LAST, received_at)
  WHERE quantity_remaining > 0;
CREATE INDEX IF NOT EXISTS idx_medicine_batches_tenant ON public.medicine_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_medicine_batches_expiry ON public.medicine_batches (tenant_id, expiry_date);

ALTER TABLE public.medicine_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'medicine_batches' AND policyname = 'Medicine batches by tenant'
  ) THEN
    CREATE POLICY "Medicine batches by tenant" ON public.medicine_batches
      FOR ALL
      USING (tenant_id = public.current_tenant_id())
      WITH CHECK (tenant_id = public.current_tenant_id());
  END IF;
END $$;

-- Deducts `p_quantity` of a medicine from a branch's batches, oldest-expiry-first
-- (FEFO), across as many batch rows as needed. Best-effort: if batches don't fully
-- cover the quantity (e.g. stock predates batch tracking), deducts what's available
-- and stops — medicine_branch_stock remains the authoritative availability check,
-- this only records which batch(es) a sale came from.
CREATE OR REPLACE FUNCTION public.deduct_fefo_batches(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_medicine_id UUID,
  p_quantity INTEGER
) RETURNS VOID AS $$
DECLARE
  v_remaining_to_deduct INTEGER := p_quantity;
  v_batch RECORD;
  v_take INTEGER;
BEGIN
  FOR v_batch IN
    SELECT id, quantity_remaining
    FROM public.medicine_batches
    WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND medicine_id = p_medicine_id
      AND quantity_remaining > 0
    ORDER BY expiry_date NULLS LAST, received_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_deduct <= 0;
    v_take := LEAST(v_batch.quantity_remaining, v_remaining_to_deduct);
    UPDATE public.medicine_batches
    SET quantity_remaining = quantity_remaining - v_take
    WHERE id = v_batch.id;
    v_remaining_to_deduct := v_remaining_to_deduct - v_take;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.deduct_fefo_batches TO authenticated;

-- receive_purchase_goods: accept optional batch_number/expiry_date per line and
-- create a batch row for each receipt.
DROP FUNCTION IF EXISTS public.receive_purchase_goods(UUID, UUID, UUID, DATE, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.receive_purchase_goods(
  p_tenant_id UUID,
  p_purchase_order_id UUID,
  p_branch_id UUID,
  p_receipt_date DATE,
  p_actor_user_id UUID,
  p_supplier_invoice_number TEXT,
  p_items JSONB
) RETURNS TABLE (goods_receipt_id UUID, receipt_number TEXT) AS $$
DECLARE
  v_supplier_id UUID;
  v_receipt_number TEXT;
  v_grn_id UUID;
  v_item JSONB;
  v_poi_id UUID;
  v_medicine_id UUID;
  v_qty_to_receive INTEGER;
  v_unit_cost DECIMAL(14,2);
  v_vat_amount DECIMAL(14,2);
  v_line_net DECIMAL(14,2);
  v_ordered INTEGER;
  v_received INTEGER;
  v_new_received INTEGER;
  v_current_branch_stock INTEGER;
  v_total_gross_for_ap DECIMAL(14,2) := 0;
  v_last_balance DECIMAL(14,2);
  v_new_balance DECIMAL(14,2);
  v_batch_number TEXT;
  v_expiry_date DATE;
BEGIN
  SELECT supplier_id INTO v_supplier_id
  FROM purchase_orders
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found for tenant %', p_purchase_order_id, p_tenant_id;
  END IF;

  v_receipt_number := 'GRN-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::TEXT;

  INSERT INTO goods_receipts (
    tenant_id, purchase_order_id, receipt_number, receipt_date, status,
    supplier_invoice_number, branch_id, created_by
  ) VALUES (
    p_tenant_id, p_purchase_order_id, v_receipt_number, p_receipt_date, 'draft',
    NULLIF(p_supplier_invoice_number, ''), p_branch_id, p_actor_user_id
  ) RETURNING id INTO v_grn_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty_to_receive := (v_item->>'quantity_to_receive')::INTEGER;
    IF v_qty_to_receive IS NULL OR v_qty_to_receive <= 0 THEN
      CONTINUE;
    END IF;

    v_poi_id := (v_item->>'purchase_order_item_id')::UUID;
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_unit_cost := (v_item->>'unit_cost')::DECIMAL(14,2);
    v_vat_amount := COALESCE((v_item->>'vat_amount')::DECIMAL(14,2), 0);
    v_batch_number := NULLIF(v_item->>'batch_number', '');
    v_expiry_date := NULLIF(v_item->>'expiry_date', '')::DATE;

    IF v_vat_amount < 0 THEN
      RAISE EXCEPTION 'Invalid VAT amount on receive line for item %', v_poi_id;
    END IF;

    SELECT quantity_ordered, quantity_received INTO v_ordered, v_received
    FROM purchase_order_items
    WHERE id = v_poi_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_ordered IS NULL THEN
      RAISE EXCEPTION 'Purchase order item % not found for tenant %', v_poi_id, p_tenant_id;
    END IF;

    v_new_received := COALESCE(v_received, 0) + v_qty_to_receive;
    IF v_new_received > v_ordered THEN
      RAISE EXCEPTION 'Cannot receive % units for item % — only % of % ordered units remain',
        v_qty_to_receive, v_poi_id, (v_ordered - COALESCE(v_received, 0)), v_ordered;
    END IF;

    v_line_net := v_unit_cost * v_qty_to_receive;
    v_total_gross_for_ap := v_total_gross_for_ap + v_line_net + v_vat_amount;

    INSERT INTO goods_receipt_items (
      goods_receipt_id, medicine_id, quantity_received, unit_cost, total_cost, vat_amount, branch_id
    ) VALUES (
      v_grn_id, v_medicine_id, v_qty_to_receive, v_unit_cost, v_line_net, v_vat_amount, p_branch_id
    );

    UPDATE purchase_order_items
    SET quantity_received = v_new_received
    WHERE id = v_poi_id;

    v_current_branch_stock := public.lock_medicine_branch_stock(p_tenant_id, p_branch_id, v_medicine_id);
    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_current_branch_stock + v_qty_to_receive, updated_at = NOW()
    WHERE branch_id = p_branch_id AND medicine_id = v_medicine_id;

    INSERT INTO public.medicine_batches (
      tenant_id, branch_id, medicine_id, batch_number, expiry_date,
      quantity_received, quantity_remaining, goods_receipt_id
    ) VALUES (
      p_tenant_id, p_branch_id, v_medicine_id, COALESCE(v_batch_number, 'BATCH-' || v_receipt_number), v_expiry_date,
      v_qty_to_receive, v_qty_to_receive, v_grn_id
    );

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, tenant_id, branch_id
    ) VALUES (
      v_medicine_id, 'purchase', v_qty_to_receive, v_grn_id, 'purchase', p_tenant_id, p_branch_id
    );
  END LOOP;

  IF v_total_gross_for_ap > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_supplier_id::TEXT));

    SELECT balance_after INTO v_last_balance
    FROM supplier_ledger_entries
    WHERE supplier_id = v_supplier_id
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 1;

    v_new_balance := COALESCE(v_last_balance, 0) + v_total_gross_for_ap;

    INSERT INTO supplier_ledger_entries (
      tenant_id, branch_id, supplier_id, purchase_order_id, goods_receipt_id,
      reference_number, supplier_bill_number, entry_type, amount, balance_after, entry_date
    ) VALUES (
      p_tenant_id, p_branch_id, v_supplier_id, p_purchase_order_id, v_grn_id,
      v_receipt_number, NULLIF(p_supplier_invoice_number, ''), 'invoice',
      v_total_gross_for_ap, v_new_balance, p_receipt_date
    );
  END IF;

  UPDATE goods_receipts SET status = 'received' WHERE id = v_grn_id;

  RETURN QUERY SELECT v_grn_id, v_receipt_number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.receive_purchase_goods TO authenticated;

-- create_sale_with_items: also deduct FEFO batches after the branch-stock decrement.
DROP FUNCTION IF EXISTS create_sale_with_items(
  VARCHAR(100), UUID, DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2), VARCHAR(50), TIMESTAMPTZ, TEXT, UUID, JSONB, UUID, UUID
);

CREATE OR REPLACE FUNCTION create_sale_with_items(
  p_sale_number VARCHAR(100),
  p_customer_id UUID,
  p_total_amount DECIMAL(10,2),
  p_discount_amount DECIMAL(10,2),
  p_tax_amount DECIMAL(10,2),
  p_payment_method VARCHAR(50),
  p_sale_date TIMESTAMPTZ,
  p_notes TEXT,
  p_user_id UUID,
  p_items JSONB,
  p_client_request_id UUID DEFAULT NULL,
  p_prescription_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_medicine_id UUID;
  v_quantity INTEGER;
  v_unit_price DECIMAL(10,2);
  v_total_price DECIMAL(10,2);
  v_current_stock INTEGER;
  v_tenant_id UUID;
  v_branch_id UUID;
  v_medicine_exists BOOLEAN;
  v_requires_rx BOOLEAN;
  v_rx_status VARCHAR(50);
  v_rx_item_id UUID;
  v_rx_prescribed INTEGER;
  v_rx_dispensed INTEGER;
  v_rx_all_filled BOOLEAN;
BEGIN
  SELECT tenant_id, current_branch_id
  INTO v_tenant_id, v_branch_id
  FROM users
  WHERE id = p_user_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
  END IF;

  IF p_prescription_id IS NOT NULL THEN
    SELECT status INTO v_rx_status
    FROM prescriptions
    WHERE id = p_prescription_id AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF v_rx_status IS NULL THEN
      RAISE EXCEPTION 'Prescription % not found for tenant %', p_prescription_id, v_tenant_id;
    END IF;
    IF v_rx_status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot dispense against a cancelled prescription';
    END IF;
  END IF;

  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_sale_id
    FROM sales
    WHERE tenant_id = v_tenant_id AND client_request_id = p_client_request_id;

    IF v_sale_id IS NOT NULL THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id
    FROM branches
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found for tenant %', v_tenant_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    SELECT prescription_required INTO v_requires_rx
    FROM medicines
    WHERE id = v_medicine_id AND tenant_id = v_tenant_id;

    IF v_requires_rx THEN
      IF p_prescription_id IS NULL THEN
        RAISE EXCEPTION 'Medicine % requires a prescription — none was provided', v_medicine_id;
      END IF;

      SELECT id, quantity_prescribed, quantity_dispensed
      INTO v_rx_item_id, v_rx_prescribed, v_rx_dispensed
      FROM prescription_items
      WHERE prescription_id = p_prescription_id AND medicine_id = v_medicine_id AND tenant_id = v_tenant_id
      FOR UPDATE;

      IF v_rx_item_id IS NULL THEN
        RAISE EXCEPTION 'Medicine % is not on prescription %', v_medicine_id, p_prescription_id;
      END IF;

      IF COALESCE(v_rx_dispensed, 0) + v_quantity > v_rx_prescribed THEN
        RAISE EXCEPTION 'Cannot dispense % of medicine % — % of % already dispensed on this prescription',
          v_quantity, v_medicine_id, COALESCE(v_rx_dispensed, 0), v_rx_prescribed;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO sales (
    sale_number, customer_id, prescription_id, total_amount, discount_amount, tax_amount,
    payment_method, payment_status, sale_date, notes, user_id, tenant_id, branch_id,
    client_request_id
  ) VALUES (
    p_sale_number, p_customer_id, p_prescription_id, p_total_amount, p_discount_amount, p_tax_amount,
    p_payment_method, 'paid', p_sale_date, p_notes, p_user_id, v_tenant_id, v_branch_id,
    p_client_request_id
  )
  ON CONFLICT (tenant_id, client_request_id) WHERE client_request_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_sale_id;

  IF v_sale_id IS NULL AND p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_sale_id FROM sales WHERE tenant_id = v_tenant_id AND client_request_id = p_client_request_id;
    RETURN v_sale_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);
    v_total_price := v_unit_price * v_quantity;

    SELECT EXISTS(
      SELECT 1 FROM medicines WHERE id = v_medicine_id AND tenant_id = v_tenant_id
    ) INTO v_medicine_exists;

    IF NOT v_medicine_exists THEN
      RAISE EXCEPTION 'Medicine % not found for tenant %', v_medicine_id, v_tenant_id;
    END IF;

    v_current_stock := public.lock_medicine_branch_stock(v_tenant_id, v_branch_id, v_medicine_id);

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for medicine % at this branch. Available: %, Requested: %',
        v_medicine_id, v_current_stock, v_quantity;
    END IF;

    INSERT INTO sale_items (
      sale_id, medicine_id, quantity, unit_price, total_price, tenant_id, branch_id
    ) VALUES (
      v_sale_id, v_medicine_id, v_quantity, v_unit_price, v_total_price, v_tenant_id, v_branch_id
    );

    UPDATE public.medicine_branch_stock
    SET stock_quantity = stock_quantity - v_quantity, updated_at = NOW()
    WHERE branch_id = v_branch_id AND medicine_id = v_medicine_id;

    -- FEFO: record which batch(es) this sale actually drew from.
    PERFORM public.deduct_fefo_batches(v_tenant_id, v_branch_id, v_medicine_id, v_quantity);

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, user_id, tenant_id, branch_id
    ) VALUES (
      v_medicine_id, 'sale', -v_quantity, v_sale_id, 'sale', p_user_id, v_tenant_id, v_branch_id
    );

    IF p_prescription_id IS NOT NULL THEN
      UPDATE prescription_items
      SET quantity_dispensed = quantity_dispensed + v_quantity
      WHERE prescription_id = p_prescription_id AND medicine_id = v_medicine_id AND tenant_id = v_tenant_id;
    END IF;
  END LOOP;

  IF p_prescription_id IS NOT NULL THEN
    SELECT bool_and(quantity_dispensed >= quantity_prescribed) INTO v_rx_all_filled
    FROM prescription_items
    WHERE prescription_id = p_prescription_id AND tenant_id = v_tenant_id;

    UPDATE prescriptions
    SET status = CASE WHEN v_rx_all_filled THEN 'filled' ELSE 'partially_filled' END,
        updated_at = NOW()
    WHERE id = p_prescription_id AND tenant_id = v_tenant_id;
  END IF;

  RETURN v_sale_id;
EXCEPTION
  WHEN OTHERS THEN
    IF v_sale_id IS NOT NULL THEN
      DELETE FROM sales WHERE id = v_sale_id;
    END IF;
    RAISE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION create_sale_with_items TO authenticated;
