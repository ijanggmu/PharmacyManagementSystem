import { describe, expect, it } from "vitest"
import { flattenProblemErrors, problemFieldErrors, problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { DotnetApiError } from "@/lib/api/dotnet-client"

const validationProblem = {
  type: "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  title: "Validation error",
  status: 400,
  detail: "One or more validation errors occurred.",
  errors: {
    Name: ["'Name' must not be empty."],
    "Lines[0].Quantity": ["Quantity must be greater than 0."],
  },
}

describe("problemToNormalizedError", () => {
  it("uses the field messages instead of the generic validation detail", () => {
    const error = problemToNormalizedError(400, validationProblem)
    expect(error.code).toBe("VALIDATION_ERROR")
    expect(error.message).toBe("'Name' must not be empty. Quantity must be greater than 0.")
    // The raw field map is kept for forms.
    expect(error.details).toEqual(validationProblem.errors)
  })

  it("keeps a specific detail and its errors array", () => {
    const error = problemToNormalizedError(400, {
      title: "CustomException",
      detail: "failed to change password",
      errors: ["Incorrect password."],
    })
    expect(error.message).toBe("failed to change password")
    expect(error.details).toEqual(["Incorrect password."])
  })

  it("falls back to title, then status, when there is no detail", () => {
    expect(problemToNormalizedError(404, { title: "Not Found" }).message).toBe("Not Found")
    expect(problemToNormalizedError(502, null).message).toBe("Request failed with status 502")
  })
})

describe("flattenProblemErrors / problemFieldErrors", () => {
  it("flattens maps, arrays and zod issues, de-duplicating", () => {
    expect(flattenProblemErrors({ A: ["x", "y"], B: "x" })).toEqual(["x", "y"])
    expect(flattenProblemErrors(["a", { message: "b" }, 3])).toEqual(["a", "b"])
    expect(flattenProblemErrors(undefined)).toEqual([])
  })

  it("camel-cases field keys for form wiring", () => {
    expect(problemFieldErrors(validationProblem.errors)).toEqual({
      name: ["'Name' must not be empty."],
      "lines[0].quantity": ["Quantity must be greater than 0."],
    })
    expect(problemFieldErrors(["not a map"])).toEqual({})
  })
})

describe("apiRequestErrorMessage with DotnetApiError", () => {
  it("shows the field messages, not the generic envelope", () => {
    const error = new DotnetApiError({
      code: "VALIDATION_ERROR",
      message: "One or more validation errors occurred.",
      status: 400,
      details: { Email: ["Email is invalid."] },
    })
    expect(apiRequestErrorMessage(error)).toBe("Email is invalid.")
  })

  it("surfaces the CustomException errors array for a 400", () => {
    const error = new DotnetApiError(
      problemToNormalizedError(400, { detail: "failed to change password", errors: ["Incorrect password."] }),
    )
    expect(apiRequestErrorMessage(error)).toBe("Incorrect password.")
  })
})
