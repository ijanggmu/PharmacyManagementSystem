import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
const put = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api/dotnet-client", () => ({
  DotnetApiError: class DotnetApiError extends Error {},
  dotnetClient: {
    get: (path: string) => get(path),
    put: (path: string, body: unknown, headers?: Record<string, string>) => put(path, body, headers),
    delete: (path: string, headers?: Record<string, string>) => del(path, headers),
  },
}))

import {
  packCost,
  perUnitCost,
  priceListRate,
  supplierPriceListDotnetApi,
  supplierPriceListItemPath,
  supplierPriceListPath,
  supplierPriceListUpsertBody,
  supplierPricesLookupQuery,
  toSupplierPriceListItem,
  SUPPLIER_PRICE_LOOKUP_MAX_IDS,
  type DotnetSupplierPriceListItemDto,
} from "@/lib/api/suppliers-api"
import { supplierPriceListAccess, supplierPriceListApi } from "@/features/suppliers/api-client-price-list"
import { applyPriceListRates, priceListRateFor } from "@/features/purchases/lib/price-list-prefill"
import { buildLowStockLines, suggestReorderQuantity } from "@/features/purchases/low-stock"

const itemDto: DotnetSupplierPriceListItemDto = {
  id: "i1",
  supplierId: "s1",
  medicineId: "m1",
  medicineName: "Cetamol 500mg",
  unitsPerPack: 10,
  unitCost: 1.25,
  minOrderQuantity: null,
  validFrom: "2026-10-01",
  validTo: null,
  notes: null,
  isActive: true,
  createdAtUtc: "2026-10-01T00:00:00Z",
  updatedAtUtc: null,
}

beforeEach(() => {
  get.mockReset()
  put.mockReset()
  del.mockReset()
})

describe("price-list paths and mapping", () => {
  it("builds list, item and lookup paths", () => {
    expect(supplierPriceListPath("s 1")).toBe("/api/v1/suppliers/s%201/price-list")
    expect(supplierPriceListPath("s1", { activeOn: "2026-10-15", includeInactive: true, page: 2, pageSize: 500 })).toBe(
      "/api/v1/suppliers/s1/price-list?activeOn=2026-10-15&includeInactive=true&pageNumber=2&pageSize=100",
    )
    expect(supplierPriceListItemPath("s1", "i1")).toBe("/api/v1/suppliers/s1/price-list/i1")
    expect(supplierPricesLookupQuery("s1", ["m1", "m2", "m1", ""], "2026-10-15")).toBe(
      "/api/v1/suppliers/price-lists/lookup?supplierId=s1&medicineIds=m1&medicineIds=m2&asOf=2026-10-15",
    )
  })

  it("maps the DTO and builds the upsert body", () => {
    expect(toSupplierPriceListItem(itemDto)).toMatchObject({
      id: "i1",
      medicine_name: "Cetamol 500mg",
      units_per_pack: 10,
      unit_cost: 1.25,
      valid_from: "2026-10-01",
      valid_to: null,
    })
    expect(
      supplierPriceListUpsertBody({ medicine_id: "m1", unit_cost: 1.5, valid_from: "2026-10-01", valid_to: "", notes: "  " }),
    ).toEqual({
      itemId: null,
      medicineId: "m1",
      unitCost: 1.5,
      minOrderQuantity: null,
      validFrom: "2026-10-01",
      validTo: null,
      notes: null,
    })
  })
})

describe("unit / pack conversion", () => {
  it("converts a pack price to per unit and back", () => {
    expect(perUnitCost(125, true, 10)).toBe(12.5)
    expect(perUnitCost(10, true, 3)).toBe(3.3333)
    expect(perUnitCost(12.5, false, 10)).toBe(12.5)
    // No pack size: the amount is already per unit.
    expect(perUnitCost(12.5, true, null)).toBe(12.5)
    expect(packCost(1.25, 10)).toBe(12.5)
    expect(packCost(1.25, 1)).toBeNull()
  })

  it("formats the order rate with 2 to 4 decimals, per pack when the line is in packs", () => {
    expect(priceListRate(1.25, false, 10)).toBe("1.25")
    expect(priceListRate(1.25, true, 10)).toBe("12.50")
    expect(priceListRate(0.1234, false, null)).toBe("0.1234")
    expect(priceListRate(0.123, false, null)).toBe("0.123")
    expect(priceListRate(7, true, null)).toBe("7.00")
  })
})

describe("api calls", () => {
  it("sends the idempotency key on save and remove", async () => {
    put.mockResolvedValue("i9")
    del.mockResolvedValue(undefined)

    const saved = await supplierPriceListApi.save("s1", { medicine_id: "m1", unit_cost: 2, valid_from: "2026-10-01" }, "key-1")
    const removed = await supplierPriceListApi.remove("s1", "i9", "key-2")

    expect(saved).toEqual({ data: { id: "i9" }, error: null })
    expect(put).toHaveBeenCalledWith("/api/v1/suppliers/s1/price-list", expect.objectContaining({ unitCost: 2 }), {
      "Idempotency-Key": "key-1",
    })
    expect(removed.error).toBeNull()
    expect(del).toHaveBeenCalledWith("/api/v1/suppliers/s1/price-list/i9", { "Idempotency-Key": "key-2" })
  })

  it("walks every page of the price list", async () => {
    get
      .mockResolvedValueOnce({ items: [itemDto], totalCount: 2, totalPages: 2 })
      .mockResolvedValueOnce({ items: [{ ...itemDto, id: "i2" }], totalCount: 2, totalPages: 2 })

    const rows = await supplierPriceListDotnetApi.listAll("s1")

    expect(rows.map((r) => r.id)).toEqual(["i1", "i2"])
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/suppliers/s1/price-list?pageNumber=2&pageSize=100")
  })

  it("skips the lookup with no medicines and batches past the server cap", async () => {
    expect(await supplierPriceListApi.lookup("s1", [])).toEqual({ data: [], error: null })
    expect(get).not.toHaveBeenCalled()

    get.mockResolvedValue([])
    const ids = Array.from({ length: SUPPLIER_PRICE_LOOKUP_MAX_IDS + 1 }, (_, i) => `m${i}`)
    await supplierPriceListApi.lookup("s1", ids, "2026-10-15")
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("returns the error message instead of throwing", async () => {
    get.mockRejectedValue(new Error("boom"))
    const res = await supplierPriceListApi.lookup("s1", ["m1"])
    expect(res.data).toEqual([])
    expect(res.error).toBeTruthy()
  })
})

describe("permissions", () => {
  it("manage implies view; root manages", () => {
    expect(supplierPriceListAccess([])).toEqual({ canView: false, canManage: false })
    expect(supplierPriceListAccess(["Permissions.Suppliers.PriceLists.View"])).toEqual({ canView: true, canManage: false })
    expect(supplierPriceListAccess(["Permissions.Suppliers.PriceLists.Manage"])).toEqual({ canView: true, canManage: true })
    expect(supplierPriceListAccess([], true)).toEqual({ canView: true, canManage: true })
  })
})

describe("purchase-order prefill", () => {
  const prices = new Map([["m1", { unit_cost: 1.25 }]])
  const packs = (id: string) => (id === "m1" ? 10 : null)
  const line = (patch: Partial<{ id: string; medicine_id: string; unit_cost: string; in_packs: boolean }> = {}) => ({
    id: "l1",
    medicine_id: "m1",
    unit_cost: "0",
    in_packs: false,
    ...patch,
  })

  it("fills an untyped line per unit or per pack", () => {
    expect(priceListRateFor(line(), prices, 10, new Set())).toBe("1.25")
    expect(priceListRateFor(line({ in_packs: true }), prices, 10, new Set())).toBe("12.50")
    expect(applyPriceListRates([line()], prices, packs, new Set())[0].unit_cost).toBe("1.25")
  })

  it("never overwrites a typed rate, and leaves lines without a price alone", () => {
    const typed = [line({ unit_cost: "9" })]
    expect(applyPriceListRates(typed, prices, packs, new Set(["l1"]))).toBe(typed)
    const unpriced = [line({ medicine_id: "m2", unit_cost: "3" }), line({ id: "l2", medicine_id: "" })]
    expect(applyPriceListRates(unpriced, prices, packs, new Set())).toBe(unpriced)
    expect(applyPriceListRates(unpriced, undefined, packs, new Set())).toBe(unpriced)
  })

  it("low-stock lines already carry the suggested reorder quantity", () => {
    const [suggested] = buildLowStockLines([
      { id: "m1", name: "Cetamol", supplier_id: "s1", stock_quantity: 3, minimum_stock: 10, maximum_stock: 50, cost_price: "1" },
    ])
    expect(suggested.quantity_ordered).toBe(suggestReorderQuantity({ onHand: 3, reorderLevel: 10, maximumStock: 50 }))
    expect(suggested.quantity_ordered).toBe(47)
  })
})
