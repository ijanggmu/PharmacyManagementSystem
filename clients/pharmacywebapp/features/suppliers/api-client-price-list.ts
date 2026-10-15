import {
  supplierPriceListDotnetApi,
  type SupplierPrice,
  type SupplierPriceListInput,
  type SupplierPriceListItem,
} from "@/lib/api/suppliers-api"
import { newIdempotencyKey } from "@/lib/api/idempotency"
import { stockErrorMessage } from "@/lib/api/stock-dotnet"

export type { SupplierPrice, SupplierPriceListInput, SupplierPriceListItem }

/** SuppliersPermissions.PriceLists (Manager/Admin manage, Accountant views). */
export const SUPPLIER_PRICE_LIST_PERMISSIONS = {
  view: "Permissions.Suppliers.PriceLists.View",
  manage: "Permissions.Suppliers.PriceLists.Manage",
} as const

export function supplierPriceListAccess(granted: readonly string[], isRoot = false): { canView: boolean; canManage: boolean } {
  const canManage = isRoot || granted.includes(SUPPLIER_PRICE_LIST_PERMISSIONS.manage)
  return { canView: canManage || granted.includes(SUPPLIER_PRICE_LIST_PERMISSIONS.view), canManage }
}

/** Supplier price lists (agreed purchase price per medicine). Errors come back as messages, not throws. */
export const supplierPriceListApi = {
  /** Every active row of the supplier, grouped by medicine (newest start first within one). */
  async list(supplierId: string): Promise<{ data: SupplierPriceListItem[]; error: string | null }> {
    try {
      return { data: await supplierPriceListDotnetApi.listAll(supplierId), error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to load the price list") }
    }
  },

  /**
   * Add (no `input.id`) or edit one row. `idempotencyKey`: one per save the user submits, reused when that same
   * save is retried, so a retried PUT cannot add the row twice. A fresh key is used when none is given.
   */
  async save(
    supplierId: string,
    input: SupplierPriceListInput,
    idempotencyKey: string = newIdempotencyKey(),
  ): Promise<{ data: { id: string } | null; error: string | null }> {
    try {
      const id = await supplierPriceListDotnetApi.upsert(supplierId, input, idempotencyKey)
      return { data: { id }, error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to save the price") }
    }
  },

  async remove(
    supplierId: string,
    itemId: string,
    idempotencyKey: string = newIdempotencyKey(),
  ): Promise<{ error: string | null }> {
    try {
      await supplierPriceListDotnetApi.remove(supplierId, itemId, idempotencyKey)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to remove the price") }
    }
  },

  /** The supplier's price valid on `asOf` ("YYYY-MM-DD") for each medicine; those without one are absent. */
  async lookup(
    supplierId: string,
    medicineIds: readonly string[],
    asOf?: string,
  ): Promise<{ data: SupplierPrice[]; error: string | null }> {
    if (!supplierId || medicineIds.filter(Boolean).length === 0) return { data: [], error: null }
    try {
      return { data: await supplierPriceListDotnetApi.lookup(supplierId, medicineIds, asOf), error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to load supplier prices") }
    }
  },
}
