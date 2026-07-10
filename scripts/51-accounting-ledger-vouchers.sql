-- General ledger: chart of accounts, journal vouchers, lines, and auto-post from sales.
-- Follows tenant RLS pattern (current_tenant_context). Server trigger uses SECURITY DEFINER.

-- 1) Chart of accounts (per tenant)
CREATE TABLE IF NOT EXISTS accounting_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name TEXT NOT NULL,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounting_accounts_tenant ON accounting_accounts(tenant_id);

-- 2) Voucher number sequence per tenant
CREATE TABLE IF NOT EXISTS accounting_voucher_sequences (
  tenant_id UUID NOT NULL PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  last_number BIGINT NOT NULL DEFAULT 0
);

-- 3) Voucher header
CREATE TABLE IF NOT EXISTS accounting_vouchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  voucher_no VARCHAR(64) NOT NULL,
  voucher_date DATE NOT NULL DEFAULT CURRENT_DATE,
  voucher_type VARCHAR(40) NOT NULL CHECK (voucher_type IN ('journal', 'system_sale')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('manual', 'system')),
  reference_type VARCHAR(40),
  reference_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
  narration TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, voucher_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_voucher_sale_posted
  ON accounting_vouchers (tenant_id, reference_id)
  WHERE reference_type = 'sale' AND status = 'posted' AND reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_tenant_date ON accounting_vouchers(tenant_id, voucher_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_vouchers_tenant_status ON accounting_vouchers(tenant_id, status);

-- 4) Voucher lines (double-entry lines: exactly one of debit/credit positive per line)
CREATE TABLE IF NOT EXISTS accounting_voucher_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES accounting_vouchers(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  account_id UUID NOT NULL REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
  description TEXT,
  debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (credit_amount > 0 AND debit_amount = 0)
  ),
  UNIQUE (voucher_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_accounting_voucher_lines_voucher ON accounting_voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_accounting_voucher_lines_account ON accounting_voucher_lines(tenant_id, account_id);

-- 5) Seed default COA for every tenant (idempotent)
INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, v.code, v.name, v.account_type, true
FROM tenants t
CROSS JOIN (
  VALUES
    ('1000', 'Cash on hand', 'asset'),
    ('1100', 'Accounts receivable', 'asset'),
    ('2000', 'Output VAT / sales tax payable', 'liability'),
    ('2100', 'Trade payables', 'liability'),
    ('3000', 'Sales revenue', 'revenue'),
    ('4000', 'Cost of goods sold', 'expense'),
    ('5000', 'Merchandise inventory', 'asset')
) AS v(code, name, account_type)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- 6) RLS
ALTER TABLE accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_voucher_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_voucher_lines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_accounts' AND policyname = 'Accounting accounts by tenant'
  ) THEN
    CREATE POLICY "Accounting accounts by tenant" ON accounting_accounts
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_voucher_sequences' AND policyname = 'Accounting sequences by tenant'
  ) THEN
    CREATE POLICY "Accounting sequences by tenant" ON accounting_voucher_sequences
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_vouchers' AND policyname = 'Accounting vouchers by tenant'
  ) THEN
    CREATE POLICY "Accounting vouchers by tenant" ON accounting_vouchers
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_voucher_lines' AND policyname = 'Accounting voucher lines by tenant'
  ) THEN
    CREATE POLICY "Accounting voucher lines by tenant" ON accounting_voucher_lines
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

-- 7) Superadmin read-all (same pattern as 45-rls-allow-superadmin.sql)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounting_accounts')
     AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_accounts' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON accounting_accounts FOR SELECT USING (public.is_superadmin());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounting_voucher_sequences')
     AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_voucher_sequences' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON accounting_voucher_sequences FOR SELECT USING (public.is_superadmin());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounting_vouchers')
     AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_vouchers' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON accounting_vouchers FOR SELECT USING (public.is_superadmin());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounting_voucher_lines')
     AND NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'accounting_voucher_lines' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON accounting_voucher_lines FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;

-- 8) Allocate next voucher number (called from SECURITY DEFINER context)
CREATE OR REPLACE FUNCTION public.accounting_next_voucher_no(p_tenant_id UUID)
RETURNS VARCHAR(64)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n BIGINT;
  y TEXT;
BEGIN
  y := to_char(CURRENT_DATE, 'YYYY');
  INSERT INTO accounting_voucher_sequences (tenant_id, last_number)
  VALUES (p_tenant_id, 0)
  ON CONFLICT (tenant_id) DO NOTHING;

  UPDATE accounting_voucher_sequences
  SET last_number = last_number + 1
  WHERE tenant_id = p_tenant_id
  RETURNING last_number INTO n;

  RETURN 'JV-' || y || '-' || lpad(n::text, 6, '0');
END;
$$;

-- 9) Post balanced system voucher for a sale (idempotent)
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
  SELECT s.* INTO r
  FROM sales s
  WHERE s.id = p_sale_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_tenant := r.tenant_id;

  IF NOT (r.payment_status IN ('paid', 'completed')) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM accounting_vouchers v
    WHERE v.tenant_id = v_tenant AND v.reference_type = 'sale' AND v.reference_id = p_sale_id AND v.status = 'posted'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_cash FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '1000' LIMIT 1;
  SELECT id INTO v_sales FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '3000' LIMIT 1;
  SELECT id INTO v_vat FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '2000' LIMIT 1;
  SELECT id INTO v_cogs_a FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '4000' LIMIT 1;
  SELECT id INTO v_inv FROM accounting_accounts WHERE tenant_id = v_tenant AND code = '5000' LIMIT 1;

  IF v_cash IS NULL OR v_sales IS NULL OR v_cogs_a IS NULL OR v_inv IS NULL THEN
    RETURN;
  END IF;

  v_total := COALESCE(r.total_amount, 0)::NUMERIC(14,2);
  v_tax := COALESCE(r.tax_amount, 0)::NUMERIC(14,2);
  v_net := v_total - v_tax;
  IF v_net < 0 THEN
    v_net := 0;
  END IF;

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
  RETURNING id INTO v_vid;

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
  PERFORM public.accounting_post_sale_voucher(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_post_accounting ON sales;
CREATE TRIGGER sales_post_accounting
AFTER INSERT ON sales
FOR EACH ROW
EXECUTE PROCEDURE public.trg_sales_accounting();

COMMENT ON FUNCTION public.accounting_post_sale_voucher IS 'Idempotent posted voucher for completed/paid sales: Dr Cash, Cr Sales (+ Cr VAT), Dr COGS / Cr Inventory.';

GRANT EXECUTE ON FUNCTION public.accounting_next_voucher_no(UUID) TO authenticated;
-- accounting_post_sale_voucher: no GRANT to authenticated (trigger-only; avoids manual RPC abuse)

-- Opening balance for GL (posted vouchers before period)
CREATE OR REPLACE FUNCTION public.accounting_opening_balance(
  p_tenant_id UUID,
  p_account_id UUID,
  p_from_date DATE
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
    AND v.voucher_date < p_from_date;
$$;

GRANT EXECUTE ON FUNCTION public.accounting_opening_balance(UUID, UUID, DATE) TO authenticated;
