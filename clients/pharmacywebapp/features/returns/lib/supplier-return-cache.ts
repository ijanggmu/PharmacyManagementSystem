import type { QueryClient } from "@tanstack/react-query"

/** Query keys of supplier-return lists (the Returns > Supplier tab). */
export const supplierReturnsKeys = {
  all: ["supplier-returns"] as const,
  list: (supplierId: string, page: number, branchId?: string) =>
    [...supplierReturnsKeys.all, supplierId, page, branchId ?? ""] as const,
}

/**
 * Everything a posted supplier return (debit note) changes on screen: the returns lists, stock on every
 * medicine list/detail and its lots (goods left stock), and the supplier's payable, ledger, statement and
 * open bills (all under ["suppliers"]), plus the return form's own medicine picker.
 */
export const SUPPLIER_RETURN_AFFECTED_KEYS = [
  supplierReturnsKeys.all,
  ["medicines"],
  ["medicine-batches"],
  ["suppliers"],
  ["supplier-return-medicines"],
] as const

export async function invalidateAfterSupplierReturn(queryClient: Pick<QueryClient, "invalidateQueries">): Promise<void> {
  await Promise.all(SUPPLIER_RETURN_AFFECTED_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] })))
}
