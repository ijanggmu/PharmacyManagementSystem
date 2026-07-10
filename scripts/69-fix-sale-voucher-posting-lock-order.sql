-- Fix: accounting_post_sale_voucher checked the posting-lock (accounting_assert_posting_open)
-- before checking whether the sale even qualifies for a voucher. This trigger fires on every
-- sales INSERT/UPDATE, so locking a past accounting period caused ALL sales inserts dated in
-- that period to fail outright — including pending/unpaid sales that would never generate a
-- voucher anyway — not just block the GL entry. The purchase/refund/return equivalents check
-- their own status gate first; this brings the sale function in line with that pattern.

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

  -- Qualification and idempotency gates run BEFORE the posting-lock check, so a
  -- locked period only blocks sales that would actually generate a voucher.
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

  PERFORM public.accounting_assert_posting_open(v_tenant, v_sale_date);

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
