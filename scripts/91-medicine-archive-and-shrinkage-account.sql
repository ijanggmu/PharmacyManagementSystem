-- 1) Archive support for medicines. Delete has always been blocked once a medicine
--    has any inventory_transactions/sale_items/prescription_items row (see
--    medicineHasRelations in medicine-service.ts) — which is nearly every medicine
--    that's ever had stock — but the error message ("archive instead") pointed at a
--    feature that didn't exist. This adds the real column; app/api/medicines/[id]
--    DELETE now archives (is_active = false) when blocked, and only hard-deletes
--    when there is truly no history.
ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_medicines_tenant_active
  ON public.medicines (tenant_id, is_active);

-- 2) Chart-of-accounts entry for inventory shrinkage / write-offs, so manual stock
--    decreases (breakage, theft, expiry write-off, count correction, other — see
--    inventory_transactions.reason_code, added in 85-inventory-safety-controls.sql)
--    can post a real GL voucher instead of only writing an inventory_transactions
--    row. Without this account, postInventoryAdjustmentVoucher
--    (lib/server/services/accounting-service.ts) resolves nothing and silently
--    skips posting, same fallback behavior as every other accounting_post_*
--    function in this codebase when its accounts are missing.
INSERT INTO accounting_accounts (tenant_id, code, name, account_type, is_system)
SELECT t.id, '6200', 'Inventory shrinkage / write-off', 'expense', true
FROM tenants t
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO public.accounting_account_map (tenant_id, map_key, account_id)
SELECT t.id, 'inventory_shrinkage', a.id
FROM tenants t
JOIN accounting_accounts a ON a.tenant_id = t.id AND a.code = '6200'
ON CONFLICT (tenant_id, map_key) DO NOTHING;
