import type { DotnetSupplierReturnDto, SupplierReturnInput, SupplierReturnsFilters } from "@/lib/api/suppliers-api"
import { suppliersDotnetApi } from "@/lib/api/suppliers-api"
import { newIdempotencyKey } from "@/lib/api/idempotency"

export type CreateSupplierReturnInput = SupplierReturnInput

export interface SupplierReturnListResult {
  data: DotnetSupplierReturnDto[]
  total: number
  error: string | null
}

export interface SupplierReturnGetResult {
  data: DotnetSupplierReturnDto | null
  error: string | null
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export const supplierReturnsApi = {
  /**
   * `idempotencyKey`: one per return the user submits, reused when that same return is retried, so a
   * retried POST cannot record it twice. A fresh key is used when none is given.
   */
  async create(
    input: CreateSupplierReturnInput,
    idempotencyKey: string = newIdempotencyKey(),
  ): Promise<{ data: { id: string } | null; error: string | null }> {
    try {
      const data = await suppliersDotnetApi.createReturn(input, idempotencyKey)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: errorMessage(error, "Failed to create supplier return"),
      }
    }
  },

  /**
   * Paged, newest first. A supplier return is final the moment it's created — stock and the AP
   * ledger are both updated synchronously in CreateSupplierReturnCommandHandler, mirroring legacy's
   * createSupplierReturnForTenant (always inserted with status: "completed"). There is no
   * pending/approve/process step to wire up on either side, so no such action exists here.
   */
  /** Empty supplierId lists debit notes across every supplier. */
  async list(supplierId: string, filters?: SupplierReturnsFilters): Promise<SupplierReturnListResult> {
    try {
      const page = await suppliersDotnetApi.listReturns(supplierId, filters)
      return { data: page.items, total: page.totalCount, error: null }
    } catch (error) {
      return { data: [], total: 0, error: errorMessage(error, "Failed to fetch supplier returns") }
    }
  },

  async get(returnId: string): Promise<SupplierReturnGetResult> {
    try {
      const data = await suppliersDotnetApi.getReturn(returnId)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: errorMessage(error, "Failed to fetch supplier return") }
    }
  },
}
