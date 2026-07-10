-- Customer accounts receivable (AR) sub-ledger + customer receipts (Option A)
-- Keeps a single AR control account (1100) in the GL, while maintaining invoice/payment history per customer.
--
-- Key ideas:
-- - Credit sale posts invoice voucher (Dr AR 1100, Cr revenue/VAT/COGS) at sale date even when unpaid.
-- - Customer receipt posts cash/bank voucher (Dr 1000/1010, Cr AR 1100) and allocates to open invoices FIFO.
-- - Customer ledger is tenant-scoped and branch-aware (branch_id nullable for historical rows).

-- 1) Customer receipts (cash/bank collections for credit sales)
CREATE TABLE IF NOT EXISTS customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'bank')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reference_note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_payments_tenant_customer_date
  ON customer_payments(tenant_id, customer_id, payment_date);

-- 2) Allocation of customer payments to credit sales (invoices)
CREATE TABLE IF NOT EXISTS customer_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES customer_payments(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount_applied NUMERIC(10,2) NOT NULL CHECK (amount_applied > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, sale_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_payment_alloc_tenant_sale
  ON customer_payment_allocations(tenant_id, sale_id);

-- 3) Customer ledger entries (sub-ledger)
CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES customer_payments(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES sales_refunds(id) ON DELETE SET NULL,
  entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN ('invoice', 'payment', 'credit_note', 'adjustment')),
  description TEXT,
  amount NUMERIC(10,2) NOT NULL, -- + increases AR, - decreases AR
  balance_after NUMERIC(10,2),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_number VARCHAR(100),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_tenant_customer_date
  ON customer_ledger_entries(tenant_id, customer_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_tenant_sale
  ON customer_ledger_entries(tenant_id, sale_id);

-- 4) RLS (tenant context)
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customer_payments' AND policyname='Customer payments by tenant'
  ) THEN
    CREATE POLICY "Customer payments by tenant" ON customer_payments
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customer_payment_allocations' AND policyname='Customer payment allocations by tenant'
  ) THEN
    CREATE POLICY "Customer payment allocations by tenant" ON customer_payment_allocations
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='customer_ledger_entries' AND policyname='Customer ledger entries by tenant'
  ) THEN
    CREATE POLICY "Customer ledger entries by tenant" ON customer_ledger_entries
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

-- 5) Helper: recompute customer balance_after for one customer (used after inserts)
CREATE OR REPLACE FUNCTION public.customer_ledger_recompute_balance(p_tenant_id UUID, p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  run NUMERIC(10,2) := 0;
BEGIN
  FOR r IN
    SELECT id, amount
    FROM customer_ledger_entries
    WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    run := COALESCE(run, 0) + COALESCE(r.amount, 0);
    UPDATE customer_ledger_entries SET balance_after = run WHERE id = r.id;
  END LOOP;
END;
$$;

-- 6) Update create_sale_with_items:
-- - set payment_status = 'pending' when payment_method='credit'
-- - create customer_ledger_entries invoice row for credit sales
CREATE OR REPLACE FUNCTION public.create_sale_with_items(
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
  v_suffix TEXT;
  v_status TEXT;
BEGIN
  SELECT tenant_id, current_branch_id
  INTO v_tenant_id, v_branch_id
  FROM users
  WHERE id = p_user_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
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

  v_status := CASE WHEN p_payment_method = 'credit' THEN 'pending' ELSE 'paid' END;

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
    v_status,
    p_sale_date,
    p_notes,
    p_user_id,
    v_tenant_id,
    v_branch_id
  ) RETURNING id INTO v_sale_id;

  v_suffix := upper(substr(replace(v_sale_id::text, '-', ''), 1, 8));

  UPDATE sales SET invoice_number = 'INV-' || to_char(COALESCE(p_sale_date, NOW()) AT TIME ZONE 'UTC', 'YYMMDD') || '-' || v_suffix
  WHERE id = v_sale_id
    AND tenant_id = v_tenant_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);
    v_total_price := v_unit_price * v_quantity;

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

    UPDATE medicines
    SET stock_quantity = stock_quantity - v_quantity,
        updated_at = NOW()
    WHERE id = v_medicine_id
      AND tenant_id = v_tenant_id;

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

  -- For credit sales, create an invoice entry in the customer AR sub-ledger.
  IF p_payment_method = 'credit' AND p_customer_id IS NOT NULL THEN
    INSERT INTO customer_ledger_entries (
      tenant_id, branch_id, customer_id, sale_id,
      entry_type, description, amount, entry_date, reference_number, created_by
    )
    SELECT
      v_tenant_id,
      v_branch_id,
      p_customer_id,
      v_sale_id,
      'invoice',
      'Credit sale invoice',
      COALESCE(p_total_amount, 0),
      (COALESCE(p_sale_date, NOW()) AT TIME ZONE 'UTC')::date,
      (SELECT invoice_number FROM sales WHERE id = v_sale_id LIMIT 1),
      p_user_id;

    PERFORM public.customer_ledger_recompute_balance(v_tenant_id, p_customer_id);
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

GRANT EXECUTE ON FUNCTION public.create_sale_with_items TO authenticated;

-- 7) Customer receipt RPC: insert payment + allocations + voucher + ledger, FIFO by sale_date.
CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_reference_note TEXT,
  p_user_id UUID,
  p_allocations JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_branch UUID;
  v_payment_id UUID;
  v_remaining NUMERIC(10,2);
  v_ar UUID;
  v_cash UUID;
  v_bank UUID;
  v_debit UUID;
  v_vid UUID;
  v_no TEXT;
  ln INT := 1;
  inv RECORD;
  v_apply NUMERIC(10,2);
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;
  IF p_payment_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'payment_method must be cash or bank';
  END IF;

  SELECT tenant_id, current_branch_id INTO v_tenant, v_branch FROM users WHERE id = p_user_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
  END IF;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM branches WHERE tenant_id = v_tenant ORDER BY created_at LIMIT 1;
  END IF;

  -- Posting lock applies (same as other system postings)
  PERFORM public.accounting_assert_posting_open(v_tenant, COALESCE(p_payment_date, CURRENT_DATE));

  INSERT INTO customer_payments (
    tenant_id, branch_id, customer_id, payment_date, payment_method, amount, reference_note, created_by
  ) VALUES (
    v_tenant, v_branch, p_customer_id, COALESCE(p_payment_date, CURRENT_DATE), p_payment_method, p_amount, p_reference_note, p_user_id
  ) RETURNING id INTO v_payment_id;

  v_remaining := p_amount::NUMERIC(10,2);

  -- allocations: if provided, use; else FIFO allocate to open credit invoices
  IF p_allocations IS NOT NULL THEN
    FOR inv IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_apply := LEAST(v_remaining, COALESCE((inv->>'amount')::NUMERIC(10,2), 0));
      IF v_apply <= 0 THEN CONTINUE; END IF;
      INSERT INTO customer_payment_allocations (tenant_id, payment_id, sale_id, amount_applied)
      VALUES (v_tenant, v_payment_id, (inv->>'sale_id')::UUID, v_apply)
      ON CONFLICT (payment_id, sale_id) DO UPDATE SET amount_applied = EXCLUDED.amount_applied;
      v_remaining := v_remaining - v_apply;
    END LOOP;
  END IF;

  IF v_remaining > 0 THEN
    FOR inv IN
      SELECT
        s.id AS sale_id,
        (COALESCE(s.total_amount,0) - COALESCE(a.paid,0) - COALESCE(r.credited,0))::NUMERIC(10,2) AS open_amount
      FROM sales s
      LEFT JOIN (
        SELECT sale_id, SUM(amount_applied) paid
        FROM customer_payment_allocations
        WHERE tenant_id = v_tenant
        GROUP BY sale_id
      ) a ON a.sale_id = s.id
      LEFT JOIN (
        SELECT original_sale_id sale_id, SUM(net_refund_amount) credited
        FROM sales_refunds
        WHERE tenant_id = v_tenant AND refund_status IN ('approved', 'completed')
        GROUP BY original_sale_id
      ) r ON r.sale_id = s.id
      WHERE s.tenant_id = v_tenant
        AND s.customer_id = p_customer_id
        AND s.payment_method = 'credit'
      ORDER BY s.sale_date ASC, s.created_at ASC
    LOOP
      EXIT WHEN v_remaining <= 0;
      IF inv.open_amount <= 0 THEN CONTINUE; END IF;
      v_apply := LEAST(v_remaining, inv.open_amount);
      INSERT INTO customer_payment_allocations (tenant_id, payment_id, sale_id, amount_applied)
      VALUES (v_tenant, v_payment_id, inv.sale_id, v_apply)
      ON CONFLICT (payment_id, sale_id) DO UPDATE SET amount_applied = EXCLUDED.amount_applied;
      v_remaining := v_remaining - v_apply;
    END LOOP;
  END IF;

  -- Post GL voucher (Dr cash/bank, Cr AR control)
  v_ar := public.accounting_resolve_account(v_tenant, 'accounts_receivable', '1100');
  v_cash := public.accounting_resolve_account(v_tenant, 'cash_on_hand', '1000');
  v_bank := public.accounting_resolve_account(v_tenant, 'bank', '1010');
  v_debit := CASE WHEN p_payment_method = 'bank' THEN v_bank ELSE v_cash END;
  IF v_ar IS NULL OR v_debit IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts missing';
  END IF;

  v_no := public.accounting_next_voucher_no(v_tenant);
  INSERT INTO accounting_vouchers (
    tenant_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, v_no, COALESCE(p_payment_date, CURRENT_DATE), 'journal', 'manual',
    'customer_payment', v_payment_id, 'posted',
    'Customer receipt', p_user_id, NOW(), p_user_id
  )
  RETURNING id INTO v_vid;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, v_vid, ln, v_debit, 'Customer receipt', p_amount, 0);
  ln := ln + 1;
  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, v_vid, ln, v_ar, 'Reduce accounts receivable', 0, p_amount);

  -- Sub-ledger entry
  INSERT INTO customer_ledger_entries (
    tenant_id, branch_id, customer_id, payment_id,
    entry_type, description, amount, entry_date, reference_number, created_by
  ) VALUES (
    v_tenant, v_branch, p_customer_id, v_payment_id,
    'payment', 'Customer receipt', -p_amount, COALESCE(p_payment_date, CURRENT_DATE), v_no, p_user_id
  );

  PERFORM public.customer_ledger_recompute_balance(v_tenant, p_customer_id);

  RETURN v_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_customer_payment TO authenticated;

-- 8) Sale voucher posting: post credit invoices even when unpaid (payment_status='pending').
-- This keeps AR correct (Dr 1100 at invoice date). Cash/bank sales still require paid/completed.
CREATE OR REPLACE FUNCTION public.accounting_post_sale_voucher(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_tenant UUID;
  v_total NUMERIC(14,2);
  v_tax NUMERIC(14,2);
  v_net NUMERIC(14,2);
  v_cogs NUMERIC(14,2);
  v_uid UUID;
  v_vid UUID;
  v_no VARCHAR(64);
  v_debit UUID;
  v_sales UUID;
  v_vat UUID;
  v_cogs_a UUID;
  v_inv UUID;
  ln INT := 1;
  v_sale_date DATE;
BEGIN
  SELECT s.* INTO r FROM sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_tenant := r.tenant_id;
  v_sale_date := (r.sale_date::timestamptz AT TIME ZONE 'UTC')::date;
  PERFORM public.accounting_assert_posting_open(v_tenant, v_sale_date);

  IF NOT (
    (r.payment_method = 'credit' AND r.payment_status IN ('pending', 'paid', 'completed'))
    OR
    (r.payment_method <> 'credit' AND r.payment_status IN ('paid', 'completed'))
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM accounting_vouchers v
    WHERE v.tenant_id = v_tenant
      AND v.reference_type = 'sale'
      AND v.reference_id = p_sale_id
      AND v.status = 'posted'
  ) THEN
    RETURN;
  END IF;

  IF r.payment_method = 'credit' THEN
    v_debit := public.accounting_resolve_account(v_tenant, 'accounts_receivable', '1100');
  ELSIF r.payment_method = 'bank' THEN
    v_debit := public.accounting_resolve_account(v_tenant, 'bank', '1010');
  ELSE
    v_debit := public.accounting_resolve_account(v_tenant, 'cash_on_hand', '1000');
  END IF;

  v_sales := public.accounting_resolve_account(v_tenant, 'sales_revenue', '3000');
  v_vat := public.accounting_resolve_account(v_tenant, 'output_vat', '2000');
  v_cogs_a := public.accounting_resolve_account(v_tenant, 'cogs', '4000');
  v_inv := public.accounting_resolve_account(v_tenant, 'inventory', '5000');

  IF v_debit IS NULL OR v_sales IS NULL OR v_cogs_a IS NULL OR v_inv IS NULL THEN RETURN; END IF;

  v_total := COALESCE(r.total_amount, 0)::NUMERIC(14,2);
  v_tax := COALESCE(r.tax_amount, 0)::NUMERIC(14,2);
  v_net := GREATEST(v_total - v_tax, 0);

  SELECT COALESCE(SUM(si.quantity::NUMERIC * COALESCE(m.cost_price, 0)::NUMERIC), 0)
  INTO v_cogs
  FROM sale_items si
  JOIN medicines m ON m.id = si.medicine_id
  WHERE si.sale_id = p_sale_id;

  v_uid := r.user_id;
  v_no := public.accounting_next_voucher_no(v_tenant);

  INSERT INTO accounting_vouchers (
    tenant_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, v_no, v_sale_date, 'system_sale', 'system',
    'sale', p_sale_id, 'posted',
    'Auto: sale ' || COALESCE(r.sale_number, p_sale_id::text),
    v_uid, NOW(), v_uid
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;

  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (
    v_tenant, v_vid, ln, v_debit,
    CASE WHEN r.payment_method = 'credit' THEN 'Accounts receivable'
         WHEN r.payment_method = 'bank' THEN 'Bank receipt'
         ELSE 'Cash / payment received' END,
    v_total, 0
  );
  ln := ln + 1;

  IF v_tax > 0 AND v_vat IS NOT NULL THEN
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, v_vid, ln, v_sales, 'Sales revenue (net of VAT)', 0, v_net);
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, v_vid, ln, v_vat, 'Output VAT', 0, v_tax);
    ln := ln + 1;
  ELSE
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, v_vid, ln, v_sales, 'Sales revenue', 0, v_total);
    ln := ln + 1;
  END IF;

  IF v_cogs > 0 THEN
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, v_vid, ln, v_cogs_a, 'COGS', v_cogs, 0);
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, v_vid, ln, v_inv, 'Inventory relief', 0, v_cogs);
  END IF;
END;
$$;

