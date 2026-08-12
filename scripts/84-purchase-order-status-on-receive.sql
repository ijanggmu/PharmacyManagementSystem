-- Purchase orders never flipped to 'received' after a GRN was posted — the
-- receive dialog stayed enabled forever because nothing wrote back to
-- purchase_orders.status. This adds a 'partially_received' status (mirroring
-- the existing prescriptions.status 'partially_filled' pattern) and makes
-- receive_purchase_goods set the PO's status based on line completion.

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'purchase_orders' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.purchase_orders DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.purchase_orders
    ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('draft', 'pending', 'approved', 'ordered', 'partially_received', 'received', 'cancelled'));
END $$;

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
  v_po_status TEXT;
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

  -- Reflect receipt completion on the PO itself: 'received' once every line's
  -- quantity_received has caught up to quantity_ordered, otherwise
  -- 'partially_received' as soon as anything has been received at all.
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_order_items poi
      WHERE poi.purchase_order_id = p_purchase_order_id AND poi.quantity_received < poi.quantity_ordered
    ) THEN 'received'
    ELSE 'partially_received'
  END INTO v_po_status;

  UPDATE purchase_orders
  SET status = v_po_status, updated_at = NOW()
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id;

  RETURN QUERY SELECT v_grn_id, v_receipt_number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.receive_purchase_goods TO authenticated;
