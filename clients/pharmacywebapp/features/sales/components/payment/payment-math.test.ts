import { describe, expect, it } from "vitest"
import {
  cashNoteSuggestions,
  fromPaisa,
  parseMoneyInput,
  remainingFor,
  roundMoney,
  summarizePayments,
  toPaisa,
} from "@/features/sales/components/payment/payment-math"
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/contexts/currency-context"

describe("paisa conversion", () => {
  it("converts rupees to integer paisa without float drift", () => {
    expect(toPaisa(44.1)).toBe(4410)
    expect(toPaisa(44.099999999)).toBe(4410)
    expect(toPaisa(0.1 + 0.2)).toBe(30)
    expect(toPaisa(1.005)).toBe(101)
    expect(toPaisa(Number.NaN)).toBe(0)
    expect(fromPaisa(4410)).toBe(44.1)
    expect(roundMoney(19.999)).toBe(20)
  })
})

describe("parseMoneyInput", () => {
  it("parses cashier input to paisa precision", () => {
    expect(parseMoneyInput("44.1")).toBe(44.1)
    expect(parseMoneyInput("1,250.505")).toBe(1250.51)
    expect(parseMoneyInput("")).toBe(0)
    expect(parseMoneyInput("abc")).toBe(0)
    expect(parseMoneyInput("-5")).toBe(0)
  })
})

describe("summarizePayments", () => {
  it("balances a single exact cash leg", () => {
    const s = summarizePayments(44.1, [{ method: "cash", amount: 44.1 }])
    expect(s).toMatchObject({ duePaisa: 4410, receivedPaisa: 4410, remainingPaisa: 0, balanced: true })
  })

  it("compares in paisa so float sums still balance", () => {
    const s = summarizePayments(0.3, [
      { method: "cash", amount: 0.1 },
      { method: "card", amount: 0.2 },
    ])
    expect(s.balanced).toBe(true)
  })

  it("reports what is still to collect and overpayment", () => {
    expect(summarizePayments(100, [{ method: "cash", amount: 60 }]).remainingPaisa).toBe(4000)
    expect(summarizePayments(100, [{ method: "card", amount: 120 }]).remainingPaisa).toBe(-2000)
  })

  it("is not balanced while a leg has no amount", () => {
    const s = summarizePayments(100, [
      { method: "cash", amount: 100 },
      { method: "card", amount: 0 },
    ])
    expect(s.balanced).toBe(false)
    expect(s.hasEmptyLeg).toBe(true)
  })

  it("computes change from cash tendered without counting it as received", () => {
    const s = summarizePayments(44.1, [{ method: "cash", amount: 44.1, tendered: 100 }])
    expect(s.receivedPaisa).toBe(4410)
    expect(s.changePaisa).toBe(5590)
    expect(s.balanced).toBe(true)
  })

  it("ignores tendered on non-cash legs and short tender", () => {
    expect(summarizePayments(50, [{ method: "card", amount: 50, tendered: 100 }]).changePaisa).toBe(0)
    expect(summarizePayments(50, [{ method: "cash", amount: 50, tendered: 20 }]).changePaisa).toBe(0)
  })
})

describe("remainingFor", () => {
  it("returns what other legs leave uncovered", () => {
    const legs = [
      { method: "cash", amount: 30.05 },
      { method: "card", amount: 0 },
    ]
    expect(remainingFor(44.1, legs)).toBe(14.05)
    expect(remainingFor(44.1, legs, 1)).toBe(14.05)
    expect(remainingFor(44.1, legs, 0)).toBe(44.1)
    expect(remainingFor(10, [{ method: "cash", amount: 20 }])).toBe(0)
  })
})

describe("cashNoteSuggestions", () => {
  it("offers exact then the next round notes", () => {
    expect(cashNoteSuggestions(44.1)).toEqual([44.1, 50, 100, 500, 1000])
    expect(cashNoteSuggestions(237)).toEqual([237, 240, 250, 300, 500])
  })

  it("dedupes when the bill is already a round figure", () => {
    expect(cashNoteSuggestions(500)).toEqual([500, 1000])
    expect(cashNoteSuggestions(1000)).toEqual([1000])
  })

  it("returns nothing for zero", () => {
    expect(cashNoteSuggestions(0)).toEqual([])
  })
})

describe("formatMoney (NPR shows paisa)", () => {
  const npr = SUPPORTED_CURRENCIES.find((c) => c.code === "NPR")!

  it("displays two decimals for NPR", () => {
    expect(formatMoney(44.1, npr)).toBe("रू44.10")
    expect(formatMoney(44.099999, npr)).toBe("रू44.10")
    expect(formatMoney("1250", npr)).toBe("रू1,250.00")
    expect(formatMoney(Number.NaN, npr)).toBe("रू0.00")
    expect(formatMoney(-0.001, npr)).toBe("रू0.00")
  })

  it("allows a compact whole-rupee override", () => {
    expect(formatMoney(1250.4, npr, { fractionDigits: 0 })).toBe("रू1,250")
  })
})
