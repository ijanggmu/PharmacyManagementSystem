import { beforeEach, describe, expect, it, vi } from "vitest"

const { dotnetMutate, post } = vi.hoisted(() => ({
  dotnetMutate: vi.fn(async (..._args: unknown[]) => "id-1" as unknown),
  post: vi.fn(async (..._args: unknown[]) => "id-1" as unknown),
}))

vi.mock("@/lib/api/stock-dotnet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/stock-dotnet")>()),
  dotnetMutate,
}))

vi.mock("@/lib/api/dotnet-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/dotnet-client")>()
  return { ...original, dotnetClient: { ...original.dotnetClient, post } }
})

import { stockTransfersApi } from "./api-client-stock-transfers"
import { consignmentApi } from "./api-client-consignment"
import { expiredBatchesApi } from "./api-client-expired-batches"
import { catalogDotnetApi } from "@/lib/api/catalog-api"

/** The Idempotency-Key a stock write passed down: the last argument of the transport call. */
const keyOf = (mock: typeof dotnetMutate | typeof post) => mock.mock.calls[0]?.at(-1)

describe("stock writes carry the caller's Idempotency-Key", () => {
  beforeEach(() => {
    dotnetMutate.mockClear()
    post.mockClear()
  })

  it("stock transfers: dispatch, receive and cancel", async () => {
    await stockTransfersApi.create({ from_branch_id: "a", to_branch_id: "b", items: [{ medicine_id: "m", quantity: 1 }] }, "k-create")
    expect(keyOf(dotnetMutate)).toBe("k-create")
    dotnetMutate.mockClear()
    await stockTransfersApi.receive("t1", "k-receive")
    expect(keyOf(dotnetMutate)).toBe("k-receive")
    dotnetMutate.mockClear()
    await stockTransfersApi.cancel("t1", "wrong branch", "k-cancel")
    expect(keyOf(dotnetMutate)).toBe("k-cancel")
  })

  it("consignment: receive and settle", async () => {
    await consignmentApi.receive({ medicine_id: "m", supplier_id: "s", quantity: 1, unit_cost: 1 }, "k-recv")
    expect(keyOf(dotnetMutate)).toBe("k-recv")
    dotnetMutate.mockClear()
    dotnetMutate.mockResolvedValueOnce({ id: "set-1", totalAmount: 10 })
    await consignmentApi.settle("s", undefined, "k-settle")
    expect(keyOf(dotnetMutate)).toBe("k-settle")
  })

  it("expired batch disposal", async () => {
    await expiredBatchesApi.dispose("b1", "expired", "k-dispose")
    expect(keyOf(dotnetMutate)).toBe("k-dispose")
  })

  it("medicine writes: bulk import, restore, add stock, adjust, price schedule", async () => {
    post.mockResolvedValueOnce({ created: [] })
    await catalogDotnetApi.bulkCreateMedicines([], "k-bulk")
    expect(keyOf(post)).toBe("k-bulk")
    post.mockClear()
    await catalogDotnetApi.restoreMedicine("m1", "k-restore")
    expect(keyOf(post)).toBe("k-restore")
    post.mockClear()
    await catalogDotnetApi.addMedicineStock("m1", {} as Parameters<typeof catalogDotnetApi.addMedicineStock>[1], "k-stock")
    expect(keyOf(post)).toBe("k-stock")
    post.mockClear()
    await catalogDotnetApi.adjustBatchQuantity("b1", 3, "count", "k-adjust")
    expect(keyOf(post)).toBe("k-adjust")
    post.mockClear()
    await catalogDotnetApi.schedulePriceChange("m1", { unit_price: 10, effective_from: "2026-10-12" }, "k-price")
    expect(keyOf(post)).toBe("k-price")
  })
})
