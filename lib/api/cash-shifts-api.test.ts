import { describe, expect, it } from "vitest"
import {
  applyCashShiftSummary,
  buildCashShiftListPath,
  buildCloseCashShiftBody,
  toCashShift,
  type DotnetCashShiftDto,
  type DotnetCashShiftSummaryDto,
} from "@/lib/api/cash-shifts-api"

const dto: DotnetCashShiftDto = {
  id: "44444444-4444-4444-4444-444444444444",
  openedAtUtc: "2026-04-01T03:00:00Z",
  openedBy: "cashier@example.com",
  openingFloat: 5000,
  closedAtUtc: null,
  closedBy: null,
  closingCashCounted: null,
  status: "Open",
  notes: "Morning float",
}

const summary: DotnetCashShiftSummaryDto = {
  cashShiftId: dto.id,
  openedAtUtc: dto.openedAtUtc,
  closedAtUtc: "2026-04-01T11:00:00Z",
  status: "Closed",
  openingFloat: 5000,
  cashSalesTotal: 12000,
  nonCashSalesTotal: 3000,
  salesCount: 14,
  expectedCash: 17000,
  actualCashCounted: 16950,
  variance: -50,
}

describe("toCashShift", () => {
  it("maps CashShiftDto to the legacy row, leaving fields the list endpoint does not return null", () => {
    expect(toCashShift(dto, "branch-1")).toEqual({
      id: dto.id,
      tenant_id: "",
      branch_id: "branch-1",
      status: "Open",
      opened_at: "2026-04-01T03:00:00Z",
      closed_at: null,
      opened_by_user_id: null,
      closed_by_user_id: null,
      opening_float_cash: 5000,
      expected_cash_system: null,
      counted_cash_closing: null,
      cash_variance: null,
      notes_opening: "Morning float",
      notes_closing: null,
    })
  })

  it("uses an empty branch id when no branch filter was applied", () => {
    expect(toCashShift(dto).branch_id).toBe("")
    expect(toCashShift({ ...dto, branchId: "branch-9" }, "branch-1").branch_id).toBe("branch-9")
  })

  it("maps a closed shift's counted cash", () => {
    const row = toCashShift({ ...dto, status: "Closed", closedAtUtc: "2026-04-01T11:00:00Z", closingCashCounted: 16950 })
    expect(row.counted_cash_closing).toBe(16950)
    expect(row.closed_at).toBe("2026-04-01T11:00:00Z")
  })
})

describe("applyCashShiftSummary", () => {
  it("adds expected cash and variance from the summary", () => {
    const row = applyCashShiftSummary(toCashShift(dto, "branch-1"), summary)
    expect(row.expected_cash_system).toBe(17000)
    expect(row.cash_variance).toBe(-50)
  })

  it("keeps a null variance when the summary has none", () => {
    expect(applyCashShiftSummary(toCashShift(dto), { ...summary, variance: null }).cash_variance).toBeNull()
  })
})

describe("buildCashShiftListPath", () => {
  it("passes branch, status and paging to the .NET list endpoint", () => {
    const params = new URLSearchParams(
      buildCashShiftListPath({ branch_id: "branch-1", status: "Open" }, 3, 100).split("?")[1],
    )
    expect(params.get("branchId")).toBe("branch-1")
    expect(params.get("status")).toBe("Open")
    expect(params.get("pageNumber")).toBe("3")
    expect(params.get("pageSize")).toBe("100")
  })

  it("omits filters that were not given", () => {
    const params = new URLSearchParams(buildCashShiftListPath({}, 1).split("?")[1])
    expect(params.has("branchId")).toBe(false)
    expect(params.has("status")).toBe(false)
  })
})

describe("close payload", () => {
  it("builds the CloseCashShiftCommand body with the counted cash unchanged", () => {
    expect(buildCloseCashShiftBody(16950.75)).toEqual({ closingCashCounted: 16950.75 })
  })

  it("sends closing notes only when they are entered", () => {
    expect(buildCloseCashShiftBody(100, "Short by 50")).toEqual({ closingCashCounted: 100, closingNotes: "Short by 50" })
    expect(buildCloseCashShiftBody(100, "  ")).toEqual({ closingCashCounted: 100 })
  })
})
