-- Accounting module completion: branch on remaining auto-vouchers, customer credit notes,
-- reversal vouchers, cash shift variance GL, COA grouping column, cash over/short account.

-- 1) COA hierarchy (optional parent for grouped trial balance)
ALTER TABLE accounting_accounts
  ADD COLUMN IF NOT EXISTS parent_account_id UUID REFERENCES accounting_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_accounts_parent
  ON accounting_accounts(tenant_id, parent_account_id);

-- Link per-supplier AP heads to control 2100 where code is 21xx but not 2100
UPDATE accounting_accounts a
SET parent_account_id = p.id
FROM accounting_accounts p
WHERE a.tenant_id = p.tenant_id
  AND p.code = '2100'
  AND a.code ~ '^21[0-9]{2,}$'
  AND a.code <> '2100'
  AND a.parent_account_id IS NULL;

-- 2) Cash over/short expense + map key
INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, '6100', 'Cash over / short', 'expense', true
FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, 'cash_over_short', a.id
FROM tenants t
JOIN accounting_accounts a ON a.tenant_id = t.id AND a.code = '6100'
ON CONFLICT (tenant_id, map_key) DO NOTHING;

-- 3) Cash shift variance voucher link
ALTER TABLE cash_register_shifts
  ADD COLUMN IF NOT EXISTS variance_voucher_id UUID REFERENCES accounting_vouchers(id) ON DELETE SET NULL;

-- 4) Purchase voucher (VAT version from 58) + branch + supplier ledger invoice
CREATE OR REPLACE FUNCTION public.accounting_post_purchase_voucher(p_goods_receipt_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gr RECORD;
  v_net NUMERIC(14,2);
  v_vat NUMERIC(14,2);
  v_gross NUMERIC(14,2);
  v_vid UUID;
  v_no VARCHAR(64);
  v_inv UUID;
  v_input_vat UUID;
  v_ap UUID;
  v_supplier_id UUID;
  v_po_id UUID;
  ln INT := 1;
  v_last_bal NUMERIC(14,2);
  v_new_bal NUMERIC(14,2);
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

  SELECT
    COALESCE(SUM(total_cost), 0)::NUMERIC(14,2),
    COALESCE(SUM(vat_amount), 0)::NUMERIC(14,2)
  INTO v_net, v_vat
  FROM goods_receipt_items
  WHERE goods_receipt_id = p_goods_receipt_id;

  v_gross := v_net + v_vat;
  IF v_gross <= 0 THEN RETURN; END IF;

  v_inv := public.accounting_resolve_account(gr.tenant_id, 'inventory', '5000');
  IF v_inv IS NULL THEN RETURN; END IF;

  IF v_vat > 0 THEN
    v_input_vat := public.accounting_resolve_account(gr.tenant_id, 'input_vat', '1150');
    IF v_input_vat IS NULL THEN RETURN; END IF;
  END IF;

  v_po_id := gr.purchase_order_id;
  SELECT supplier_id INTO v_supplier_id FROM purchase_orders WHERE id = v_po_id LIMIT 1;
  IF v_supplier_id IS NOT NULL THEN
    SELECT accounting_payable_account_id INTO v_ap FROM suppliers WHERE id = v_supplier_id LIMIT 1;
  END IF;
  IF v_ap IS NULL THEN
    v_ap := public.accounting_resolve_account(gr.tenant_id, 'trade_payables', '2100');
  END IF;
  IF v_ap IS NULL THEN RETURN; END IF;

  v_no := public.accounting_next_voucher_no(gr.tenant_id);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    gr.tenant_id, gr.branch_id, v_no, gr.receipt_date::date, 'system_purchase', 'system',
    'purchase', p_goods_receipt_id, 'posted',
    'Auto: goods receipt ' || COALESCE(gr.receipt_number, p_goods_receipt_id::text),
    gr.created_by, NOW(), gr.created_by
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (gr.tenant_id, gr.branch_id, v_vid, ln, v_inv, 'Inventory received (net)', v_net, 0);
  ln := ln + 1;

  IF v_vat > 0 THEN
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (gr.tenant_id, gr.branch_id, v_vid, ln, v_input_vat, 'Input VAT on purchase', v_vat, 0);
    ln := ln + 1;
  END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (gr.tenant_id, gr.branch_id, v_vid, ln, v_ap, 'Trade payable (supplier, gross)', 0, v_gross);

  -- Supplier sub-ledger invoice (if not already inserted by app layer)
  IF v_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM supplier_ledger_entries
    WHERE tenant_id = gr.tenant_id
      AND goods_receipt_id = p_goods_receipt_id
      AND entry_type = 'invoice'
  ) THEN
    SELECT balance_after INTO v_last_bal
    FROM supplier_ledger_entries
    WHERE tenant_id = gr.tenant_id AND supplier_id = v_supplier_id
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 1;
    v_new_bal := COALESCE(v_last_bal, 0) + v_gross;
    INSERT INTO supplier_ledger_entries (
      tenant_id, branch_id, supplier_id, goods_receipt_id, supplier_bill_number,
      entry_type, amount, balance_after, entry_date, description
    ) VALUES (
      gr.tenant_id, gr.branch_id, v_supplier_id, p_goods_receipt_id, gr.supplier_invoice_number,
      'invoice', v_gross, v_new_bal, gr.receipt_date::date,
      'GRN ' || COALESCE(gr.receipt_number, p_goods_receipt_id::text)
    );
  END IF;
END;
$$;

-- 5) Sales refund: branch, credit-sale AR reversal, customer ledger credit note
CREATE OR REPLACE FUNCTION public.accounting_post_sales_refund_voucher(p_refund_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rf RECORD;
  orig RECORD;
  v_total NUMERIC(14,2);
  v_cogs NUMERIC(14,2);
  v_vid UUID;
  v_no VARCHAR(64);
  v_cash UUID;
  v_bank UUID;
  v_ar UUID;
  v_credit UUID;
  v_sales_return UUID;
  v_cogs_a UUID;
  v_inv UUID;
  ln INT := 1;
  v_branch UUID;
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

  SELECT s.* INTO orig FROM sales s WHERE s.id = rf.original_sale_id LIMIT 1;
  v_branch := orig.branch_id;

  SELECT COALESCE(SUM(sri.quantity_refunded::NUMERIC * COALESCE(m.cost_price, 0)::NUMERIC), 0)
  INTO v_cogs
  FROM sales_refund_items sri
  JOIN sale_items si ON si.id = sri.sale_item_id
  JOIN medicines m ON m.id = si.medicine_id
  WHERE sri.refund_id = p_refund_id;

  v_cash := public.accounting_resolve_account(rf.tenant_id, 'cash_on_hand', '1000');
  v_bank := public.accounting_resolve_account(rf.tenant_id, 'bank', '1010');
  v_ar := public.accounting_resolve_account(rf.tenant_id, 'accounts_receivable', '1100');
  v_sales_return := public.accounting_resolve_account(rf.tenant_id, 'sales_returns', '3100');
  IF v_sales_return IS NULL THEN
    SELECT id INTO v_sales_return FROM accounting_accounts WHERE tenant_id = rf.tenant_id AND code = '3100' LIMIT 1;
  END IF;
  v_cogs_a := public.accounting_resolve_account(rf.tenant_id, 'cogs', '4000');
  v_inv := public.accounting_resolve_account(rf.tenant_id, 'inventory', '5000');
  IF v_sales_return IS NULL THEN RETURN; END IF;

  IF orig.payment_method = 'credit' THEN
    v_credit := v_ar;
  ELSIF orig.payment_method = 'bank' THEN
    v_credit := v_bank;
  ELSE
    v_credit := v_cash;
  END IF;
  IF v_credit IS NULL THEN RETURN; END IF;

  v_no := public.accounting_next_voucher_no(rf.tenant_id);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    rf.tenant_id, v_branch, v_no, rf.refund_date::date, 'system_sales_return', 'system',
    'sales_refund', p_refund_id, 'posted',
    'Auto: sales refund ' || COALESCE(rf.refund_number, rf.credit_note_number, p_refund_id::text),
    rf.user_id, NOW(), rf.user_id
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (rf.tenant_id, v_branch, v_vid, ln, v_sales_return, 'Sales return / allowance', v_total, 0);
  ln := ln + 1;
  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (
    rf.tenant_id, v_branch, v_vid, ln, v_credit,
    CASE WHEN orig.payment_method = 'credit' THEN 'Reduce accounts receivable'
         WHEN orig.payment_method = 'bank' THEN 'Bank refund'
         ELSE 'Cash refund' END,
    0, v_total
  );
  ln := ln + 1;

  IF v_cogs > 0 AND v_cogs_a IS NOT NULL AND v_inv IS NOT NULL THEN
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (rf.tenant_id, v_branch, v_vid, ln, v_inv, 'Inventory restocked from return', v_cogs, 0);
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (rf.tenant_id, v_branch, v_vid, ln, v_cogs_a, 'Reverse COGS', 0, v_cogs);
  END IF;

  -- Customer AR sub-ledger credit note
  IF orig.customer_id IS NOT NULL AND orig.payment_method = 'credit' THEN
    INSERT INTO customer_ledger_entries (
      tenant_id, branch_id, customer_id, sale_id, refund_id,
      entry_type, description, amount, entry_date, reference_number, created_by
    ) VALUES (
      rf.tenant_id, v_branch, orig.customer_id, rf.original_sale_id, p_refund_id,
      'credit_note', 'Credit note / refund', -v_total, rf.refund_date::date,
      COALESCE(rf.credit_note_number, rf.refund_number, v_no), rf.user_id
    );
    PERFORM public.customer_ledger_recompute_balance(rf.tenant_id, orig.customer_id);
  END IF;
END;
$$;

-- 6) Purchase return + branch
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
  v_branch UUID;
BEGIN
  SELECT r.* INTO sr FROM supplier_returns r WHERE r.id = p_supplier_return_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(sr.status, '') NOT IN ('approved', 'completed') THEN RETURN; END IF;

  SELECT s.tenant_id INTO v_tenant FROM suppliers s WHERE s.id = sr.supplier_id LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

  v_branch := sr.branch_id;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM branches WHERE tenant_id = v_tenant ORDER BY created_at LIMIT 1;
  END IF;

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

  SELECT accounting_payable_account_id INTO v_ap FROM suppliers WHERE id = sr.supplier_id AND tenant_id = v_tenant LIMIT 1;
  IF v_ap IS NULL THEN
    v_ap := public.accounting_resolve_account(v_tenant, 'trade_payables', '2100');
  END IF;
  v_inv := public.accounting_resolve_account(v_tenant, 'inventory', '5000');
  IF v_ap IS NULL OR v_inv IS NULL THEN RETURN; END IF;

  v_no := public.accounting_next_voucher_no(v_tenant);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, v_branch, v_no, sr.return_date::date, 'system_purchase_return', 'system',
    'purchase_return', p_supplier_return_id, 'posted',
    'Auto: purchase return ' || COALESCE(sr.return_number, p_supplier_return_id::text),
    sr.user_id, NOW(), sr.user_id
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (v_tenant, v_branch, v_vid, 1, v_ap, 'Reduce trade payables (purchase return)', v_total, 0),
    (v_tenant, v_branch, v_vid, 2, v_inv, 'Reduce inventory (purchase return)', 0, v_total);
END;
$$;

-- supplier_returns.branch_id if missing
ALTER TABLE supplier_returns
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

-- 7) Reverse a posted voucher (mirror lines; link reverses_voucher_id)
CREATE OR REPLACE FUNCTION public.accounting_reverse_posted_voucher(
  p_voucher_id UUID,
  p_user_id UUID,
  p_reversal_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orig RECORD;
  v_rev_id UUID;
  v_no VARCHAR(64);
  v_date DATE;
  r RECORD;
  ln INT := 0;
BEGIN
  SELECT * INTO v_orig FROM accounting_vouchers WHERE id = p_voucher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Voucher not found';
  END IF;
  IF v_orig.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted vouchers can be reversed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM accounting_vouchers
    WHERE reverses_voucher_id = p_voucher_id AND status = 'posted'
  ) THEN
    RAISE EXCEPTION 'This voucher was already reversed';
  END IF;

  v_date := COALESCE(p_reversal_date, CURRENT_DATE);
  PERFORM public.accounting_assert_posting_open(v_orig.tenant_id, v_date);

  v_no := public.accounting_next_voucher_no(v_orig.tenant_id);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by,
    reverses_voucher_id
  ) VALUES (
    v_orig.tenant_id, v_orig.branch_id, v_no, v_date, 'journal', 'manual',
    'reversal', p_voucher_id, 'posted',
    'Reversal of ' || v_orig.voucher_no,
    p_user_id, NOW(), p_user_id,
    p_voucher_id
  ) RETURNING id INTO v_rev_id;

  FOR r IN
    SELECT account_id, description, debit_amount, credit_amount
    FROM accounting_voucher_lines
    WHERE voucher_id = p_voucher_id
    ORDER BY line_no
  LOOP
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (
      tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount
    ) VALUES (
      v_orig.tenant_id, v_orig.branch_id, v_rev_id, ln, r.account_id,
      'Reversal: ' || COALESCE(r.description, ''),
      r.credit_amount, r.debit_amount
    );
  END LOOP;

  UPDATE accounting_vouchers SET status = 'void' WHERE id = p_voucher_id;

  RETURN v_rev_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accounting_reverse_posted_voucher(UUID, UUID, DATE) TO authenticated;

-- 8) Cash shift close variance voucher (short: Dr 6100 Cr 1000; over: Dr 1000 Cr 6100)
CREATE OR REPLACE FUNCTION public.accounting_post_cash_shift_variance(
  p_shift_id UUID,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sh RECORD;
  v_var NUMERIC(14,2);
  v_vid UUID;
  v_no VARCHAR(64);
  v_cash UUID;
  v_ovs UUID;
  ln INT := 1;
  v_amt NUMERIC(14,2);
BEGIN
  SELECT * INTO sh FROM cash_register_shifts WHERE id = p_shift_id;
  IF NOT FOUND OR sh.status <> 'closed' THEN RETURN NULL; END IF;
  IF sh.variance_voucher_id IS NOT NULL THEN RETURN sh.variance_voucher_id; END IF;

  v_var := COALESCE(sh.cash_variance, 0)::NUMERIC(14,2);
  IF ABS(v_var) < 0.01 THEN RETURN NULL; END IF;

  PERFORM public.accounting_assert_posting_open(
    sh.tenant_id,
    COALESCE(sh.closed_at::date, CURRENT_DATE)
  );

  v_cash := public.accounting_resolve_account(sh.tenant_id, 'cash_on_hand', '1000');
  v_ovs := public.accounting_resolve_account(sh.tenant_id, 'cash_over_short', '6100');
  IF v_cash IS NULL OR v_ovs IS NULL THEN RETURN NULL; END IF;

  v_amt := ABS(v_var);
  v_no := public.accounting_next_voucher_no(sh.tenant_id);

  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    sh.tenant_id, sh.branch_id, v_no, COALESCE(sh.closed_at::date, CURRENT_DATE), 'journal', 'system',
    'cash_shift_variance', p_shift_id, 'posted',
    'Cash count variance (shift close)',
    p_user_id, NOW(), p_user_id
  ) RETURNING id INTO v_vid;

  IF v_var < 0 THEN
    -- Short: Dr expense, Cr cash
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (sh.tenant_id, sh.branch_id, v_vid, ln, v_ovs, 'Cash shortage', v_amt, 0);
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (sh.tenant_id, sh.branch_id, v_vid, ln, v_cash, 'Cash shortage adjustment', 0, v_amt);
  ELSE
    -- Over: Dr cash, Cr income (expense credit)
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (sh.tenant_id, sh.branch_id, v_vid, ln, v_cash, 'Cash overage', v_amt, 0);
    ln := ln + 1;
    INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (sh.tenant_id, sh.branch_id, v_vid, ln, v_ovs, 'Cash overage', 0, v_amt);
  END IF;

  UPDATE cash_register_shifts SET variance_voucher_id = v_vid WHERE id = p_shift_id;
  RETURN v_vid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accounting_post_cash_shift_variance(UUID, UUID) TO authenticated;

-- Map key for sales_returns if missing
INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, 'sales_returns', a.id
FROM tenants t
JOIN accounting_accounts a ON a.tenant_id = t.id AND a.code = '3100'
ON CONFLICT (tenant_id, map_key) DO NOTHING;
