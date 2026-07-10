-- Fix: getDashboardContextData (called on every dashboard page load via
-- components/dashboard-layout.tsx's client-side context fetch) pulled every
-- medicines/prescriptions/medicine_returns/sales_refunds row for the tenant just to
-- count low-stock/expiring/pending in JavaScript. That's 4 full-table reads on every
-- single page navigation. Replace with one aggregate RPC.

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
  SELECT
    (SELECT COUNT(*) FROM medicines
      WHERE tenant_id = p_tenant_id AND stock_quantity <= minimum_stock),
    (SELECT COUNT(*) FROM medicines
      WHERE tenant_id = p_tenant_id AND expiry_date IS NOT NULL
        AND expiry_date <= (CURRENT_DATE + INTERVAL '30 days') AND expiry_date >= CURRENT_DATE),
    (SELECT COUNT(*) FROM prescriptions
      WHERE tenant_id = p_tenant_id AND status = 'pending'),
    (SELECT COUNT(*) FROM medicine_returns
      WHERE tenant_id = p_tenant_id AND status = 'pending'),
    (SELECT COUNT(*) FROM sales_refunds
      WHERE tenant_id = p_tenant_id AND refund_status = 'pending');
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_notification_counts TO authenticated;
