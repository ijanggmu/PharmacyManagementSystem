-- Split (multi-tender) payments per sale, and persisted per-line-item discount.
--
-- Context: checkout previously supported exactly one payment_method per sale (a single
-- VARCHAR column on `sales`) and computed a per-item discount only in memory to shrink
-- the sale total — it was never written to `sale_items`. This adds:
--   1. sale_items.discount_percent — the per-line discount actually applied, persisted.
--   2. sale_payments — one row per tender leg (e.g. cash + card for one sale); amounts
--      must sum to the sale total (enforced in the application layer, not by a DB
--      constraint, since the total isn't known until all legs are inserted).
-- `sales.payment_method` is kept for simple filtering/backward compatibility: it holds
-- the single method when there's one payment leg, or 'mixed' when there's more than one.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100);

CREATE TABLE IF NOT EXISTS sale_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  branch_id UUID REFERENCES branches(id),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN
    ('cash', 'card', 'insurance', 'fonepay', 'esewa', 'khalti', 'bank', 'credit', 'other')),
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_tenant_sale
  ON sale_payments(tenant_id, sale_id);

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sale_payments' AND policyname = 'Sale payments by tenant'
  ) THEN
    CREATE POLICY "Sale payments by tenant" ON sale_payments
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sale_payments' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON sale_payments
      FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;

-- --- create_sale_with_items: accept multiple payment legs + per-item discount --------
DROP FUNCTION IF EXISTS create_sale_with_items(
  VARCHAR(100), UUID, DECIMAL(10,2), DECIMAL(10,2), DECIMAL(10,2), VARCHAR(50), TIMESTAMPTZ, TEXT, UUID, JSONB, UUID, UUID
);

CREATE OR REPLACE FUNCTION create_sale_with_items(
  p_sale_number VARCHAR(100),
  p_customer_id UUID,
  p_total_amount DECIMAL(10,2),
  p_discount_amount DECIMAL(10,2),
  p_tax_amount DECIMAL(10,2),
  p_payments JSONB,
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
  v_payment JSONB;
  v_medicine_id UUID;
  v_quantity INTEGER;
  v_unit_price DECIMAL(10,2);
  v_total_price DECIMAL(10,2);
  v_discount_percent DECIMAL(5,2);
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
  v_payment_method VARCHAR(50);
  v_payment_leg_count INTEGER;
BEGIN
  SELECT tenant_id, current_branch_id
  INTO v_tenant_id, v_branch_id
  FROM users
  WHERE id = p_user_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
  END IF;

  SELECT COUNT(*) INTO v_payment_leg_count FROM jsonb_array_elements(p_payments);
  IF v_payment_leg_count IS NULL OR v_payment_leg_count = 0 THEN
    RAISE EXCEPTION 'At least one payment is required';
  END IF;

  v_payment_method := CASE WHEN v_payment_leg_count = 1
    THEN (p_payments->0->>'method')
    ELSE 'mixed'
  END;

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
    v_payment_method, 'paid', p_sale_date, p_notes, p_user_id, v_tenant_id, v_branch_id,
    p_client_request_id
  )
  ON CONFLICT (tenant_id, client_request_id) WHERE client_request_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_sale_id;

  IF v_sale_id IS NULL AND p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_sale_id FROM sales WHERE tenant_id = v_tenant_id AND client_request_id = p_client_request_id;
    RETURN v_sale_id;
  END IF;

  FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO sale_payments (sale_id, tenant_id, branch_id, payment_method, amount)
    VALUES (
      v_sale_id, v_tenant_id, v_branch_id,
      v_payment->>'method',
      (v_payment->>'amount')::DECIMAL(10,2)
    );
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);
    v_discount_percent := COALESCE((v_item->>'discount_percent')::DECIMAL(5,2), 0);
    v_total_price := v_unit_price * v_quantity * (1 - v_discount_percent / 100);

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
      sale_id, medicine_id, quantity, unit_price, total_price, discount_percent, tenant_id, branch_id
    ) VALUES (
      v_sale_id, v_medicine_id, v_quantity, v_unit_price, v_total_price, v_discount_percent, v_tenant_id, v_branch_id
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
