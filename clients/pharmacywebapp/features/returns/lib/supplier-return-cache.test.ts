import { describe, expect, it, vi } from "vitest"
import { invalidateAfterSupplierReturn, supplierReturnsKeys } from "@/features/returns/lib/supplier-return-cache"

describe("invalidateAfterSupplierReturn", () => {
  it("refreshes supplier returns, medicines (stock + lots) and suppliers (payable, ledger)", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)

    await invalidateAfterSupplierReturn({ invalidateQueries })

    const keys = invalidateQueries.mock.calls.map(([arg]) => (arg as { queryKey: unknown[] }).queryKey)
    expect(keys).toEqual(
      expect.arrayContaining([[...supplierReturnsKeys.all], ["medicines"], ["medicine-batches"], ["suppliers"]]),
    )
  })
})
