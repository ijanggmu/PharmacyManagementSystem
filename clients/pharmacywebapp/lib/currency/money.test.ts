import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES, findSupportedCurrency, formatMoney } from "@/lib/currency/money"
import { formatCurrency } from "@/lib/utils/formatting"
import { convertFromUSD } from "@/lib/currency/convert"

describe("money formatting", () => {
  it("defaults to Nepalese rupees", () => {
    expect(DEFAULT_CURRENCY.code).toBe("NPR")
    expect(formatMoney(1234.5)).toBe("रू1,234.50")
  })

  it("offers only NPR, since amounts are rupees and nothing converts them", () => {
    expect(SUPPORTED_CURRENCIES.map((c) => c.code)).toEqual(["NPR"])
    expect(findSupportedCurrency("USD")).toBeUndefined()
  })
})

describe("formatCurrency (lib/utils/formatting)", () => {
  it("formats in the app currency by default, never dollars", () => {
    expect(formatCurrency(1500)).toBe("रू1,500.00")
    expect(formatCurrency("44.1")).toBe("रू44.10")
  })

  it("renders non-numeric input as zero rupees, not $0.00", () => {
    expect(formatCurrency("abc")).toBe("रू0.00")
    expect(formatCurrency(Number.NaN)).toBe("रू0.00")
  })

  it("still formats an explicit foreign code", () => {
    expect(formatCurrency(10, "USD")).toContain("10.00")
  })
})

describe("convertFromUSD", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("uses the default NPR rate when no env override is set", () => {
    vi.stubEnv("NEXT_PUBLIC_USD_TO_NPR_RATE", "")
    expect(convertFromUSD(10, "NPR")).toBe(1325)
  })

  it("reads the NEXT_PUBLIC_USD_TO_NPR_RATE override", () => {
    vi.stubEnv("NEXT_PUBLIC_USD_TO_NPR_RATE", "140")
    expect(convertFromUSD(10, "NPR")).toBe(1400)
  })

  it("ignores an invalid override", () => {
    vi.stubEnv("NEXT_PUBLIC_USD_TO_NPR_RATE", "-3")
    expect(convertFromUSD(10, "NPR")).toBe(1325)
  })
})
