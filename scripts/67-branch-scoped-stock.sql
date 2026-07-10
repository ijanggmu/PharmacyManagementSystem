-- Fix: medicines.stock_quantity was a single tenant-wide counter with no branch_id,
-- so a multi-branch tenant's branches all shared one stock number — a sale rung up at
-- Branch A depleted the same number Branch B's till showed as available.
--
-- Fix: introduce a per-branch stock ledger (medicine_branch_stock). The medicine
-- catalog (name, price, description) stays shared per tenant — only quantity becomes
-- branch-scoped, which matches how users.current_branch_id already threads through the
-- rest of the app. medicines.stock_quantity is kept as a maintained tenant-wide total
-- (SUM across branches) via trigger, so existing tenant-wide UI (low-stock badges,
-- the medicines list) keeps working unmodified while stock *mutations* now correctly
-- target one branch.

-- 1) Per-branch stock table.
CREATE TABLE IF NOT EXISTS public.medicine_branch_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  medicine_id UUID NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, medicine_id)
);

CREATE INDEX IF NOT EXISTS idx_medicine_branch_stock_tenant ON public.medicine_branch_stock (tenant_id);
CREATE INDEX IF NOT EXISTS idx_medicine_branch_stock_medicine ON public.medicine_branch_stock (medicine_id);

ALTER TABLE public.medicine_branch_stock ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'medicine_branch_stock' AND policyname = 'Medicine branch stock by tenant'
  ) THEN
    CREATE POLICY "Medicine branch stock by tenant" ON public.medicine_branch_stock
      FOR ALL
      USING (tenant_id = public.current_tenant_id())
      WITH CHECK (tenant_id = public.current_tenant_id());
  END IF;
END $$;

-- 2) Backfill: seed one row per (existing medicine, tenant's primary/oldest branch)
-- with today's tenant-wide stock_quantity, and 0 for every other branch. We cannot
-- reconstruct the true historical per-branch split (the whole point of this fix is
-- that it was never tracked) — assigning the full known quantity to the primary
-- branch is the least-surprising choice; other branches start at 0 and must be
-- corrected via a stock take / transfer, same as they would in real life after
-- discovering a shared-till bug.
INSERT INTO public.medicine_branch_stock (tenant_id, branch_id, medicine_id, stock_quantity)
SELECT
  m.tenant_id,
  b.id AS branch_id,
  m.id AS medicine_id,
  CASE WHEN b.id = primary_branch.branch_id THEN COALESCE(m.stock_quantity, 0) ELSE 0 END
FROM public.medicines m
JOIN public.branches b ON b.tenant_id = m.tenant_id
JOIN LATERAL (
  SELECT id AS branch_id
  FROM public.branches
  WHERE tenant_id = m.tenant_id
  ORDER BY created_at ASC
  LIMIT 1
) primary_branch ON TRUE
ON CONFLICT (branch_id, medicine_id) DO NOTHING;

-- 3) Keep medicines.stock_quantity as a maintained tenant-wide total.
CREATE OR REPLACE FUNCTION public.sync_medicine_stock_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_medicine_id UUID;
BEGIN
  v_medicine_id := COALESCE(NEW.medicine_id, OLD.medicine_id);

  UPDATE public.medicines
  SET stock_quantity = COALESCE((
    SELECT SUM(stock_quantity) FROM public.medicine_branch_stock WHERE medicine_id = v_medicine_id
  ), 0),
  updated_at = NOW()
  WHERE id = v_medicine_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_medicine_stock_total ON public.medicine_branch_stock;
CREATE TRIGGER trg_sync_medicine_stock_total
AFTER INSERT OR UPDATE OF stock_quantity OR DELETE ON public.medicine_branch_stock
FOR EACH ROW EXECUTE FUNCTION public.sync_medicine_stock_total();

-- 4) Helper: get-or-create a branch's stock row, row-locked, for atomic read-then-write.
CREATE OR REPLACE FUNCTION public.lock_medicine_branch_stock(p_tenant_id UUID, p_branch_id UUID, p_medicine_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_qty INTEGER;
BEGIN
  SELECT stock_quantity INTO v_qty
  FROM public.medicine_branch_stock
  WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.medicine_branch_stock (tenant_id, branch_id, medicine_id, stock_quantity)
    VALUES (p_tenant_id, p_branch_id, p_medicine_id, 0)
    ON CONFLICT (branch_id, medicine_id) DO NOTHING;

    SELECT stock_quantity INTO v_qty
    FROM public.medicine_branch_stock
    WHERE branch_id = p_branch_id AND medicine_id = p_medicine_id
    FOR UPDATE;
  END IF;

  RETURN COALESCE(v_qty, 0);
END;
$$;

-- 5) create_sale_with_items: check/decrement the *branch's* stock row instead of the
-- tenant-wide medicines.stock_quantity column (which is now a derived aggregate).
CREATE OR REPLACE FUNCTION create_sale_with_items(
  p_sale_number VARCHAR(100),
  p_customer_id UUID,
  p_total_amount DECIMAL(10,2),
  p_discount_amount DECIMAL(10,2),
  p_tax_amount DECIMAL(10,2),
  p_payment_method VARCHAR(50),
  p_sale_date TIMESTAMPTZ,
  p_notes TEXT,
  p_user_id UUID,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
  v_item JSONB;
  v_medicine_id UUID;
  v_quantity INTEGER;
  v_unit_price DECIMAL(10,2);
  v_total_price DECIMAL(10,2);
  v_current_stock INTEGER;
  v_tenant_id UUID;
  v_branch_id UUID;
  v_medicine_exists BOOLEAN;
BEGIN
  SELECT tenant_id, current_branch_id
  INTO v_tenant_id, v_branch_id
  FROM users
  WHERE id = p_user_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant not found for user %', p_user_id;
  END IF;

  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id
    FROM branches
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at
    LIMIT 1;
  END IF;

  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found for tenant %', v_tenant_id;
  END IF;

  INSERT INTO sales (
    sale_number, customer_id, total_amount, discount_amount, tax_amount,
    payment_method, payment_status, sale_date, notes, user_id, tenant_id, branch_id
  ) VALUES (
    p_sale_number, p_customer_id, p_total_amount, p_discount_amount, p_tax_amount,
    p_payment_method, 'paid', p_sale_date, p_notes, p_user_id, v_tenant_id, v_branch_id
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_medicine_id := (v_item->>'medicine_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);
    v_total_price := v_unit_price * v_quantity;

    SELECT EXISTS(
      SELECT 1 FROM medicines WHERE id = v_medicine_id AND tenant_id = v_tenant_id
    ) INTO v_medicine_exists;

    IF NOT v_medicine_exists THEN
      RAISE EXCEPTION 'Medicine % not found for tenant %', v_medicine_id, v_tenant_id;
    END IF;

    -- Row-locked, branch-scoped stock check (was: tenant-wide medicines.stock_quantity).
    v_current_stock := public.lock_medicine_branch_stock(v_tenant_id, v_branch_id, v_medicine_id);

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for medicine % at this branch. Available: %, Requested: %',
        v_medicine_id, v_current_stock, v_quantity;
    END IF;

    INSERT INTO sale_items (
      sale_id, medicine_id, quantity, unit_price, total_price, tenant_id, branch_id
    ) VALUES (
      v_sale_id, v_medicine_id, v_quantity, v_unit_price, v_total_price, v_tenant_id, v_branch_id
    );

    UPDATE public.medicine_branch_stock
    SET stock_quantity = stock_quantity - v_quantity, updated_at = NOW()
    WHERE branch_id = v_branch_id AND medicine_id = v_medicine_id;

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, user_id, tenant_id, branch_id
    ) VALUES (
      v_medicine_id, 'sale', -v_quantity, v_sale_id, 'sale', p_user_id, v_tenant_id, v_branch_id
    );
  END LOOP;

  RETURN v_sale_id;
EXCEPTION
  WHEN OTHERS THEN
    IF v_sale_id IS NOT NULL THEN
      DELETE FROM sales WHERE id = v_sale_id;
    END IF;
    RAISE;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION create_sale_with_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.lock_medicine_branch_stock TO authenticated;

-- 6) Atomic, branch-scoped, over-receive-capped purchase receiving — replaces the
-- multi-round-trip, unlocked JS orchestration in purchase-service.ts (which raced on
-- both stock and supplier-ledger balance, had no rollback on partial failure, and had
-- no cap on quantity received vs. ordered).
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
BEGIN
  SELECT supplier_id INTO v_supplier_id
  FROM purchase_orders
  WHERE id = p_purchase_order_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found for tenant %', p_purchase_order_id, p_tenant_id;
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

    IF v_vat_amount < 0 THEN
      RAISE EXCEPTION 'Invalid VAT amount on receive line for item %', v_poi_id;
    END IF;

    -- Row-locked read of ordered/received so concurrent receipts against the same PO
    -- line can't both pass the over-receive check before either writes.
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

    -- Row-locked, branch-scoped stock increment (was: unlocked read-then-write on the
    -- tenant-wide medicines.stock_quantity column).
    v_current_branch_stock := public.lock_medicine_branch_stock(p_tenant_id, p_branch_id, v_medicine_id);
    UPDATE public.medicine_branch_stock
    SET stock_quantity = v_current_branch_stock + v_qty_to_receive, updated_at = NOW()
    WHERE branch_id = p_branch_id AND medicine_id = v_medicine_id;

    INSERT INTO inventory_transactions (
      medicine_id, transaction_type, quantity, reference_id, reference_type, tenant_id, branch_id
    ) VALUES (
      v_medicine_id, 'purchase', v_qty_to_receive, v_grn_id, 'purchase', p_tenant_id, p_branch_id
    );
  END LOOP;

  IF v_total_gross_for_ap > 0 THEN
    -- Serialize supplier-ledger balance writes per supplier within this transaction —
    -- closes the race where two concurrent receipts both read the same "last balance".
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

  RETURN QUERY SELECT v_grn_id, v_receipt_number;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.receive_purchase_goods TO authenticated;
