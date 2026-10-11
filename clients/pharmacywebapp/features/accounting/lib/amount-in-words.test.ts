import { describe, expect, it } from "vitest"
import { amountInWords, integerToWords } from "./amount-in-words"

describe("integerToWords", () => {
  it.each([
    [0, "Zero"],
    [7, "Seven"],
    [15, "Fifteen"],
    [20, "Twenty"],
    [74, "Seventy-Four"],
    [100, "One Hundred"],
    [101, "One Hundred One"],
    [999, "Nine Hundred Ninety-Nine"],
    [1000, "One Thousand"],
    [12_345, "Twelve Thousand Three Hundred Forty-Five"],
    [100_000, "One Lakh"],
    [1_250_000, "Twelve Lakh Fifty Thousand"],
    [9_999_999, "Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine"],
    [10_000_000, "One Crore"],
    [123_456_789, "Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine"],
    [1_000_000_000, "One Hundred Crore"],
  ])("%d -> %s", (n, words) => {
    expect(integerToWords(n)).toBe(words)
  })
})

describe("amountInWords", () => {
  it("writes rupees and paisa", () => {
    expect(amountInWords(74.1)).toBe("Rupees Seventy-Four and Ten Paisa Only")
  })

  it("omits paisa when the amount is whole", () => {
    expect(amountInWords(1500)).toBe("Rupees One Thousand Five Hundred Only")
  })

  it("handles zero", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only")
  })

  it("handles paisa only", () => {
    expect(amountInWords(0.5)).toBe("Fifty Paisa Only")
  })

  it("rounds to the nearest paisa (no float drift)", () => {
    expect(amountInWords(1.005 + 0.000001)).toBe("Rupees One and One Paisa Only")
    expect(amountInWords(0.1 + 0.2)).toBe("Thirty Paisa Only")
    expect(amountInWords(99.999)).toBe("Rupees One Hundred Only")
  })

  it("prefixes negatives with Minus", () => {
    expect(amountInWords(-250.75)).toBe("Minus Rupees Two Hundred Fifty and Seventy-Five Paisa Only")
  })

  it("uses lakh/crore grouping for large amounts", () => {
    expect(amountInWords(12_500_000.01)).toBe("Rupees One Crore Twenty-Five Lakh and One Paisa Only")
  })

  it("returns empty string for non-finite input", () => {
    expect(amountInWords(Number.NaN)).toBe("")
  })

  it("accepts custom unit labels", () => {
    expect(amountInWords(2.02, { currency: "Dollars", minorUnit: "Cents" })).toBe("Dollars Two and Two Cents Only")
  })
})
