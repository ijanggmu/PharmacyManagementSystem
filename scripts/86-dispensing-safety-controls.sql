-- Sales, Prescriptions & Dispensing safety controls, addressing the audit's Module 02
-- findings (12 Aug 2026):
--   1. Drug interaction / allergy checking existed in lib/utils/drug-interactions.ts but
--      was never called from anywhere, and checkAllergies() queried a customers.allergies
--      column that didn't exist. Adds the columns it (and chronic conditions / current
--      medications, needed for the same feature) actually need.
--   2. No prescription expiry/staleness check — adds expiry_date and enforces it in
--      create_sale_with_items.
--   3. Returned medicine went straight back onto the shelf with no quarantine step —
--      adds a packaging-condition flag per return line; only sealed/unopened, non-
--      controlled-substance lines get auto-restocked.

-- --- customers: patient safety data the interaction/allergy checker needs -------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS allergies TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS chronic_conditions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS current_medications TEXT[] NOT NULL DEFAULT '{}';

-- --- prescriptions: expiry/staleness -------------------------------------------------
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- --- return_items: packaging condition -> quarantine gate ----------------------------
ALTER TABLE public.return_items
  ADD COLUMN IF NOT EXISTS packaging_condition VARCHAR(20) NOT NULL DEFAULT 'opened'
    CHECK (packaging_condition IN ('sealed', 'opened', 'damaged')),
  ADD COLUMN IF NOT EXISTS restocked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.return_items.packaging_condition IS
  'sealed = unopened, eligible for restock. opened/damaged = quarantined, never auto-restocked regardless of medicine type.';
COMMENT ON COLUMN public.return_items.restocked IS
  'Set true by restore_return_stock() only for lines it actually added back to sellable stock.';

-- --- create_medicine_return: accept packaging_condition per line ---------------------
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
  v_packaging_condition TEXT;
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
    v_packaging_condition := COALESCE(NULLIF(v_item->>'packaging_condition', ''), 'opened');

    IF v_packaging_condition NOT IN ('sealed', 'opened', 'damaged') THEN
      v_packaging_condition := 'opened';
    END IF;

    IF v_quantity_returned IS NULL OR v_quantity_returned <= 0 THEN
      RAISE EXCEPTION 'quantity_returned must be positive for sale_item %', v_sale_item_id;
    END IF;

    SELECT quantity, unit_price, medicine_id
    INTO v_sale_item_quantity, v_sale_item_unit_price, v_sale_item_medicine_id
    FROM sale_items
    WHERE id = v_sale_item_id AND sale_id = p_sale_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_sale_item_quantity IS NULL THEN
      RAISE EXCEPTION 'Sale item % not found on sale %', v_sale_item_id, p_sale_id;
    END IF;

    SELECT COALESCE(SUM(ri.quantity_returned), 0) INTO v_already_returned
    FROM return_items ri
    JOIN medicine_returns mr ON mr.id = ri.return_id
    WHERE ri.sale_item_id = v_sale_item_id AND mr.status <> 'rejected';

    IF v_already_returned + v_quantity_returned > v_sale_item_quantity THEN
      RAISE EXCEPTION 'Cannot return % units of sale item % — % of % already returned/sold',
        v_quantity_returned, v_sale_item_id, v_already_returned, v_sale_item_quantity;
    END IF;

    v_line_total := v_sale_item_unit_price * v_quantity_returned;
    v_total_return_amount := v_total_return_amount + v_line_total;

    INSERT INTO return_items (
      tenant_id, return_id, sale_item_id, medicine_id, quantity_returned,
      unit_price, total_amount, reason, packaging_condition
    ) VALUES (
      p_tenant_id, v_return_id, v_sale_item_id, v_sale_item_medicine_id, v_quantity_returned,
      v_sale_item_unit_price, v_line_total, v_item_reason, v_packaging_condition
    );
  END LOOP;

  UPDATE medicine_returns SET total_return_amount = v_total_return_amount WHERE id = v_return_id;

  IF p_status = 'completed' THEN
    PERFORM public.restore_return_stock(v_return_id, p_tenant_id, p_branch_id);
  END IF;

  RETURN v_return_id;
END;
$$ LANGUAGE plpgsql;

-- --- restore_return_stock: quarantine gate -------------------------------------------
-- Only restocks lines marked packaging_condition='sealed' on a non-controlled-substance
-- medicine. Opened/damaged lines, and any controlled substance regardless of packaging,
-- are quarantined — the return record still exists (refund/accounting unaffected) but
-- the physical stock is never put back on the shelf automatically.
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
    SELECT ri.id, ri.medicine_id, ri.quantity_returned, ri.packaging_condition, m.controlled_substance
    FROM return_items ri
    JOIN medicines m ON m.id = ri.medicine_id
    WHERE ri.return_id = p_return_id AND ri.tenant_id = p_tenant_id
  LOOP
    IF v_item.packaging_condition <> 'sealed' OR v_item.controlled_substance THEN
      CONTINUE; -- quarantined: leave stock as-is, don't mark restocked
    END IF;

    v_current_branch_stock := public.lock_medicine_branch_stock(p_tenant_id, p_branch_id, v_item.medicine_id);

    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_current_branch_stock + v_item.quantity_returned, updated_at = NOW()
    WHERE branch_id = p_branch_id AND medicine_id = v_item.medicine_id;

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, tenant_id, branch_id
    ) VALUES (
      v_item.medicine_id, 'return', v_item.quantity_returned, p_return_id, 'return', p_tenant_id, p_branch_id
    );

    UPDATE return_items SET restocked = true WHERE id = v_item.id;
  END LOOP;

  UPDATE medicine_returns SET stock_restored_at = NOW() WHERE id = p_return_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_medicine_return TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_return_stock TO authenticated;

-- --- create_sale_with_items: prescription expiry/staleness check ---------------------
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
  v_rx_expiry DATE;
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
    SELECT status, expiry_date INTO v_rx_status, v_rx_expiry
    FROM prescriptions
    WHERE id = p_prescription_id AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF v_rx_status IS NULL THEN
      RAISE EXCEPTION 'Prescription % not found for tenant %', p_prescription_id, v_tenant_id;
    END IF;
    IF v_rx_status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot dispense against a cancelled prescription';
    END IF;
    IF v_rx_expiry IS NOT NULL AND v_rx_expiry < CURRENT_DATE THEN
      RAISE EXCEPTION 'This prescription expired on % and can no longer be dispensed against', v_rx_expiry;
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
