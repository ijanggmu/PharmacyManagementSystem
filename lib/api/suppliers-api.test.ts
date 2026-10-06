import { describe, expect, it } from "vitest"
import {
  INCOMPLETE_PROFILE_UNSUPPORTED,
  supplierCreateBody,
  supplierUpdateBody,
  suppliersListQuery,
  toSupplier,
  toSuppliersResponse,
  type DotnetSupplierDto,
} from "@/lib/api/suppliers-api"

const stored: DotnetSupplierDto = {
  id: "s1",
  name: "Himalayan Pharma",
  contactPerson: "Ram",
  phone: "01-4000000",
  email: "sales@himalayan.example",
  address: "Lalitpur",
  taxId: "PAN-123",
  currentBalance: 2500,
  isActive: true,
  createdAtUtc: "2026-01-10T09:00:00Z",
  updatedAtUtc: null,
}

describe("toSupplier", () => {
  it("maps a positive balance to payable", () => {
    const s = toSupplier(stored)
    expect(s.payable_amount).toBe(2500)
    expect(s.receivable_amount).toBe(0)
    expect(s.contact_person).toBe("Ram")
    expect(s.reconciliation_account_ref).toBeNull()
  })

  it("maps a negative balance to receivable (they owe us)", () => {
    const s = toSupplier({ ...stored, currentBalance: -400 })
    expect(s.payable_amount).toBe(0)
    expect(s.receivable_amount).toBe(400)
  })
})

describe("suppliersListQuery", () => {
  it("translates filters to .NET paging and the active flag", () => {
    expect(
      suppliersListQuery({ search: " himal ", status: "active", page: 1, limit: 20, sortBy: "name", sortOrder: "asc" }),
    ).toBe("/api/v1/suppliers?search=himal&pageNumber=1&pageSize=20&sortBy=name&sortDir=asc&isActive=true")
  })

  it("sends no status filter for 'all'", () => {
    expect(suppliersListQuery({ status: "all" })).toBe("/api/v1/suppliers")
  })

  it("rejects the incomplete-profile filter, which has no .NET equivalent", () => {
    expect(() => suppliersListQuery({ status: "incomplete" })).toThrow(INCOMPLETE_PROFILE_UNSUPPORTED)
  })
})

describe("toSuppliersResponse", () => {
  it("maps items and totals", () => {
    const res = toSuppliersResponse({ items: [stored], pageNumber: 1, pageSize: 50, totalCount: 7, totalPages: 1 })
    expect(res).toEqual({ data: [toSupplier(stored)], error: null, total: 7 })
  })
})

describe("supplierCreateBody", () => {
  it("trims the name and nulls empty optional fields", () => {
    expect(
      supplierCreateBody({ name: " Nepal Drugs ", contact_person: "", phone: "9800000001", email: undefined, address: "" }),
    ).toEqual({
      name: "Nepal Drugs",
      contactPerson: null,
      phone: "9800000001",
      email: null,
      address: null,
      taxId: null,
      openingBalance: 0,
    })
  })
})

describe("supplierUpdateBody", () => {
  it("keeps stored values for fields absent from the update and preserves tax id and active state", () => {
    expect(supplierUpdateBody(stored, { phone: "01-5000000" })).toEqual({
      name: "Himalayan Pharma",
      contactPerson: "Ram",
      phone: "01-5000000",
      email: "sales@himalayan.example",
      address: "Lalitpur",
      taxId: "PAN-123",
      isActive: true,
    })
  })

  it("ignores a blank name rather than sending an empty one", () => {
    expect(supplierUpdateBody(stored, { name: "  " }).name).toBe("Himalayan Pharma")
  })
})
