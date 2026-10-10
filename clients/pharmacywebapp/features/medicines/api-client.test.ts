import { describe, expect, it } from "vitest"
import { medicineListQueryFrom, toMedicineBatch } from "@/features/medicines/api-client"
import { medicineListPath } from "@/lib/api/catalog-api"

describe("medicineListQueryFrom", () => {
  it("maps every inventory-table filter onto the .NET query", () => {
    const query = medicineListQueryFrom(
      {
        search: "  para ",
        categoryIds: ["c1", "c2"],
        supplierId: "s1",
        stockStatuses: ["low", "out"],
        expiryStatuses: ["expired"],
        includeArchived: true,
        sortBy: "quantity",
        sortOrder: "desc",
      },
      3,
      20
    )

    expect(query).toEqual({
      search: "para",
      categoryId: undefined,
      categoryIds: ["c1", "c2"],
      supplierId: "s1",
      stockStatuses: ["low", "out"],
      expiryStatuses: ["expired"],
      includeArchived: true,
      sortBy: "quantity",
      sortOrder: "desc",
      pageNumber: 3,
      pageSize: 20,
    })
  })

  it("drops the 'all' sentinels instead of sending them to the server", () => {
    const query = medicineListQueryFrom(
      { category: "all", categoryIds: ["all"], supplierId: "all", stockStatus: "all", expiryStatus: "all" },
      1,
      10
    )

    expect(query.categoryId).toBeUndefined()
    expect(query.categoryIds).toBeUndefined()
    expect(query.supplierId).toBeUndefined()
    expect(query.stockStatuses).toEqual([])
    expect(query.expiryStatuses).toEqual([])
  })

  it("ignores sort fields the endpoint does not accept", () => {
    const query = medicineListQueryFrom({ sortBy: "created_at", sortOrder: "desc" }, 1, 10)

    expect(query.sortBy).toBeUndefined()
    expect(query.sortOrder).toBeUndefined()
  })

  it("serializes to the parameter names SearchMedicinesEndpoint binds", () => {
    const path = medicineListPath(
      medicineListQueryFrom(
        { search: "amox", categoryIds: ["c1"], supplierId: "s1", stockStatuses: ["low", "out"], sortBy: "expiry", sortOrder: "asc" },
        2,
        50
      )
    )
    const params = new URL(path, "http://x").searchParams

    expect(params.get("search")).toBe("amox")
    expect(params.getAll("categoryIds")).toEqual(["c1"])
    expect(params.get("supplierId")).toBe("s1")
    expect(params.getAll("stockStatuses")).toEqual(["low", "out"])
    expect(params.get("sortBy")).toBe("expiry")
    expect(params.get("sortOrder")).toBe("asc")
    expect(params.get("pageNumber")).toBe("2")
    expect(params.get("pageSize")).toBe("50")
  })

  it("sends belowReorderLevel only when it is on", () => {
    const on = new URL(medicineListPath(medicineListQueryFrom({ belowReorderLevel: true }, 1, 10)), "http://x").searchParams
    expect(on.get("belowReorderLevel")).toBe("true")
    const off = new URL(medicineListPath(medicineListQueryFrom({ belowReorderLevel: false }, 1, 10)), "http://x").searchParams
    expect(off.has("belowReorderLevel")).toBe(false)
  })
})

describe("toMedicineBatch", () => {
  it("carries the lot cost, disposed flag and no-expiry as null", () => {
    const batch = toMedicineBatch({
      id: "b1",
      medicineId: "m1",
      medicineName: "Paracetamol",
      branchId: "br1",
      batchNo: "B-1",
      expiryDate: "9999-12-31",
      quantityOnHand: 4,
      costPrice: 2.5,
      sellingPrice: 4,
      rackLocation: "A1",
      isDisposed: true,
      createdAtUtc: "2026-10-01T00:00:00Z",
      updatedAtUtc: "2026-10-02T00:00:00Z",
      isRecalled: false,
      recalledAtUtc: null,
      recallReason: null,
      branchName: "Main",
      receivedQuantity: 10,
    })
    expect(batch).toMatchObject({
      batch_number: "B-1",
      expiry_date: null,
      cost_price: 2.5,
      is_disposed: true,
      quantity_received: 10,
      quantity_remaining: 4,
      updated_at: "2026-10-02T00:00:00Z",
      branches: { id: "br1", name: "Main", code: "" },
    })
  })
})
