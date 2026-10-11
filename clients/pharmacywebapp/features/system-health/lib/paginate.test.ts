import { describe, expect, it } from "vitest"
import { matchesQuery, paginate } from "./paginate"

const items = Array.from({ length: 19 }, (_, i) => i + 1)

describe("paginate", () => {
  it("slices pages", () => {
    const p = paginate(items, 2, 8)
    expect(p.items).toEqual([9, 10, 11, 12, 13, 14, 15, 16])
    expect(p.totalPages).toBe(3)
    expect(p.startIndex).toBe(8)
    expect(p.totalItems).toBe(19)
  })
  it("clamps out-of-range pages", () => {
    expect(paginate(items, 99, 8).page).toBe(3)
    expect(paginate(items, 99, 8).items).toEqual([17, 18, 19])
    expect(paginate(items, 0, 8).page).toBe(1)
    expect(paginate(items, Number.NaN, 8).page).toBe(1)
  })
  it("handles empty lists", () => {
    const p = paginate([], 3, 10)
    expect(p).toMatchObject({ items: [], page: 1, totalPages: 1, totalItems: 0, startIndex: 0 })
  })
})

describe("matchesQuery", () => {
  it("matches every word across fields, case-insensitive", () => {
    expect(matchesQuery("", ["x"])).toBe(true)
    expect(matchesQuery("ird SYNC", ["ird-sync-job", null])).toBe(true)
    expect(matchesQuery("ird nightly", ["ird-sync", "*/5 * * * *"])).toBe(false)
  })
})
