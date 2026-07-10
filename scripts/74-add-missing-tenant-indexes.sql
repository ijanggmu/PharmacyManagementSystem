-- Fix: tenant_id was added to medicines, sales, sale_items, customers, prescriptions,
-- and inventory_transactions in scripts/30-add-multi-tenancy.sql, but no follow-up
-- migration ever indexed it. Every RLS-filtered query against these tables (i.e.
-- every query the app makes against them) has been a full table scan since — the
-- single biggest cause of the app getting slower as data grows.
--
-- Composite indexes match the actual filter/sort patterns used by the app's list
-- queries (e.g. sales list filters + sorts by date within a tenant) rather than a
-- bare tenant_id index alone, so the common queries can be satisfied by the index
-- without a secondary sort/filter pass.

CREATE INDEX IF NOT EXISTS idx_medicines_tenant ON public.medicines (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON public.sales (tenant_id, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant ON public.sale_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant ON public.prescriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_tenant ON public.inventory_transactions (tenant_id);
