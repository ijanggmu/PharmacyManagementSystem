-- Fast AP sub-ledger total as-of date (sum of latest balance_after per supplier).

CREATE OR REPLACE FUNCTION public.supplier_ap_subledger_balance_total(p_tenant_id UUID, p_as_of DATE)
RETURNS NUMERIC(14,2)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(latest.balance_after::NUMERIC(14,2)), 0)::NUMERIC(14,2)
  FROM (
    SELECT DISTINCT ON (supplier_id) balance_after
    FROM supplier_ledger_entries
    WHERE tenant_id = p_tenant_id
      AND entry_date <= p_as_of
    ORDER BY supplier_id, entry_date DESC, created_at DESC
  ) AS latest;
$$;

GRANT EXECUTE ON FUNCTION public.supplier_ap_subledger_balance_total(UUID, DATE) TO authenticated;
