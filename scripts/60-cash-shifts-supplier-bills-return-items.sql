-- Supplier reconciliation ref, supplier tax invoice on GRN, ledger bill #,
-- supplier_return_items, cash_register_shifts (cashier close), supplier_returns hardening.

-- 1) Suppliers: vendor-side account / statement reference for reconciliation
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS reconciliation_account_ref VARCHAR(150);

COMMENT ON COLUMN suppliers.reconciliation_account_ref IS
  'Your account or reference number on the supplier''s invoices/statements (for statement matching).';

-- 2) Goods receipt: supplier''s tax invoice / bill number for this delivery
ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS supplier_invoice_number VARCHAR(120);

COMMENT ON COLUMN goods_receipts.supplier_invoice_number IS
  'Supplier''s invoice or bill number printed on their document (IRD / AP reconciliation).';

-- 3) Supplier sub-ledger: copy of supplier bill # on the payable line
ALTER TABLE supplier_ledger_entries
  ADD COLUMN IF NOT EXISTS supplier_bill_number VARCHAR(120);

COMMENT ON COLUMN supplier_ledger_entries.supplier_bill_number IS
  'Supplier tax invoice / bill number tied to this AP movement (usually from GRN).';

-- 4) supplier_returns: tenant, nullable header medicine for multi-line returns
ALTER TABLE supplier_returns
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE supplier_returns sr
SET tenant_id = s.tenant_id
FROM suppliers s
WHERE sr.supplier_id = s.id
  AND sr.tenant_id IS NULL;

DELETE FROM supplier_returns WHERE tenant_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supplier_returns WHERE tenant_id IS NULL) THEN
    ALTER TABLE supplier_returns ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE supplier_returns
  ALTER COLUMN medicine_id DROP NOT NULL;

-- Auto return_number when missing
CREATE OR REPLACE FUNCTION public.set_supplier_return_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.return_number IS NULL OR btrim(NEW.return_number) = '' THEN
    NEW.return_number := 'SRT-' || to_char(COALESCE(NEW.return_date, CURRENT_DATE), 'YYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_return_number ON supplier_returns;
CREATE TRIGGER trg_supplier_return_number
  BEFORE INSERT ON supplier_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_supplier_return_number();

-- 5) Line items for supplier returns (replaces mistaken medicine_return_items usage)
CREATE TABLE IF NOT EXISTS supplier_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  return_id UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  return_reason VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_return_items_tenant ON supplier_return_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_return ON supplier_return_items(return_id);

ALTER TABLE supplier_return_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_return_items' AND policyname = 'Supplier return items by tenant'
  ) THEN
    CREATE POLICY "Supplier return items by tenant" ON supplier_return_items
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

-- supplier_returns RLS (table may have been created before tenant RLS)
ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_returns' AND policyname = 'Supplier returns by tenant'
  ) THEN
    CREATE POLICY "Supplier returns by tenant" ON supplier_returns
      FOR ALL
      USING (
        tenant_id IS NOT NULL
        AND tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1)
      )
      WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1)
      );
  END IF;
END $$;

GRANT ALL ON supplier_return_items TO authenticated;
GRANT ALL ON supplier_returns TO authenticated;

-- 6) Cash register shifts (cashier open / close) per branch
CREATE TABLE IF NOT EXISTS cash_register_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opened_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  opening_float_cash NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expected_cash_system NUMERIC(14, 2),
  counted_cash_closing NUMERIC(14, 2),
  cash_variance NUMERIC(14, 2),
  notes_opening TEXT,
  notes_closing TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_shifts_tenant_branch ON cash_register_shifts(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_open ON cash_register_shifts(tenant_id, branch_id) WHERE status = 'open';

COMMENT ON TABLE cash_register_shifts IS
  'Cashier session: opening float, system-expected cash from posted cash sales, physical count, variance.';

ALTER TABLE cash_register_shifts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cash_register_shifts' AND policyname = 'Cash shifts by tenant'
  ) THEN
    CREATE POLICY "Cash shifts by tenant" ON cash_register_shifts
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;
END $$;

GRANT ALL ON cash_register_shifts TO authenticated;

-- Superadmin read-all (pattern from 45): append if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cash_register_shifts')
     AND NOT EXISTS (
 SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'cash_register_shifts' AND policyname = 'Superadmin read all'
     ) THEN
    CREATE POLICY "Superadmin read all" ON cash_register_shifts
      FOR SELECT USING (public.is_superadmin());
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'supplier_return_items')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'supplier_return_items' AND policyname = 'Superadmin read all'
     ) THEN
    CREATE POLICY "Superadmin read all" ON supplier_return_items
      FOR SELECT USING (public.is_superadmin());
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'supplier_returns')
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'supplier_returns' AND policyname = 'Superadmin read all'
     ) THEN
    CREATE POLICY "Superadmin read all" ON supplier_returns
      FOR SELECT USING (public.is_superadmin());
  END IF;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;
