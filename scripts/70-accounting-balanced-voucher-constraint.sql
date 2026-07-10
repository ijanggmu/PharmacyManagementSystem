-- Fix: debits == credits per voucher was only enforced in TypeScript before insert
-- (assertBalancedLines) and by how the SQL auto-voucher functions happen to be
-- written — nothing at the database level stopped a stray direct SQL insert (e.g.
-- via the Supabase SQL editor, or a future buggy migration) from posting an
-- unbalanced voucher, silently corrupting the trial balance.
--
-- A deferred constraint trigger on accounting_vouchers checks the balance once at
-- end-of-transaction (not per line-insert), so it doesn't fire prematurely while a
-- voucher's lines are still being inserted within the same transaction as the header.

CREATE OR REPLACE FUNCTION public.accounting_check_voucher_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit NUMERIC(14,2);
  v_credit NUMERIC(14,2);
  v_line_count INTEGER;
BEGIN
  IF NEW.status <> 'posted' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0), COUNT(*)
  INTO v_debit, v_credit, v_line_count
  FROM accounting_voucher_lines
  WHERE voucher_id = NEW.id;

  IF v_line_count = 0 THEN
    RAISE EXCEPTION 'Voucher % cannot be posted with no lines', NEW.id;
  END IF;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Voucher % is unbalanced: debits % != credits %', NEW.id, v_debit, v_credit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounting_check_voucher_balance ON public.accounting_vouchers;
CREATE CONSTRAINT TRIGGER trg_accounting_check_voucher_balance
AFTER INSERT OR UPDATE OF status ON public.accounting_vouchers
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.accounting_check_voucher_balance();
