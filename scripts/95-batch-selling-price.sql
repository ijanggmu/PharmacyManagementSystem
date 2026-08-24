-- Item 11 of the 2026-08 domain audit, scoped down after discussion: manufacturer
-- MRP can change between deliveries of the same medicine, but most pharmacies
-- still price off one shelf price most of the time — so this is an *optional*
-- per-batch override, not a mandatory field, and there is no POS UI change: the
-- cashier still just searches/scans as before, FEFO still picks the batch, and
-- the sale line prices off that specific batch's selling_price when set, falling
-- back to medicines.unit_price when it isn't (today's behavior, unchanged for the
-- common case where every batch of a medicine shares one price).
--
-- Only populated by the app-layer batch-creation paths this audit already fixed
-- (Add Medicine, Edit Medicine stock increase, Bulk Import — see
-- insertMedicineBatchRow, medicine-service.ts). Batches created via the formal
-- PO -> GRN receive flow don't collect a selling price at receipt time and will
-- keep falling back to medicines.unit_price, same as before this migration.

ALTER TABLE public.medicine_batches
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2) CHECK (selling_price IS NULL OR selling_price >= 0);

COMMENT ON COLUMN public.medicine_batches.selling_price IS
  'Optional per-batch price override (e.g. manufacturer MRP changed on this delivery). NULL falls back to medicines.unit_price.';
