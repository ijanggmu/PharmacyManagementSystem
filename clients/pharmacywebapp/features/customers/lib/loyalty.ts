/**
 * The loyalty programme as stored in tenant settings (`loyalty.*`), mirrored from the .NET
 * `LoyaltySettings` so the counter shows the same numbers the server enforces.
 */
export interface LoyaltySettings {
  enabled: boolean
  /** Spend this much to earn one point. */
  amountPerPoint: number
  /** Money value of one point when redeemed. */
  pointValue: number
  /** Discount members get at the counter. */
  memberDiscountPercent: number
  /** Fewest points that can be redeemed at once. */
  minRedeemPoints: number
}

export const LOYALTY_KEYS = {
  enabled: "loyalty.enabled",
  amountPerPoint: "loyalty.amount_per_point",
  pointValue: "loyalty.point_value",
  memberDiscountPercent: "loyalty.member_discount_percent",
  minRedeemPoints: "loyalty.min_redeem_points",
} as const

export const DEFAULT_LOYALTY: LoyaltySettings = {
  enabled: false,
  amountPerPoint: 100,
  pointValue: 1,
  memberDiscountPercent: 0,
  minRedeemPoints: 0,
}

function num(value: string | undefined, fallback: number, min: number): number {
  const n = value === undefined || value.trim() === "" ? Number.NaN : Number(value)
  return Number.isFinite(n) && n >= min ? n : fallback
}

/** Reads the programme from `{ key, value }` settings rows; missing or bad values fall back to the defaults. */
export function parseLoyaltySettings(rows: ReadonlyArray<{ key: string; value: string }> | undefined): LoyaltySettings {
  const byKey = new Map((rows ?? []).map((r) => [r.key.toLowerCase(), r.value] as const))
  const get = (key: string) => byKey.get(key)
  return {
    enabled: get(LOYALTY_KEYS.enabled)?.trim().toLowerCase() === "true",
    amountPerPoint: num(get(LOYALTY_KEYS.amountPerPoint), DEFAULT_LOYALTY.amountPerPoint, 0.01),
    pointValue: num(get(LOYALTY_KEYS.pointValue), DEFAULT_LOYALTY.pointValue, 0),
    memberDiscountPercent: Math.min(100, num(get(LOYALTY_KEYS.memberDiscountPercent), 0, 0)),
    minRedeemPoints: Math.floor(num(get(LOYALTY_KEYS.minRedeemPoints), 0, 0)),
  }
}

/** Whole points a member earns on `amount` (rounded down), or 0 when the programme is off. */
export function pointsEarnedOn(settings: LoyaltySettings, amount: number): number {
  return settings.enabled && amount > 0 ? Math.floor(amount / settings.amountPerPoint) : 0
}

/** Money value of `points`, rounded to paisa. */
export function pointsValue(settings: LoyaltySettings, points: number): number {
  return Math.round(points * settings.pointValue * 100) / 100
}

/** Most points usable on a bill of `billTotal`: no more than held, and not worth more than the bill. */
export function maxRedeemablePoints(settings: LoyaltySettings, held: number, billTotal: number): number {
  if (!settings.enabled || held <= 0 || settings.pointValue <= 0) return 0
  return Math.max(0, Math.min(held, Math.floor(billTotal / settings.pointValue)))
}
