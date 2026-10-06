import { describe, expect, it } from "vitest"
import { toPrescriptionStats } from "@/lib/api/prescriptions-api"

describe("toPrescriptionStats", () => {
  it("maps PrescriptionStatsDto to the legacy stats row", () => {
    expect(
      toPrescriptionStats({ total: 40, pending: 12, partiallyFilled: 5, filled: 20, cancelled: 3 }),
    ).toEqual({ total: 40, pending: 12, filled: 20, partially_filled: 5, cancelled: 3 })
  })

  it("keeps zero counts as zero", () => {
    expect(toPrescriptionStats({ total: 0, pending: 0, partiallyFilled: 0, filled: 0, cancelled: 0 })).toEqual({
      total: 0,
      pending: 0,
      filled: 0,
      partially_filled: 0,
      cancelled: 0,
    })
  })
})
