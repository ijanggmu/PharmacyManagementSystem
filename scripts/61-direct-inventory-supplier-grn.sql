-- Direct inventory receipts from supplier (no purchase order): goods_receipts.supplier_id,
-- nullable purchase_order_id, and purchase voucher resolves supplier from header when PO is null.

-- 1) Link goods receipt to supplier when not tied to a PO
ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier ON goods_receipts(tenant_id, supplier_id);

COMMENT ON COLUMN goods_receipts.supplier_id IS
  'Supplier for direct (non-PO) receipts; when purchase_order_id is set, supplier is normally derived from the PO.';

-- 2) Allow goods receipts without a purchase order (inventory UI / bulk import paths)
ALTER TABLE goods_receipts
  ALTER COLUMN purchase_order_id DROP NOT NULL;

-- 3) Purchase voucher: resolve supplier from PO or from goods_receipts.supplier_id
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
  IF v_po_id IS NOT NULL THEN
    SELECT supplier_id INTO v_supplier_id FROM purchase_orders WHERE id = v_po_id LIMIT 1;
  ELSE
    v_supplier_id := gr.supplier_id;
  END IF;

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
