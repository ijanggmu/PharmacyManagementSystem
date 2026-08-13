-- Purchases, Suppliers & Accounting controls, addressing the audit's Module 03
-- findings (13 Aug 2026):
--   1. purchase_orders.approved_by existed as a column but was referenced nowhere —
--      any purchase-write user could create AND receive a PO end to end, no
--      segregation of duties. Adds a real approve_purchase_order() gate and makes
--      receive_purchase_goods refuse to run against a non-approved PO.
--   2. Supplier payments never checked against the outstanding payable balance —
--      post_supplier_payment now blocks an overpayment unless explicitly flagged
--      as an advance (p_allow_overpayment), mirroring the acknowledge-override
--      pattern used for the drug-interaction safety warning.
--   3. Bank deposits weren't linked back to the cash shift that generated the cash
--      — adds an optional cash_shift_id so a deposit can be traced to "this shift's
--      counted cash became this deposit."
--   4. No inter-branch stock transfer — the old stock_transfers table was dropped
--      as unused with no replacement. Adds a fresh, minimal, atomic version.

-- --- 1) Purchase order approval gate --------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.approve_purchase_order(
  p_tenant_id UUID,
  p_purchase_order_id UUID,
  p_approver_user_id UUID
) RETURNS VOID AS $$
DECLARE
  v_status TEXT;
  v_created_by UUID;
BEGIN
  SELECT status, created_by INTO v_status, v_created_by
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found for tenant %', p_purchase_order_id, p_tenant_id;
  END IF;

  IF v_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Purchase order is % — only draft/pending orders can be approved', v_status;
  END IF;

  -- Segregation of duties: the creator can't also be the approver. created_by is
  -- nullable on older rows (predates this being captured) — those are exempt since
  -- there's nothing to compare against.
  IF v_created_by IS NOT NULL AND v_created_by = p_approver_user_id THEN
    RAISE EXCEPTION 'The purchase order creator cannot also approve it — have another user approve';
  END IF;

  UPDATE public.purchase_orders
  SET status = 'approved', approved_by = p_approver_user_id, approved_at = NOW(), updated_at = NOW()
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.approve_purchase_order TO authenticated;

-- receive_purchase_goods: refuse to receive against a PO that hasn't been approved.
DROP FUNCTION IF EXISTS public.receive_purchase_goods(UUID, UUID, UUID, DATE, UUID, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.receive_purchase_goods(
  p_tenant_id UUID,
  p_purchase_order_id UUID,
  p_branch_id UUID,
  p_receipt_date DATE,
  p_actor_user_id UUID,
  p_supplier_invoice_number TEXT,
  p_items JSONB
) RETURNS TABLE (goods_receipt_id UUID, receipt_number TEXT) AS $$
DECLARE
  v_supplier_id UUID;
  v_po_status TEXT;
  v_receipt_number TEXT;
  v_grn_id UUID;
  v_item JSONB;
  v_poi_id UUID;
  v_medicine_id UUID;
  v_qty_to_receive INTEGER;
  v_unit_cost DECIMAL(14,2);
  v_vat_amount DECIMAL(14,2);
  v_line_net DECIMAL(14,2);
  v_ordered INTEGER;
  v_received INTEGER;
  v_new_received INTEGER;
  v_current_branch_stock INTEGER;
  v_total_gross_for_ap DECIMAL(14,2) := 0;
  v_last_balance DECIMAL(14,2);
  v_new_balance DECIMAL(14,2);
  v_batch_number TEXT;
  v_expiry_date DATE;
BEGIN
  SELECT supplier_id, status INTO v_supplier_id, v_po_status
  FROM purchase_orders
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found for tenant %', p_purchase_order_id, p_tenant_id;
  END IF;

  IF v_po_status NOT IN ('approved', 'ordered', 'partially_received') THEN
    RAISE EXCEPTION 'Purchase order is % — it must be approved before goods can be received against it', v_po_status;
  END IF;

  v_receipt_number := 'GRN-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::TEXT;

  INSERT INTO goods_receipts (
    tenant_id, purchase_order_id, receipt_number, receipt_date, status,
    supplier_invoice_number, branch_id, created_by
  ) VALUES (
    p_tenant_id, p_purchase_order_id, v_receipt_number, p_receipt_date, 'draft',
    NULLIF(p_supplier_invoice_number, ''), p_branch_id, p_actor_user_id
  ) RETURNING id INTO v_grn_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty_to_receive := (v_item->>'quantity_to_receive')::INTEGER;
    IF v_qty_to_receive IS NULL OR v_qty_to_receive <= 0 THEN
      CONTINUE;
    END IF;

    v_poi_id := (v_item->>'purchase_order_item_id')::UUID;
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_unit_cost := (v_item->>'unit_cost')::DECIMAL(14,2);
    v_vat_amount := COALESCE((v_item->>'vat_amount')::DECIMAL(14,2), 0);
    v_batch_number := NULLIF(v_item->>'batch_number', '');
    v_expiry_date := NULLIF(v_item->>'expiry_date', '')::DATE;

    IF v_vat_amount < 0 THEN
      RAISE EXCEPTION 'Invalid VAT amount on receive line for item %', v_poi_id;
    END IF;

    SELECT quantity_ordered, quantity_received INTO v_ordered, v_received
    FROM purchase_order_items
    WHERE id = v_poi_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_ordered IS NULL THEN
      RAISE EXCEPTION 'Purchase order item % not found for tenant %', v_poi_id, p_tenant_id;
    END IF;

    v_new_received := COALESCE(v_received, 0) + v_qty_to_receive;
    IF v_new_received > v_ordered THEN
      RAISE EXCEPTION 'Cannot receive % units for item % — only % of % ordered units remain',
        v_qty_to_receive, v_poi_id, (v_ordered - COALESCE(v_received, 0)), v_ordered;
    END IF;

    v_line_net := v_unit_cost * v_qty_to_receive;
    v_total_gross_for_ap := v_total_gross_for_ap + v_line_net + v_vat_amount;

    INSERT INTO goods_receipt_items (
      goods_receipt_id, medicine_id, quantity_received, unit_cost, total_cost, vat_amount, branch_id
    ) VALUES (
      v_grn_id, v_medicine_id, v_qty_to_receive, v_unit_cost, v_line_net, v_vat_amount, p_branch_id
    );

    UPDATE purchase_order_items
    SET quantity_received = v_new_received
    WHERE id = v_poi_id;

    v_current_branch_stock := public.lock_medicine_branch_stock(p_tenant_id, p_branch_id, v_medicine_id);
    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_current_branch_stock + v_qty_to_receive, updated_at = NOW()
    WHERE branch_id = p_branch_id AND medicine_id = v_medicine_id;

    INSERT INTO public.medicine_batches (
      tenant_id, branch_id, medicine_id, batch_number, expiry_date,
      quantity_received, quantity_remaining, goods_receipt_id
    ) VALUES (
      p_tenant_id, p_branch_id, v_medicine_id, COALESCE(v_batch_number, 'BATCH-' || v_receipt_number), v_expiry_date,
      v_qty_to_receive, v_qty_to_receive, v_grn_id
    );

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, tenant_id, branch_id
    ) VALUES (
      v_medicine_id, 'purchase', v_qty_to_receive, v_grn_id, 'purchase', p_tenant_id, p_branch_id
    );
  END LOOP;

  IF v_total_gross_for_ap > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_supplier_id::TEXT));

    SELECT balance_after INTO v_last_balance
    FROM supplier_ledger_entries
    WHERE supplier_id = v_supplier_id
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 1;

    v_new_balance := COALESCE(v_last_balance, 0) + v_total_gross_for_ap;

    INSERT INTO supplier_ledger_entries (
      tenant_id, branch_id, supplier_id, purchase_order_id, goods_receipt_id,
      reference_number, supplier_bill_number, entry_type, amount, balance_after, entry_date
    ) VALUES (
      p_tenant_id, p_branch_id, v_supplier_id, p_purchase_order_id, v_grn_id,
      v_receipt_number, NULLIF(p_supplier_invoice_number, ''), 'invoice',
      v_total_gross_for_ap, v_new_balance, p_receipt_date
    );
  END IF;

  UPDATE goods_receipts SET status = 'received' WHERE id = v_grn_id;

  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM purchase_order_items poi
      WHERE poi.purchase_order_id = p_purchase_order_id AND poi.quantity_received < poi.quantity_ordered
    ) THEN 'received'
    ELSE 'partially_received'
  END INTO v_po_status;

  UPDATE purchase_orders
  SET status = v_po_status, updated_at = NOW()
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id;

  RETURN QUERY SELECT v_grn_id, v_receipt_number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.receive_purchase_goods TO authenticated;

-- --- 2) Supplier payment overpayment guard --------------------------------------------
DROP FUNCTION IF EXISTS public.post_supplier_payment(UUID, UUID, NUMERIC, TEXT, DATE, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.post_supplier_payment(
  p_tenant_id UUID,
  p_supplier_id UUID,
  p_amount NUMERIC(14,2),
  p_payment_method TEXT,
  p_payment_date DATE,
  p_user_id UUID,
  p_reference_note TEXT,
  p_branch_id UUID DEFAULT NULL,
  p_allow_overpayment BOOLEAN DEFAULT false
)
RETURNS TABLE(ledger_entry_id UUID, voucher_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ap UUID;
  v_cash_bank UUID;
  v_last NUMERIC(14,2);
  v_new_bal NUMERIC(14,2);
  v_ledger_id UUID;
  v_vid UUID;
  v_no VARCHAR(64);
  v_branch UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  PERFORM public.accounting_assert_posting_open(p_tenant_id, p_payment_date);

  IF p_payment_method NOT IN ('cash', 'bank') THEN
    RAISE EXCEPTION 'payment_method must be cash or bank';
  END IF;

  v_branch := p_branch_id;
  IF v_branch IS NULL THEN
    SELECT current_branch_id INTO v_branch FROM users WHERE id = p_user_id;
  END IF;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM branches WHERE tenant_id = p_tenant_id ORDER BY created_at LIMIT 1;
  END IF;

  SELECT accounting_payable_account_id INTO v_ap FROM suppliers WHERE id = p_supplier_id AND tenant_id = p_tenant_id LIMIT 1;
  IF v_ap IS NULL THEN
    RAISE EXCEPTION 'Supplier has no accounts payable head; save supplier again or run migration';
  END IF;

  IF p_payment_method = 'cash' THEN
    SELECT id INTO v_cash_bank FROM accounting_accounts WHERE tenant_id = p_tenant_id AND code = '1000' LIMIT 1;
  ELSE
    SELECT id INTO v_cash_bank FROM accounting_accounts WHERE tenant_id = p_tenant_id AND code = '1010' LIMIT 1;
  END IF;
  IF v_cash_bank IS NULL THEN
    RAISE EXCEPTION 'Cash/Bank account missing (codes 1000 / 1010)';
  END IF;

  SELECT balance_after INTO v_last
  FROM supplier_ledger_entries
  WHERE tenant_id = p_tenant_id AND supplier_id = p_supplier_id
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1;

  -- Overpayment guard: balance_after is what's still owed to the supplier. Paying
  -- more than that is sometimes legitimate (an advance against future orders), so
  -- it isn't blocked outright — but it now requires the caller to explicitly say so
  -- instead of happening silently on a typo.
  IF NOT p_allow_overpayment AND p_amount > COALESCE(v_last, 0) THEN
    RAISE EXCEPTION
      'Payment of % exceeds the outstanding balance of % for this supplier — pass allow_overpayment to record it as an advance',
      p_amount, COALESCE(v_last, 0);
  END IF;

  v_new_bal := COALESCE(v_last, 0)::NUMERIC(14,2) - p_amount;

  INSERT INTO supplier_ledger_entries (
    tenant_id, branch_id, supplier_id, reference_number, entry_type, amount, balance_after, entry_date, description
  ) VALUES (
    p_tenant_id,
    v_branch,
    p_supplier_id,
    COALESCE(p_reference_note, 'PAY-' || to_char(now(), 'YYYYMMDDHH24MISS')),
    'payment',
    p_amount,
    v_new_bal,
    p_payment_date,
    'Supplier payment (' || p_payment_method || ')' || CASE WHEN v_new_bal < 0 THEN ' [advance]' ELSE '' END
  )
  RETURNING id INTO v_ledger_id;

  v_no := public.accounting_next_voucher_no(p_tenant_id);

  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    p_tenant_id, v_branch, v_no, p_payment_date, 'system_supplier_payment', 'system',
    'supplier_payment', v_ledger_id, 'posted',
    'Supplier payment',
    p_user_id, NOW(), p_user_id
  )
  ON CONFLICT (tenant_id, reference_type, reference_id)
  WHERE status = 'posted' AND reference_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_vid;

  IF v_vid IS NULL THEN
    RAISE EXCEPTION 'Duplicate supplier payment voucher';
  END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (p_tenant_id, v_branch, v_vid, 1, v_ap, 'Reduce supplier payable', p_amount, 0),
    (p_tenant_id, v_branch, v_vid, 2, v_cash_bank, 'Payment ' || p_payment_method, 0, p_amount);

  ledger_entry_id := v_ledger_id;
  voucher_id := v_vid;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_supplier_payment(
  UUID, UUID, NUMERIC, TEXT, DATE, UUID, TEXT, UUID, BOOLEAN
) TO authenticated;

-- --- 3) Bank deposit <-> cash shift traceability --------------------------------------
ALTER TABLE public.bank_deposits
  ADD COLUMN IF NOT EXISTS cash_shift_id UUID REFERENCES public.cash_register_shifts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_deposits_cash_shift ON public.bank_deposits(cash_shift_id);

CREATE OR REPLACE FUNCTION public.record_bank_deposit(
  p_branch_id UUID,
  p_amount NUMERIC(14,2),
  p_deposit_date DATE,
  p_reference_note TEXT,
  p_user_id UUID,
  p_cash_shift_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_cash UUID;
  v_bank UUID;
  v_vid UUID;
  v_no VARCHAR(64);
  v_deposit_id UUID;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  SELECT tenant_id INTO v_tenant FROM users WHERE id = p_user_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM branches b WHERE b.id = p_branch_id AND b.tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Invalid branch for tenant';
  END IF;

  IF p_cash_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM cash_register_shifts s
    WHERE s.id = p_cash_shift_id AND s.tenant_id = v_tenant AND s.branch_id = p_branch_id
  ) THEN
    RAISE EXCEPTION 'Invalid cash shift for this branch';
  END IF;

  PERFORM public.accounting_assert_posting_open(v_tenant, COALESCE(p_deposit_date, CURRENT_DATE));

  v_cash := public.accounting_resolve_account(v_tenant, 'cash_on_hand', '1000');
  v_bank := public.accounting_resolve_account(v_tenant, 'bank', '1010');
  IF v_cash IS NULL OR v_bank IS NULL THEN
    RAISE EXCEPTION 'Cash (1000) or Bank (1010) account missing';
  END IF;

  INSERT INTO bank_deposits (
    tenant_id, branch_id, deposit_date, amount, reference_note, created_by, cash_shift_id
  ) VALUES (
    v_tenant, p_branch_id, COALESCE(p_deposit_date, CURRENT_DATE), p_amount, p_reference_note, p_user_id, p_cash_shift_id
  ) RETURNING id INTO v_deposit_id;

  v_no := public.accounting_next_voucher_no(v_tenant);
  INSERT INTO accounting_vouchers (
    tenant_id, branch_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, created_by, posted_at, posted_by
  ) VALUES (
    v_tenant, p_branch_id, v_no, COALESCE(p_deposit_date, CURRENT_DATE), 'journal', 'manual',
    'bank_deposit', v_deposit_id, 'posted',
    COALESCE(p_reference_note, 'Bank deposit'),
    p_user_id, NOW(), p_user_id
  ) RETURNING id INTO v_vid;

  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, p_branch_id, v_vid, 1, v_bank, 'Cash deposited to bank', p_amount, 0);
  INSERT INTO accounting_voucher_lines (tenant_id, branch_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES (v_tenant, p_branch_id, v_vid, 2, v_cash, 'Cash out for bank deposit', 0, p_amount);

  UPDATE bank_deposits SET voucher_id = v_vid WHERE id = v_deposit_id;

  RETURN v_deposit_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_bank_deposit(UUID, NUMERIC, DATE, TEXT, UUID, UUID) TO authenticated;

-- --- 4) Inter-branch stock transfer ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  to_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  transfer_number VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_transfers_different_branches CHECK (from_branch_id <> to_branch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfers_number ON public.stock_transfers(tenant_id, transfer_number);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant ON public.stock_transfers(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON public.stock_transfer_items(transfer_id);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stock_transfers' AND policyname = 'Stock transfers by tenant'
  ) THEN
    CREATE POLICY "Stock transfers by tenant" ON public.stock_transfers
      FOR ALL USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stock_transfer_items' AND policyname = 'Stock transfer items by tenant'
  ) THEN
    CREATE POLICY "Stock transfer items by tenant" ON public.stock_transfer_items
      FOR ALL USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
  END IF;
END $$;

GRANT ALL ON public.stock_transfers TO authenticated;
GRANT ALL ON public.stock_transfer_items TO authenticated;

-- Atomically moves stock between two branches of the same tenant. Each line is
-- capped at the source branch's current stock (no negative stock at the source);
-- the destination is credited the same quantity. Both sides get an
-- inventory_transactions row (type 'adjustment', reference_type 'stock_transfer')
-- so the movement shows up in each branch's audit trail, not just a silent number
-- change.
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_tenant_id UUID,
  p_from_branch_id UUID,
  p_to_branch_id UUID,
  p_actor_user_id UUID,
  p_notes TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
  v_medicine_id UUID;
  v_quantity INTEGER;
  v_from_stock INTEGER;
  v_to_stock INTEGER;
BEGIN
  IF p_from_branch_id = p_to_branch_id THEN
    RAISE EXCEPTION 'Source and destination branch must differ';
  END IF;

  PERFORM 1 FROM branches WHERE id = p_from_branch_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid source branch'; END IF;
  PERFORM 1 FROM branches WHERE id = p_to_branch_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid destination branch'; END IF;

  v_transfer_number := 'TRF-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::TEXT;

  INSERT INTO stock_transfers (tenant_id, from_branch_id, to_branch_id, transfer_number, notes, created_by)
  VALUES (p_tenant_id, p_from_branch_id, p_to_branch_id, v_transfer_number, p_notes, p_actor_user_id)
  RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'quantity must be positive for medicine %', v_medicine_id;
    END IF;

    v_from_stock := public.lock_medicine_branch_stock(p_tenant_id, p_from_branch_id, v_medicine_id);
    IF v_from_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock at source branch for medicine % — has %, requested %',
        v_medicine_id, v_from_stock, v_quantity;
    END IF;

    v_to_stock := public.lock_medicine_branch_stock(p_tenant_id, p_to_branch_id, v_medicine_id);

    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_from_stock - v_quantity, updated_at = NOW()
    WHERE branch_id = p_from_branch_id AND medicine_id = v_medicine_id;

    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_to_stock + v_quantity, updated_at = NOW()
    WHERE branch_id = p_to_branch_id AND medicine_id = v_medicine_id;

    INSERT INTO stock_transfer_items (tenant_id, transfer_id, medicine_id, quantity)
    VALUES (p_tenant_id, v_transfer_id, v_medicine_id, v_quantity);

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, reason_code, user_id, tenant_id, branch_id
    ) VALUES
      (v_medicine_id, 'adjustment', -v_quantity, v_transfer_id, 'stock_transfer', 'branch_transfer_out', p_actor_user_id, p_tenant_id, p_from_branch_id),
      (v_medicine_id, 'adjustment', v_quantity, v_transfer_id, 'stock_transfer', 'branch_transfer_in', p_actor_user_id, p_tenant_id, p_to_branch_id);
  END LOOP;

  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.create_stock_transfer TO authenticated;
