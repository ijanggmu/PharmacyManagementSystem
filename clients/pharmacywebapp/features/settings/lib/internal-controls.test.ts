import { describe, expect, it } from "vitest"
import {
  CONTROLS_KEYS,
  DEFAULT_INTERNAL_CONTROLS,
  capRoleNames,
  parseCapInput,
  parseDiscountCaps,
  parseInternalControls,
  serializeDiscountCaps,
} from "@/features/settings/lib/internal-controls"

describe("internal controls settings", () => {
  it("defaults match the server: cashier 5%, pharmacist 10%, manager unlimited, refunds above 1000, SoD off", () => {
    const controls = parseInternalControls([])
    expect(controls).toEqual(DEFAULT_INTERNAL_CONTROLS)
    expect(controls.discountCaps.Cashier).toEqual({ line: 5, bill: 5 })
    expect(controls.discountCaps.Pharmacist).toEqual({ line: 10, bill: 10 })
    expect(controls.discountCaps.Manager).toEqual({ line: null, bill: null })
  })

  it("reads stored values, overlaying the defaults and clamping percents", () => {
    const controls = parseInternalControls([
      { key: CONTROLS_KEYS.discountCaps, value: '{"cashier":{"line":3,"bill":250},"Night":{"line":null,"bill":2}}' },
      { key: CONTROLS_KEYS.refundApprovalThreshold, value: "2500" },
      { key: CONTROLS_KEYS.voucherCreatorCannotPost, value: "true" },
    ])
    expect(controls.discountCaps.cashier).toEqual({ line: 3, bill: 100 })
    expect(controls.discountCaps.Cashier).toBeUndefined()
    expect(controls.discountCaps.Night).toEqual({ line: null, bill: 2 })
    expect(controls.refundApprovalThreshold).toBe(2500)
    expect(controls.voucherCreatorCannotPost).toBe(true)
  })

  it("ignores malformed JSON and a negative threshold", () => {
    const controls = parseInternalControls([
      { key: CONTROLS_KEYS.discountCaps, value: "{oops" },
      { key: CONTROLS_KEYS.refundApprovalThreshold, value: "-1" },
    ])
    expect(controls.discountCaps).toEqual(DEFAULT_INTERNAL_CONTROLS.discountCaps)
    expect(controls.refundApprovalThreshold).toBe(1000)
  })

  it("round-trips the caps JSON", () => {
    const caps = { Cashier: { line: 7, bill: 4 }, "*": { line: null, bill: 1 } }
    expect(parseDiscountCaps(serializeDiscountCaps(caps))).toMatchObject(caps)
  })

  it("parses a cap field: blank is unlimited, 0-100 otherwise", () => {
    expect(parseCapInput("")).toBeNull()
    expect(parseCapInput(" 12.5 ")).toBe(12.5)
    expect(parseCapInput("101")).toBeUndefined()
    expect(parseCapInput("-1")).toBeUndefined()
    expect(parseCapInput("abc")).toBeUndefined()
  })

  it("lists the tenant's roles (not Admin/Basic) once, then 'any other role'", () => {
    expect(capRoleNames(["Admin", "Basic", "Cashier", "Accountant"], { cashier: { line: 1, bill: 1 }, "*": { line: 5, bill: 5 } })).toEqual([
      "Accountant",
      "Cashier",
      "*",
    ])
  })
})
