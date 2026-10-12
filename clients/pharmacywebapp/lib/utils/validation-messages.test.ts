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

describe("formatValidationDetails with .NET ProblemDetails errors", () => {
  it("flattens a FluentValidation field map of string arrays", () => {
    expect(
      formatValidationDetails({
        Name: ["'Name' must not be empty."],
        Price: ["Price must be greater than 0.", "Price is too large."],
      })
    ).toBe("'Name' must not be empty. Price must be greater than 0. Price is too large.")
  })

  it("reads a CustomException string array", () => {
    expect(formatValidationDetails(["Incorrect password."])).toBe("Incorrect password.")
  })

  it("replaces the .NET generic envelope even for non-validation codes", () => {
    expect(
      userFacingErrorMessage("One or more validation errors occurred.", "BAD_REQUEST", { Email: ["Email is invalid."] })
    ).toBe("Email is invalid.")
  })
})
