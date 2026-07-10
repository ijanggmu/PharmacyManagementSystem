/**
 * Server-only bulk operations persistence. Used by `app/api/bulk-operations/route.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export const ALLOWED_BULK_ENTITIES = new Set(["medicines", "customers", "prescriptions", "suppliers"])

export type BulkEntityType = "medicines" | "customers" | "prescriptions" | "suppliers"

export async function bulkDeleteEntities(
  supabase: SupabaseClient,
  entityType: string,
  ids: string[]
): Promise<{ affected: number; error: Error | null }> {
  const { error } = await supabase.from(entityType).delete().in("id", ids)
  if (error) {
    return { affected: 0, error: new Error(error.message) }
  }
  return { affected: ids.length, error: null }
}

export async function bulkUpdateStatus(
  supabase: SupabaseClient,
  entityType: string,
  ids: string[],
  status: string
): Promise<{ affected: number; error: Error | null }> {
  const updateData: Record<string, unknown> = {}
  if (entityType === "prescriptions") updateData.status = status
  if (entityType === "medicines") updateData.prescription_required = status === "prescription_required"

  const { error } = await supabase.from(entityType).update(updateData).in("id", ids)
  if (error) {
    return { affected: 0, error: new Error(error.message) }
  }
  return { affected: ids.length, error: null }
}

export async function bulkExportEntities(
  supabase: SupabaseClient,
  entityType: string,
  ids: string[]
): Promise<{ rows: Record<string, unknown>[]; error: Error | null }> {
  const { data, error } = await supabase.from(entityType).select("*").in("id", ids)
  if (error) {
    return { rows: [], error: new Error(error.message) }
  }
  return { rows: (data as Record<string, unknown>[]) || [], error: null }
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0]).join(",")
  const contentRows = rows
    .map((row) =>
      Object.values(row)
        .map((value) => (typeof value === "string" ? `"${value.replace(/"/g, '""')}"` : String(value ?? "")))
        .join(",")
    )
    .join("\n")
  return `${headers}\n${contentRows}`
}
