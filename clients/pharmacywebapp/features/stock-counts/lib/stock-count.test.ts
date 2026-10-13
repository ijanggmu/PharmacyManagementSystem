import { describe, expect, it } from "vitest"
import {
  NO_RACK,
  VARIANCE_CSV_HEADERS,
  buildCountSheetHtml,
  canCancel,
  filterLines,
  groupByRack,
  parseCountInput,
  varianceCsvRows,
  varianceSummary,
  type StockCountLine,
  type StockCountSession,
} from "./stock-count"
import { stockCountsListPath } from "../api-client"

function line(overrides: Partial<StockCountLine> = {}): StockCountLine {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    medicineId: "m1",
    medicineName: "Paracetamol 500mg",
    batchId: "b1",
    batchNo: "PCM1",
    expiryDate: "2027-01-31",
    rackLocation: "A1",
    unitCost: 3,
    snapshotQuantity: 100,
    snapshotAtUtc: "2026-10-01T04:00:00Z",
    isFoundLot: false,
    countedQuantity: null,
    countedAtUtc: null,
    note: null,
    movementsSinceSnapshot: 0,
    expectedQuantity: null,
    varianceQuantity: null,
    varianceValue: null,
    currentSystemQuantity: 100,
    postedDelta: null,
    ...overrides,
  }
}

const session: StockCountSession = {
  id: "s1",
  sessionNumber: "SC-261001-040000",
  title: "Month end <count>",
  branchId: "br1",
  status: "Counting",
  categoryId: null,
  rackLocation: null,
  supplierId: null,
  notes: null,
  createdAtUtc: "2026-10-01T04:00:00Z",
  snapshotAtUtc: "2026-10-01T04:00:00Z",
  submittedAtUtc: null,
  postedAtUtc: null,
  cancelledAtUtc: null,
  lineCount: 2,
  countedLineCount: 0,
  postedGainValue: 0,
  postedLossValue: 0,
}

describe("parseCountInput", () => {
  it("clears on blank and parses non-negative numbers", () => {
    expect(parseCountInput("  ")).toBeNull()
    expect(parseCountInput("12")).toBe(12)
    expect(parseCountInput("1,200")).toBe(1200)
    expect(parseCountInput("2.5")).toBe(2.5)
  })

  it("rejects negatives and junk", () => {
    expect(parseCountInput("-1")).toBeUndefined()
    expect(parseCountInput("abc")).toBeUndefined()
    expect(parseCountInput("1.23456")).toBeUndefined()
  })
})

describe("variance summary", () => {
  it("only counts counted lines and splits gains from losses", () => {
    const summary = varianceSummary([
      line({ countedQuantity: 88, expectedQuantity: 90, varianceQuantity: -2, varianceValue: -6 }),
      line({ countedQuantity: 12, expectedQuantity: 10, varianceQuantity: 2, varianceValue: 4 }),
      line({ countedQuantity: 5, expectedQuantity: 5, varianceQuantity: 0, varianceValue: 0 }),
      line(),
    ])
    expect(summary).toEqual({ total: 4, counted: 3, uncounted: 1, withVariance: 2, gainValue: 4, lossValue: 6, netValue: -2 })
  })
})

describe("filter and group", () => {
  const lines = [
    line({ id: "1", medicineName: "Zinc", rackLocation: "B10" }),
    line({ id: "2", medicineName: "Amoxicillin", rackLocation: "B2", batchNo: "AMX9" }),
    line({ id: "3", medicineName: "Cetirizine", rackLocation: null }),
  ]

  it("filters by medicine, batch or rack", () => {
    expect(filterLines(lines, "amx").map((l) => l.id)).toEqual(["2"])
    expect(filterLines(lines, "b10").map((l) => l.id)).toEqual(["1"])
    expect(filterLines(lines, "")).toHaveLength(3)
  })

  it("orders racks naturally with unracked lots last", () => {
    expect(groupByRack(lines).map((g) => g.rack)).toEqual(["B2", "B10", NO_RACK])
  })
})

describe("CSV rows", () => {
  it("has one row per line matching the headers", () => {
    const rows = varianceCsvRows([line({ countedQuantity: 8, expectedQuantity: 10, varianceQuantity: -2, varianceValue: -6, isFoundLot: true })])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveLength(VARIANCE_CSV_HEADERS.length)
    expect(rows[0][8]).toBe(-2)
    expect(rows[0][10]).toBe("-6.00")
    expect(rows[0][11]).toBe("Yes")
  })
})

describe("count sheet", () => {
  const profile = { name: "Hamro Pharmacy" }

  it("escapes values and hides system quantities on a blind count", () => {
    const html = buildCountSheetHtml({ session, lines: [line({ snapshotQuantity: 4321 })], profile, blind: true, printedAt: new Date(0) })
    expect(html).toContain("Month end &lt;count&gt;")
    expect(html).not.toContain("4321")
    expect(html).toContain("<h2>A1 ")
  })

  it("shows system quantities when not blind", () => {
    const html = buildCountSheetHtml({ session, lines: [line({ snapshotQuantity: 4321 })], profile, blind: false, printedAt: new Date(0) })
    expect(html).toContain("4321")
  })
})

describe("status helpers", () => {
  it("can cancel until posted", () => {
    expect(canCancel("Counting")).toBe(true)
    expect(canCancel("Posted")).toBe(false)
  })

  it("builds the list path", () => {
    expect(stockCountsListPath({ page: 2, pageSize: 10, status: "Review" })).toBe("/inventory/stock-counts?pageNumber=2&pageSize=10&status=Review")
    expect(stockCountsListPath({ status: "all" })).toBe("/inventory/stock-counts?pageNumber=1&pageSize=20")
  })
})
