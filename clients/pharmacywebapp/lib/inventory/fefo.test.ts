import { describe, expect, it } from "vitest"
import { allocateFefo, compareFefo, isSellableOn, type FefoPick } from "@/lib/inventory/fefo"

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
    { batch_number: "A", expiry_date: "2026-12-01", rack_location: "Rack 3", quantity_remaining: 4 },
    { batch_number: "B", expiry_date: "2027-03-01", rack_location: "Fridge 2", quantity_remaining: 10 },
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
