import { describe, expect, it } from "vitest"
import { DEFAULT_LOYALTY, maxRedeemablePoints, parseLoyaltySettings, pointsEarnedOn, pointsValue } from "./loyalty"

describe("loyalty settings", () => {
  it("is off with defaults when nothing is set", () => {
    expect(parseLoyaltySettings([])).toEqual(DEFAULT_LOYALTY)
  })

  it("parses values and ignores bad ones", () => {
    const s = parseLoyaltySettings([
      { key: "LOYALTY.ENABLED", value: "true" },
      { key: "loyalty.amount_per_point", value: "50" },
      { key: "loyalty.point_value", value: "0.5" },
      { key: "loyalty.member_discount_percent", value: "250" },
      { key: "loyalty.min_redeem_points", value: "abc" },
    ])
    expect(s).toEqual({ enabled: true, amountPerPoint: 50, pointValue: 0.5, memberDiscountPercent: 100, minRedeemPoints: 0 })
  })
})

describe("points maths", () => {
  const on = { ...DEFAULT_LOYALTY, enabled: true }

  it("earns one point per amount spent, rounded down", () => {
    expect(pointsEarnedOn(on, 1250)).toBe(12)
    expect(pointsEarnedOn(DEFAULT_LOYALTY, 1250)).toBe(0)
  })

  it("values points at the point value", () => {
    expect(pointsValue({ ...on, pointValue: 0.5 }, 31)).toBe(15.5)
  })

  it("never redeems more than held or more than the bill is worth", () => {
    expect(maxRedeemablePoints(on, 500, 120)).toBe(120)
    expect(maxRedeemablePoints(on, 80, 120)).toBe(80)
    expect(maxRedeemablePoints(DEFAULT_LOYALTY, 80, 120)).toBe(0)
  })
})
