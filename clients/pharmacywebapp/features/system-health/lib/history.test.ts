import { describe, expect, it } from "vitest"
import { HISTORY_SIZE, latencyStats, pushHistory, sparklinePoints, type HistoryEntry } from "./history"

const entry = (at: number, roundTripMs: number | null = at): HistoryEntry => ({ at, status: "Healthy", roundTripMs })

describe("pushHistory", () => {
  it("keeps at most the newest N entries", () => {
    let buf: HistoryEntry[] = []
    for (let i = 1; i <= 35; i++) buf = pushHistory(buf, entry(i))
    expect(buf).toHaveLength(HISTORY_SIZE)
    expect(buf[0].at).toBe(6)
    expect(buf[buf.length - 1].at).toBe(35)
  })
  it("ignores a duplicate timestamp and never mutates", () => {
    const a = [entry(1)]
    const b = pushHistory(a, entry(1))
    expect(b).toHaveLength(1)
    expect(b).not.toBe(a)
    const c = pushHistory(a, entry(2), 1)
    expect(c.map((e) => e.at)).toEqual([2])
    expect(a).toHaveLength(1)
  })
})

describe("latencyStats", () => {
  it("summarises finite values only", () => {
    expect(latencyStats([entry(1, 10), entry(2, null), entry(3, 30), entry(4, 21)])).toEqual({ min: 10, avg: 20, max: 30, count: 3 })
    expect(latencyStats([entry(1, null)])).toBeNull()
    expect(latencyStats([])).toBeNull()
  })
})

describe("sparklinePoints", () => {
  it("returns empty for no data", () => {
    expect(sparklinePoints([], 100, 20)).toBe("")
    expect(sparklinePoints([null], 100, 20)).toBe("")
  })
  it("maps min to bottom and max to top, right-aligned", () => {
    const pts = sparklinePoints([10, 30], 100, 20, { slots: 3, padding: 0 }).split(" ")
    expect(pts).toEqual(["50,20", "100,0"])
  })
  it("draws flat series through the middle and skips nulls", () => {
    expect(sparklinePoints([5, null, 5], 100, 20, { padding: 0 })).toBe("0,10 100,10")
  })
})
