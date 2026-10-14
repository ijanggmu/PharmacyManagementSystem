import { describe, expect, it } from "vitest"

import { isCashShiftRequired } from "./cash-shift-required"

describe("isCashShiftRequired", () => {
  it("recognises the API's 409 cash_shift_required, wrapped or normalized", () => {
    const normalized = { status: 409, message: "Open a cash shift", details: ["cash_shift_required"] }
    expect(isCashShiftRequired(normalized)).toBe(true)
    expect(isCashShiftRequired({ normalized })).toBe(true)
  })

  it("ignores other refusals", () => {
    expect(isCashShiftRequired({ status: 409, details: ["InsufficientStock"] })).toBe(false)
    expect(isCashShiftRequired({ status: 403, details: ["cash_shift_required"] })).toBe(false)
    expect(isCashShiftRequired(new Error("network"))).toBe(false)
    expect(isCashShiftRequired(null)).toBe(false)
  })
})
