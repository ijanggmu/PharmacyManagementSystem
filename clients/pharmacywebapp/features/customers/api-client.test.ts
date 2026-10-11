import { describe, expect, it, vi } from "vitest"

const del = vi.fn()
vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get: vi.fn(), delete: (path: string) => del(path) },
  DotnetApiError: class DotnetApiError extends Error {},
}))

import { customersApi } from "./api-client"

describe("customersApi.deleteCustomer", () => {
  it("deletes through the API", async () => {
    del.mockImplementation(() => Promise.resolve(undefined))
    expect(await customersApi.deleteCustomer("c1")).toEqual({ error: null })
    expect(del).toHaveBeenCalledWith("/api/v1/customers/c1")
  })

  it("returns the server's balance-guard message", async () => {
    del.mockImplementation(() =>
      Promise.reject(new Error("Ram still owes 250.00. Record their payment (or settle the balance) before deleting them.")),
    )
    const result = await customersApi.deleteCustomer("c1")
    expect(result.error).toContain("still owes 250.00")
  })
})
