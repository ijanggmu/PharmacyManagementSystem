-- Create a database function to handle sale creation atomically
-- This ensures all-or-nothing transaction behavior

CREATE OR REPLACE FUNCTION create_sale_with_items(
  p_sale_number VARCHAR(100),
  p_customer_id UUID,
  p_total_amount DECIMAL(10,2),
  p_discount_amount DECIMAL(10,2),
  p_tax_amount DECIMAL(10,2),
  p_payment_method VARCHAR(50),
  p_sale_date TIMESTAMP WITH TIME ZONE,
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
BEGIN
  -- Insert sale
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
    user_id
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
    p_user_id
  ) RETURNING id INTO v_sale_id;

  -- Insert sale items and update inventory atomically
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);
    v_total_price := v_unit_price * v_quantity;

    -- Check stock availability
    SELECT stock_quantity INTO v_current_stock
    FROM medicines
    WHERE id = v_medicine_id
    FOR UPDATE; -- Lock the row for update

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Medicine % not found', v_medicine_id;
    END IF;

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for medicine %. Available: %, Requested: %', 
        v_medicine_id, v_current_stock, v_quantity;
    END IF;

    -- Insert sale item
    INSERT INTO sale_items (
      sale_id,
      medicine_id,
      quantity,
      unit_price,
      total_price
    ) VALUES (
      v_sale_id,
      v_medicine_id,
      v_quantity,
      v_unit_price,
      v_total_price
    );

    -- Update stock
    UPDATE medicines
    SET stock_quantity = stock_quantity - v_quantity,
        updated_at = NOW()
    WHERE id = v_medicine_id;

    -- Record inventory transaction
    INSERT INTO inventory_transactions (
      medicine_id,
      transaction_type,
      quantity,
      reference_id,
      reference_type,
      user_id
    ) VALUES (
      v_medicine_id,
      'sale',
      -v_quantity,
      v_sale_id,
      'sale',
      p_user_id
    );
  END LOOP;

  RETURN v_sale_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback by deleting the sale if it was created
    IF v_sale_id IS NOT NULL THEN
      DELETE FROM sales WHERE id = v_sale_id;
    END IF;
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_sale_with_items TO authenticated;

-- Add comment
COMMENT ON FUNCTION create_sale_with_items IS 'Atomically creates a sale with items and updates inventory. Rolls back on any error.';

