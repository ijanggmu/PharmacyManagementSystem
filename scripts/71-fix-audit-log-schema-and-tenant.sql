-- Fix: createAuditLog() has been inserting an `access_type` value that has never
-- existed as a column on audit_logs — every single audit log insert in the app's
-- history has been silently failing (the error is caught and only console.log'd).
-- On top of that, the insert never set tenant_id, so even if it had succeeded, the
-- row would be invisible to the tenant-scoped audit log viewer (GET /api/reports/audit-logs
-- filters .eq("tenant_id", tenantId)).
--
-- This adds the missing column so the app-layer fix (lib/security/audit.ts) actually
-- persists rows, and backfills nothing (there is nothing to backfill — no rows were
-- ever successfully written).

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS access_type VARCHAR(20) CHECK (access_type IN ('read', 'write', 'delete'));

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs (tenant_id);
