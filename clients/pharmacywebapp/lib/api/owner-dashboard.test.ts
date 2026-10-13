import { describe, expect, it } from "vitest"
import {
  bsMonthStartUtc,
  canViewOwnerDashboard,
  formatPercent,
  marginTone,
  ownerDashboardPath,
  vatHint,
} from "./owner-dashboard"

describe("ownerDashboardPath", () => {
  it("omits empty parameters", () => {
    expect(ownerDashboardPath({})).toBe("/accounting/reports/owner-dashboard")
  })

  it("encodes branch and month start", () => {
    expect(ownerDashboardPath({ branchId: "b1", monthStartUtc: "2026-09-16T18:15:00.000Z" })).toBe(
      "/accounting/reports/owner-dashboard?branchId=b1&monthStartUtc=2026-09-16T18%3A15%3A00.000Z",
    )
  })
})

describe("bsMonthStartUtc", () => {
  it("is 00:00 NPT on the first day of the current Bikram Sambat month", () => {
    // 2026-10-13 10:00 NPT falls in Ashwin 2083, which began on 2026-09-17.
    expect(bsMonthStartUtc(new Date("2026-10-13T04:15:00Z"))).toBe("2026-09-16T18:15:00.000Z")
  })

  it("uses the Nepal day, not the UTC day", () => {
    // 2026-09-16 19:00 UTC is already 17 Sep 00:45 NPT, the first day of Ashwin.
    expect(bsMonthStartUtc(new Date("2026-09-16T19:00:00Z"))).toBe("2026-09-16T18:15:00.000Z")
  })
})

describe("formatting helpers", () => {
  it("formats percentages and missing values", () => {
    expect(formatPercent(38.46)).toBe("38.5%")
    expect(formatPercent(null)).toBe("—")
    expect(formatPercent(Number.NaN)).toBe("—")
  })

  it("picks a tone for the margin", () => {
    expect(marginTone(null)).toBe("default")
    expect(marginTone(-2)).toBe("danger")
    expect(marginTone(6)).toBe("warning")
    expect(marginTone(25)).toBe("success")
  })

  it("explains a negative VAT balance as a credit", () => {
    expect(vatHint(-10)).toMatch(/credit/)
    expect(vatHint(10)).toMatch(/Output VAT/)
  })

  it("gates the panel on the accounting reports permission", () => {
    expect(canViewOwnerDashboard(["Permissions.Accounting.Reports.View"])).toBe(true)
    expect(canViewOwnerDashboard(["Permissions.Sales.Sales.View"])).toBe(false)
    expect(canViewOwnerDashboard(undefined)).toBe(false)
  })
})
