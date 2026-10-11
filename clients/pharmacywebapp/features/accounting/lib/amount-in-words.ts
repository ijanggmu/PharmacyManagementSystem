/**
 * Amount in words using the Nepali / Indian numbering system (thousand, lakh, crore).
 *
 *   amountInWords(74.1)      -> "Rupees Seventy-Four and Ten Paisa Only"
 *   amountInWords(1250000)   -> "Rupees Twelve Lakh Fifty Thousand Only"
 *
 * Amounts are rounded to the nearest paisa first. Values of 100 crore and above recurse on the
 * crore part ("One Hundred Twenty Crore …"), which is how Nepali vouchers usually write them.
 */

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
] as const

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"] as const

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]
  const tens = TENS[Math.floor(n / 10)]
  const ones = n % 10
  return ones ? `${tens}-${ONES[ones]}` : tens
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`)
  if (rest) parts.push(belowHundred(rest))
  return parts.join(" ")
}

/** Whole number (>= 0) to words in the lakh/crore system. 0 -> "Zero". */
export function integerToWords(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) return "Zero"
  const parts: string[] = []
  const crore = Math.floor(n / 10_000_000)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  const thousand = Math.floor((n % 100_000) / 1000)
  const rest = n % 1000
  if (crore) parts.push(`${integerToWords(crore)} Crore`)
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`)
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`)
  if (rest) parts.push(belowThousand(rest))
  return parts.join(" ")
}

export interface AmountInWordsOptions {
  /** Major unit label, default "Rupees". */
  currency?: string
  /** Minor unit label, default "Paisa". */
  minorUnit?: string
}

export function amountInWords(amount: number, options: AmountInWordsOptions = {}): string {
  const currency = options.currency ?? "Rupees"
  const minorUnit = options.minorUnit ?? "Paisa"
  if (!Number.isFinite(amount)) return ""
  const totalPaisa = Math.round(Math.abs(amount) * 100)
  const rupees = Math.floor(totalPaisa / 100)
  const paisa = totalPaisa % 100
  const sign = amount < 0 && totalPaisa > 0 ? "Minus " : ""
  const rupeeWords = `${currency} ${integerToWords(rupees)}`
  if (paisa === 0) return `${sign}${rupeeWords} Only`
  if (rupees === 0) return `${sign}${belowHundred(paisa)} ${minorUnit} Only`
  return `${sign}${rupeeWords} and ${belowHundred(paisa)} ${minorUnit} Only`
}
