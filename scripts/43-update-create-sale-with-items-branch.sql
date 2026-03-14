-- Update create_sale_with_items to set branch_id on sales, sale_items, and inventory_transactions
-- Uses users.current_branch_id if available, otherwise tenant's default branch

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
  p_items JSONB
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
BEGIN
  -- Derive tenant and current branch from application user
  SELECT tenant_id, current_branch_id
  INTO v_tenant_id, v_branch_id
  FROM users
  WHERE id = p_user_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
  END IF;

  -- Fallback: if user has no current_branch_id, use tenant's first branch
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

  -- Insert sale with tenant and branch
  INSERT INTO sales (
    sale_number,
    customer_id,
    total_amount,
    discount_amount,
    tax_amount,
    payment_method,
    payment_status,
    sale_date,
    notes,
    user_id,
    tenant_id,
    branch_id
  ) VALUES (
    p_sale_number,
    p_customer_id,
    p_total_amount,
    p_discount_amount,
    p_tax_amount,
    p_payment_method,
    'paid',
    p_sale_date,
    p_notes,
    p_user_id,
    v_tenant_id,
    v_branch_id
  ) RETURNING id INTO v_sale_id;

  -- Insert sale items and update inventory atomically
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);
    v_total_price := v_unit_price * v_quantity;

    -- Check stock availability within tenant scope
    SELECT stock_quantity INTO v_current_stock
    FROM medicines
    WHERE id = v_medicine_id
      AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Medicine % not found for tenant %', v_medicine_id, v_tenant_id;
    END IF;

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for medicine %. Available: %, Requested: %',
        v_medicine_id, v_current_stock, v_quantity;
    END IF;

    -- Insert sale item with tenant and branch
    INSERT INTO sale_items (
      sale_id,
      medicine_id,
      quantity,
      unit_price,
      total_price,
      tenant_id,
      branch_id
    ) VALUES (
      v_sale_id,
      v_medicine_id,
      v_quantity,
      v_unit_price,
      v_total_price,
      v_tenant_id,
      v_branch_id
    );

    -- Update stock
    UPDATE medicines
    SET stock_quantity = stock_quantity - v_quantity,
        updated_at = NOW()
    WHERE id = v_medicine_id
      AND tenant_id = v_tenant_id;

    -- Record inventory transaction with tenant and branch
    INSERT INTO inventory_transactions (
      medicine_id,
      transaction_type,
      quantity,
      reference_id,
      reference_type,
      user_id,
      tenant_id,
      branch_id
    ) VALUES (
      v_medicine_id,
      'sale',
      -v_quantity,
      v_sale_id,
      'sale',
      p_user_id,
      v_tenant_id,
      v_branch_id
    );
  END LOOP;

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

