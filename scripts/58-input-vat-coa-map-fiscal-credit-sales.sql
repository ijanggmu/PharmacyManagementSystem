-- Input VAT on GRN, tenant COA mapping, fiscal periods, sale voucher cash/bank/AR, credit payment method.

-- 1) GRN line VAT (tax point: GRN; amounts exclude VAT in total_cost, VAT in vat_amount)
ALTER TABLE goods_receipt_items
  ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(14,2) NOT NULL DEFAULT 0
  CHECK (vat_amount >= 0);

-- 2) Input VAT recoverable (asset) — Nepal-style net; adjust mapping if your policy differs
INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, v.code, v.name, v.account_type, true
FROM tenants t
CROSS JOIN (
  VALUES
    ('1150', 'Input VAT recoverable', 'asset')
) AS v(code, name, account_type)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 3) COA mapping (per-tenant keys → account_id; falls back to code in resolve function)
CREATE TABLE IF NOT EXISTS public.accounting_account_map (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  map_key VARCHAR(64) NOT NULL,
  account_id UUID NOT NULL REFERENCES accounting_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, map_key)
);

CREATE INDEX IF NOT EXISTS idx_accounting_account_map_tenant ON public.accounting_account_map(tenant_id);

INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, m.map_key, a.id
FROM tenants t
CROSS JOIN (
  VALUES
    ('inventory'),
    ('input_vat'),
    ('trade_payables'),
    ('cash_on_hand'),
    ('bank'),
    ('accounts_receivable')
) AS m(map_key)
JOIN accounting_accounts a
  ON a.tenant_id = t.id
 AND a.code = CASE m.map_key
 WHEN 'inventory' THEN '5000'
   WHEN 'input_vat' THEN '1150'
   WHEN 'trade_payables' THEN '2100'
   WHEN 'cash_on_hand' THEN '1000'
   WHEN 'bank' THEN '1010'
   WHEN 'accounts_receivable' THEN '1100'
 END
ON CONFLICT (tenant_id, map_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.accounting_resolve_account(
  p_tenant_id UUID,
  p_map_key TEXT,
  p_fallback_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT m.account_id INTO v_id
  FROM accounting_account_map m
  WHERE m.tenant_id = p_tenant_id AND m.map_key = p_map_key
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT a.id INTO v_id
  FROM accounting_accounts a
  WHERE a.tenant_id = p_tenant_id AND a.code = p_fallback_code
  LIMIT 1;

  RETURN v_id;
END;
$$;

-- 4) Fiscal periods (optional rows; closed period blocks posting for dates inside range)
CREATE TABLE IF NOT EXISTS public.accounting_fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  label TEXT,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (tenant_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_periods_tenant ON public.accounting_fiscal_periods(tenant_id);

-- 5) Reversal link (future reversing entries reference original voucher)
ALTER TABLE accounting_vouchers
  ADD COLUMN IF NOT EXISTS reverses_voucher_id UUID REFERENCES accounting_vouchers(id) ON DELETE SET NULL;

-- 6) Posting assert: closed fiscal period
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

  IF v_lock IS NOT NULL AND btrim(v_lock) <> '' THEN
    BEGIN
      v_lock_d := v_lock::DATE;
    EXCEPTION WHEN OTHERS THEN
      v_lock_d := NULL;
    END;

    IF v_lock_d IS NOT NULL AND p_voucher_date <= v_lock_d THEN
      RAISE EXCEPTION 'Accounting period closed: cannot post on or before %', v_lock_d
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM accounting_fiscal_periods fp
    WHERE fp.tenant_id = p_tenant_id
      AND fp.is_closed = true
      AND p_voucher_date >= fp.period_start
      AND p_voucher_date <= fp.period_end
  ) THEN
    RAISE EXCEPTION 'Fiscal period is closed for date %', p_voucher_date
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- 7) Sales: allow on-account / credit payment method
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.sales'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_method%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE sales DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE sales
    ADD CONSTRAINT sales_payment_method_check
    CHECK (
      payment_method IN (
        'cash',
        'card',
        'insurance',
        'fonepay',
        'esewa',
        'khalti',
        'bank',
        'mixed',
        'other',
        'credit'
      )
    );
END $$;

-- 8) Purchase voucher: Dr Inventory (net), Dr Input VAT (if any), Cr AP (gross)
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
  VALUES (gr.tenant_id, v_vid, ln, v_inv, 'Inventory received (net)', v_net, 0);
  ln := ln + 1;

  IF v_vat > 0 THEN
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES (gr.tenant_id, v_vid, ln, v_input_vat, 'Input VAT on purchase', v_vat, 0);
    ln := ln + 1;
  END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (gr.tenant_id, v_vid, ln, v_ap, 'Trade payable (supplier, gross)', 0, v_gross);
END;
$$;

-- 8b) Extra COA map keys for sale voucher (must exist before sale function body runs in same migration)
INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, m.map_key, a.id
FROM tenants t
CROSS JOIN (
  VALUES
    ('sales_revenue'),
    ('output_vat'),
    ('cogs')
) AS m(map_key)
JOIN accounting_accounts a
  ON a.tenant_id = t.id
 AND a.code = CASE m.map_key
   WHEN 'sales_revenue' THEN '3000'
   WHEN 'output_vat' THEN '2000'
   WHEN 'cogs' THEN '4000'
 END
ON CONFLICT (tenant_id, map_key) DO NOTHING;

-- 9) Sale voucher: Dr Cash / Bank / AR by payment_method
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

-- 10) RLS
ALTER TABLE public.accounting_account_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_fiscal_periods ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_account_map' AND policyname = 'Accounting account map by tenant'
  ) THEN
    CREATE POLICY "Accounting account map by tenant" ON public.accounting_account_map
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_fiscal_periods' AND policyname = 'Fiscal periods by tenant'
  ) THEN
    CREATE POLICY "Fiscal periods by tenant" ON public.accounting_fiscal_periods
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

-- 11) Superadmin read on new tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounting_account_map')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accounting_account_map' AND policyname = 'Superadmin read all') THEN
    CREATE POLICY "Superadmin read all" ON public.accounting_account_map FOR SELECT USING (public.is_superadmin());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounting_fiscal_periods')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accounting_fiscal_periods' AND policyname = 'Superadmin read all') THEN
    CREATE POLICY "Superadmin read all" ON public.accounting_fiscal_periods FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;
