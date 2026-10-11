import { describe, expect, it } from "vitest"
import {
  assertCategoryEmpty,
  balanceLines,
  openingStockLines,
  openingStockTotal,
  partyLines,
  saveDraftBody,
  startSessionBody,
  toMigrationSession,
  type DotnetMigrationSessionStatusDto,
} from "@/lib/api/onboarding-api"

const dto: DotnetMigrationSessionStatusDto = {
  id: "sess-1",
  cutoverDate: "2026-03-31",
  notes: "Moved from Excel",
  status: "Draft",
  createdAtUtc: "2026-04-01T06:00:00Z",
  committedAtUtc: null,
  committedBy: null,
  categories: [],
  bankVoucherId: null,
  cashVoucherId: null,
  customerVoucherId: null,
  supplierVoucherId: null,
  stockVoucherId: null,
}

describe("toMigrationSession", () => {
  it("maps a draft session to the legacy shape", () => {
    expect(toMigrationSession(dto)).toEqual({
      id: "sess-1",
      tenant_id: "",
      status: "draft",
      cutover_date: "2026-03-31",
      notes: "Moved from Excel",
      created_at: "2026-04-01T06:00:00Z",
      completed_at: null,
    })
  })

  it("maps a committed session to completed with its commit time", () => {
    const out = toMigrationSession({ ...dto, status: "Committed", committedAtUtc: "2026-04-02T07:00:00Z" })
    expect(out.status).toBe("completed")
    expect(out.completed_at).toBe("2026-04-02T07:00:00Z")
  })

  it("rejects an unknown status", () => {
    expect(() => toMigrationSession({ ...dto, status: "Archived" })).toThrow(/Unknown migration session status/)
  })
})

describe("startSessionBody", () => {
  it("sends the cutover date and trimmed notes", () => {
    expect(startSessionBody({ cutover_date: "2026-03-31", notes: "  first load " })).toEqual({
      cutoverDate: "2026-03-31",
      notes: "first load",
    })
  })

  it("sends null for blank notes and refuses a non date-only cutover", () => {
    expect(startSessionBody({ cutover_date: "2026-03-31", notes: "   " }).notes).toBeNull()
    expect(() => startSessionBody({ cutover_date: "31/03/2026" })).toThrow(/YYYY-MM-DD/)
  })
})

describe("openingStockLines and openingStockTotal", () => {
  const items = [
    { medicine_id: "m1", quantity: 10, unit_cost: 2.5, batch_number: " B-1 ", expiry_date: "2027-06-30" },
    { medicine_id: "m2", quantity: 3, unit_cost: 10, batch_number: null, expiry_date: "2026-12-31" },
  ]

  it("maps each stock item to a draft line with the .NET field names", () => {
    expect(openingStockLines(items)).toEqual([
      { medicineId: "m1", quantity: 10, unitCost: 2.5, sellingPrice: null, batchNo: "B-1", expiryDate: "2027-06-30", description: null },
      { medicineId: "m2", quantity: 3, unitCost: 10, sellingPrice: null, batchNo: null, expiryDate: "2026-12-31", description: null },
    ])
  })

  it("refuses a line without an expiry date, which the .NET validator requires", () => {
    expect(() => openingStockLines([{ ...items[0], expiry_date: null }])).toThrow(/expiry date/)
  })

  it("totals quantity times unit cost to two decimals", () => {
    expect(openingStockTotal(items)).toBe(55)
    expect(openingStockTotal([{ ...items[0], quantity: 1, unit_cost: 0.335 }])).toBe(0.34)
  })
})

describe("balance and party lines", () => {
  it("sends one positive amount for cash or bank", () => {
    expect(balanceLines(1500)).toEqual([{ amount: 1500, description: null }])
    expect(() => balanceLines(0)).toThrow(/positive/)
    expect(() => balanceLines(-5)).toThrow(/positive/)
  })

  it("maps party entries to one line per customer or supplier", () => {
    expect(partyLines([{ id: "p1", amount: 250 }, { id: "p2", amount: 75.5 }])).toEqual([
      { partyId: "p1", amount: 250, description: null },
      { partyId: "p2", amount: 75.5, description: null },
    ])
  })

  it("wraps lines in the category body the draft-lines endpoint expects", () => {
    expect(saveDraftBody("Cash", balanceLines(10))).toEqual({ category: "Cash", lines: [{ amount: 10, description: null }] })
  })
})

describe("assertCategoryEmpty", () => {
  it("passes when the category has no saved lines", () => {
    expect(() =>
      assertCategoryEmpty([{ category: "Bank", lineCount: 1, totalAmount: 5 }], "Cash", "Opening cash"),
    ).not.toThrow()
  })

  it("refuses a second save for a category that already has lines", () => {
    expect(() =>
      assertCategoryEmpty([{ category: "Cash", lineCount: 1, totalAmount: 5 }], "Cash", "Opening cash"),
    ).toThrow(/already saved.*second save/)
  })

  it("matches categories regardless of case", () => {
    expect(() =>
      assertCategoryEmpty([{ category: "STOCK", lineCount: 4, totalAmount: 900 }], "Stock", "Opening stock"),
    ).toThrow(/already saved/)
  })
})
