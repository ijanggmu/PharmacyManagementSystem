-- Drop tables with zero code paths anywhere in the app (no .from() call, no RPC/trigger
-- writer). Confirmed via full-repo grep across app/, lib/, features/, components/.
--
-- warehouses / warehouse_stock / stock_transfers (scripts/10-create-warehouses.sql):
--   an old multi-location design, superseded by branches (scripts/36) and
--   medicine_branch_stock (scripts/67-branch-scoped-stock.sql), which is the table
--   that actually backs per-location stock today.
--
-- medicine_batches / batch_allocations (scripts/11-create-medicine-batches.sql):
--   a batch/expiry tracking design that was never wired into any receiving, sale, or
--   adjustment code path — nothing ever inserts a row. (Real FEFO/batch tracking is
--   still a planned feature; when it's built, prefer a fresh migration over resurrecting
--   this one, since its shape was never validated against a real receiving flow.)
--
-- serial_numbers (scripts/12-create-serial-numbers.sql): unused serialized-item
-- tracking, never referenced outside its own creation script.
--
-- The system-health diagnostics pings that referenced warehouses/medicine_batches were
-- updated (lib/server/services/system-diagnostics-service.ts) to check
-- medicine_branch_stock instead, before this migration ran.

DROP TABLE IF EXISTS public.stock_transfers CASCADE;
DROP TABLE IF EXISTS public.warehouse_stock CASCADE;
DROP TABLE IF EXISTS public.warehouses CASCADE;
DROP TABLE IF EXISTS public.batch_allocations CASCADE;
DROP TABLE IF EXISTS public.medicine_batches CASCADE;
DROP TABLE IF EXISTS public.serial_numbers CASCADE;
