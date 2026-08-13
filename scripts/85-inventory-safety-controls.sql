-- Inventory & dispensing safety controls, addressing the "Medicines & Inventory"
-- audit findings (12 Aug 2026):
--   1. FEFO batch tracking was record-keeping only — the sale-time availability
--      check ran against the branch aggregate, not the batches, so it never
--      actually blocked anything. deduct_fefo_batches now raises when the
--      batch-tracked quantity can't cover the sale (once a medicine has any
--      batch rows) instead of silently under-deducting.
--   2. No expiry block at sale, no recall mechanism. FEFO batch selection now
--      skips expired and recalled batches; medicines with no batch rows yet
--      (pre-batch-tracking stock) fall back to the medicine-level expiry_date.
--   3. Manual stock DECREASES wrote no inventory_transactions row and had no
--      reason code — only increases were audited. Fixed in application code
--      (medicine-service.ts) using the reason_code/notes columns added here.
--   4. No temperature range field for cold-chain medicines (vaccines, insulin).
--   5. No pack/unit distinction for partial-strip dispensing.

-- --- medicine_batches: recall support -----------------------------------------
ALTER TABLE public.medicine_batches
  ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recalled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recall_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_medicine_batches_recalled
  ON public.medicine_batches (tenant_id, medicine_id, batch_number)
  WHERE recalled_at IS NOT NULL;

-- --- medicines: cold-chain + pack/unit sizing ----------------------------------
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS requires_cold_chain BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storage_temp_min_c NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS storage_temp_max_c NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS units_per_pack INTEGER CHECK (units_per_pack IS NULL OR units_per_pack > 0),
  ADD COLUMN IF NOT EXISTS unit_label VARCHAR(30);

-- --- inventory_transactions: reason code for adjustments -----------------------
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS reason_code VARCHAR(50);

COMMENT ON COLUMN public.inventory_transactions.reason_code IS
  'For transaction_type=adjustment: breakage, theft, expiry_writeoff, count_correction, other.';

-- --- deduct_fefo_batches: make FEFO a real control, not just record-keeping ----
-- Skips expired and recalled batches when selecting stock to deduct. If the
-- medicine has ANY batch rows at this branch, the batch-tracked total must
-- cover the full quantity or the sale is rejected — this is what makes FEFO
-- (and the expiry/recall exclusion) an actual control on what gets handed
-- over, not just a best-effort record after the branch aggregate already
-- approved the sale. Medicines with zero batch rows (stock that predates
-- batch tracking) are unaffected — the branch aggregate remains authoritative
-- for them, same as before.
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
  v_has_any_batches BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.medicine_batches
    WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND medicine_id = p_medicine_id
  ) INTO v_has_any_batches;

  FOR v_batch IN
    SELECT id, quantity_remaining
    FROM public.medicine_batches
    WHERE tenant_id = p_tenant_id AND branch_id = p_branch_id AND medicine_id = p_medicine_id
      AND quantity_remaining > 0
      AND recalled_at IS NULL
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
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

  IF v_has_any_batches AND v_remaining_to_deduct > 0 THEN
    RAISE EXCEPTION
      'Cannot dispense % unit(s) of this medicine — only % unit(s) of sellable (non-expired, non-recalled) batch stock available at this branch',
      p_quantity, (p_quantity - v_remaining_to_deduct);
  END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.deduct_fefo_batches TO authenticated;

-- --- recall_medicine_batch: flag a lot bad and block it from sale everywhere ---
-- Recalls by (tenant, medicine, batch_number) so a lot delivered to multiple
-- branches is pulled from sale everywhere at once, not just where it was
-- clicked from.
CREATE OR REPLACE FUNCTION public.recall_medicine_batch(
  p_tenant_id UUID,
  p_medicine_id UUID,
  p_batch_number VARCHAR(100),
  p_actor_user_id UUID,
  p_reason TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_affected INTEGER;
BEGIN
  UPDATE public.medicine_batches
  SET recalled_at = NOW(), recalled_by = p_actor_user_id, recall_reason = NULLIF(p_reason, '')
  WHERE tenant_id = p_tenant_id AND medicine_id = p_medicine_id AND batch_number = p_batch_number
    AND recalled_at IS NULL;

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.recall_medicine_batch TO authenticated;

-- --- create_sale_with_items: expiry fallback for pre-batch-tracking stock ------
-- deduct_fefo_batches (above) already blocks expired/recalled batch-tracked
-- stock. This adds the same protection for medicines with zero batch rows —
-- their only expiry signal is medicines.expiry_date — by rejecting the sale
-- outright if that date has passed.
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
  v_medicine_name TEXT;
  v_medicine_expiry DATE;
  v_has_batches BOOLEAN;
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

    SELECT prescription_required, name, expiry_date
    INTO v_requires_rx, v_medicine_name, v_medicine_expiry
    FROM medicines
    WHERE id = v_medicine_id AND tenant_id = v_tenant_id;

    -- Expiry block for stock that predates batch tracking (no medicine_batches
    -- rows yet) — batch-tracked stock is checked by deduct_fefo_batches below.
    SELECT EXISTS (
      SELECT 1 FROM public.medicine_batches
      WHERE tenant_id = v_tenant_id AND branch_id = v_branch_id AND medicine_id = v_medicine_id
    ) INTO v_has_batches;

    IF NOT v_has_batches AND v_medicine_expiry IS NOT NULL AND v_medicine_expiry < CURRENT_DATE THEN
      RAISE EXCEPTION 'Cannot sell % — this medicine expired on %', COALESCE(v_medicine_name, v_medicine_id::TEXT), v_medicine_expiry;
    END IF;

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

    -- FEFO: now a real control — raises if batch-tracked (non-expired,
    -- non-recalled) stock can't cover the quantity, aborting the whole sale.
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

-- --- listBatchesForMedicine consumers need recall fields returned too ---------
-- (No view/function change needed — app/api/medicines/[id]/batches selects
-- explicit columns; lib/server/services/medicine-service.ts is updated to
-- include recalled_at/recall_reason in that select list.)
