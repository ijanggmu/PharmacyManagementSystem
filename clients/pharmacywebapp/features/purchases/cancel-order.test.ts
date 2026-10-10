import { describe, expect, it } from "vitest"
import { cancelPurchaseOrderBody } from "./api-client"

describe("cancelPurchaseOrderBody", () => {
  it("sends the trimmed reason the .NET command requires", () => {
    expect(cancelPurchaseOrderBody("  supplier could not deliver ")).toEqual({ reason: "supplier could not deliver" })
  })

  it("refuses a blank reason", () => {
    expect(() => cancelPurchaseOrderBody("")).toThrow(/reason is required/)
    expect(() => cancelPurchaseOrderBody("   ")).toThrow(/reason is required/)
  })

  it("accepts exactly 512 characters and refuses more", () => {
    expect(cancelPurchaseOrderBody("x".repeat(512)).reason).toHaveLength(512)
    expect(() => cancelPurchaseOrderBody("x".repeat(513))).toThrow(/512 characters/)
  })
})
