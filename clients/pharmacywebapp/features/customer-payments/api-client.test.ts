import { describe, expect, it } from "vitest"
import { customerPayerSearchPath } from "./api-client"

describe("customerPayerSearchPath", () => {
  it("requests one bounded page of active customers", () => {
    expect(customerPayerSearchPath("", 25)).toBe("/api/v1/customers?pageNumber=1&pageSize=25&isActive=true")
  })
  it("adds a trimmed search term", () => {
    expect(customerPayerSearchPath("  ram ", 10)).toBe("/api/v1/customers?pageNumber=1&pageSize=10&isActive=true&search=ram")
  })
})
