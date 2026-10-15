import { describe, expect, it } from "vitest"

import { buildZReportHtml, formatVariance } from "./z-report"

const summary = {
  cashShiftId: "shift-1",
  openedAtUtc: "2026-10-14T07:25:30Z",
  closedAtUtc: "2026-10-14T07:28:34Z",
  status: "Closed",
  openingFloat: 10000,
  cashSalesTotal: 1.8,
  nonCashSalesTotal: 20,
  salesCount: 2,
  cashRefundsTotal: 0,
  cashReceiptsTotal: 0,
  expectedCash: 10001.8,
  actualCashCounted: 10000,
  variance: -1.8,
}

describe("formatVariance", () => {
  it("signs shortages and excesses and shows a balanced drawer as zero", () => {
    expect(formatVariance(-1.8)).toBe("-1.80")
    expect(formatVariance(5)).toBe("+5.00")
    expect(formatVariance(0.001)).toBe("0.00")
  })
})

describe("buildZReportHtml", () => {
  const html = buildZReportHtml({
    summary,
    profile: { name: "Demo <Pharmacy>", panVat: "301234567" },
    branchName: "Main Branch",
    openedBy: "Test Cashier",
    closedBy: "Test Cashier",
    closingNotes: "Short by change",
    printedAt: new Date("2026-10-14T08:00:00Z"),
  })

  it("prints the drawer reconciliation with the shortage marked", () => {
    expect(html).toContain("Z-REPORT")
    expect(html).toContain("10,001.80")
    expect(html).toContain("10,000.00")
    expect(html).toContain("-1.80 (short)")
    expect(html).toContain("21.80")
  })

  it("escapes the pharmacy name and prints who ran the shift", () => {
    expect(html).toContain("Demo &lt;Pharmacy&gt;")
    expect(html).not.toContain("Demo <Pharmacy>")
    expect(html).toContain("Test Cashier")
    expect(html).toContain("Short by change")
  })

  it("labels an open shift as an X-report", () => {
    const open = buildZReportHtml({
      summary: { ...summary, status: "Open", closedAtUtc: null, actualCashCounted: null, variance: null },
      profile: { name: "Demo" },
    })
    expect(open).toContain("X-REPORT")
    expect(open).not.toContain("Z-REPORT")
  })
})
