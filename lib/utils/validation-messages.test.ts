import { describe, expect, it } from "vitest"
import { formatValidationDetails, userFacingErrorMessage } from "@/lib/utils/validation-messages"

describe("userFacingErrorMessage", () => {
  it("replaces the generic validation envelope with the field message", () => {
    const message = userFacingErrorMessage("Validation failed", "VALIDATION_ERROR", [
      {
        code: "too_small",
        message: "Supplier name must be at least 2 characters",
        path: ["name"],
      },
    ])
    expect(message).toBe("Supplier name must be at least 2 characters")
  })

  it("reads string maps used by some routes", () => {
    expect(formatValidationDetails({ supplierId: "supplierId is required" })).toBe("supplierId is required")
  })

  it("keeps a specific message when there are no field details", () => {
    expect(userFacingErrorMessage("Bill/invoice number is required", "VALIDATION_ERROR")).toBe(
      "Bill/invoice number is required"
    )
  })
})
