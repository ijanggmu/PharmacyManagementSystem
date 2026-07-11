-- Root cause of "accounting doesn't seem to be linked to anything": the standard
-- chart of accounts (1000 Cash, 3000 Sales revenue, 4000 COGS, 5000 Inventory, etc.)
-- was only ever seeded as a one-time bulk INSERT ... SELECT t.id FROM tenants in
-- migrations 51/53/58/65 — it covered whatever tenants existed *at the time each
-- migration ran*, but nothing seeds it for tenants created afterward. Every
-- accounting_post_*_voucher() trigger function guards with
-- "IF v_cash IS NULL OR v_sales_return IS NULL THEN RETURN" (silent no-op), so for
-- any tenant missing these accounts, sales/purchases/returns/refunds/payments all
-- post stock and ledger rows correctly but never touch accounting_vouchers at all —
-- the accounting module is completely dark for that tenant, with no error anywhere.
--
-- This backfills the full standard chart for every tenant currently missing it.
-- app/api/onboarding and app/api/tenants (POST) now also call seedDefaultChartOfAccounts
-- (lib/server/services/tenant-service.ts) at signup time so this gap can't reopen for
-- new tenants going forward.

INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, v.code, v.name, v.account_type, true
FROM tenants t
CROSS JOIN (
  VALUES
    ('1000', 'Cash on hand', 'asset'),
    ('1010', 'Bank', 'asset'),
    ('1100', 'Accounts receivable', 'asset'),
    ('1150', 'Input VAT recoverable', 'asset'),
    ('2000', 'Output VAT / sales tax payable', 'liability'),
    ('2100', 'Trade payables', 'liability'),
    ('3000', 'Sales revenue', 'revenue'),
    ('3100', 'Sales returns and allowances', 'revenue'),
    ('4000', 'Cost of goods sold', 'expense'),
    ('5000', 'Merchandise inventory', 'asset'),
    ('6100', 'Cash over / short', 'expense')
) AS v(code, name, account_type)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, 'cash_over_short', a.id
FROM tenants t
JOIN accounting_accounts a ON a.tenant_id = t.id AND a.code = '6100'
ON CONFLICT (tenant_id, map_key) DO NOTHING;

-- Now that accounts exist for every tenant, retroactively post vouchers for
-- transactions that went through silently un-posted while their tenant had no
-- chart of accounts. All accounting_post_*_voucher() functions are idempotent
-- (guarded by ux_accounting_voucher_reference_posted), so this only creates the
-- vouchers that are genuinely missing.
--
-- Each call is wrapped in its own sub-transaction (BEGIN/EXCEPTION below creates
-- an implicit savepoint) so one bad historical row — e.g. a sale with a corrupt
-- negative total that fails the voucher-lines debit/credit check constraint —
-- logs a warning and is skipped, instead of rolling back this entire migration
-- (including the chart-of-accounts insert above, which is the actual fix).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM goods_receipts WHERE status = 'received' LOOP
    BEGIN
      PERFORM public.accounting_post_purchase_voucher(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skipping goods_receipt % — %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN SELECT id FROM sales WHERE payment_status IN ('paid', 'completed') LOOP
    BEGIN
      PERFORM public.accounting_post_sale_voucher(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skipping sale % — %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN SELECT id FROM sales_refunds WHERE refund_status IN ('approved', 'completed') LOOP
    BEGIN
      PERFORM public.accounting_post_sales_refund_voucher(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skipping sales_refund % — %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN SELECT id FROM supplier_returns WHERE status = 'completed' LOOP
    BEGIN
      PERFORM public.accounting_post_purchase_return_voucher(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skipping supplier_return % — %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN SELECT id FROM medicine_returns WHERE status = 'completed' LOOP
    BEGIN
      PERFORM public.accounting_post_medicine_return_voucher(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skipping medicine_return % — %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
