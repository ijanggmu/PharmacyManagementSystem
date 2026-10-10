import { describe, expect, it } from "vitest"
import { balanceLine, parseAmount, validateJournal, type JournalLineDraft } from "./journal-form"

const line = (over: Partial<JournalLineDraft>): JournalLineDraft => ({
  key: over.key ?? Math.random().toString(36),
  account_id: "",
  description: "",
  debit: "",
  credit: "",
  ...over,
})

describe("parseAmount", () => {
  it("parses plain, comma-grouped and empty input", () => {
    expect(parseAmount("1,234.50")).toBe(1234.5)
    expect(parseAmount("")).toBe(0)
    expect(parseAmount("12.")).toBe(12)
    expect(Number.isNaN(parseAmount("abc"))).toBe(true)
  })
})

describe("validateJournal", () => {
  it("accepts a balanced two-line journal and ignores blank rows", () => {
    const r = validateJournal([
      line({ account_id: "a", debit: "100.10" }),
      line({ account_id: "b", credit: "100.1", description: " rent " }),
      line({}),
    ])
    expect(r.ok).toBe(true)
    expect(r.payload).toHaveLength(2)
    expect(r.payload[1]).toEqual({ account_id: "b", description: "rent", debit_amount: 0, credit_amount: 100.1 })
    expect(r.totals.difference).toBe(0)
  })

  it("reports per-line errors next to the field", () => {
    const r = validateJournal([
      line({ key: "1", debit: "50" }),
      line({ key: "2", account_id: "b", debit: "10", credit: "10" }),
      line({ key: "3", account_id: "c" }),
    ])
    expect(r.ok).toBe(false)
    expect(r.lineErrors["1"].account).toBe("Choose an account")
    expect(r.lineErrors["2"].amount).toMatch(/either debit or credit/)
    expect(r.lineErrors["3"].amount).toMatch(/Enter a debit or credit/)
    expect(r.formError).toBe("Fix the highlighted lines")
  })

  it("requires debits to equal credits (to the paisa)", () => {
    const r = validateJournal([line({ account_id: "a", debit: "0.1" }), line({ account_id: "b", debit: "0.2" }), line({ account_id: "c", credit: "0.3" })])
    expect(r.ok).toBe(true)
    const bad = validateJournal([line({ account_id: "a", debit: "10" }), line({ account_id: "b", credit: "9.99" })])
    expect(bad.ok).toBe(false)
    expect(bad.formError).toBe("Debits must equal credits")
    expect(bad.totals.difference).toBe(0.01)
  })

  it("requires at least two lines", () => {
    expect(validateJournal([line({ account_id: "a", debit: "10" })]).formError).toMatch(/at least two lines/)
  })
})

describe("balanceLine", () => {
  it("puts the difference on the chosen line's opposite side", () => {
    const lines = [line({ key: "a", debit: "150" }), line({ key: "b", credit: "100" }), line({ key: "c" })]
    const out = balanceLine(lines, "c")
    expect(out[2].credit).toBe("50.00")
    expect(out[2].debit).toBe("")
  })
})
