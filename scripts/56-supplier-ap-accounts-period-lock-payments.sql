-- Per-supplier accounts payable heads, posting period lock, purchase voucher → supplier AP,
-- and atomic supplier payment (ledger + GL voucher).

-- 1) Supplier → payable account (nullable until backfill / create)
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS accounting_payable_account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_payable_account ON suppliers(accounting_payable_account_id);

-- 2) Backfill: one liability account per supplier without a payable head
DO $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_acct UUID;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.tenant_id, s.name
    FROM suppliers s
    WHERE s.accounting_payable_account_id IS NULL
  LOOP
    v_code := 'S' || substr(md5(r.id::text), 1, 8);
    -- Ensure code unique per tenant (extremely unlikely collision; bump if needed)
    WHILE EXISTS (
      SELECT 1 FROM accounting_accounts a
      WHERE a.tenant_id = r.tenant_id AND a.code = v_code
    ) LOOP
      n := n + 1;
      v_code := 'S' || substr(md5(r.id::text || n::text), 1, 8);
    END LOOP;

    INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system, is_active)
    VALUES (
      r.tenant_id,
      v_code,
      'AP: ' || left(r.name, 120),
      'liability',
      false,
      true
    )
    RETURNING id INTO v_acct;

    UPDATE suppliers SET accounting_payable_account_id = v_acct WHERE id = r.id;
  END LOOP;
END $$;

-- 3) Posting lock: no automatic voucher dated on or before this date (tenant setting key)
CREATE OR REPLACE FUNCTION public.accounting_assert_posting_open(p_tenant_id UUID, p_voucher_date DATE)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_lock TEXT;
  v_lock_d DATE;
BEGIN
  SELECT value INTO v_lock
  FROM system_settings
  WHERE tenant_id = p_tenant_id AND key = 'accounting_posting_lock_date'
  LIMIT 1;

  IF v_lock IS NULL OR btrim(v_lock) = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_lock_d := v_lock::DATE;
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF p_voucher_date <= v_lock_d THEN
    RAISE EXCEPTION 'Accounting period closed: cannot post on or before %', v_lock_d
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- 4) Expand voucher_type for supplier payments (manual + system)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'accounting_vouchers'
      AND constraint_name = 'accounting_vouchers_voucher_type_check'
  ) THEN
    ALTER TABLE accounting_vouchers DROP CONSTRAINT accounting_vouchers_voucher_type_check;
  END IF;

  ALTER TABLE accounting_vouchers
    ADD CONSTRAINT accounting_vouchers_voucher_type_check
    CHECK (
      voucher_type IN (
        'journal',
        'system_sale',
        'system_purchase',
        'system_sales_return',
        'system_purchase_return',
        'system_supplier_payment'
      )
    );
END $$;

-- 5) Sale voucher: respect posting lock
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
  v_cash UUID;
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

  IF NOT (r.payment_status IN ('paid', 'completed')) THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM accounting_vouchers v
    WHERE v.tenant_id = v_tenant
      AND v.reference_type = 'sale'
      AND v.reference_id = p_sale_id
      AND v.status = 'posted'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_cash FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '1000' LIMIT 1;
  SELECT id INTO v_sales FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '3000' LIMIT 1;
  SELECT id INTO v_vat FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '2000' LIMIT 1;
  SELECT id INTO v_cogs_a FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '4000' LIMIT 1;
  SELECT id INTO v_inv FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '5000' LIMIT 1;
  IF v_cash IS NULL OR v_sales IS NULL OR v_cogs_a IS NULL OR v_inv IS NULL THEN RETURN; END IF;

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
  VALUES (v_tenant, v_vid, ln, v_cash, 'Cash / payment received', v_total, 0);
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

-- 6) Purchase voucher: credit supplier-specific AP when set; else 2100
CREATE OR REPLACE FUNCTION public.accounting_post_purchase_voucher(p_goods_receipt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gr RECORD;
  v_total NUMERIC(14,2);
  v_vid UUID;
  v_no VARCHAR(64);
  v_inv UUID;
  v_ap UUID;
  v_supplier_id UUID;
  v_po_id UUID;
BEGIN
  SELECT g.* INTO gr FROM goods_receipts g WHERE g.id = p_goods_receipt_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(gr.status, '') <> 'received' THEN RETURN; END IF;

  PERFORM public.accounting_assert_posting_open(gr.tenant_id, gr.receipt_date::date);

  IF EXISTS (
    SELECT 1 FROM accounting_vouchers v
    WHERE v.tenant_id = gr.tenant_id
      AND v.reference_type = 'purchase'
      AND v.reference_id = p_goods_receipt_id
      AND v.status = 'posted'
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(total_cost), 0)::NUMERIC(14,2)
    INTO v_total
    FROM goods_receipt_items
    WHERE goods_receipt_id = p_goods_receipt_id;
  IF v_total <= 0 THEN RETURN; END IF;

  SELECT id INTO v_inv FROM accounting_accounts WHERE tenant_id = gr.tenant_id AND code = '5000' LIMIT 1;
  IF v_inv IS NULL THEN RETURN; END IF;

  v_po_id := gr.purchase_order_id;
  SELECT supplier_id INTO v_supplier_id FROM purchase_orders WHERE id = v_po_id LIMIT 1;
  IF v_supplier_id IS NOT NULL THEN
    SELECT accounting_payable_account_id INTO v_ap FROM suppliers WHERE id = v_supplier_id LIMIT 1;
  END IF;
  IF v_ap IS NULL THEN
    SELECT id INTO v_ap FROM accounting_accounts WHERE tenant_id = gr.tenant_id AND code = '2100' LIMIT 1;
  END IF;
  IF v_ap IS NULL THEN RETURN; END IF;

  v_no := public.accounting_next_voucher_no(gr.tenant_id);
  INSERT INTO accounting_vouchers (
    tenant_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    gr.tenant_id, v_no, gr.receipt_date::date, 'system_purchase', 'system',
    'purchase', p_goods_receipt_id, 'posted',
    'Auto: goods receipt ' || COALESCE(gr.receipt_number, p_goods_receipt_id::text),
    gr.created_by, NOW(), gr.created_by
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (gr.tenant_id, v_vid, 1, v_inv, 'Inventory received', v_total, 0),
    (gr.tenant_id, v_vid, 2, v_ap, 'Trade payable (supplier)', 0, v_total);
END;
$$;

-- 7) Other auto-vouchers: posting lock only (bodies unchanged from 55 except assert)
CREATE OR REPLACE FUNCTION public.accounting_post_sales_refund_voucher(p_refund_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rf RECORD;
  v_total NUMERIC(14,2);
  v_cogs NUMERIC(14,2);
  v_vid UUID;
  v_no VARCHAR(64);
  v_cash UUID;
  v_sales_return UUID;
  v_cogs_a UUID;
  v_inv UUID;
  ln INT := 1;
BEGIN
  SELECT r.* INTO rf FROM sales_refunds r WHERE r.id = p_refund_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(rf.refund_status, '') NOT IN ('approved', 'completed') THEN RETURN; END IF;

  PERFORM public.accounting_assert_posting_open(rf.tenant_id, rf.refund_date::date);

  IF EXISTS (
    SELECT 1 FROM accounting_vouchers v
    WHERE v.tenant_id = rf.tenant_id
      AND v.reference_type = 'sales_refund'
      AND v.reference_id = p_refund_id
      AND v.status = 'posted'
  ) THEN
    RETURN;
  END IF;

  v_total := COALESCE(rf.net_refund_amount, rf.refund_amount, 0)::NUMERIC(14,2);
  IF v_total <= 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(sri.quantity_refunded::NUMERIC * COALESCE(m.cost_price, 0)::NUMERIC), 0)
    INTO v_cogs
    FROM sales_refund_items sri
    JOIN sale_items si ON si.id = sri.sale_item_id
    JOIN medicines m ON m.id = si.medicine_id
    WHERE sri.refund_id = p_refund_id;

  SELECT id INTO v_cash FROM accounting_accounts WHERE tenant_id = rf.tenant_id AND code = '1000' LIMIT 1;
  SELECT id INTO v_sales_return FROM accounting_accounts WHERE tenant_id = rf.tenant_id AND code = '3100' LIMIT 1;
  SELECT id INTO v_cogs_a FROM accounting_accounts WHERE tenant_id = rf.tenant_id AND code = '4000' LIMIT 1;
  SELECT id INTO v_inv FROM accounting_accounts WHERE tenant_id = rf.tenant_id AND code = '5000' LIMIT 1;
  IF v_cash IS NULL OR v_sales_return IS NULL THEN RETURN; END IF;

  v_no := public.accounting_next_voucher_no(rf.tenant_id);
  INSERT INTO accounting_vouchers (
    tenant_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    rf.tenant_id, v_no, rf.refund_date::date, 'system_sales_return', 'system',
    'sales_refund', p_refund_id, 'posted',
    'Auto: sales refund ' || COALESCE(rf.refund_number, p_refund_id::text),
    rf.user_id, NOW(), rf.user_id
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (rf.tenant_id, v_vid, ln, v_sales_return, 'Sales return / allowance', v_total, 0),
    (rf.tenant_id, v_vid, ln + 1, v_cash, 'Cash / payment refunded', 0, v_total);
  ln := ln + 2;

  IF v_cogs > 0 AND v_cogs_a IS NOT NULL AND v_inv IS NOT NULL THEN
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES
      (rf.tenant_id, v_vid, ln, v_inv, 'Inventory restocked from return', v_cogs, 0),
      (rf.tenant_id, v_vid, ln + 1, v_cogs_a, 'Reverse COGS', 0, v_cogs);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.accounting_post_purchase_return_voucher(p_supplier_return_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sr RECORD;
  v_tenant UUID;
  v_total NUMERIC(14,2);
  v_vid UUID;
  v_no VARCHAR(64);
  v_ap UUID;
  v_inv UUID;
BEGIN
  SELECT r.* INTO sr FROM supplier_returns r WHERE r.id = p_supplier_return_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(sr.status, '') NOT IN ('approved', 'completed') THEN RETURN; END IF;

  SELECT s.tenant_id, s.accounting_payable_account_id
  INTO v_tenant, v_ap
  FROM suppliers s
  WHERE s.id = sr.supplier_id
  LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  PERFORM public.accounting_assert_posting_open(v_tenant, sr.return_date::date);

  IF EXISTS (
    SELECT 1 FROM accounting_vouchers v
    WHERE v.tenant_id = v_tenant
      AND v.reference_type = 'purchase_return'
      AND v.reference_id = p_supplier_return_id
      AND v.status = 'posted'
  ) THEN
    RETURN;
  END IF;

  v_total := COALESCE(sr.total_cost, 0)::NUMERIC(14,2);
  IF v_total <= 0 THEN RETURN; END IF;

  IF v_ap IS NULL THEN
    SELECT id INTO v_ap FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '2100' LIMIT 1;
  END IF;
  SELECT id INTO v_inv FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '5000' LIMIT 1;
  IF v_ap IS NULL OR v_inv IS NULL THEN RETURN; END IF;

  v_no := public.accounting_next_voucher_no(v_tenant);
  INSERT INTO accounting_vouchers (
    tenant_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, v_no, sr.return_date::date, 'system_purchase_return', 'system',
    'purchase_return', p_supplier_return_id, 'posted',
    'Auto: purchase return ' || COALESCE(sr.return_number, p_supplier_return_id::text),
    sr.user_id, NOW(), sr.user_id
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (v_tenant, v_vid, 1, v_ap, 'Reduce trade payables (purchase return)', v_total, 0),
    (v_tenant, v_vid, 2, v_inv, 'Reduce inventory (purchase return)', 0, v_total);
END;
$$;

-- 8) Atomic supplier payment: ledger row + posted voucher (Dr AP, Cr cash/bank)
CREATE OR REPLACE FUNCTION public.post_supplier_payment(
  p_tenant_id UUID,
  p_supplier_id UUID,
  p_amount NUMERIC(14,2),
  p_payment_method TEXT,
  p_payment_date DATE,
  p_user_id UUID,
  p_reference_note TEXT
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
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  PERFORM public.accounting_assert_posting_open(p_tenant_id, p_payment_date);

  IF p_payment_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'payment_method must be cash or bank';
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
    tenant_id, supplier_id, reference_number, entry_type, amount, balance_after, entry_date, description
  ) VALUES (
    p_tenant_id,
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
    tenant_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    p_tenant_id, v_no, p_payment_date, 'system_supplier_payment', 'system',
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

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (p_tenant_id, v_vid, 1, v_ap, 'Reduce supplier payable', p_amount, 0),
    (p_tenant_id, v_vid, 2, v_cash_bank, 'Payment ' || p_payment_method, 0, p_amount);

  ledger_entry_id := v_ledger_id;
  voucher_id := v_vid;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.post_supplier_payment IS 'Records supplier payment in supplier_ledger_entries and posts balanced GL voucher (Dr AP, Cr cash/bank).';

GRANT EXECUTE ON FUNCTION public.post_supplier_payment(
  UUID, UUID, NUMERIC, TEXT, DATE, UUID, TEXT
) TO authenticated;
