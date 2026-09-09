-- Bank statement import & reconciliation (2026-09 ERP audit, priority item #2).
--
-- The app already had *internal* GL reconciliation reports (AR/AP/inventory
-- control vs sub-ledger) but nothing that checks the GL bank account against
-- what the bank itself says happened. Without that, a missed deposit, a bank
-- charge nobody recorded, or a bounced customer cheque never surfaces — the
-- books look internally consistent while being wrong about real cash.
--
-- Modelled against a GL account rather than a separate bank_accounts table: a
-- pharmacy with several bank accounts creates one asset account per bank in its
-- chart of accounts (1010, 1011, …) and reconciles each independently. That
-- avoids a second source of truth for "which banks exist".

CREATE TABLE IF NOT EXISTS public.bank_statement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES public.accounting_accounts(id) ON DELETE RESTRICT,
  statement_label VARCHAR(200),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Balances as printed on the bank's own statement. Closing balance is what the
  -- reconciliation report compares the GL account balance against.
  opening_balance NUMERIC(14,2),
  closing_balance NUMERIC(14,2),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reconciled')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reconciled_at TIMESTAMPTZ,
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_imports_tenant_account
  ON public.bank_statement_imports (tenant_id, account_id, period_end DESC);

CREATE TABLE IF NOT EXISTS public.bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES public.bank_statement_imports(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  txn_date DATE NOT NULL,
  description TEXT,
  reference VARCHAR(200),
  -- Direction mirrors the GL: money into the bank account is a debit.
  debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
  matched_voucher_line_id UUID REFERENCES public.accounting_voucher_lines(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ,
  matched_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note TEXT,
  CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (credit_amount > 0 AND debit_amount = 0)
  ),
  -- Deliberately no CHECK tying status='matched' to a non-null
  -- matched_voucher_line_id: the FK is ON DELETE SET NULL, and such a CHECK
  -- would make that SET NULL fail, blocking deletion of the voucher line
  -- instead of just orphaning the match. A match whose GL line has gone away
  -- is treated as unmatched by the reconciliation view (see
  -- bank-reconciliation-service.ts) rather than being forbidden outright.
  UNIQUE (import_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_import ON public.bank_statement_lines (import_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_tenant_status ON public.bank_statement_lines (tenant_id, status);

-- One GL line can back at most one statement line: without this, the same
-- deposit could be used to "explain away" two different bank credits and the
-- reconciliation would balance while hiding a real discrepancy.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bank_statement_lines_voucher_line
  ON public.bank_statement_lines (matched_voucher_line_id)
  WHERE matched_voucher_line_id IS NOT NULL;

ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_statement_imports' AND policyname = 'Bank statement imports by tenant'
  ) THEN
    CREATE POLICY "Bank statement imports by tenant" ON public.bank_statement_imports
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_statement_lines' AND policyname = 'Bank statement lines by tenant'
  ) THEN
    CREATE POLICY "Bank statement lines by tenant" ON public.bank_statement_lines
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_statement_imports' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON public.bank_statement_imports FOR SELECT USING (public.is_superadmin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bank_statement_lines' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON public.bank_statement_lines FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;
