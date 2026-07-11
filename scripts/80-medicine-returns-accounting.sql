-- Accounting gap: customer returns processed via medicine_returns/return_items
-- (app/dashboard/returns, lib/server/services/returns-service.ts, RPC
-- create_medicine_return / restore_return_stock in 68-returns-refunds-integrity.sql)
-- restore physical stock but never post anything to accounting_vouchers. This is a
-- *different* table from sales_refunds (app/dashboard/refunds), which already has
-- an auto-posting trigger (trg_sales_refunds_accounting, 53-accounting-auto-vouchers-all-flows.sql).
-- Every completed customer return through this flow silently understated COGS
-- reversal and overstated revenue relative to physical inventory.
--
-- Mirrors accounting_post_sales_refund_voucher exactly: Dr Sales returns (3100) /
-- Cr Cash (1000) for the return amount, plus Dr Inventory (5000) / Cr COGS (4000)
-- to reverse cost of goods sold on the returned quantity. Gated on status='completed',
-- the same point restore_return_stock() puts stock back — so a pending/approved
-- return that never completes never hits the books, matching the stock behavior.

CREATE OR REPLACE FUNCTION public.accounting_post_medicine_return_voucher(p_return_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mr RECORD;
  v_total NUMERIC(14,2);
  v_cogs NUMERIC(14,2);
  v_vid UUID;
  v_no VARCHAR(64);
  v_cash UUID;
  v_sales_return UUID;
  v_cogs_a UUID;
  v_inv UUID;
  ln INT := 1;
BEGIN
  SELECT r.* INTO mr FROM medicine_returns r WHERE r.id = p_return_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(mr.status, '') <> 'completed' THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM accounting_vouchers v
    WHERE v.tenant_id = mr.tenant_id
      AND v.reference_type = 'medicine_return'
      AND v.reference_id = p_return_id
      AND v.status = 'posted'
  ) THEN
    RETURN;
  END IF;

  v_total := COALESCE(mr.total_return_amount, 0)::NUMERIC(14,2);
  IF v_total <= 0 THEN RETURN; END IF;

  SELECT COALESCE(SUM(ri.quantity_returned::NUMERIC * COALESCE(m.cost_price, 0)::NUMERIC), 0)
    INTO v_cogs
    FROM return_items ri
    JOIN medicines m ON m.id = ri.medicine_id
    WHERE ri.return_id = p_return_id;

  SELECT id INTO v_cash FROM accounting_accounts WHERE tenant_id = mr.tenant_id AND code = '1000' LIMIT 1;
  SELECT id INTO v_sales_return FROM accounting_accounts WHERE tenant_id = mr.tenant_id AND code = '3100' LIMIT 1;
  SELECT id INTO v_cogs_a FROM accounting_accounts WHERE tenant_id = mr.tenant_id AND code = '4000' LIMIT 1;
  SELECT id INTO v_inv FROM accounting_accounts WHERE tenant_id = mr.tenant_id AND code = '5000' LIMIT 1;
  IF v_cash IS NULL OR v_sales_return IS NULL THEN RETURN; END IF;

  v_no := public.accounting_next_voucher_no(mr.tenant_id);
  INSERT INTO accounting_vouchers (
    tenant_id, voucher_no, voucher_date, voucher_type, source,
    reference_type, reference_id, status, narration, posted_at
  ) VALUES (
    mr.tenant_id, v_no, mr.return_date::date, 'system_sales_return', 'system',
    'medicine_return', p_return_id, 'posted',
    'Auto: customer return ' || p_return_id::text,
    NOW()
  )
  ON CONFLICT ON CONSTRAINT ux_accounting_voucher_reference_posted DO NOTHING
  RETURNING id INTO v_vid;
  IF v_vid IS NULL THEN RETURN; END IF;

  INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
  VALUES
    (mr.tenant_id, v_vid, ln, v_sales_return, 'Sales return / allowance', v_total, 0),
    (mr.tenant_id, v_vid, ln + 1, v_cash, 'Cash / credit issued to customer', 0, v_total);
  ln := ln + 2;

  IF v_cogs > 0 AND v_cogs_a IS NOT NULL AND v_inv IS NOT NULL THEN
    INSERT INTO accounting_voucher_lines (tenant_id, voucher_id, line_no, account_id, description, debit_amount, credit_amount)
    VALUES
      (mr.tenant_id, v_vid, ln, v_inv, 'Inventory restocked from return', v_cogs, 0),
      (mr.tenant_id, v_vid, ln + 1, v_cogs_a, 'Reverse COGS', 0, v_cogs);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_medicine_returns_accounting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      PERFORM public.accounting_post_medicine_return_voucher(NEW.id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status, '') <> COALESCE(NEW.status, '') AND NEW.status = 'completed' THEN
      PERFORM public.accounting_post_medicine_return_voucher(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS medicine_returns_post_accounting ON medicine_returns;
CREATE TRIGGER medicine_returns_post_accounting
AFTER INSERT OR UPDATE OF status ON medicine_returns
FOR EACH ROW
EXECUTE PROCEDURE public.trg_medicine_returns_accounting();

-- Backfill: post the voucher for any already-completed return that predates this
-- migration and doesn't have one yet (accounting_post_medicine_return_voucher is
-- idempotent via the reference_type/reference_id posted-uniqueness check).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM medicine_returns WHERE status = 'completed' LOOP
    PERFORM public.accounting_post_medicine_return_voucher(r.id);
  END LOOP;
END $$;
