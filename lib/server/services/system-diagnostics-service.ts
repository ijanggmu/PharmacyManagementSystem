/**
 * Server-only diagnostics persistence for `app/api/system/migration-status` and
 * `app/api/system-health` Route Handlers.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface AppliedMigrationRecord {
  migration_name: string
  applied_at: string
  executed_by: string | null
}

export interface MigrationStatus {
  appliedMigrations: AppliedMigrationRecord[]
  schemaChecks: Record<string, boolean>
}

export async function getMigrationStatus(
  supabase: SupabaseClient
): Promise<{ data: MigrationStatus; error: Error | null }> {
  const { data: appliedMigrations } = await supabase
    .from("schema_migrations")
    .select("migration_name, applied_at, executed_by")

  const hasColumn = async (column: string) => {
    const { error } = await supabase.from("medicines").select(column).limit(1)
    return !error
  }

  const checks: Record<string, boolean> = {}
  checks.is_taxable = await hasColumn("is_taxable")
  checks.controlled_substance = await hasColumn("controlled_substance")
  checks.audit_logs = !(await supabase.from("audit_logs").select("id").limit(1)).error
  checks.medicine_branch_stock = !(await supabase.from("medicine_branch_stock").select("id").limit(1)).error
  checks.notifications = !(await supabase.from("notifications").select("id").limit(1)).error
  checks.system_settings = !(await supabase.from("system_settings").select("id").limit(1)).error

  return {
    data: {
      appliedMigrations: (appliedMigrations as AppliedMigrationRecord[]) || [],
      schemaChecks: checks,
    },
    error: null,
  }
}

export interface IrdQueueRow {
  id: string
  last_error: string | null
  created_at: string
}

export interface SystemHealth {
  ird: {
    pendingCount: number
    failedCount: number
    recentFailed: { id: string; last_error: string | null; created_at: string }[]
    salesFailedCount: number
  }
}

export async function getSystemHealthForTenant(
  supabase: SupabaseClient,
  tenantId: string | undefined
): Promise<{ data: SystemHealth; error: Error | null }> {
  const [{ data: irdPending }, { data: irdFailed }, { data: salesFailed }] = await Promise.all([
    supabase
      .from("ird_invoice_queue")
      .select("id, last_error, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("ird_invoice_queue")
      .select("id, last_error, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sales")
      .select("id, invoice_number, ird_status, ird_error, ird_synced_at")
      .eq("tenant_id", tenantId)
      .eq("ird_status", "failed")
      .order("sale_date", { ascending: false })
      .limit(50),
  ])

  const failedRows = (irdFailed as IrdQueueRow[] | null) || []

  return {
    data: {
      ird: {
        pendingCount: irdPending?.length ?? 0,
        failedCount: irdFailed?.length ?? 0,
        recentFailed: failedRows.slice(0, 5).map((row) => ({
          id: row.id,
          last_error: row.last_error,
          created_at: row.created_at,
        })),
        salesFailedCount: salesFailed?.length ?? 0,
      },
    },
    error: null,
  }
}
