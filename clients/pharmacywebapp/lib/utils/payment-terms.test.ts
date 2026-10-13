import { describe, expect, it } from "vitest"
import {
  creditTermsLabel,
  defaultDueDate,
  dueBadgeVariant,
  dueOverdueWeight,
  sumDueBuckets,
  dueDateError,
  dueLabel,
  dueState,
  overdueTotal,
  parseCreditDays,
  resolveBillDueDate,
} from "./payment-terms"

describe("parseCreditDays", () => {
  it("treats blank as no terms", () => {
    expect(parseCreditDays("")).toEqual({ ok: true, value: null })
    expect(parseCreditDays("  ")).toEqual({ ok: true, value: null })
    expect(parseCreditDays(null)).toEqual({ ok: true, value: null })
  })

  it("accepts whole days 0-365", () => {
    expect(parseCreditDays("0")).toEqual({ ok: true, value: 0 })
    expect(parseCreditDays(" 30 ")).toEqual({ ok: true, value: 30 })
    expect(parseCreditDays(365)).toEqual({ ok: true, value: 365 })
  })

  it("rejects fractions, negatives and over a year", () => {
    expect(parseCreditDays("7.5").ok).toBe(false)
    expect(parseCreditDays("-1").ok).toBe(false)
    expect(parseCreditDays("366").ok).toBe(false)
    expect(parseCreditDays("abc").ok).toBe(false)
  })
})

describe("due dates", () => {
  it("adds the credit days to the bill date across month ends", () => {
    expect(defaultDueDate("2026-10-13", 30)).toBe("2026-11-12")
    expect(defaultDueDate("2026-01-31", 1)).toBe("2026-02-01")
    expect(defaultDueDate("2026-10-13", 0)).toBe("2026-10-13")
  })

  it("has no due date without terms or a valid bill date", () => {
    expect(defaultDueDate("2026-10-13", null)).toBeNull()
    expect(defaultDueDate("", 30)).toBeNull()
  })

  it("lets a date picked on the bill override the terms, and sends only an override", () => {
    expect(resolveBillDueDate({ billDate: "2026-10-13", creditDays: 30 })).toEqual({
      dueDate: "2026-11-12",
      source: "terms",
      sendDueDate: null,
    })
    expect(resolveBillDueDate({ billDate: "2026-10-13", creditDays: 30, override: "2026-10-20" })).toEqual({
      dueDate: "2026-10-20",
      source: "override",
      sendDueDate: "2026-10-20",
    })
    expect(resolveBillDueDate({ billDate: "2026-10-13", creditDays: null, override: "" })).toEqual({
      dueDate: null,
      source: "none",
      sendDueDate: null,
    })
  })

  it("refuses a due date before the bill date", () => {
    expect(dueDateError("2026-10-13", "2026-10-12")).toMatch(/before the bill date/)
    expect(dueDateError("2026-10-13", "2026-10-13")).toBeNull()
    expect(dueDateError("2026-10-13", null)).toBeNull()
  })
})

describe("due state and labels", () => {
  it("classifies days overdue", () => {
    expect(dueState(3)).toBe("overdue")
    expect(dueState(0)).toBe("due_today")
    expect(dueState(-7)).toBe("due_soon")
    expect(dueState(-8)).toBe("later")
    expect(dueState(null)).toBe("none")
  })

  it("labels and colours them", () => {
    expect(dueLabel(1)).toBe("1 day overdue")
    expect(dueLabel(12)).toBe("12 days overdue")
    expect(dueLabel(0)).toBe("Due today")
    expect(dueLabel(-1)).toBe("Due tomorrow")
    expect(dueLabel(-5)).toBe("Due in 5 days")
    expect(dueLabel(null)).toBe("No due date")
    expect(dueBadgeVariant("overdue")).toBe("danger")
    expect(dueBadgeVariant("due_soon")).toBe("warning")
  })

  it("names the terms", () => {
    expect(creditTermsLabel(30)).toBe("Net 30")
    expect(creditTermsLabel(0)).toBe("Due on receipt")
    expect(creditTermsLabel(null)).toBe("No terms")
  })

  it("sums aging rows' due buckets, skipping rows without them", () => {
    const a = { not_yet_due: 10, overdue_1_30: 5, overdue_31_60: 0, overdue_61_90: 0, overdue_90_plus: 1, no_due_date: 2 }
    const total = sumDueBuckets([{ due: a }, { due: a }, {}])
    expect(total.not_yet_due).toBe(20)
    expect(total.overdue_90_plus).toBe(2)
    expect(total.no_due_date).toBe(4)
    expect(dueOverdueWeight({ ...a, overdue_1_30: 1000 })).toBeLessThan(dueOverdueWeight({ ...a, overdue_1_30: 0, overdue_90_plus: 2 }))
  })

  it("sums the overdue buckets", () => {
    expect(overdueTotal({ overdue_1_30: 10, overdue_31_60: 20, overdue_61_90: 30, overdue_90_plus: 40 })).toBe(100)
  })
})
