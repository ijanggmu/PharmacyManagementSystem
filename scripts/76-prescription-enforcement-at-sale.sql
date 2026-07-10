-- H7/H8: prescription enforcement at point of sale.
--
-- Before this, sales.prescription_id existed but nothing ever populated it — any
-- medicine, including prescription_required ones, could be sold with no prescription
-- reference, no check on prescription status, and prescription_items.quantity_dispensed
-- was never updated by an actual sale (only ever touched, if at all, by hand).
--
-- This makes create_sale_with_items prescription-aware:
--  - Any prescription_required medicine in the cart MUST match a line item on the
--    supplied prescription (by medicine_id), or the whole sale is rejected.
--  - The referenced prescription must belong to the tenant and not be 'cancelled'.
--  - Matching items increment prescription_items.quantity_dispensed, capped at
--    quantity_prescribed (rejects over-dispensing / double-filling).
--  - prescriptions.status is recomputed after dispensing: 'filled' once every item
--    on the prescription is fully dispensed, 'partially_filled' otherwise.

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS refills_allowed INTEGER;

DROP FUNCTION IF EXISTS create_sale_with_items(
  VARCHAR(100), UUID, DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2), VARCHAR(50), TIMESTAMPTZ, TEXT, UUID, JSONB, UUID
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

  -- Pre-flight: any prescription_required medicine in the cart must match a line on
  -- the supplied prescription, with dispensable quantity remaining. Checked before
  -- any writes so a failure here leaves nothing to roll back.
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

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, user_id, tenant_id, branch_id
    ) VALUES (
      v_medicine_id, 'sale', -v_quantity, v_sale_id, 'sale', p_user_id, v_tenant_id, v_branch_id
    );

    -- Dispense against the matching prescription line, if this sale is linked to one.
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
