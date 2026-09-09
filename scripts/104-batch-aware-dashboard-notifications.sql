-- get_dashboard_notification_counts (scripts/75) — the RPC behind the
-- notification bell shown on every dashboard page load — counted "expiring"
-- medicines against the static medicines.expiry_date column. That field is set
-- once at creation and never kept in sync as real per-lot batches (in
-- medicine_batches) come and go, so a medicine whose only real batch expires
-- next week could go uncounted while a stale field said otherwise — the exact
-- same bug fixed in medicine-service.ts (list display/filter) and the
-- inventory page's stat tiles (getMedicineInventoryStats).
--
-- Fix: prefer each medicine's nearest sellable (non-recalled, quantity
-- remaining) batch expiry once it has batches; fall back to the static field
-- only for medicines with no batch rows yet — the same effectiveExpiryFromAgg
-- rule medicine-service.ts already applies everywhere else.

CREATE OR REPLACE FUNCTION public.get_dashboard_notification_counts(p_tenant_id UUID)
RETURNS TABLE (
  low_stock BIGINT,
  expiring BIGINT,
  pending_prescriptions BIGINT,
  pending_returns BIGINT,
  pending_refunds BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH batch_nearest AS (
    SELECT medicine_id, MIN(expiry_date) AS nearest_expiry, COUNT(*) AS batch_count
    FROM medicine_batches
    WHERE tenant_id = p_tenant_id AND quantity_remaining > 0 AND recalled_at IS NULL
    GROUP BY medicine_id
  ),
  effective AS (
    SELECT
      m.id,
      CASE WHEN bn.batch_count > 0 THEN bn.nearest_expiry ELSE m.expiry_date END AS effective_expiry
    FROM medicines m
    LEFT JOIN batch_nearest bn ON bn.medicine_id = m.id
    WHERE m.tenant_id = p_tenant_id
  )
  SELECT
    (SELECT COUNT(*) FROM medicines
      WHERE tenant_id = p_tenant_id AND stock_quantity <= minimum_stock),
    (SELECT COUNT(*) FROM effective
      WHERE effective_expiry IS NOT NULL
        AND effective_expiry <= (CURRENT_DATE + INTERVAL '30 days') AND effective_expiry >= CURRENT_DATE),
    (SELECT COUNT(*) FROM prescriptions
      WHERE tenant_id = p_tenant_id AND status = 'pending'),
    (SELECT COUNT(*) FROM medicine_returns
      WHERE tenant_id = p_tenant_id AND status = 'pending'),
    (SELECT COUNT(*) FROM sales_refunds
      WHERE tenant_id = p_tenant_id AND refund_status = 'pending');
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_notification_counts TO authenticated;
