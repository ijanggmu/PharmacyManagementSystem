import { describe, expect, it } from "vitest"
import { completedSales, countLabel, DETAIL_LIST_LIMIT } from "./customer-detail"

describe("completedSales", () => {
  it("drops cancelled sales whatever the casing", () => {
    const rows = [{ id: "a", status: "completed" }, { id: "b", status: "Cancelled" }, { id: "c", status: null }]
    expect(completedSales(rows).map((r) => r.id)).toEqual(["a", "c"])
  })
})

describe("countLabel", () => {
  it("prefers the server total", () => {
    expect(countLabel(250, DETAIL_LIST_LIMIT, 300)).toBe("250")
    expect(countLabel(0, 0)).toBe("0")
  })
  it("falls back to the fetched rows, marking a capped list with +", () => {
    expect(countLabel(null, 12, 12)).toBe("12")
    expect(countLabel(undefined, DETAIL_LIST_LIMIT)).toBe("100+")
    expect(countLabel(null, 40, 41)).toBe("40+")
  })
})
