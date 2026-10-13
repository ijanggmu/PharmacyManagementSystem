import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get: (path: string) => get(path) },
}))

import {
  mergeSupplierOptions,
  supplierLookupQuery,
  suppliersDotnetApi,
  suppliersListQuery,
  toSupplierOption,
  type DotnetSupplierDto,
} from "@/lib/api/suppliers-api"
import { resolveSupplierOptions, supplierOptionKeys } from "@/features/suppliers/hooks/use-supplier-options"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"

function dto(id: string, name: string): DotnetSupplierDto {
  return {
    id,
    name,
    contactPerson: null,
    phone: null,
    email: null,
    address: null,
    taxId: null,
    currentBalance: 0,
    isActive: true,
    createdAtUtc: "2026-01-01T00:00:00Z",
    updatedAtUtc: null,
  }
}

function pageParam(path: string, key: string): string | null {
  return new URLSearchParams(path.split("?")[1] ?? "").get(key)
}

beforeEach(() => {
  get.mockReset()
})

describe("supplierLookupQuery", () => {
  it("builds the lookup path with search, inactive flag and a bounded limit", () => {
    expect(supplierLookupQuery()).toBe("/api/v1/suppliers/lookup")
    const path = supplierLookupQuery({ search: "  himal ", includeInactive: true, limit: 5000 })
    expect(path.startsWith("/api/v1/suppliers/lookup?")).toBe(true)
    expect(pageParam(path, "search")).toBe("himal")
    expect(pageParam(path, "includeInactive")).toBe("true")
    expect(pageParam(path, "limit")).toBe("1000")
    expect(pageParam(supplierLookupQuery({ limit: 0 }), "limit")).toBe("1")
  })
})

describe("toSupplierOption / mergeSupplierOptions", () => {
  it("maps the lookup row", () => {
    expect(toSupplierOption({ id: "s1", name: "Himal", phone: "980", isActive: false })).toEqual({
      id: "s1",
      name: "Himal",
      phone: "980",
      is_active: false,
      credit_days: null,
    })
  })

  it("unions by id (first wins) and sorts by name", () => {
    const a = [{ id: "2", name: "Zeta", phone: null, is_active: true }]
    const b = [
      { id: "1", name: "Alpha", phone: null, is_active: true },
      { id: "2", name: "Zeta (stale)", phone: null, is_active: true },
    ]
    expect(mergeSupplierOptions(a, undefined, b).map((s) => s.name)).toEqual(["Alpha", "Zeta"])
  })
})

describe("suppliersListQuery", () => {
  it("never asks for more than the server's 200-row page cap", () => {
    expect(pageParam(suppliersListQuery({ limit: 1000 }), "pageSize")).toBe("200")
    expect(pageParam(suppliersListQuery({ limit: 50 }), "pageSize")).toBe("50")
  })
})

describe("suppliersDotnetApi.list / listAll", () => {
  it("walks the pages when a caller asks for more than 200 rows, and trims to the limit", async () => {
    get.mockImplementation((path: string) => {
      const page = Number(pageParam(path, "pageNumber"))
      expect(pageParam(path, "pageSize")).toBe("200")
      const items = page === 1 ? [dto("1", "A"), dto("2", "B")] : [dto("3", "C")]
      return Promise.resolve({ items, pageNumber: page, pageSize: 200, totalCount: 3, totalPages: 2 })
    })

    const res = await suppliersDotnetApi.list({ limit: 2 + 500 })
    expect(get).toHaveBeenCalledTimes(2)
    expect(res.data.map((s) => s.id)).toEqual(["1", "2", "3"])
    expect(res.total).toBe(3)

    get.mockClear()
    const trimmed = await suppliersDotnetApi.list({ limit: 250 })
    expect(trimmed.data).toHaveLength(3)
  })

  it("makes a single request for a normal page", async () => {
    get.mockResolvedValue({ items: [dto("1", "A")], pageNumber: 1, pageSize: 50, totalCount: 1, totalPages: 1 })
    const res = await suppliersDotnetApi.list({ limit: 50 })
    expect(get).toHaveBeenCalledTimes(1)
    expect(res.data[0].name).toBe("A")
  })

  it("lookup maps the rows from the lookup endpoint", async () => {
    get.mockResolvedValue([{ id: "s1", name: "Himal", phone: null, isActive: true }])
    const rows = await suppliersDotnetApi.lookup({ search: "him" })
    expect(get).toHaveBeenCalledWith("/api/v1/suppliers/lookup?search=him")
    expect(rows).toEqual([{ id: "s1", name: "Himal", phone: null, is_active: true, credit_days: null }])
  })
})

describe("useSupplierOptions helpers", () => {
  const initial = [
    { id: "1", name: "Himal Pharma", phone: "9800", is_active: true },
    { id: "2", name: "Nepal Drug", phone: null, is_active: true },
  ]

  it("shows the initial list without a search term", () => {
    expect(resolveSupplierOptions(initial, undefined, "  ").map((s) => s.id)).toEqual(["1", "2"])
  })

  it("shows the server matches for a search term", () => {
    const searched = [{ id: "9", name: "Nepal Pharma House", phone: null, is_active: true }]
    expect(resolveSupplierOptions(initial, searched, "nepal").map((s) => s.id)).toEqual(["9"])
  })

  it("filters the initial list locally while the first search is in flight", () => {
    expect(resolveSupplierOptions(initial, undefined, "9800").map((s) => s.id)).toEqual(["1"])
  })

  it("keys sit under the supplier list keys so supplier mutations refresh the pickers", () => {
    expect(supplierOptionKeys.list(false, "").slice(0, 2)).toEqual([...supplierKeys.lists()])
  })
})
