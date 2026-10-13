/**
 * Locale-aware number / date / amount-in-words formatting. Pure (no React, no clock unless a Date is
 * passed) so the same functions serve client components, print HTML builders and unit tests.
 *
 *   toNepaliDigits("1,234.50")            -> "१,२३४.५०"
 *   groupSouthAsian(1234567.5, 2)         -> "12,34,567.50"
 *   formatNumber(100000, { locale: "ne" }) -> "१,००,०००"
 *   amountInWordsNe(150000)               -> "रुपैयाँ एक लाख पचास हजार मात्र"
 *   formatBsDate(new Date(2026, 9, 11), { locale: "ne" }) -> "२५ असोज २०८३"
 */

import NepaliDate from "nepali-date-converter"
import { BS_MONTH_NAMES_EN } from "@/features/calendar/nepali-utils"
import { DEFAULT_CURRENCY, type Currency, type FormatMoneyOptions } from "@/lib/currency/money"
import type { Locale } from "@/lib/i18n/config"

// ---------- Digits ------------------------------------------------------------------------------

const NEPALI_DIGITS = ["०", "१", "२", "३", "४", "५", "६", "७", "८", "९"] as const

/** Replaces ASCII 0-9 with Devanagari digits; everything else (separators, symbols, text) is kept. */
export function toNepaliDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => NEPALI_DIGITS[Number(d)])
}

/** Inverse of toNepaliDigits — for parsing typed input that may contain Devanagari digits. */
export function fromNepaliDigits(value: string): string {
  return value.replace(/[०-९]/g, (d) => String(NEPALI_DIGITS.indexOf(d as (typeof NEPALI_DIGITS)[number])))
}

export interface DisplayOptions {
  locale: Locale
  /** Only applies when locale = "ne". Defaults to true. */
  nepaliDigits?: boolean
}

/** Applies the Nepali-digit preference to an already formatted string. */
export function localizeDigits(value: string, { locale, nepaliDigits = true }: DisplayOptions): string {
  return locale === "ne" && nepaliDigits ? toNepaliDigits(value) : value
}

// ---------- Grouping ----------------------------------------------------------------------------

/**
 * South-Asian (Nepali / Indian) grouping: the last three digits, then pairs — 1,00,000 and
 * 1,23,45,678. Rounds to `fractionDigits` first (half away from zero, no float drift: 1.005 -> 1.01).
 */
export function groupSouthAsian(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return "0"
  const factor = 10 ** fractionDigits
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * factor) / factor
  const negative = value < 0 && rounded !== 0
  const [intPart, fracPart] = rounded.toFixed(fractionDigits).split(".")
  let grouped = intPart
  if (intPart.length > 3) {
    const head = intPart.slice(0, -3)
    const tail = intPart.slice(-3)
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`
  }
  return `${negative ? "-" : ""}${grouped}${fracPart ? `.${fracPart}` : ""}`
}

export interface FormatNumberOptions extends DisplayOptions {
  /** Fixed decimals; default 0 for integers, up to 2 otherwise. */
  fractionDigits?: number
}

/**
 * Display number: Nepali grouping + optional Devanagari digits for "ne", the existing en-US style
 * for "en" (so English screens are unchanged).
 */
export function formatNumber(value: number | string, options: FormatNumberOptions): string {
  const n = typeof value === "string" ? parseFloat(value) : value
  const safe = Number.isFinite(n) ? n : 0
  const digits = options.fractionDigits ?? (Number.isInteger(safe) ? 0 : 2)
  if (options.locale !== "ne") {
    return safe.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  return localizeDigits(groupSouthAsian(safe, digits), options)
}

/** Money for the "ne" locale: "रू1,00,000.00" (or "रू१,००,०००.००" with Nepali digits). */
export function formatMoneyNe(
  amount: number | string,
  currency: Currency = DEFAULT_CURRENCY,
  options: FormatMoneyOptions & { nepaliDigits?: boolean } = {},
): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount
  const digits = options.fractionDigits ?? currency.minorDigits ?? 2
  const formatted = localizeDigits(groupSouthAsian(Number.isFinite(n) ? n : 0, digits), {
    locale: "ne",
    nepaliDigits: options.nepaliDigits,
  })
  return currency.position === "before" ? `${currency.symbol}${formatted}` : `${formatted} ${currency.symbol}`
}

// ---------- BS dates ----------------------------------------------------------------------------

export const BS_MONTH_NAMES_NE = [
  "बैशाख",
  "जेठ",
  "असार",
  "साउन",
  "भदौ",
  "असोज",
  "कात्तिक",
  "मंसिर",
  "पुस",
  "माघ",
  "फागुन",
  "चैत",
] as const

function toDate(value: Date | string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  // "yyyy-MM-dd" is a calendar day (local), not UTC midnight.
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const d = ymd ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])) : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface BsDateOptions extends DisplayOptions {
  /** Default true. */
  withYear?: boolean
}

/**
 * Long BS date for a local calendar day: "25 Ashwin 2083" (en) or "२५ असोज २०८३" (ne). Returns ""
 * for an invalid date or one outside the converter's range.
 */
export function formatBsDate(value: Date | string, options: BsDateOptions): string {
  const d = toDate(value)
  if (!d) return ""
  try {
    const bs = NepaliDate.fromAD(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    const month = options.locale === "ne" ? BS_MONTH_NAMES_NE[bs.getMonth()] : BS_MONTH_NAMES_EN[bs.getMonth()]
    const label = options.withYear === false ? `${bs.getDate()} ${month}` : `${bs.getDate()} ${month} ${bs.getYear()}`
    return localizeDigits(label, options)
  } catch {
    return ""
  }
}

/** "2026-10-11" style AD date for a secondary label, with digits localized. */
export function formatAdDate(value: Date | string, options: DisplayOptions): string {
  const d = toDate(value)
  if (!d) return ""
  const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  return localizeDigits(label, options)
}

// ---------- Amount in words (Nepali) ------------------------------------------------------------

/** 0–99: Nepali has a distinct word for every number below a hundred. */
const NE_0_99 = [
  "शून्य", "एक", "दुई", "तीन", "चार", "पाँच", "छ", "सात", "आठ", "नौ",
  "दश", "एघार", "बाह्र", "तेह्र", "चौध", "पन्ध्र", "सोह्र", "सत्र", "अठार", "उन्नाइस",
  "बीस", "एक्काइस", "बाइस", "तेइस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताइस", "अठ्ठाइस", "उनन्तीस",
  "तीस", "एकतीस", "बत्तीस", "तेत्तीस", "चौँतीस", "पैँतीस", "छत्तीस", "सैँतीस", "अठतीस", "उनन्चालीस",
  "चालीस", "एकचालीस", "बयालीस", "त्रिचालीस", "चवालीस", "पैँतालीस", "छयालीस", "सतचालीस", "अठचालीस", "उनन्चास",
  "पचास", "एकाउन्न", "बाउन्न", "त्रिपन्न", "चवन्न", "पचपन्न", "छपन्न", "सन्ताउन्न", "अन्ठाउन्न", "उनन्साठी",
  "साठी", "एकसट्ठी", "बयसट्ठी", "त्रिसट्ठी", "चौसट्ठी", "पैँसट्ठी", "छयसट्ठी", "सतसट्ठी", "अठसट्ठी", "उनन्सत्तरी",
  "सत्तरी", "एकहत्तर", "बहत्तर", "त्रिहत्तर", "चौहत्तर", "पचहत्तर", "छयहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "असी", "एकासी", "बयासी", "त्रियासी", "चौरासी", "पचासी", "छयासी", "सतासी", "अठासी", "उनान्नब्बे",
  "नब्बे", "एकानब्बे", "बयानब्बे", "त्रियानब्बे", "चौरानब्बे", "पन्चानब्बे", "छयानब्बे", "सन्तानब्बे", "अन्ठानब्बे", "उनान्सय",
] as const

/** Whole number (>= 0) in Nepali words: सय, हजार, लाख, करोड, अर्ब (recursing above that). */
export function integerToWordsNe(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) return NE_0_99[0]
  const parts: string[] = []
  const arba = Math.floor(n / 1_000_000_000)
  const crore = Math.floor((n % 1_000_000_000) / 10_000_000)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  const thousand = Math.floor((n % 100_000) / 1000)
  const hundred = Math.floor((n % 1000) / 100)
  const rest = n % 100
  if (arba) parts.push(`${integerToWordsNe(arba)} अर्ब`)
  if (crore) parts.push(`${NE_0_99[crore]} करोड`)
  if (lakh) parts.push(`${NE_0_99[lakh]} लाख`)
  if (thousand) parts.push(`${NE_0_99[thousand]} हजार`)
  if (hundred) parts.push(`${NE_0_99[hundred]} सय`)
  if (rest) parts.push(NE_0_99[rest])
  return parts.join(" ")
}

/**
 * Invoice "amount in words" in Nepali, rounded to the paisa:
 *   74.1    -> "रुपैयाँ चौहत्तर र दश पैसा मात्र"
 *   150000  -> "रुपैयाँ एक लाख पचास हजार मात्र"
 */
export function amountInWordsNe(amount: number): string {
  if (!Number.isFinite(amount)) return ""
  const totalPaisa = Math.round(Math.abs(amount) * 100)
  const rupees = Math.floor(totalPaisa / 100)
  const paisa = totalPaisa % 100
  const sign = amount < 0 && totalPaisa > 0 ? "ऋण " : ""
  if (paisa === 0) return `${sign}रुपैयाँ ${integerToWordsNe(rupees)} मात्र`
  if (rupees === 0) return `${sign}${NE_0_99[paisa]} पैसा मात्र`
  return `${sign}रुपैयाँ ${integerToWordsNe(rupees)} र ${NE_0_99[paisa]} पैसा मात्र`
}
