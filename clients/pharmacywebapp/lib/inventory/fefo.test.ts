import { describe, expect, it } from "vitest"
import { allocateFefo, compareFefo, fefoGross, fefoHasMixedPrices, fefoUnitPrice, isSellableOn, type FefoPick } from "@/lib/inventory/fefo"

describe("compareFefo", () => {
  it("puts the soonest expiry first and undated batches last", () => {
    const rows = [
      { expiry_date: null, received_at: "2026-01-01T00:00:00Z", batch_number: "undated" },
      { expiry_date: "2027-06-01", received_at: "2026-01-01T00:00:00Z", batch_number: "later" },
      { expiry_date: "2026-12-01", received_at: "2026-03-01T00:00:00Z", batch_number: "soon-new" },
      { expiry_date: "2026-12-01", received_at: "2026-02-01T00:00:00Z", batch_number: "soon-old" },
    ]
    rows.sort(compareFefo)
    expect(rows.map((r) => r.batch_number)).toEqual(["soon-old", "soon-new", "later", "undated"])
  })
})

describe("isSellableOn", () => {
  it("rejects a batch that expired before today and keeps a same-day expiry", () => {
    expect(isSellableOn("2026-09-24", "2026-09-25")).toBe(false)
    expect(isSellableOn("2026-09-25", "2026-09-25")).toBe(true)
    expect(isSellableOn(null, "2026-09-25")).toBe(true)
  })
})

describe("allocateFefo", () => {
  const picks: FefoPick[] = [
    { batch_number: "A", expiry_date: "2026-12-01", rack_location: "Rack 3", quantity_remaining: 4, selling_price: 10 },
    { batch_number: "B", expiry_date: "2027-03-01", rack_location: "Fridge 2", quantity_remaining: 10, selling_price: 12 },
  ]

  it("stays on the first batch when it covers the quantity", () => {
    expect(allocateFefo(picks, 2).map((l) => [l.batch_number, l.take])).toEqual([["A", 2]])
  })

  it("continues into the next batch when the first lot is short", () => {
    expect(allocateFefo(picks, 6).map((l) => [l.batch_number, l.rack_location, l.take])).toEqual([
      ["A", "Rack 3", 4],
      ["B", "Fridge 2", 2],
    ])
  })
})

describe("batch pricing", () => {
  const picks: FefoPick[] = [
    { batch_number: "A", expiry_date: "2026-12-01", rack_location: null, quantity_remaining: 4, selling_price: 10 },
    { batch_number: "B", expiry_date: "2027-03-01", rack_location: null, quantity_remaining: 10, selling_price: 12 },
  ]

  it("prices each unit at the lot it is taken from", () => {
    expect(fefoGross(picks, 2, 99)).toBe(20)
    expect(fefoGross(picks, 6, 99)).toBe(4 * 10 + 2 * 12)
    expect(fefoHasMixedPrices(picks, 2)).toBe(false)
    expect(fefoHasMixedPrices(picks, 6)).toBe(true)
  })

  it("falls back only for units no lot covers", () => {
    expect(fefoGross(picks, 16, 15)).toBe(4 * 10 + 10 * 12 + 2 * 15)
    expect(fefoGross([], 3, 15)).toBe(45)
  })

  it("quotes the first lot's price for the next unit", () => {
    expect(fefoUnitPrice(picks, 99)).toBe(10)
    expect(fefoUnitPrice([], 15)).toBe(15)
  })
})
