import { describe, expect, it } from "vitest"
import { backendTarget, BACKEND_AREAS, checkoutOnDotnet } from "@/lib/api/backend-target"

describe("backendTarget", () => {
  it("defaults every area to the .NET API", () => {
    for (const area of BACKEND_AREAS) {
      expect(backendTarget(area, {})).toBe("dotnet")
    }
  })

  it("rolls back only the named area when set to nextjs", () => {
    const env = { SALES: "nextjs" } as const
    expect(backendTarget("SALES", env)).toBe("nextjs")
    expect(backendTarget("INVENTORY", env)).toBe("dotnet")
  })

  it("treats any value other than the exact nextjs as the .NET API", () => {
    expect(backendTarget("SALES", { SALES: "nextjss" })).toBe("dotnet")
    expect(backendTarget("SALES", { SALES: " NextJS " })).toBe("dotnet")
    expect(backendTarget("SALES", { SALES: "nextjs" })).toBe("nextjs")
  })
})

describe("checkoutOnDotnet", () => {
  it("stays off unless explicitly enabled", () => {
    expect(checkoutOnDotnet({})).toBe(false)
    expect(checkoutOnDotnet({ CHECKOUT_ON_DOTNET: "false" })).toBe(false)
  })

  it("is on when the flag is true and sales is on .NET", () => {
    expect(checkoutOnDotnet({ CHECKOUT_ON_DOTNET: "true" })).toBe(true)
  })
})
