-- Phase 2/3 items from the 2026-08 business-logic domain audit:
--   item 15 (fiscal year default), item 14 (PAN/VAT number storage),
--   item 10 (expired-stock disposal), item 12 (expenses / net profit).

-- --- item 15: fiscal year default was April (India-style), not Nepal's mid-July ---
ALTER TABLE public.tenants ALTER COLUMN fiscal_year_start_month SET DEFAULT 7;
COMMENT ON COLUMN public.tenants.fiscal_year_start_month IS
  '1-12; Nepal fiscal year starts Shrawan 1 BS, which lands in Gregorian July (7).';

-- --- item 14: PAN/VAT registration number, needed on IRD-compliant invoices ------
-- Storage only — flagged in the audit as "needs verification with current Nepal
-- regulations," not asserting this satisfies IRD requirements on its own.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS pan_vat_number VARCHAR(20);
COMMENT ON COLUMN public.tenants.pan_vat_number IS
  'Pharmacy''s PAN/VAT registration number (Nepal IRD) — printed on invoices when set.';

-- --- item 10: expired-stock quarantine/disposal --------------------------------
-- Expired batches were excluded from sale (deduct_fefo_batches) but never routed
-- anywhere — they just sit as invisible dead inventory forever with no write-off.
ALTER TABLE public.medicine_batches
  ADD COLUMN IF NOT EXISTS disposed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposed_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS disposal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_medicine_batches_expired_undisposed
  ON public.medicine_batches (tenant_id, branch_id, expiry_date)
  WHERE quantity_remaining > 0 AND disposed_at IS NULL;

-- --- item 12: operating expenses, separate from COGS/purchases ------------------
-- Without this, "profit" can only ever mean gross profit (revenue - COGS); there
-- was no way to track rent/salaries/utilities/etc. for a true net-profit figure.
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'rent', 'utilities', 'salaries', 'maintenance', 'marketing',
    'transport', 'supplies', 'insurance', 'taxes_fees', 'other'
  )),
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL,
  payment_method VARCHAR(20) CHECK (payment_method IN ('cash', 'bank', 'card', 'other')),
  receipt_reference VARCHAR(120),
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON public.expenses (tenant_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON public.expenses (tenant_id, branch_id);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'Expenses by tenant'
  ) THEN
    CREATE POLICY "Expenses by tenant" ON public.expenses
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON public.expenses
      FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;

-- Auto-seed an 'operating_expenses' account (6000) so expenses can post a GL
-- entry the same way inventory shrinkage does (postInventoryAdjustmentVoucher,
-- lib/server/services/accounting-service.ts), instead of living only as a
-- standalone row with no ledger effect.
INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, '6000', 'Operating expenses', 'expense', true
FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, 'operating_expenses', a.id
FROM tenants t
JOIN accounting_accounts a ON a.tenant_id = t.id AND a.code = '6000'
ON CONFLICT (tenant_id, map_key) DO NOTHING;
