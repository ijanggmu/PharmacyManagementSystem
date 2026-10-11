import { describe, expect, it } from "vitest"
import { parseSafetyWarning } from "./safety-warning"

const apiError = (normalized: Record<string, unknown>) => Object.assign(new Error(String(normalized.message ?? "")), { normalized })

describe("parseSafetyWarning", () => {
  it("splits interactions and the allergy line from a SafetyWarningException 409", () => {
    const info = parseSafetyWarning(
      apiError({
        status: 409,
        title: "SafetyWarningException",
        message: "This cart triggered a drug interaction or allergy warning — review before completing the sale.",
        details: ["Warfarin + Aspirin: bleeding risk", "Customer has a recorded allergy to: penicillin — cart includes Amoxicillin."],
      }),
    )
    expect(info).toEqual({
      interactions: ["Warfarin + Aspirin: bleeding risk"],
      allergy: "Customer has a recorded allergy to: penicillin — cart includes Amoxicillin.",
    })
  })

  it("recognises the warning by message when the title is missing", () => {
    const info = parseSafetyWarning(
      apiError({ status: 409, message: "This cart triggered a drug interaction or allergy warning — review." }),
    )
    expect(info?.interactions).toHaveLength(1)
  })

  it("ignores other conflicts and statuses", () => {
    expect(parseSafetyWarning(apiError({ status: 409, title: "CustomException", message: "Credit limit exceeded" }))).toBeNull()
    expect(parseSafetyWarning(apiError({ status: 400, title: "SafetyWarningException" }))).toBeNull()
    expect(parseSafetyWarning(new Error("boom"))).toBeNull()
  })
})
