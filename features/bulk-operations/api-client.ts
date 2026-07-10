import { apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export type BulkEntityType = "medicines" | "customers" | "prescriptions" | "suppliers"

export const bulkOperationsApi = {
  async delete(entityType: BulkEntityType, ids: string[]) {
    const token = await getCSRFToken()
    return apiPost<{ affected: number }>("/api/bulk-operations", { entityType, ids, operation: "delete" }, token)
  },
  async updateStatus(entityType: BulkEntityType, ids: string[], status: string) {
    const token = await getCSRFToken()
    return apiPost<{ affected: number }>(
      "/api/bulk-operations",
      { entityType, ids, status, operation: "status_update" },
      token
    )
  },
  async export(entityType: BulkEntityType, ids: string[], format: "csv" | "json") {
    const token = await getCSRFToken()
    return apiPost<{ rows?: Record<string, unknown>[]; csv?: string }>(
      "/api/bulk-operations",
      { entityType, ids, format, operation: "export" },
      token
    )
  },
}

