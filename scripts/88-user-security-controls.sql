-- Users, Roles & Security controls, addressing the audit's Module 04 findings
-- (13 Aug 2026):
--   1. Removing an employee was a hard delete (DELETE FROM users) — any sale or
--      dispensing record they touched lost clean attribution the moment their row
--      was gone. Adds users.is_active; the day-to-day "remove this person" action
--      now deactivates instead of deleting, and login is blocked for inactive users
--      (mirrors the existing tenant.is_active gate in post-login-check).
--   2. Sale voids/edits and PO approvals were not written to audit_logs — fixed in
--      application code (app/api/sales/[id]/route.ts PATCH,
--      app/api/purchases/[id]/approve/route.ts), no schema change needed for that.
--   3. Branch-level sales visibility — fixed in application code
--      (resolveSalesBranchScope in lib/server/services/sales-service.ts), no schema
--      change needed for that either.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_users_tenant_active ON public.users(tenant_id, is_active);
