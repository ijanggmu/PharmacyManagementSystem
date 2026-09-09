-- Opening-balance / migration wizard (spec sections 45-53 of the 2026-09 ERP
-- audit, item #1 of the follow-up priority list): lets a pharmacy that already
-- has real stock/cash/bank/AR/AP but unreliable historical transactions go
-- live without re-entering years of sales. One migration_sessions row per
-- tenant tracks the cutover date and completion state. Opening figures post
-- as ordinary GL vouchers against a dedicated Opening Balance Equity account
-- (3900) so the books stay double-entry-balanced (rule.md 9.1) instead of
-- being seeded with a raw UPDATE — see lib/server/services/migration-service.ts.

CREATE TABLE IF NOT EXISTS public.migration_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  cutover_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.migration_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'migration_sessions' AND policyname = 'Migration sessions by tenant'
  ) THEN
    CREATE POLICY "Migration sessions by tenant" ON public.migration_sessions
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'migration_sessions' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON public.migration_sessions FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;

-- Backfill the Opening Balance Equity account + map key for every tenant that
-- already exists (mirrors scripts/81-backfill-chart-of-accounts.sql). New
-- tenants get it going forward via seedDefaultChartOfAccounts (tenant-service.ts).
INSERT INTO public.accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, '3900', 'Opening balance equity', 'equity', true
FROM public.tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, 'opening_balance_equity', a.id
FROM public.tenants t
JOIN public.accounting_accounts a ON a.tenant_id = t.id AND a.code = '3900'
ON CONFLICT (tenant_id, map_key) DO NOTHING;

-- Widen voucher_type for the new 'system_opening_balance' vouchers this module
-- posts. While here, also add 'system_adjustment' and 'system_expense': both
-- are already used as voucher_type values by postInventoryAdjustmentVoucher and
-- postExpenseVoucher (accounting-service.ts) but were never added to this CHECK
-- constraint after 53/56 last widened it — those inserts have been silently
-- failing the constraint and swallowing the error (both callers treat voucher
-- posting as non-fatal), so stock adjustments and expenses have not actually
-- been reaching the GL. Fixed here as a byproduct of touching this constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'accounting_vouchers'
      AND constraint_name = 'accounting_vouchers_voucher_type_check'
  ) THEN
    ALTER TABLE public.accounting_vouchers DROP CONSTRAINT accounting_vouchers_voucher_type_check;
  END IF;

  ALTER TABLE public.accounting_vouchers
    ADD CONSTRAINT accounting_vouchers_voucher_type_check
    CHECK (
      voucher_type IN (
        'journal',
        'system_sale',
        'system_purchase',
        'system_sales_return',
        'system_purchase_return',
        'system_supplier_payment',
        'system_adjustment',
        'system_expense',
        'system_opening_balance'
      )
    );
END $$;
