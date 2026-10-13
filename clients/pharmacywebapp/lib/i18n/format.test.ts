import { describe, expect, it } from "vitest"
import {
  amountInWordsNe,
  formatBsDate,
  formatMoneyNe,
  formatNumber,
  fromNepaliDigits,
  groupSouthAsian,
  integerToWordsNe,
  localizeDigits,
  toNepaliDigits,
} from "@/lib/i18n/format"

describe("Nepali digits", () => {
  it("maps 0-9 to Devanagari and leaves separators / text alone", () => {
    expect(toNepaliDigits("0123456789")).toBe("०१२३४५६७८९")
    expect(toNepaliDigits("रू1,00,000.50")).toBe("रू१,००,०००.५०")
    expect(toNepaliDigits(2083)).toBe("२०८३")
    expect(fromNepaliDigits("१,२३४.५०")).toBe("1,234.50")
  })

  it("only localizes for Nepali with the setting on", () => {
    expect(localizeDigits("12", { locale: "ne" })).toBe("१२")
    expect(localizeDigits("12", { locale: "ne", nepaliDigits: false })).toBe("12")
    expect(localizeDigits("12", { locale: "en" })).toBe("12")
  })
})

describe("South-Asian grouping", () => {
  it("groups the last three digits then pairs", () => {
    expect(groupSouthAsian(0)).toBe("0")
    expect(groupSouthAsian(999)).toBe("999")
    expect(groupSouthAsian(1000)).toBe("1,000")
    expect(groupSouthAsian(100000)).toBe("1,00,000")
    expect(groupSouthAsian(12345678)).toBe("1,23,45,678")
    expect(groupSouthAsian(1234567.5, 2)).toBe("12,34,567.50")
  })

  it("rounds to the paisa without float drift and keeps the sign", () => {
    expect(groupSouthAsian(1.005, 2)).toBe("1.01")
    expect(groupSouthAsian(-150000.4, 2)).toBe("-1,50,000.40")
    expect(groupSouthAsian(-0.001, 2)).toBe("0.00")
    expect(groupSouthAsian(Number.NaN)).toBe("0")
  })

  it("formatNumber: lakh grouping + digits for ne, unchanged en-US for en", () => {
    expect(formatNumber(100000, { locale: "ne" })).toBe("१,००,०००")
    expect(formatNumber(100000, { locale: "ne", nepaliDigits: false })).toBe("1,00,000")
    expect(formatNumber(100000, { locale: "en" })).toBe("100,000")
    expect(formatNumber("1234.5", { locale: "ne", nepaliDigits: false })).toBe("1,234.50")
  })

  it("formatMoneyNe keeps the rupee symbol and paisa", () => {
    expect(formatMoneyNe(150000)).toBe("रू१,५०,०००.००")
    expect(formatMoneyNe(44.1, undefined, { nepaliDigits: false })).toBe("रू44.10")
    expect(formatMoneyNe(1234, undefined, { fractionDigits: 0, nepaliDigits: false })).toBe("रू1,234")
  })
})

describe("Nepali amount in words", () => {
  it("covers the irregular 0-99 words", () => {
    expect(integerToWordsNe(0)).toBe("शून्य")
    expect(integerToWordsNe(11)).toBe("एघार")
    expect(integerToWordsNe(45)).toBe("पैँतालीस")
    expect(integerToWordsNe(99)).toBe("उनान्सय")
  })

  it("uses सय / हजार / लाख / करोड / अर्ब", () => {
    expect(integerToWordsNe(163)).toBe("एक सय त्रिसट्ठी")
    expect(integerToWordsNe(1000)).toBe("एक हजार")
    expect(integerToWordsNe(150000)).toBe("एक लाख पचास हजार")
    expect(integerToWordsNe(12_34_56_789)).toBe("बाह्र करोड चौँतीस लाख छपन्न हजार सात सय उनान्नब्बे")
    expect(integerToWordsNe(2_05_00_00_000)).toBe("दुई अर्ब पाँच करोड")
  })

  it("adds रुपैयाँ, पैसा and मात्र", () => {
    expect(amountInWordsNe(150000)).toBe("रुपैयाँ एक लाख पचास हजार मात्र")
    expect(amountInWordsNe(74.1)).toBe("रुपैयाँ चौहत्तर र दश पैसा मात्र")
    expect(amountInWordsNe(0.5)).toBe("पचास पैसा मात्र")
    expect(amountInWordsNe(0)).toBe("रुपैयाँ शून्य मात्र")
    expect(amountInWordsNe(Number.POSITIVE_INFINITY)).toBe("")
  })
})

describe("BS dates", () => {
  // 1 Baishakh 2083 BS = 14 April 2026 AD.
  it("formats the BS date in English or Nepali", () => {
    expect(formatBsDate("2026-04-14", { locale: "en" })).toBe("1 Baishakh 2083")
    expect(formatBsDate("2026-04-14", { locale: "ne" })).toBe("१ बैशाख २०८३")
    expect(formatBsDate("2026-04-14", { locale: "ne", nepaliDigits: false })).toBe("1 बैशाख 2083")
    expect(formatBsDate(new Date(2026, 3, 14), { locale: "ne", withYear: false })).toBe("१ बैशाख")
  })

  it("returns an empty string for invalid input", () => {
    expect(formatBsDate("not a date", { locale: "ne" })).toBe("")
  })
})
