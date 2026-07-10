-- Extend accounting automation:
-- - sales (insert + payment status transition)
-- - purchases (goods receipts)
-- - sales returns (sales_refunds)
-- - purchase returns (supplier_returns)
-- Also seeds missing account heads and broadens voucher_type constraint.

-- 1) Seed additional system account heads (idempotent)
INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, v.code, v.name, v.account_type, true
FROM tenants t
CROSS JOIN (
  VALUES
    ('3100', 'Sales returns and allowances', 'revenue'),
    ('1010', 'Bank', 'asset')
) AS v(code, name, account_type)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 2) Expand voucher_type allowed values (keep existing rows)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
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
        'system_purchase_return'
      )
    );
END $$;

-- 3) Idempotency index for posted system references (all ref types)
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_voucher_reference_posted
  ON accounting_vouchers (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL;

-- 4) Auto post sale voucher: also works when payment status changes later
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
BEGIN
  SELECT s.* INTO r FROM sales s WHERE s.id = p_sale_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_tenant := r.tenant_id;
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
    v_tenant, v_no, (r.sale_date::timestamptz AT TIME ZONE 'UTC')::date, 'system_sale', 'system',
    'sale', p_sale_id, 'posted',
    'Auto: sale ' || COALESCE(r.sale_number, p_sale_id::text),
    v_uid, NOW(), v_uid
  )
  ON CONFLICT ON CONSTRAINT ux_accounting_voucher_reference_posted DO NOTHING
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

CREATE OR REPLACE FUNCTION public.trg_sales_accounting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.accounting_post_sale_voucher(NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.payment_status, '') <> COALESCE(NEW.payment_status, '')
       AND NEW.payment_status IN ('paid', 'completed') THEN
      PERFORM public.accounting_post_sale_voucher(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_post_accounting ON sales;
CREATE TRIGGER sales_post_accounting
AFTER INSERT OR UPDATE OF payment_status ON sales
FOR EACH ROW
EXECUTE PROCEDURE public.trg_sales_accounting();

-- 5) Purchase voucher from received goods receipt
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
BEGIN
  SELECT g.* INTO gr FROM goods_receipts g WHERE g.id = p_goods_receipt_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(gr.status, '') <> 'received' THEN RETURN; END IF;

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
  SELECT id INTO v_ap FROM accounting_accounts WHERE tenant_id = gr.tenant_id AND code = '2100' LIMIT 1;
  IF v_inv IS NULL OR v_ap IS NULL THEN RETURN; END IF;

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
  ON CONFLICT ON CONSTRAINT ux_accounting_voucher_reference_posted DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (gr.tenant_id, v_vid, 1, v_inv, 'Inventory received', v_total, 0),
    (gr.tenant_id, v_vid, 2, v_ap, 'Trade payable recognized', 0, v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_goods_receipts_accounting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.accounting_post_purchase_voucher(NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status, '') <> COALESCE(NEW.status, '') AND NEW.status = 'received' THEN
      PERFORM public.accounting_post_purchase_voucher(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goods_receipts_post_accounting ON goods_receipts;
CREATE TRIGGER goods_receipts_post_accounting
AFTER INSERT OR UPDATE OF status ON goods_receipts
FOR EACH ROW
EXECUTE PROCEDURE public.trg_goods_receipts_accounting();

-- 6) Sales refund voucher (customer return)
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
  ON CONFLICT ON CONSTRAINT ux_accounting_voucher_reference_posted DO NOTHING
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

CREATE OR REPLACE FUNCTION public.trg_sales_refunds_accounting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.accounting_post_sales_refund_voucher(NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.refund_status, '') <> COALESCE(NEW.refund_status, '')
       AND NEW.refund_status IN ('approved', 'completed') THEN
      PERFORM public.accounting_post_sales_refund_voucher(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_refunds_post_accounting ON sales_refunds;
CREATE TRIGGER sales_refunds_post_accounting
AFTER INSERT OR UPDATE OF refund_status ON sales_refunds
FOR EACH ROW
EXECUTE PROCEDURE public.trg_sales_refunds_accounting();

-- 7) Purchase return voucher (returns to supplier)
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

  SELECT s.tenant_id INTO v_tenant
  FROM suppliers s
  WHERE s.id = sr.supplier_id
  LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;

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

  SELECT id INTO v_ap FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '2100' LIMIT 1;
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
  ON CONFLICT ON CONSTRAINT ux_accounting_voucher_reference_posted DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (v_tenant, v_vid, 1, v_ap, 'Reduce trade payables (purchase return)', v_total, 0),
    (v_tenant, v_vid, 2, v_inv, 'Reduce inventory (purchase return)', 0, v_total);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_supplier_returns_accounting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.accounting_post_purchase_return_voucher(NEW.id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status, '') <> COALESCE(NEW.status, '')
       AND NEW.status IN ('approved', 'completed') THEN
      PERFORM public.accounting_post_purchase_return_voucher(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supplier_returns_post_accounting ON supplier_returns;
CREATE TRIGGER supplier_returns_post_accounting
AFTER INSERT OR UPDATE OF status ON supplier_returns
FOR EACH ROW
EXECUTE PROCEDURE public.trg_supplier_returns_accounting();

COMMENT ON FUNCTION public.accounting_post_purchase_voucher IS 'Auto posted purchase voucher: Dr Inventory, Cr Trade payables.';
COMMENT ON FUNCTION public.accounting_post_sales_refund_voucher IS 'Auto posted sales return voucher: Dr Sales returns, Cr Cash (+ inventory/COGS reversal when available).';
COMMENT ON FUNCTION public.accounting_post_purchase_return_voucher IS 'Auto posted purchase return voucher: Dr Trade payables, Cr Inventory.';

