-- Phase 0/1 fixes from the 2026-08 business-logic domain audit:
--   AUDIT-004 (barcode uniqueness), item 9 (batch uniqueness), item 8 (missing
--   CHECK constraints on sale_items / purchase_order_items / goods_receipt_items).
-- Each unique constraint is guarded by a duplicate check first — if a tenant's
-- existing data already has duplicates, adding the constraint would hard-fail
-- this migration for everyone, so we skip and warn instead of blocking.

-- 1) AUDIT-004: two medicines sharing a barcode is a scan-to-wrong-medicine risk
-- at POS. Partial unique index (NULLs allowed — barcode is optional).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.medicines
    WHERE barcode IS NOT NULL AND barcode <> ''
    GROUP BY tenant_id, barcode
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'Skipping medicines barcode unique index — duplicate (tenant_id, barcode) rows exist. Resolve them, then run: CREATE UNIQUE INDEX ux_medicines_tenant_barcode ON public.medicines (tenant_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '''';';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS ux_medicines_tenant_barcode
      ON public.medicines (tenant_id, barcode)
      WHERE barcode IS NOT NULL AND barcode <> '';
  END IF;
END $$;

-- 2) item 9: duplicate batch rows for the same physical lot fragment FEFO
-- allocation (two rows tracking what should be one lot's remaining quantity).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.medicine_batches
    GROUP BY tenant_id, branch_id, medicine_id, batch_number
    HAVING COUNT(*) > 1
  ) THEN
    RAISE WARNING 'Skipping medicine_batches unique index — duplicate (tenant_id, branch_id, medicine_id, batch_number) rows exist.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS ux_medicine_batches_lot
      ON public.medicine_batches (tenant_id, branch_id, medicine_id, batch_number);
  END IF;
END $$;

-- 3) item 8: quantity/price sanity at the DB level — previously only enforced by
-- application-layer Zod validation, with zero defense-in-depth against a direct
-- write (script, future integration, manual fix) bypassing the API layer.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_quantity_positive') THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_items_quantity_positive CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_unit_price_nonneg') THEN
    ALTER TABLE public.sale_items ADD CONSTRAINT chk_sale_items_unit_price_nonneg CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_poi_quantity_positive') THEN
    ALTER TABLE public.purchase_order_items ADD CONSTRAINT chk_poi_quantity_positive CHECK (quantity_ordered > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_poi_unit_cost_nonneg') THEN
    ALTER TABLE public.purchase_order_items ADD CONSTRAINT chk_poi_unit_cost_nonneg CHECK (unit_cost >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_gri_quantity_positive') THEN
    ALTER TABLE public.goods_receipt_items ADD CONSTRAINT chk_gri_quantity_positive CHECK (quantity_received > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_gri_unit_cost_nonneg') THEN
    ALTER TABLE public.goods_receipt_items ADD CONSTRAINT chk_gri_unit_cost_nonneg CHECK (unit_cost >= 0);
  END IF;
EXCEPTION WHEN check_violation THEN
  RAISE WARNING 'Skipping one or more CHECK constraints — existing rows violate them. Clean up bad rows, then re-run this migration.';
END $$;

-- 4) Missing index flagged by the audit: sale_items.sale_id has an FK but Postgres
-- does not auto-index FK columns, so every sale-detail lookup by sale_id was an
-- unindexed scan.
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items (sale_id);
