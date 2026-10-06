import { describe, expect, it } from "vitest"
import {
  customerCreateBody,
  customerUpdateBody,
  customersListQuery,
  joinCustomerName,
  splitCustomerName,
  toCustomer,
  toCustomersResponse,
  type DotnetCustomerDto,
} from "@/lib/api/customers-api"

const stored: DotnetCustomerDto = {
  id: "c1",
  name: "Sita Devi Thapa",
  phone: "9800000000",
  email: null,
  address: "Kathmandu",
  currentBalance: 0,
  isActive: true,
  createdAtUtc: "2026-01-05T08:00:00Z",
  updatedAtUtc: null,
}

describe("name split and join", () => {
  it("splits on the first space so the rest of the name stays in last_name", () => {
    expect(splitCustomerName("Sita Devi Thapa")).toEqual({ first: "Sita", last: "Devi Thapa" })
    expect(splitCustomerName("Ram")).toEqual({ first: "Ram", last: "" })
  })

  it("joins non-empty parts with a single space", () => {
    expect(joinCustomerName(" Ram ", "")).toBe("Ram")
    expect(joinCustomerName("Ram", "Shrestha")).toBe("Ram Shrestha")
  })
})

describe("toCustomer", () => {
  it("maps to the UI shape and leaves non-.NET fields empty", () => {
    expect(toCustomer(stored)).toEqual({
      id: "c1",
      first_name: "Sita",
      last_name: "Devi Thapa",
      email: null,
      phone: "9800000000",
      address: "Kathmandu",
      date_of_birth: null,
      insurance_provider: null,
      insurance_number: null,
      created_at: "2026-01-05T08:00:00Z",
      prescriptions: [],
      sales: [],
    })
  })
})

describe("customersListQuery", () => {
  it("translates UI filters to the .NET paging and active parameters", () => {
    expect(
      customersListQuery({ search: " sita ", page: 2, limit: 25, activity: "inactive", sortBy: "balance", sortOrder: "desc" }),
    ).toBe("/api/v1/customers?search=sita&pageNumber=2&pageSize=25&sortBy=balance&sortDir=desc&isActive=false")
  })

  it("uses a single legacy status as the activity filter", () => {
    expect(customersListQuery({ statuses: ["active"] })).toBe("/api/v1/customers?isActive=true")
  })

  it("sends no filter when none is given", () => {
    expect(customersListQuery()).toBe("/api/v1/customers")
  })
})

describe("toCustomersResponse", () => {
  it("maps the paged items and total count", () => {
    const res = toCustomersResponse({ items: [stored], pageNumber: 1, pageSize: 50, totalCount: 1, totalPages: 1 })
    expect(res.error).toBeNull()
    expect(res.total).toBe(1)
    expect(res.data).toHaveLength(1)
    expect(res.data[0].first_name).toBe("Sita")
  })
})

describe("customerCreateBody", () => {
  it("joins the names, nulls empty optional fields and sends a zero opening balance", () => {
    expect(
      customerCreateBody({ first_name: "Gita", last_name: "", phone: "", email: "g@x.com", address: " " }),
    ).toEqual({ name: "Gita", phone: null, email: "g@x.com", address: null, openingBalance: 0 })
  })
})

describe("customerUpdateBody", () => {
  it("keeps stored values for fields absent from the update", () => {
    expect(customerUpdateBody(stored, { phone: "9811111111" })).toEqual({
      name: "Sita Devi Thapa",
      phone: "9811111111",
      email: null,
      address: "Kathmandu",
      isActive: true,
    })
  })

  it("rebuilds the name from the stored pair when only one part changes", () => {
    expect(customerUpdateBody(stored, { first_name: "Sunita" }).name).toBe("Sunita Devi Thapa")
    expect(customerUpdateBody(stored, { last_name: "" }).name).toBe("Sita")
  })

  it("clears a field when it is set to an empty string", () => {
    expect(customerUpdateBody(stored, { address: "" }).address).toBeNull()
  })
})
