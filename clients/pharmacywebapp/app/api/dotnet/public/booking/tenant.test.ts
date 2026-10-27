import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { bookingTenant } from "./tenant"

const request = (host: string) => new NextRequest("http://x/api/dotnet/public/booking", { headers: { host } })

describe("bookingTenant", () => {
  it("uses the pharmacy code from the link", () => {
    expect(bookingTenant(request("localhost:3000"), " Shree-Pharmacy ")).toBe("shree-pharmacy")
  })

  it("ignores a malformed code and never books into the operator tenant", () => {
    expect(bookingTenant(request("localhost:3000"), "../root")).toBeNull()
    expect(bookingTenant(request("localhost:3000"), "root")).toBeNull()
    expect(bookingTenant(request("localhost:3000"), null)).toBeNull()
  })
})
