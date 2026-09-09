-- Rack/bin/shelf location per batch (2026-09 ERP audit, item #10 follow-up).
--
-- Location is tracked per BATCH, not per medicine: two batches of the same
-- medicine (old delivery vs. new) commonly sit in different physical spots —
-- front-of-shelf for stock being sold down, further back for a fresh delivery
-- — so a medicine-level field would be wrong the moment a second batch arrives.
--
-- Free text rather than a structured rack/aisle/shelf breakdown: pharmacies
-- label storage locations very differently ("Rack 3", "A-12", "Fridge 2"), and
-- a rigid schema would force a taxonomy nobody asked for. Kept short (VARCHAR)
-- since it's meant to be glanced at next to a batch row, not a full address.

ALTER TABLE public.medicine_batches
  ADD COLUMN IF NOT EXISTS rack_location VARCHAR(60);

COMMENT ON COLUMN public.medicine_batches.rack_location IS
  'Free-text shelf/rack/bin label for where this specific batch is physically stored (e.g. "Rack 3", "Fridge 2"). Optional, per-batch since two batches of the same medicine can sit in different spots.';
