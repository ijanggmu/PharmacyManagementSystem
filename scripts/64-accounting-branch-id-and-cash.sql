-- Branch-wise accounting (vouchers + sub-ledgers) and bank deposit workflow.
-- Nullable branch_id: NULL = legacy / tenant-wide; reports filter by branch when provided.

-- 1) Branch on GL vouchers and lines
ALTER TABLE accounting_vouchers
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE accounting_voucher_lines
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_tenant_branch_date
  ON accounting_vouchers(tenant_id, branch_id, voucher_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_voucher_lines_tenant_branch
  ON accounting_voucher_lines(tenant_id, branch_id);

-- 2) Branch on supplier sub-ledger
ALTER TABLE supplier_ledger_entries
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_tenant_branch
  ON supplier_ledger_entries(tenant_id, branch_id);

-- 3) Backfill voucher branch from source documents
UPDATE accounting_vouchers v
SET branch_id = s.branch_id
FROM sales s
WHERE v.tenant_id = s.tenant_id
  AND v.reference_type = 'sale'
  AND v.reference_id = s.id
  AND v.branch_id IS NULL
  AND s.branch_id IS NOT NULL;

UPDATE accounting_vouchers v
SET branch_id = cp.branch_id
FROM customer_payments cp
WHERE v.tenant_id = cp.tenant_id
  AND v.reference_type = 'customer_payment'
  AND v.reference_id = cp.id
  AND v.branch_id IS NULL
  AND cp.branch_id IS NOT NULL;

UPDATE accounting_vouchers v
SET branch_id = gr.branch_id
FROM supplier_ledger_entries sle
JOIN goods_receipts gr ON gr.id = sle.goods_receipt_id
WHERE v.tenant_id = sle.tenant_id
  AND v.reference_type IN ('goods_receipt', 'purchase_receipt', 'grn')
  AND v.reference_id = sle.goods_receipt_id
  AND v.branch_id IS NULL
  AND gr.branch_id IS NOT NULL;

UPDATE accounting_voucher_lines l
SET branch_id = v.branch_id
FROM accounting_vouchers v
WHERE l.voucher_id = v.id
  AND l.branch_id IS NULL
  AND v.branch_id IS NOT NULL;

UPDATE supplier_ledger_entries sle
SET branch_id = gr.branch_id
FROM goods_receipts gr
WHERE sle.goods_receipt_id = gr.id
  AND sle.branch_id IS NULL
  AND gr.branch_id IS NOT NULL;

-- 4) Opening balance RPC — optional branch filter
DROP FUNCTION IF EXISTS public.accounting_opening_balance(UUID, UUID, DATE);

CREATE OR REPLACE FUNCTION public.accounting_opening_balance(
  p_tenant_id UUID,
  p_account_id UUID,
  p_from_date DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS NUMERIC(14,2)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(l.debit_amount - l.credit_amount),
    0
  )::NUMERIC(14,2)
  FROM accounting_voucher_lines l
  INNER JOIN accounting_vouchers v ON v.id = l.voucher_id
  WHERE l.tenant_id = p_tenant_id
    AND l.account_id = p_account_id
    AND v.status = 'posted'
    AND v.voucher_date < p_from_date
    AND (p_branch_id IS NULL OR v.branch_id = p_branch_id);
$$;

GRANT EXECUTE ON FUNCTION public.accounting_opening_balance(UUID, UUID, DATE, UUID) TO authenticated;

-- 5) Bank deposits (cash to bank transfer with GL voucher Dr 1010 / Cr 1000)
CREATE TABLE IF NOT EXISTS bank_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  deposit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reference_note TEXT,
  voucher_id UUID REFERENCES accounting_vouchers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_deposits_tenant_branch_date
  ON bank_deposits(tenant_id, branch_id, deposit_date DESC);

COMMENT ON TABLE bank_deposits IS 'Physical cash deposited to bank; posts GL voucher Dr Bank (1010), Cr Cash (1000).';

ALTER TABLE bank_deposits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'bank_deposits' AND policyname = 'Bank deposits by tenant'
  ) THEN
    CREATE POLICY "Bank deposits by tenant" ON bank_deposits
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

GRANT ALL ON bank_deposits TO authenticated;

CREATE OR REPLACE FUNCTION public.record_bank_deposit(
  p_branch_id UUID,
  p_amount NUMERIC(14,2),
  p_deposit_date DATE,
  p_reference_note TEXT,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_cash UUID;
  v_bank UUID;
  v_vid UUID;
  v_no VARCHAR(64);
  v_deposit_id UUID;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  SELECT tenant_id INTO v_tenant FROM users WHERE id = p_user_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.id = p_branch_id AND b.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Invalid branch for tenant';
  END IF;

  PERFORM public.accounting_assert_posting_open(v_tenant, COALESCE(p_deposit_date, CURRENT_DATE));

  v_cash := public.accounting_resolve_account(v_tenant, 'cash_on_hand', '1000');
  v_bank := public.accounting_resolve_account(v_tenant, 'bank', '1010');
  IF v_cash IS NULL OR v_bank IS NULL THEN
    RAISE EXCEPTION 'Cash (1000) or Bank (1010) account missing';
  END IF;

  INSERT INTO bank_deposits (
    tenant_id, branch_id, deposit_date, amount, reference_note, created_by
  ) VALUES (
    v_tenant, p_branch_id, COALESCE(p_deposit_date, CURRENT_DATE), p_amount, p_reference_note, p_user_id
  ) RETURNING id INTO v_deposit_id;

  v_no := public.accounting_next_voucher_no(v_tenant);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, p_branch_id, v_no, COALESCE(p_deposit_date, CURRENT_DATE), 'journal', 'manual',
    'bank_deposit', v_deposit_id, 'posted',
    COALESCE(p_reference_note, 'Bank deposit'),
    p_user_id, NOW(), p_user_id
  ) RETURNING id INTO v_vid;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, p_branch_id, v_vid, 1, v_bank, 'Cash deposited to bank', p_amount, 0);
  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, p_branch_id, v_vid, 2, v_cash, 'Cash out for bank deposit', 0, p_amount);

  UPDATE bank_deposits SET voucher_id = v_vid WHERE id = v_deposit_id;

  RETURN v_deposit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_bank_deposit(UUID, NUMERIC, DATE, TEXT, UUID) TO authenticated;

-- 6) Sale voucher — tag branch from sale
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
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, r.branch_id, v_no, v_sale_date, 'system_sale', 'system',
    'sale', p_sale_id, 'posted',
    'Auto: sale ' || COALESCE(r.sale_number, p_sale_id::text),
    v_uid, NOW(), v_uid
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;

  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (
    v_tenant, r.branch_id, v_vid, ln, v_debit,
    CASE WHEN r.payment_method = 'credit' THEN 'Accounts receivable'
         WHEN r.payment_method = 'bank' THEN 'Bank receipt'
         ELSE 'Cash / payment received' END,
    v_total, 0
  );
  ln := ln + 1;

  IF v_tax > 0 AND v_vat IS NOT NULL THEN
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, r.branch_id, v_vid, ln, v_sales, 'Sales revenue (net of VAT)', 0, v_net);
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, r.branch_id, v_vid, ln, v_vat, 'Output VAT', 0, v_tax);
    ln := ln + 1;
  ELSE
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, r.branch_id, v_vid, ln, v_sales, 'Sales revenue', 0, v_total);
    ln := ln + 1;
  END IF;

  IF v_cogs > 0 THEN
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, r.branch_id, v_vid, ln, v_cogs_a, 'COGS', v_cogs, 0);
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (v_tenant, r.branch_id, v_vid, ln, v_inv, 'Inventory relief', 0, v_cogs);
  END IF;
END;
$$;

-- 7) Customer receipt — tag voucher/lines with branch
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

  PERFORM public.accounting_assert_posting_open(v_tenant, COALESCE(p_payment_date, CURRENT_DATE));

  INSERT INTO customer_payments (
    tenant_id, branch_id, customer_id, payment_date, payment_method, amount, reference_note, created_by
  ) VALUES (
    v_tenant, v_branch, p_customer_id, COALESCE(p_payment_date, CURRENT_DATE), p_payment_method, p_amount, p_reference_note, p_user_id
  ) RETURNING id INTO v_payment_id;

  v_remaining := p_amount::NUMERIC(10,2);

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

  v_ar := public.accounting_resolve_account(v_tenant, 'accounts_receivable', '1100');
  v_cash := public.accounting_resolve_account(v_tenant, 'cash_on_hand', '1000');
  v_bank := public.accounting_resolve_account(v_tenant, 'bank', '1010');
  v_debit := CASE WHEN p_payment_method = 'bank' THEN v_bank ELSE v_cash END;
  IF v_ar IS NULL OR v_debit IS NULL THEN
    RAISE EXCEPTION 'Required GL accounts missing';
  END IF;

  v_no := public.accounting_next_voucher_no(v_tenant);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, v_branch, v_no, COALESCE(p_payment_date, CURRENT_DATE), 'journal', 'manual',
    'customer_payment', v_payment_id, 'posted',
    'Customer receipt', p_user_id, NOW(), p_user_id
  )
  RETURNING id INTO v_vid;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, v_branch, v_vid, ln, v_debit, 'Customer receipt', p_amount, 0);
  ln := ln + 1;
  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, v_branch, v_vid, ln, v_ar, 'Reduce accounts receivable', 0, p_amount);

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

-- 8) Supplier payment — branch on ledger + voucher
DROP FUNCTION IF EXISTS public.post_supplier_payment(UUID, UUID, NUMERIC, TEXT, DATE, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.post_supplier_payment(
  p_tenant_id UUID,
  p_supplier_id UUID,
  p_amount NUMERIC(14,2),
  p_payment_method TEXT,
  p_payment_date DATE,
  p_user_id UUID,
  p_reference_note TEXT,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE(ledger_entry_id UUID, voucher_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ap UUID;
  v_cash_bank UUID;
  v_last NUMERIC(14,2);
  v_new_bal NUMERIC(14,2);
  v_ledger_id UUID;
  v_vid UUID;
  v_no VARCHAR(64);
  v_branch UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  PERFORM public.accounting_assert_posting_open(p_tenant_id, p_payment_date);

  IF p_payment_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'payment_method must be cash or bank';
  END IF;

  v_branch := p_branch_id;
  IF v_branch IS NULL THEN
    SELECT current_branch_id INTO v_branch FROM users WHERE id = p_user_id;
  END IF;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM branches WHERE tenant_id = p_tenant_id ORDER BY created_at LIMIT 1;
  END IF;

  SELECT accounting_payable_account_id INTO v_ap FROM suppliers WHERE id = p_supplier_id AND tenant_id = p_tenant_id LIMIT 1;
  IF v_ap IS NULL THEN
    RAISE EXCEPTION 'Supplier has no accounts payable head; save supplier again or run migration';
  END IF;

  IF p_payment_method = 'cash' THEN
    SELECT id INTO v_cash_bank FROM accounting_accounts WHERE tenant_id = p_tenant_id AND code = '1000' LIMIT 1;
  ELSE
    SELECT id INTO v_cash_bank FROM accounting_accounts WHERE tenant_id = p_tenant_id AND code = '1010' LIMIT 1;
  END IF;
  IF v_cash_bank IS NULL THEN
    RAISE EXCEPTION 'Cash/Bank account missing (codes 1000 / 1010)';
  END IF;

  SELECT balance_after INTO v_last
  FROM supplier_ledger_entries
  WHERE tenant_id = p_tenant_id AND supplier_id = p_supplier_id
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1;

  v_new_bal := COALESCE(v_last, 0)::NUMERIC(14,2) - p_amount;

  INSERT INTO supplier_ledger_entries (
    tenant_id, branch_id, supplier_id, reference_number, entry_type, amount, balance_after, entry_date, description
  ) VALUES (
    p_tenant_id,
    v_branch,
    p_supplier_id,
    COALESCE(p_reference_note, 'PAY-' || to_char(now(), 'YYYYMMDDHH24MISS')),
    'payment',
    p_amount,
    v_new_bal,
    p_payment_date,
    'Supplier payment (' || p_payment_method || ')'
  )
  RETURNING id INTO v_ledger_id;

  v_no := public.accounting_next_voucher_no(p_tenant_id);

  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    p_tenant_id, v_branch, v_no, p_payment_date, 'system_supplier_payment', 'system',
    'supplier_payment', v_ledger_id, 'posted',
    'Supplier payment',
    p_user_id, NOW(), p_user_id
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;

  IF v_vid IS NULL THEN
    RAISE EXCEPTION 'Duplicate supplier payment voucher';
  END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (p_tenant_id, v_branch, v_vid, 1, v_ap, 'Reduce supplier payable', p_amount, 0),
    (p_tenant_id, v_branch, v_vid, 2, v_cash_bank, 'Payment ' || p_payment_method, 0, p_amount);

  ledger_entry_id := v_ledger_id;
  voucher_id := v_vid;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_supplier_payment(
  UUID, UUID, NUMERIC, TEXT, DATE, UUID, TEXT, UUID
) TO authenticated;
