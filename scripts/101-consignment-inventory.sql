-- Consignment inventory (2026-09 ERP audit, priority item #8): stock a supplier
-- places on the shelf that the pharmacy does not own, and does not pay for,
-- until it actually sells. Common for slow-moving/high-value imported items
-- with Nepal distributors who want to reduce the pharmacy's upfront cash risk.
--
-- Deliberately kept OUT of the purchase-order/GRN pipeline (scripts 34/61/65/87,
-- already patched many times and central to every purchase accounting flow):
-- receiving consignment stock does not transfer ownership, so it must not touch
-- accounting_vouchers or supplier_ledger_entries at receipt time the way an
-- ordinary GRN does. It only needs to make the stock physically sellable
-- (medicine_branch_stock + medicine_batches, same as any other batch, so FEFO
-- and the POS treat it identically) — no GL entry, no AP.
--
-- The automatic per-sale voucher (accounting_post_sale_voucher) can't be made
-- consignment-aware without knowing which batch a sale item was drawn from —
-- and FEFO deduction (deduct_fefo_batches, script 85) is documented as *not*
-- recording that (script 93's "known limitation"). So instead of intercepting
-- the sale, "settlement" reconciles after the fact: it reads how much of each
-- consignment batch's quantity_remaining has dropped since it was last settled
-- (which deduct_fefo_batches already decrements correctly, consignment or not)
-- and posts one correcting voucher — Dr Inventory / Cr the supplier's AP
-- account — for the value sold. That undoes the phantom "Cr Inventory" the
-- auto sale voucher already posted against stock the pharmacy never owned, and
-- records the real payable. Net GL effect across a sale + its later settlement:
-- Dr COGS / Cr Supplier AP — which is exactly what happened in the business.

ALTER TABLE public.medicine_batches
  ADD COLUMN IF NOT EXISTS is_consignment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consignment_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS consignment_unit_cost NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS consignment_settled_quantity INTEGER NOT NULL DEFAULT 0 CHECK (consignment_settled_quantity >= 0);

ALTER TABLE public.medicine_batches
  ADD CONSTRAINT medicine_batches_consignment_fields_check CHECK (
    (is_consignment = false AND consignment_supplier_id IS NULL AND consignment_unit_cost IS NULL)
    OR (is_consignment = true AND consignment_supplier_id IS NOT NULL AND consignment_unit_cost IS NOT NULL AND consignment_unit_cost >= 0)
  );

ALTER TABLE public.medicine_batches
  ADD CONSTRAINT medicine_batches_consignment_settled_check CHECK (consignment_settled_quantity <= quantity_received);

CREATE INDEX IF NOT EXISTS idx_medicine_batches_consignment_outstanding
  ON public.medicine_batches (tenant_id, consignment_supplier_id)
  WHERE is_consignment = true;

-- One settlement run can cover many batches/suppliers — grouped as a single
-- audit record with per-batch detail lines, mirroring how a purchase groups
-- goods_receipt_items under one goods_receipt.
CREATE TABLE IF NOT EXISTS public.consignment_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
  total_value NUMERIC(14,2) NOT NULL CHECK (total_value >= 0),
  voucher_id UUID REFERENCES public.accounting_vouchers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consignment_settlements_tenant_supplier
  ON public.consignment_settlements (tenant_id, supplier_id, settlement_date DESC);

CREATE TABLE IF NOT EXISTS public.consignment_settlement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.consignment_settlements(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.medicine_batches(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(10,2) NOT NULL CHECK (unit_cost >= 0),
  value NUMERIC(14,2) NOT NULL CHECK (value >= 0)
);

CREATE INDEX IF NOT EXISTS idx_consignment_settlement_lines_settlement ON public.consignment_settlement_lines (settlement_id);
CREATE INDEX IF NOT EXISTS idx_consignment_settlement_lines_batch ON public.consignment_settlement_lines (batch_id);

ALTER TABLE public.consignment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignment_settlement_lines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consignment_settlements' AND policyname = 'Consignment settlements by tenant'
  ) THEN
    CREATE POLICY "Consignment settlements by tenant" ON public.consignment_settlements
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consignment_settlement_lines' AND policyname = 'Consignment settlement lines by tenant'
  ) THEN
    CREATE POLICY "Consignment settlement lines by tenant" ON public.consignment_settlement_lines
      FOR ALL
      USING (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1))
      WITH CHECK (tenant_id = (SELECT tenant_id FROM current_tenant_context LIMIT 1));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consignment_settlements' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON public.consignment_settlements FOR SELECT USING (public.is_superadmin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consignment_settlement_lines' AND policyname = 'Superadmin read all'
  ) THEN
    CREATE POLICY "Superadmin read all" ON public.consignment_settlement_lines FOR SELECT USING (public.is_superadmin());
  END IF;
END $$;

-- Add 'system_consignment_settlement' to the voucher_type allowlist.
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
        'system_opening_balance',
        'system_consignment_settlement'
      )
    );
END $$;
