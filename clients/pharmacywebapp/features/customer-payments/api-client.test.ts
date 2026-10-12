import { describe, expect, it } from "vitest"
import { customerPayerSearchPath } from "./api-client"

describe("customerPayerSearchPath", () => {
  it("requests one bounded page of active customers plus inactive ones with a balance", () => {
    expect(customerPayerSearchPath("", 25)).toBe("/api/v1/customers?pageNumber=1&pageSize=25&isActive=true&orHasBalance=true")
  })
  it("adds a trimmed search term", () => {
    expect(customerPayerSearchPath("  ram ", 10)).toBe("/api/v1/customers?pageNumber=1&pageSize=10&isActive=true&orHasBalance=true&search=ram")
  })
})
