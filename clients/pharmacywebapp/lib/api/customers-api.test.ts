import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
const del = vi.fn()
vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get: (path: string) => get(path), delete: (path: string) => del(path) },
  DotnetApiError: class DotnetApiError extends Error {},
}))

import {
  CUSTOMERS_MAX_PAGE_SIZE,
  cleanList,
  customersDotnetApi,
  customerCreateBody,
  customerLedgerQuery,
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
      pan_number: null,
      is_active: true,
      created_at: "2026-01-05T08:00:00Z",
      code: null,
      current_balance: 0,
      credit_limit: null,
      available_credit: null,
      credit_days: null,
      is_member: false,
      sms_consent: false,
      loyalty_points: 0,
      allergies: [],
      chronic_conditions: [],
      current_medications: [],
      prescriptions: [],
      sales: [],
    })
  })

  it("reads the date of birth and insurance back, and leaves the balance out when the API withholds it", () => {
    const customer = toCustomer({
      ...stored,
      currentBalance: null,
      dateOfBirth: "2019-05-01",
      insuranceProvider: "Shikhar",
      insuranceNumber: "POL-1",
      panNumber: "123456789",
    })
    expect(customer).toMatchObject({
      date_of_birth: "2019-05-01",
      insurance_provider: "Shikhar",
      insurance_number: "POL-1",
      pan_number: "123456789",
    })
    expect(customer.current_balance).toBeUndefined()
  })

  it("reads the medical lists back from the DTO", () => {
    const customer = toCustomer({
      ...stored,
      allergies: ["Penicillin"],
      chronicConditions: ["Diabetes"],
      currentMedications: ["Metformin"],
    })
    expect(customer.allergies).toEqual(["Penicillin"])
    expect(customer.chronic_conditions).toEqual(["Diabetes"])
    expect(customer.current_medications).toEqual(["Metformin"])
  })
})

describe("cleanList", () => {
  it("trims, drops blanks and case-insensitive duplicates", () => {
    expect(cleanList([" Penicillin ", "", "penicillin", "Sulfa"])).toEqual(["Penicillin", "Sulfa"])
    expect(cleanList(undefined)).toEqual([])
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

  it("maps the single status filter used by the stat cards", () => {
    expect(customersListQuery({ status: "active", limit: 1 })).toBe("/api/v1/customers?pageSize=1&isActive=true")
    expect(customersListQuery({ status: "inactive" })).toBe("/api/v1/customers?isActive=false")
  })

  it("sends no active filter when both statuses are selected", () => {
    expect(customersListQuery({ statuses: ["active", "inactive"] })).toBe("/api/v1/customers")
  })

  it("maps UI sort keys to the ones the handler recognises and drops unknown ones", () => {
    expect(customersListQuery({ sortBy: "first_name", sortOrder: "asc" })).toBe("/api/v1/customers?sortBy=name&sortDir=asc")
    expect(customersListQuery({ sortBy: "created_at", sortOrder: "desc" })).toBe("/api/v1/customers?sortBy=created&sortDir=desc")
    expect(customersListQuery({ sortBy: "nonsense" })).toBe("/api/v1/customers")
  })

  it("clamps the page size to the server cap", () => {
    expect(customersListQuery({ limit: 5000 })).toBe(`/api/v1/customers?pageSize=${CUSTOMERS_MAX_PAGE_SIZE}`)
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

describe("customerLedgerQuery", () => {
  it("defaults to page 1 and clamps the page size", () => {
    expect(customerLedgerQuery("c1", 20)).toBe("/api/v1/customers/c1/ledger?pageNumber=1&pageSize=20")
  })

  it("accepts a page number for real pagination, not just a bigger pageSize", () => {
    expect(customerLedgerQuery("c1", 20, 3)).toBe("/api/v1/customers/c1/ledger?pageNumber=3&pageSize=20")
  })

  it("floors a fractional or non-positive page to at least 1", () => {
    expect(customerLedgerQuery("c1", 20, 0)).toBe("/api/v1/customers/c1/ledger?pageNumber=1&pageSize=20")
    expect(customerLedgerQuery("c1", 20, 2.9)).toBe("/api/v1/customers/c1/ledger?pageNumber=2&pageSize=20")
  })
})

describe("customerCreateBody", () => {
  it("joins the names, nulls empty optional fields and sends a zero opening balance", () => {
    expect(
      customerCreateBody({ first_name: "Gita", last_name: "", phone: "", email: "g@x.com", address: " " }),
    ).toEqual({
      name: "Gita",
      phone: null,
      email: "g@x.com",
      address: null,
      openingBalance: 0,
      creditLimit: null,
      creditDays: null,
      isMember: false,
      smsConsent: false,
      allergies: [],
      chronicConditions: [],
      currentMedications: [],
      dateOfBirth: null,
      insuranceProvider: null,
      insuranceNumber: null,
    })
  })

  it("sends the date of birth and insurance", () => {
    expect(
      customerCreateBody({
        first_name: "Gita",
        last_name: "",
        date_of_birth: "2019-05-01",
        insurance_provider: " Shikhar ",
        insurance_number: "POL-1",
      }),
    ).toMatchObject({ dateOfBirth: "2019-05-01", insuranceProvider: "Shikhar", insuranceNumber: "POL-1" })
  })

  it("sends allergies, chronic conditions and current medications", () => {
    expect(
      customerCreateBody({
        first_name: "Gita",
        last_name: "",
        allergies: ["Penicillin", " "],
        chronic_conditions: ["Asthma"],
        current_medications: ["Salbutamol"],
      }),
    ).toMatchObject({ allergies: ["Penicillin"], chronicConditions: ["Asthma"], currentMedications: ["Salbutamol"] })
  })

  it("sends the credit limit when one is set", () => {
    expect(customerCreateBody({ first_name: "Gita", last_name: "", credit_limit: 5000 }).creditLimit).toBe(5000)
  })
})

describe("customerUpdateBody", () => {
  it("keeps stored values for fields absent from the update", () => {
    expect(customerUpdateBody(stored, { phone: "9811111111" })).toEqual({
      name: "Sita Devi Thapa",
      phone: "9811111111",
      email: null,
      address: "Kathmandu",
      isActive: null,
      creditLimit: null,
      clearCreditLimit: false,
      creditDays: null,
      clearCreditDays: false,
      isMember: null,
      smsConsent: null,
      allergies: null,
      chronicConditions: null,
      currentMedications: null,
      dateOfBirth: null,
      clearDateOfBirth: false,
      insuranceProvider: null,
      insuranceNumber: null,
    })
  })

  it("only changes the active flag when asked (never reactivates by omission)", () => {
    const inactive = { ...stored, isActive: false }
    expect(customerUpdateBody(inactive, { phone: "9811111111" }).isActive).toBeNull()
    expect(customerUpdateBody(inactive, { is_active: true }).isActive).toBe(true)
    expect(customerUpdateBody(stored, { is_active: false }).isActive).toBe(false)
  })

  it("sets, keeps or clears the date of birth and insurance", () => {
    expect(customerUpdateBody(stored, { date_of_birth: "2019-05-01" })).toMatchObject({ dateOfBirth: "2019-05-01", clearDateOfBirth: false })
    expect(customerUpdateBody(stored, { date_of_birth: "" })).toMatchObject({ dateOfBirth: null, clearDateOfBirth: true })
    expect(customerUpdateBody(stored, { date_of_birth: null })).toMatchObject({ dateOfBirth: null, clearDateOfBirth: true })
    expect(customerUpdateBody(stored, { insurance_provider: "Shikhar", insurance_number: null })).toMatchObject({
      insuranceProvider: "Shikhar",
      insuranceNumber: "",
    })
  })

  it("replaces the medical lists when given and keeps them (null) when absent", () => {
    expect(customerUpdateBody(stored, { allergies: ["Aspirin"], current_medications: [] })).toMatchObject({
      allergies: ["Aspirin"],
      chronicConditions: null,
      currentMedications: [],
    })
  })

  it("keeps, sets or explicitly clears the credit limit", () => {
    expect(customerUpdateBody(stored, {})).toMatchObject({ creditLimit: null, clearCreditLimit: false })
    expect(customerUpdateBody(stored, { credit_limit: 2500 })).toMatchObject({ creditLimit: 2500, clearCreditLimit: false })
    expect(customerUpdateBody(stored, { credit_limit: null })).toMatchObject({ creditLimit: null, clearCreditLimit: true })
  })

  it("sets, keeps or clears the payment terms", () => {
    expect(customerCreateBody({ first_name: "Gita", last_name: "", credit_days: 15 }).creditDays).toBe(15)
    expect(customerUpdateBody(stored, {})).toMatchObject({ creditDays: null, clearCreditDays: false })
    expect(customerUpdateBody(stored, { credit_days: 30 })).toMatchObject({ creditDays: 30, clearCreditDays: false })
    expect(customerUpdateBody(stored, { credit_days: null })).toMatchObject({ creditDays: null, clearCreditDays: true })
  })

  it("rebuilds the name from the stored pair when only one part changes", () => {
    expect(customerUpdateBody(stored, { first_name: "Sunita" }).name).toBe("Sunita Devi Thapa")
    expect(customerUpdateBody(stored, { last_name: "" }).name).toBe("Sita")
  })

  it("clears a field when it is set to an empty string", () => {
    expect(customerUpdateBody(stored, { address: "" }).address).toBeNull()
  })
})

describe("customersDotnetApi.list", () => {
  beforeEach(() => {
    get.mockReset()
  })

  function page(pageNumber: number, totalPages: number, count: number) {
    return {
      items: Array.from({ length: count }, (_, i) => ({ ...stored, id: `c${pageNumber}-${i}` })),
      pageNumber,
      pageSize: CUSTOMERS_MAX_PAGE_SIZE,
      totalCount: 450,
      totalPages,
    }
  }

  it("pages through 200-row requests when asked for more than the server cap", async () => {
    get.mockImplementation((path: string) => {
      const n = Number(new URLSearchParams(path.split("?")[1]).get("pageNumber"))
      return Promise.resolve(page(n, 3, n === 3 ? 50 : 200))
    })

    const res = await customersDotnetApi.list({ limit: 2000, sortBy: "first_name", sortOrder: "asc", search: "ram" })

    expect(get).toHaveBeenCalledTimes(3)
    for (const [path] of get.mock.calls) {
      const sp = new URLSearchParams(String(path).split("?")[1])
      expect(sp.get("pageSize")).toBe("200")
      expect(sp.get("search")).toBe("ram")
      expect(sp.get("sortBy")).toBe("name")
    }
    expect(res.data).toHaveLength(450)
    expect(res.total).toBe(450)
  })

  it("stops paging once the requested limit is reached", async () => {
    get.mockImplementation((path: string) => {
      const n = Number(new URLSearchParams(path.split("?")[1]).get("pageNumber"))
      return Promise.resolve(page(n, 3, 200))
    })

    const res = await customersDotnetApi.list({ limit: 300 })

    expect(get).toHaveBeenCalledTimes(2)
    expect(res.data).toHaveLength(300)
  })

  it("makes a single request within the cap", async () => {
    get.mockResolvedValue(page(1, 1, 1))

    await customersDotnetApi.list({ page: 2, limit: 10, statuses: ["inactive"] })

    expect(get).toHaveBeenCalledWith("/api/v1/customers?pageNumber=2&pageSize=10&isActive=false")
  })
})

describe("customersDotnetApi.delete", () => {
  beforeEach(() => del.mockReset())

  it("calls DELETE on the customer", async () => {
    del.mockResolvedValue(undefined)
    await customersDotnetApi.delete("c 1")
    expect(del).toHaveBeenCalledWith("/api/v1/customers/c%201")
  })
})
