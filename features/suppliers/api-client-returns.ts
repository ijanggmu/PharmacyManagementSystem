import { apiPost, getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { suppliersDotnetApi } from "@/lib/api/suppliers-api"

/** One key per submit, so a retried POST cannot record the return twice on the .NET side. */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface CreateSupplierReturnInput {
  supplier_id: string
  notes?: string
  items: Array<{
    medicine_id: string
    quantity: number
    unit_cost: number
    return_reason: string
    notes?: string
  }>
}

export const supplierReturnsApi = {
  async create(input: CreateSupplierReturnInput): Promise<{ data: unknown | null; error: string | null }> {
    try {
      if (backendTarget("SUPPLIERS") === "dotnet") {
        const data = await suppliersDotnetApi.createReturn(input, newIdempotencyKey())
        return { data, error: null }
      }
      const token = await getCSRFToken()
      const data = await apiPost("/api/supplier-returns", input, token)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to create supplier return",
      }
    }
  },
}

